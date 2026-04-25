"""
Proctoring WebSocket server — receives JPEG frames from the frontend,
runs MediaPipe face/gaze detection server-side, returns analysis results,
and logs proctor_events to Supabase.

Usage:
    uv run python mediapipe-core/proctor.py

Env vars (reads from apps/backend/.env):
    SUPABASE_URL, SUPABASE_SERVICE_KEY (or SUPABASE_KEY)
"""

import os
import sys
import time
import json
import asyncio
import numpy as np
import cv2
import mediapipe as mp
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# ── Load env from backend .env (local dev) or environment (production) ──
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
_backend_env = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "..", "apps", "backend", ".env")
if os.path.exists(_backend_env):
    load_dotenv(dotenv_path=_backend_env)

from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── MediaPipe setup ──────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(SCRIPT_DIR, "face_landmarker_v2_with_blendshapes.task")

DEFINITIONS = {
    "left-eye-quad": [474, 475, 476, 477],
    "left-eye-in-and-out": [463, 263],
    "right-eye-quad": [469, 470, 471, 472],
    "right-eye-in-and-out": [133, 33],
    "face-bounds": [54, 284, 152],
}
DELTA = 1.5
ANGLE_THRESHOLD = 20
EVENT_COOLDOWN = 5  # seconds


BaseOptions = mp.tasks.BaseOptions
FaceLandmarker = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

# Use IMAGE mode since we process individual frames (not a live stream)
_options = FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=MODEL_PATH),
    running_mode=VisionRunningMode.IMAGE,
    num_faces=2,
)

_landmarker: FaceLandmarker | None = None


def get_landmarker() -> FaceLandmarker:
    global _landmarker
    if _landmarker is None:
        _landmarker = FaceLandmarker.create_from_options(_options)
    return _landmarker


# ── Frame analysis ───────────────────────────────────────────
def iris_ratio(face, iris_idx: int, in_out_key: str) -> float:
    inner = face[DEFINITIONS[in_out_key][0]]
    outer = face[DEFINITIONS[in_out_key][1]]
    iris = face[iris_idx]
    d_inner = np.hypot(iris.x - inner.x, iris.y - inner.y)
    d_outer = np.hypot(iris.x - outer.x, iris.y - outer.y)
    return d_inner - d_outer


def analyze_frame(jpeg_bytes: bytes) -> dict:
    """Decode a JPEG frame, run MediaPipe, return analysis dict."""
    arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        return {"error": "invalid_frame"}

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = get_landmarker().detect(mp_image)

    faces = result.face_landmarks
    num_faces = len(faces) if faces else 0

    if num_faces == 0:
        return {"cheating": False, "gaze": "none", "event": "face_absent",
                "severity": "high", "num_faces": 0}

    if num_faces > 1:
        return {"cheating": True, "gaze": "none", "event": "multiple_faces",
                "severity": "high", "num_faces": num_faces}

    face = faces[0]

    # Face normal angle
    fb = [face[i] for i in DEFINITIONS["face-bounds"]]
    pts = np.array([[lm.x, lm.y, lm.z] for lm in fb])
    v1, v2 = pts[1] - pts[0], pts[2] - pts[0]
    normal = np.cross(v1, v2)
    normal /= np.linalg.norm(normal)
    cam_forward = np.array([0.0, 0.0, -1.0])
    angle = float(np.degrees(np.arccos(np.clip(np.dot(normal, cam_forward), -1.0, 1.0))))
    angle = round(180 - angle, 3)

    # Gaze via iris ratio
    left = iris_ratio(face, 473, "left-eye-in-and-out")
    right = iris_ratio(face, 468, "right-eye-in-and-out")
    lateral = round((left - right) * 100, 3)

    if lateral < -DELTA:
        gaze = "Looking Right"
    elif lateral > DELTA:
        gaze = "Looking Left"
    else:
        gaze = "Looking Straight"

    cheating = bool(angle >= ANGLE_THRESHOLD or abs(lateral) > DELTA)

    resp: dict = {
        "cheating": cheating,
        "gaze": gaze,
        "angle": float(angle),
        "lateral": float(lateral),
        "num_faces": 1,
    }
    if cheating:
        resp["event"] = "gaze_away"
        resp["severity"] = "medium"
    return resp


# ── Event logging (with cooldown per session+event_type) ─────
_last_event: dict[str, float] = {}


def log_event(session_id: str, event_type: str, severity: str, metadata: dict | None = None):
    key = f"{session_id}:{event_type}"
    now = time.time()
    if now - _last_event.get(key, 0) < EVENT_COOLDOWN:
        return
    _last_event[key] = now
    # Prune stale entries to prevent unbounded growth
    stale = [k for k, t in list(_last_event.items()) if now - t > EVENT_COOLDOWN]
    for k in stale:
        del _last_event[k]
    try:
        supabase.table("proctor_events").insert({
            "session_id": session_id,
            "event_type": event_type,
            "severity": severity,
            "metadata": json.dumps(metadata or {}),
        }).execute()
    except Exception as e:
        print(f"[PROCTOR] Failed to log event: {e}", file=sys.stderr)


# ── FastAPI app ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up the model on startup
    print("[PROCTOR] Loading MediaPipe model...", flush=True)
    get_landmarker()
    print("[PROCTOR] Model ready.", flush=True)
    yield
    global _landmarker
    if _landmarker:
        _landmarker.close()
        _landmarker = None
    print("[PROCTOR] Shut down.", flush=True)


app = FastAPI(title="Proctor Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "running", "service": "proctor"}


@app.websocket("/ws/{session_id}")
async def proctor_ws(websocket: WebSocket, session_id: str):
    """
    Frontend connects here and sends JPEG frames as binary messages.
    Server responds with JSON analysis for each frame.
    """
    await websocket.accept()
    print(f"[PROCTOR] WS connected session={session_id}", flush=True)

    try:
        while True:
            # Receive JPEG bytes from frontend
            data = await websocket.receive_bytes()

            # Run analysis in a thread to avoid blocking the event loop
            result = await asyncio.to_thread(analyze_frame, data)

            # Log events to Supabase if needed
            event_type = result.get("event")
            if event_type:
                severity = result.get("severity", "medium")
                meta = {k: v for k, v in result.items()
                        if k not in ("event", "severity", "error")}
                await asyncio.to_thread(log_event, session_id, event_type, severity, meta)

            # Send result back to frontend
            await websocket.send_json(result)

    except WebSocketDisconnect:
        print(f"[PROCTOR] WS disconnected session={session_id}", flush=True)
    except Exception as e:
        print(f"[PROCTOR] WS error session={session_id}: {e}", flush=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
