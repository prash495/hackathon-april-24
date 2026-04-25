"""
Proctoring camera process — launched as a subprocess by the backend.
Usage: python proctor.py <session_id> <supabase_url> <supabase_key> <candidate_id> [stream_port]

Captures webcam, runs MediaPipe face/gaze detection, logs proctor_events
to Supabase, and serves an MJPEG video stream on stream_port (default 9100).
"""

import sys
import os
import cv2
import mediapipe as mp
import numpy as np
import time
import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

# ── Args ─────────────────────────────────────────────────────
if len(sys.argv) < 5:
    print("Usage: python proctor.py <session_id> <supabase_url> <supabase_key> <candidate_id> [stream_port]")
    sys.exit(1)

SESSION_ID = sys.argv[1]
SUPABASE_URL = sys.argv[2]
SUPABASE_KEY = sys.argv[3]
CANDIDATE_ID = sys.argv[4]
STREAM_PORT = int(sys.argv[5]) if len(sys.argv) > 5 else 9100

from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── MediaPipe setup ──────────────────────────────────────────
definitions = {
    'left-eye-quad': [474, 475, 476, 477],
    'left-eye-in-and-out': [463, 263],
    'right-eye-quad': [469, 470, 471, 472],
    'right-eye-in-and-out': [133, 33],
    'face-bounds': [54, 284, 152],
}

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
model_path = os.path.join(SCRIPT_DIR, 'face_landmarker_v2_with_blendshapes.task')

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
    result_callback=store_result,
)

# ── Shared frame buffer for MJPEG streaming ──────────────────
_latest_jpeg: bytes = b""
_frame_lock = threading.Lock()

def set_frame(jpeg_bytes: bytes):
    global _latest_jpeg
    with _frame_lock:
        _latest_jpeg = jpeg_bytes

def get_frame() -> bytes:
    with _frame_lock:
        return _latest_jpeg

# ── MJPEG HTTP server ────────────────────────────────────────
class MJPEGHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/stream":
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            try:
                while True:
                    frame = get_frame()
                    if frame:
                        self.wfile.write(b"--frame\r\n")
                        self.wfile.write(b"Content-Type: image/jpeg\r\n\r\n")
                        self.wfile.write(frame)
                        self.wfile.write(b"\r\n")
                    time.sleep(0.05)  # ~20fps
            except (BrokenPipeError, ConnectionResetError):
                pass
        elif self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "running", "session_id": SESSION_ID}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # suppress logs

def start_stream_server():
    server = HTTPServer(("127.0.0.1", STREAM_PORT), MJPEGHandler)
    server.serve_forever()

# ── Event logging ────────────────────────────────────────────
EVENT_COOLDOWN = 5
_last_event_time: dict[str, float] = {}

def log_event(event_type: str, severity: str = "medium", metadata: dict | None = None):
    now = time.time()
    if now - _last_event_time.get(event_type, 0) < EVENT_COOLDOWN:
        return
    _last_event_time[event_type] = now
    try:
        supabase.table("proctor_events").insert({
            "session_id": SESSION_ID,
            "event_type": event_type,
            "severity": severity,
            "metadata": json.dumps(metadata or {}),
        }).execute()
    except Exception as e:
        print(f"[PROCTOR] Failed to log event: {e}", file=sys.stderr)

# ── Main loop ────────────────────────────────────────────────
def main():
    # Start MJPEG stream server in background thread
    stream_thread = threading.Thread(target=start_stream_server, daemon=True)
    stream_thread.start()
    print(f"[PROCTOR] MJPEG stream on http://localhost:{STREAM_PORT}/stream", flush=True)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[PROCTOR] Cannot open camera", file=sys.stderr)
        sys.exit(1)

    print(f"[PROCTOR] Started for session={SESSION_ID}", flush=True)

    with FaceLandmarker.create_from_options(options) as landmarker:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame)
            landmarker.detect_async(mp_image, int(time.time() * 1000))

            if latest_result:
                h, w = frame.shape[:2]
                num_faces = len(latest_result.face_landmarks)

                if num_faces == 0:
                    log_event("face_absent", "high")
                    cv2.putText(frame, "No Face Detected", (30, 40),
                                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

                elif num_faces > 1:
                    log_event("multiple_faces", "high", {"count": num_faces})
                    cv2.putText(frame, f"Multiple Faces: {num_faces}", (30, 40),
                                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

                else:
                    face = latest_result.face_landmarks[0]

                    # Draw face mesh
                    for lm in face:
                        cx, cy = int(lm.x * w), int(lm.y * h)
                        cv2.circle(frame, (cx, cy), 1, (200, 200, 200), -1)

                    # Face normal angle
                    fb = [face[i] for i in definitions['face-bounds']]
                    pts = np.array([[lm.x, lm.y, lm.z] for lm in fb])
                    v1, v2 = pts[1] - pts[0], pts[2] - pts[0]
                    normal = np.cross(v1, v2)
                    normal /= np.linalg.norm(normal)
                    cam_forward = np.array([0.0, 0.0, -1.0])
                    angle = np.degrees(np.arccos(np.clip(np.dot(normal, cam_forward), -1.0, 1.0)))
                    angle = round(180 - angle, 3)

                    def iris_ratio(iris_idx, in_out_key):
                        iris = face[iris_idx]
                        inner = face[definitions[in_out_key][0]]
                        outer = face[definitions[in_out_key][1]]
                        d_inner = np.hypot(iris.x - inner.x, iris.y - inner.y)
                        d_outer = np.hypot(iris.x - outer.x, iris.y - outer.y)
                        return d_inner - d_outer

                    left = iris_ratio(473, 'left-eye-in-and-out')
                    right = iris_ratio(468, 'right-eye-in-and-out')
                    lateral = round((left - right) * 100, 3)

                    delta = 1.5
                    if lateral < -delta: gaze = "Looking Right"
                    elif lateral > delta: gaze = "Looking Left"
                    else: gaze = "Looking Straight"

                    cheating = angle >= 20 or abs(lateral) > delta

                    if cheating:
                        log_event("gaze_away", "medium", {"angle": angle, "lateral": lateral, "gaze": gaze})
                        cv2.putText(frame, f"Cheating - {gaze}", (30, 40),
                                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
                    else:
                        cv2.putText(frame, "OK", (30, 40),
                                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

            # Encode frame as JPEG and push to stream buffer
            _, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            set_frame(jpeg.tobytes())

            # Control frame rate (~30fps)
            time.sleep(0.033)

    cap.release()
    print(f"[PROCTOR] Stopped for session={SESSION_ID}", flush=True)

if __name__ == "__main__":
    main()
