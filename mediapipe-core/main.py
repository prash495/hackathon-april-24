import cv2
import mediapipe as mp
import numpy as np
import time

definitions = {
    'lip-top': [0],
    'lip-bottom':[17],
    'left-eye-quad': [474, 475, 476, 477],
    'left-eye-in-and-out': [463, 263],
    'right-eye-quad': [469, 470, 471, 472],
    'right-eye-in-and-out': [133, 33],
    'face-bounds': [54, 284, 152],
}

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

options = FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=model_path),
    running_mode=VisionRunningMode.LIVE_STREAM,
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
                for mainkey in definitions:
                    for pt_index in definitions[mainkey]:
                        lm = face[pt_index]
                        cx, cy = int(lm.x * w), int(lm.y * h)
                        cv2.circle(frame, (cx, cy), 1, (0, 255, 0), 3)
                        print(lm)

                # Draw normal to face-bounds plane
                fb = [face[i] for i in definitions['face-bounds']]
                pts = np.array([[lm.x, lm.y, lm.z] for lm in fb])
                mid = pts.mean(axis=0)
                v1, v2 = pts[1] - pts[0], pts[2] - pts[0]
                normal = np.cross(v1, v2)
                normal /= np.linalg.norm(normal)
                # Project midpoint and midpoint+normal onto screen
                p1 = (int(mid[0] * w), int(mid[1] * h))
                tip = mid - normal * 0.15  # scale for visibility
                p2 = (int(tip[0] * w), int(tip[1] * h))
                cv2.line(frame, p1, p2, (0, 0, 255), 2)

                # Gaze direction: compare iris center distance to inner vs outer corner
                def iris_ratio(iris_idx, in_out_key):
                    iris = face[iris_idx]
                    inner = face[definitions[in_out_key][0]]
                    outer = face[definitions[in_out_key][1]]
                    d_inner = np.hypot(iris.x - inner.x, iris.y - inner.y)
                    d_outer = np.hypot(iris.x - outer.x, iris.y - outer.y)
                    # ratio < 0.5 means closer to inner corner
                    return d_inner - d_outer

                # Left eye (user's left): inner=463, outer=263, iris=473
                # Right eye (user's right): inner=133, outer=33, iris=468
                # Closer to inner corner → looking toward nose → looking right (user's right)
                left = iris_ratio(473, 'left-eye-in-and-out')
                right = iris_ratio(468, 'right-eye-in-and-out')

                # + is left, - is right
                lateral = round((left - right) * 100, 3)
                print(lateral)
                
                delta = 1.5
                if lateral < -delta: gaze = "Looking Right"
                elif lateral > delta: gaze = 'Looking Left'
                else: gaze = "Looking Straight"

                cv2.putText(frame, gaze, (30, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)

        cv2.imshow('Face Landmarker', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
