import cv2
import mediapipe as mp
import numpy as np
import time
import logging

# --- Logging setup ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)
log = logging.getLogger('gaze_tracker')

definitions = {
    'lip-top': [0],
    'lip-bottom': [17],
    'left-eye-quad': [474, 475, 476, 477],
    'right-eye-quad': [469, 470, 471, 472],
    'face-bounds': [54, 284, 152],
    # Eye corner landmarks for gaze ratio calculation
    'left-eye-corners': [362, 263],    # inner, outer corners of left eye
    'right-eye-corners': [33, 133],    # inner, outer corners of right eye
    'left-eye-top-bottom': [386, 374], # top, bottom of left eye
    'right-eye-top-bottom': [159, 145],# top, bottom of right eye
}

# Iris center landmarks
LEFT_IRIS_CENTER = 473
RIGHT_IRIS_CENTER = 468

# Gaze thresholds — tune these to your setup
GAZE_HORIZONTAL_THRESHOLD = 0.35  # how far left/right before flagging (0.5 = center)
GAZE_VERTICAL_THRESHOLD = 0.30    # how far up/down before flagging
CHEAT_FRAME_THRESHOLD = 15        # consecutive frames before "cheating" alert

# Head pose thresholds (angle in degrees from facing camera)
HEAD_YAW_THRESHOLD = 20    # left/right head turn
HEAD_PITCH_THRESHOLD = 20  # up/down head tilt

cheat_counter = 0

model_path = 'mediapipe-core/face_landmarker_v2_with_blendshapes.task'

BaseOptions = mp.tasks.BaseOptions
FaceLandmarker = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
FaceLandmarkerResult = mp.tasks.vision.FaceLandmarkerResult
VisionRunningMode = mp.tasks.vision.RunningMode

latest_result = None

def store_result(result: FaceLandmarkerResult, output_image: mp.Image, timestamp_ms: int):
    global latest_result
    latest_result = result

def get_gaze_ratio(iris_center, corner_inner, corner_outer, top, bottom):
    """Calculate how far the iris is from center of the eye (0.0-1.0 range).
    Returns (horizontal_ratio, vertical_ratio) where 0.5 = centered."""
    # Horizontal: where is iris between inner and outer corner
    eye_width = np.linalg.norm(np.array(corner_outer) - np.array(corner_inner))
    if eye_width < 1e-6:
        return 0.5, 0.5
    iris_from_inner = np.linalg.norm(np.array(iris_center) - np.array(corner_inner))
    h_ratio = iris_from_inner / eye_width

    # Vertical: where is iris between top and bottom
    eye_height = np.linalg.norm(np.array(bottom) - np.array(top))
    if eye_height < 1e-6:
        return h_ratio, 0.5
    iris_from_top = np.linalg.norm(np.array(iris_center) - np.array(top))
    v_ratio = iris_from_top / eye_height

    return h_ratio, v_ratio


def get_head_pose_angles(face_landmarks, face_bounds_indices):
    """Calculate yaw and pitch angles of the head from the face normal.
    Returns (yaw_degrees, pitch_degrees). 0,0 = facing camera."""
    fb = [face_landmarks[i] for i in face_bounds_indices]
    pts = np.array([[lm.x, lm.y, lm.z] for lm in fb])
    v1, v2 = pts[1] - pts[0], pts[2] - pts[0]
    normal = np.cross(v1, v2)
    norm_len = np.linalg.norm(normal)
    if norm_len < 1e-6:
        return 0.0, 0.0
    normal /= norm_len

    # Ensure normal points TOWARD the camera (negative Z in MediaPipe space).
    # If the cross product winding comes out flipped, the normal points away
    # from the camera (~180° off), causing wildly wrong yaw/pitch values.
    if normal[2] > 0:
        normal = -normal

    # Camera faces -Z, so a face looking at camera has normal ~ (0, 0, -1)
    # Yaw   = angle in the X-Z plane (left/right turn)
    # Pitch = angle in the Y-Z plane (up/down tilt)
    yaw = np.degrees(np.arctan2(normal[0], -normal[2]))
    pitch = np.degrees(np.arctan2(normal[1], -normal[2]))

    return yaw, pitch


options = FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=model_path),
    running_mode=VisionRunningMode.LIVE_STREAM,
    result_callback=store_result)

cap = cv2.VideoCapture(0)
log.info("Camera opened, starting face landmarker...")

