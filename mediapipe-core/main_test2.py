import cv2
import mediapipe as mp
import numpy as np
import time
import logging
from collections import deque

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
    'left-eye-corners': [362, 263],
    'right-eye-corners': [33, 133],
    'left-eye-top-bottom': [386, 374],
    'right-eye-top-bottom': [159, 145],
}

# Iris center landmarks
LEFT_IRIS_CENTER  = 473
RIGHT_IRIS_CENTER = 468

# ── Gaze thresholds ───────────────────────────────────────────────────────────
# Signed normalised offset from eye centre.  Tune these up to reduce sensitivity.
GAZE_H_THRESHOLD = 0.12
GAZE_V_THRESHOLD = 0.10

# Temporal smoothing — number of frames to average over
SMOOTH_FRAMES = 6

# Consecutive "away" frames before raising a cheat alert
CHEAT_FRAME_THRESHOLD = 20

# Head pose thresholds (degrees)
HEAD_YAW_THRESHOLD   = 20
HEAD_PITCH_THRESHOLD = 20

# ─────────────────────────────────────────────────────────────────────────────
cheat_counter = 0

# Smoothing buffers
h_buf = deque(maxlen=SMOOTH_FRAMES)
v_buf = deque(maxlen=SMOOTH_FRAMES)

model_path = 'mediapipe-core/face_landmarker_v2_with_blendshapes.task'

BaseOptions           = mp.tasks.BaseOptions
FaceLandmarker        = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
FaceLandmarkerResult  = mp.tasks.vision.FaceLandmarkerResult
VisionRunningMode     = mp.tasks.vision.RunningMode

latest_result = None

def store_result(result: FaceLandmarkerResult, output_image: mp.Image, timestamp_ms: int):
    global latest_result
    latest_result = result


# ── Core gaze math ────────────────────────────────────────────────────────────

def get_gaze_ratio(iris_px, inner_px, outer_px, top_px, bottom_px):
    """
    Returns (h_offset, v_offset) as signed fractions of eye width/height.

    By projecting the iris-to-centre vector onto the eye's own horizontal and
    vertical axes we get a proper signed result, unlike the old scalar-distance
    approach which threw away direction information.

    Sign convention (before the caller flips the right-eye h component):
      h_offset > 0  →  iris toward outer corner
      h_offset < 0  →  iris toward inner corner
      v_offset > 0  →  iris toward bottom lid  (gaze DOWN)
      v_offset < 0  →  iris toward top lid     (gaze UP)
    """
    iris   = np.array(iris_px,   dtype=float)
    inner  = np.array(inner_px,  dtype=float)
    outer  = np.array(outer_px,  dtype=float)
    top    = np.array(top_px,    dtype=float)
    bottom = np.array(bottom_px, dtype=float)

    eye_center = (inner + outer + top + bottom) / 4.0

    # Horizontal axis: inner → outer
    h_axis = outer - inner
    h_len  = np.linalg.norm(h_axis)
    if h_len < 1e-6:
        return 0.0, 0.0
    h_unit = h_axis / h_len

    # Vertical axis: top → bottom
    v_axis = bottom - top
    v_len  = np.linalg.norm(v_axis)
    if v_len < 1e-6:
        return 0.0, 0.0
    v_unit = v_axis / v_len

    offset   = iris - eye_center
    h_offset = np.dot(offset, h_unit) / h_len
    v_offset = np.dot(offset, v_unit) / v_len

    return h_offset, v_offset


def get_gaze_direction(avg_h, avg_v):
    """
    Converts smoothed (h, v) offsets into a human-readable direction string
    and a bool indicating whether gaze is away from screen.
    """
    h_dir = None
    v_dir = None

    if abs(avg_h) > GAZE_H_THRESHOLD:
        h_dir = "RIGHT" if avg_h > 0 else "LEFT"
    if abs(avg_v) > GAZE_V_THRESHOLD:
        v_dir = "DOWN" if avg_v > 0 else "UP"

    if h_dir and v_dir:
        return f"EYES {v_dir}-{h_dir}", True
    elif h_dir:
        return f"EYES {h_dir}", True
    elif v_dir:
        return f"EYES {v_dir}", True
    else:
        return "CENTER", False


