import cv2
import mediapipe as mp
import numpy as np
import time

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

def lm_px(lm, w, h):
    return (int(lm.x * w), int(lm.y * h))

def lm_3d(lm, w=1, h=1):
    return np.array([lm.x * w, lm.y * h, lm.z])

def face_normal(landmarks):
    nose  = lm_3d(landmarks[1])
    left  = lm_3d(landmarks[33])
    right = lm_3d(landmarks[263])
    n = np.cross(left - nose, right - nose)
    return n / (np.linalg.norm(n) + 1e-6)

def draw_face_normal(frame, landmarks, h, w):
    nose = lm_3d(landmarks[1])
    n = face_normal(landmarks)
    scale = 0.15
    start = (int(nose[0] * w), int(nose[1] * h))
    end   = (int((nose[0] + n[0] * scale) * w),
             int((nose[1] + n[1] * scale) * h))
    cv2.arrowedLine(frame, start, end, (255, 0, 0), 2, tipLength=0.3)

def draw_gaze_lines(frame, landmarks, h, w):
    # For each eye: project iris offset onto the face plane, then draw
    n = face_normal(landmarks)
    for inner, outer, top, bot, iris_idx in [
        (133, 33,  159, 145, 468),   # left eye
        (362, 263, 386, 374, 473),   # right eye
    ]:
        # Eye center in 3D (normalized coords)
        eye_pts = [lm_3d(landmarks[i]) for i in [inner, outer, top, bot]]
        eye_center = np.mean(eye_pts, axis=0)

        iris = lm_3d(landmarks[iris_idx])
        offset = iris - eye_center

        # Remove component along face normal (keep in-plane offset)
        offset_in_plane = offset - np.dot(offset, n) * n

        scale = 80  # pixels
        start_px = (int(eye_center[0] * w), int(eye_center[1] * h))
        end_px   = (int(eye_center[0] * w + offset_in_plane[0] * scale * w),
                    int(eye_center[1] * h + offset_in_plane[1] * scale * h))
        cv2.arrowedLine(frame, start_px, end_px, (0, 255, 0), 2, tipLength=0.4)

options = FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=model_path),
    running_mode=VisionRunningMode.LIVE_STREAM,
    output_face_blendshapes=True,
    result_callback=store_result)

cap = cv2.VideoCapture(0)

with FaceLandmarker.create_from_options(options) as landmarker:
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame)
        landmarker.detect_async(mp_image, int(time.time() * 1000))

        if latest_result:
            h, w = frame.shape[:2]
            for face in latest_result.face_landmarks:
                # Dots
                for lm in face:
                    cv2.circle(frame, lm_px(lm, w, h), 1, (0, 200, 0), -1)
                # Overlays
                draw_face_normal(frame, face, h, w)
                draw_gaze_lines(frame, face, h, w)

        cv2.imshow('Face Landmarker', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