with FaceLandmarker.create_from_options(options) as landmarker:
    log.info("Face landmarker initialized, entering main loop")
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame)
        landmarker.detect_async(mp_image, int(time.time() * 1000))

        if latest_result:
            h, w = frame.shape[:2]
            for face in latest_result.face_landmarks:
                for mainkey in definitions:
                    for pt_index in definitions[mainkey]:
                        lm = face[pt_index]
                        cx, cy = int(lm.x * w), int(lm.y * h)
                        cv2.circle(frame, (cx, cy), 1, (0, 255, 0), 3)

                # Draw normal to face-bounds plane (scaled up 60x)
                fb = [face[i] for i in definitions['face-bounds']]
                pts = np.array([[lm.x, lm.y, lm.z] for lm in fb])
                mid = pts.mean(axis=0)
                v1, v2 = pts[1] - pts[0], pts[2] - pts[0]
                normal = np.cross(v1, v2)
                norm_len = np.linalg.norm(normal)
                if norm_len > 1e-6:
                    normal /= norm_len
                    # Same flip as in get_head_pose_angles so arrow points correctly
                    if normal[2] > 0:
                        normal = -normal
                p1 = (int(mid[0] * w), int(mid[1] * h))
                tip = mid - normal * 0.1  # move in normalised coords then scale to px
                p2 = (int(tip[0] * w), int(tip[1] * h))
                cv2.arrowedLine(frame, p1, p2, (0, 0, 255), 3, tipLength=0.2)

                # --- Head pose angles ---
                yaw, pitch = get_head_pose_angles(face, definitions['face-bounds'])
                head_turned = abs(yaw) > HEAD_YAW_THRESHOLD or abs(pitch) > HEAD_PITCH_THRESHOLD

                # --- Gaze / Eye tracking ---
                def lm_to_px(idx):
                    return (face[idx].x * w, face[idx].y * h)

                # Left eye gaze
                l_iris = lm_to_px(LEFT_IRIS_CENTER)
                l_inner, l_outer = lm_to_px(362), lm_to_px(263)
                l_top, l_bottom = lm_to_px(386), lm_to_px(374)
                lh, lv = get_gaze_ratio(l_iris, l_inner, l_outer, l_top, l_bottom)

                # Right eye gaze
                r_iris = lm_to_px(RIGHT_IRIS_CENTER)
                r_inner, r_outer = lm_to_px(33), lm_to_px(133)
                r_top, r_bottom = lm_to_px(159), lm_to_px(145)
                rh, rv = get_gaze_ratio(r_iris, r_inner, r_outer, r_top, r_bottom)

                # Average both eyes
                avg_h = (lh + rh) / 2
                avg_v = (lv + rv) / 2

                gaze_away = (
                    abs(avg_h - 0.5) > GAZE_HORIZONTAL_THRESHOLD or
                    abs(avg_v - 0.5) > GAZE_VERTICAL_THRESHOLD
                )

                # Either eyes or head turned = looking away
                looking_away = gaze_away or head_turned

                # Determine direction label (head pose takes priority)
                if head_turned:
                    if abs(yaw) > HEAD_YAW_THRESHOLD:
                        direction = f"HEAD {'LEFT' if yaw < 0 else 'RIGHT'} ({yaw:.0f}°)"
                    else:
                        direction = f"HEAD {'UP' if pitch < 0 else 'DOWN'} ({pitch:.0f}°)"
                elif abs(avg_h - 0.5) > GAZE_HORIZONTAL_THRESHOLD:
                    direction = "EYES LEFT" if avg_h < 0.5 else "EYES RIGHT"
                elif abs(avg_v - 0.5) > GAZE_VERTICAL_THRESHOLD:
                    direction = "EYES UP" if avg_v < 0.5 else "EYES DOWN"
                else:
                    direction = "CENTER"

                if looking_away:
                    cheat_counter += 1
                    reason = "head_pose" if head_turned else "gaze"
                    log.warning(f"Looking away: {direction} | reason={reason} | yaw={yaw:.1f} pitch={pitch:.1f} | gaze=({avg_h:.3f}, {avg_v:.3f}) | streak={cheat_counter}")
                else:
                    if cheat_counter > 0:
                        log.info(f"Returned to center | streak reset from {cheat_counter}")
                    cheat_counter = max(0, cheat_counter - 1)

                # --- Face bounding box from all landmarks ---
                all_x = [face[i].x * w for i in range(len(face))]
                all_y = [face[i].y * h for i in range(len(face))]
                x_min, x_max = int(min(all_x)), int(max(all_x))
                y_min, y_max = int(min(all_y)), int(max(all_y))
                pad = 20  # padding around face
                x_min, y_min = max(0, x_min - pad), max(0, y_min - pad)
                x_max, y_max = min(w, x_max + pad), min(h, y_max + pad)

                cheating = cheat_counter >= CHEAT_FRAME_THRESHOLD
                box_color = (0, 0, 255) if cheating else (0, 255, 0)
                label = "CHEATING" if cheating else "OK"

                if cheating:
                    log.critical(f"CHEAT DETECTED | direction={direction} | frames={cheat_counter}")

                # Draw face bounding box
                cv2.rectangle(frame, (x_min, y_min), (x_max, y_max), box_color, 3)

                # Semi-transparent overlay on the box edges
                overlay = frame.copy()
                cv2.rectangle(overlay, (x_min, y_min), (x_max, y_max), box_color, -1)
                cv2.addWeighted(overlay, 0.1, frame, 0.9, 0, frame)

                # Status label above the box
                cv2.putText(frame, label, (x_min, y_min - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.9, box_color, 2)

                # Gaze direction info
                cv2.putText(frame, f"{direction}",
                            (10, h - 50), cv2.FONT_HERSHEY_SIMPLEX, 0.6, box_color, 2)
                cv2.putText(frame, f"Head: yaw={yaw:.0f} pitch={pitch:.0f} | Eyes: ({avg_h:.2f}, {avg_v:.2f})",
                            (10, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 2)

                # Draw iris centers
                cv2.circle(frame, (int(l_iris[0]), int(l_iris[1])), 3, (255, 0, 255), -1)
                cv2.circle(frame, (int(r_iris[0]), int(r_iris[1])), 3, (255, 0, 255), -1)

        cv2.imshow('Face Landmarker', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
log.info("Shutdown complete")