# ── Head pose ─────────────────────────────────────────────────────────────────

def get_head_pose_angles(face_landmarks, face_bounds_indices):
    fb       = [face_landmarks[i] for i in face_bounds_indices]
    pts      = np.array([[lm.x, lm.y, lm.z] for lm in fb])
    v1, v2   = pts[1] - pts[0], pts[2] - pts[0]
    normal   = np.cross(v1, v2)
    norm_len = np.linalg.norm(normal)
    if norm_len < 1e-6:
        return 0.0, 0.0
    normal /= norm_len

    # Ensure normal points toward camera (−Z in MediaPipe space)
    if normal[2] > 0:
        normal = -normal

    yaw   = np.degrees(np.arctan2(normal[0], -normal[2]))
    pitch = np.degrees(np.arctan2(normal[1], -normal[2]))
    return yaw, pitch


# ── Main loop ─────────────────────────────────────────────────────────────────

options = FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=model_path),
    running_mode=VisionRunningMode.LIVE_STREAM,
    result_callback=store_result)

cap = cv2.VideoCapture(0)
log.info("Camera opened, starting face landmarker...")

with FaceLandmarker.create_from_options(options) as landmarker:
    log.info("Face landmarker initialised, entering main loop")
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame)
        landmarker.detect_async(mp_image, int(time.time() * 1000))

        if latest_result:
            h_frame, w_frame = frame.shape[:2]

            for face in latest_result.face_landmarks:

                # ── Landmark dots ───────────────────────────────────────────
                for mainkey in definitions:
                    for pt_index in definitions[mainkey]:
                        lm = face[pt_index]
                        cx, cy = int(lm.x * w_frame), int(lm.y * h_frame)
                        cv2.circle(frame, (cx, cy), 1, (0, 255, 0), 3)

                # ── Face normal arrow ───────────────────────────────────────
                fb       = [face[i] for i in definitions['face-bounds']]
                pts      = np.array([[lm.x, lm.y, lm.z] for lm in fb])
                mid      = pts.mean(axis=0)
                v1, v2   = pts[1] - pts[0], pts[2] - pts[0]
                normal   = np.cross(v1, v2)
                norm_len = np.linalg.norm(normal)
                if norm_len > 1e-6:
                    normal /= norm_len
                    if normal[2] > 0:
                        normal = -normal
                p1  = (int(mid[0] * w_frame), int(mid[1] * h_frame))
                tip = mid - normal * 0.1
                p2  = (int(tip[0] * w_frame), int(tip[1] * h_frame))
                cv2.arrowedLine(frame, p1, p2, (0, 0, 255), 3, tipLength=0.2)

                # ── Head pose ───────────────────────────────────────────────
                yaw, pitch  = get_head_pose_angles(face, definitions['face-bounds'])
                head_turned = abs(yaw) > HEAD_YAW_THRESHOLD or abs(pitch) > HEAD_PITCH_THRESHOLD

                # ── Pixel helper ────────────────────────────────────────────
                def lm_px(idx):
                    return (face[idx].x * w_frame, face[idx].y * h_frame)

                # ── Left eye gaze ───────────────────────────────────────────
                l_iris            = lm_px(LEFT_IRIS_CENTER)
                l_inner, l_outer  = lm_px(362), lm_px(263)
                l_top,   l_bottom = lm_px(386), lm_px(374)
                lh, lv            = get_gaze_ratio(l_iris, l_inner, l_outer, l_top, l_bottom)

                # ── Right eye gaze ──────────────────────────────────────────
                r_iris            = lm_px(RIGHT_IRIS_CENTER)
                r_inner, r_outer  = lm_px(33),  lm_px(133)
                r_top,   r_bottom = lm_px(159), lm_px(145)
                rh, rv            = get_gaze_ratio(r_iris, r_inner, r_outer, r_top, r_bottom)

                # Right-eye h is flipped so that positive = looking RIGHT for both eyes.
                # (For the left eye,  outer corner is to the left  of the face → positive h = gaze RIGHT)
                # (For the right eye, outer corner is to the right of the face → positive h = gaze LEFT,
                #  so we negate it to unify the sign convention.)
                combined_h = (lh + (-rh)) / 2.0
                combined_v = (lv +   rv)  / 2.0

                # ── Temporal smoothing ──────────────────────────────────────
                h_buf.append(combined_h)
                v_buf.append(combined_v)
                smooth_h = float(np.mean(h_buf))
                smooth_v = float(np.mean(v_buf))

                gaze_label, gaze_away = get_gaze_direction(smooth_h, smooth_v)

                # ── Combine head + gaze ─────────────────────────────────────
                looking_away = gaze_away or head_turned

                if head_turned:
                    if abs(yaw) > HEAD_YAW_THRESHOLD:
                        direction = f"HEAD {'LEFT' if yaw < 0 else 'RIGHT'} ({yaw:.0f}°)"
                    else:
                        direction = f"HEAD {'UP' if pitch < 0 else 'DOWN'} ({pitch:.0f}°)"
                else:
                    direction = gaze_label

                # ── Cheat counter ───────────────────────────────────────────
                if looking_away:
                    cheat_counter += 1
                    reason = "head_pose" if head_turned else "gaze"
                    log.warning(
                        f"Looking away: {direction} | reason={reason} | "
                        f"yaw={yaw:.1f} pitch={pitch:.1f} | "
                        f"gaze=({smooth_h:+.3f}, {smooth_v:+.3f}) | streak={cheat_counter}"
                    )
                else:
                    if cheat_counter > 0:
                        log.info(f"Returned to centre | streak reset from {cheat_counter}")
                    cheat_counter = max(0, cheat_counter - 1)

                # ── Bounding box ────────────────────────────────────────────
                all_x = [face[i].x * w_frame for i in range(len(face))]
                all_y = [face[i].y * h_frame  for i in range(len(face))]
                x_min = max(0,       int(min(all_x)) - 20)
                y_min = max(0,       int(min(all_y)) - 20)
                x_max = min(w_frame, int(max(all_x)) + 20)
                y_max = min(h_frame, int(max(all_y)) + 20)

                cheating  = cheat_counter >= CHEAT_FRAME_THRESHOLD
                box_color = (0, 0, 255) if cheating else (0, 255, 0)
                label     = "CHEATING" if cheating else "OK"

                if cheating:
                    log.critical(f"CHEAT DETECTED | direction={direction} | frames={cheat_counter}")

                cv2.rectangle(frame, (x_min, y_min), (x_max, y_max), box_color, 3)
                overlay = frame.copy()
                cv2.rectangle(overlay, (x_min, y_min), (x_max, y_max), box_color, -1)
                cv2.addWeighted(overlay, 0.1, frame, 0.9, 0, frame)

                cv2.putText(frame, label,
                            (x_min, y_min - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.9, box_color, 2)
                cv2.putText(frame, direction,
                            (10, h_frame - 50),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, box_color, 2)
                cv2.putText(
                    frame,
                    f"Head: yaw={yaw:.0f} pitch={pitch:.0f} | "
                    f"Eyes: h={smooth_h:+.3f} v={smooth_v:+.3f}",
                    (10, h_frame - 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 2
                )

                # ── Iris & eye-centre dots ──────────────────────────────────
                cv2.circle(frame, (int(l_iris[0]), int(l_iris[1])), 4, (255, 0, 255), -1)
                cv2.circle(frame, (int(r_iris[0]), int(r_iris[1])), 4, (255, 0, 255), -1)

                def draw_eye_centre(inner, outer, top, bottom):
                    pts_e = [np.array(p) for p in [inner, outer, top, bottom]]
                    c     = sum(pts_e) / 4
                    cv2.circle(frame, (int(c[0]), int(c[1])), 3, (0, 255, 255), -1)

                draw_eye_centre(l_inner, l_outer, l_top, l_bottom)
                draw_eye_centre(r_inner, r_outer, r_top, r_bottom)

        cv2.imshow('Face Landmarker', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
log.info("Shutdown complete")