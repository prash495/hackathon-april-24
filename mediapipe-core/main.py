import cv2
import mediapipe as mp
import numpy as np
import time

definitions = {
    'lip-top': [0],
    'lip-bottom':[17],
    'left-eye-quad': [474, 475, 476, 477],
    'right-eye-quad': [469, 470, 471, 472],
    'face-bounds': [54, 284, 152]
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
                p1 = (int(mid[0] * w), int(mid[1] * h))
                tip = mid - normal * 0.15
                p2 = (int(tip[0] * w), int(tip[1] * h))
                cv2.line(frame, p1, p2, (0, 0, 255), 2)

                # Draw normals for eye quads
                for eye_key in ('left-eye-quad', 'right-eye-quad'):
                    eq = [face[i] for i in definitions[eye_key]]
                    epts = np.array([[lm.x, lm.y, lm.z] for lm in eq])
                    emid = epts.mean(axis=0)
                    ev1, ev2 = epts[1] - epts[0], epts[2] - epts[0]
                    enorm = np.cross(ev1, ev2)
                    enorm /= np.linalg.norm(enorm)
                    ep1 = (int(emid[0] * w), int(emid[1] * h))
                    etip = emid - enorm * 0.08
                    ep2 = (int(etip[0] * w), int(etip[1] * h))
                    cv2.line(frame, ep1, ep2, (255, 0, 0), 2)

                # for lm in face:
                #     cx, cy = int(lm.x * w), int(lm.y * h)
                #     cv2.circle(frame, (cx, cy), 1, (0, 255, 0), -1)

        cv2.imshow('Face Landmarker', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
