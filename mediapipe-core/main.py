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

def lm_3d(lm):
    return np.array([lm.x, lm.y, lm.z])

def draw_face_normal(frame, landmarks, h, w):
    nose  = lm_3d(landmarks[1])
    left  = lm_3d(landmarks[33])
    right = lm_3d(landmarks[263])
    normal = np.cross(left - nose, right - nose)
    normal /= np.linalg.norm(normal) + 1e-6
    scale = 0.15
    start = lm_px(landmarks[1], w, h)
    end = (int((nose[0] + normal[0] * scale) * w),
           int((nose[1] + normal[1] * scale) * h))
    cv2.arrowedLine(frame, start, end, (255, 0, 0), 2, tipLength=0.3)

def draw_gaze_lines(frame, landmarks, h, w):
    for eye_a, eye_b, iris_idx in [(33, 133, 468), (362, 263, 473)]:
        a, b = lm_3d(landmarks[eye_a]), lm_3d(landmarks[eye_b])
        mid_px = (int(((a[0] + b[0]) / 2) * w), int(((a[1] + b[1]) / 2) * h))
        iris = lm_px(landmarks[iris_idx], w, h)
        dx, dy = iris[0] - mid_px[0], iris[1] - mid_px[1]
        scale = 5
        end = (mid_px[0] + dx * scale, mid_px[1] + dy * scale)
        cv2.arrowedLine(frame, mid_px, end, (0, 255, 0), 2, tipLength=0.3)

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
                draw_face_normal(frame, face, h, w)
                draw_gaze_lines(frame, face, h, w)

        cv2.imshow('Face Landmarker', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
