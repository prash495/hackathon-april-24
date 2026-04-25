from fastapi import FastAPI, HTTPException, Depends, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from typing import Optional, List
import os
import base64
import logging
from dotenv import load_dotenv
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
import numpy as np
import cv2
import mediapipe as mp

from gaze import GazeAnalyzer

load_dotenv()

# PHASE 0: Project Bootstrap
app = FastAPI(
    title="InterviewPilot API",
    description="AI-Powered Honest Coding Interviews",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# PHASE 1: Auth + DB Schema
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Models
class User(BaseModel):
    id: Optional[str] = None
    email: str
    name: str
    role: str  # 'candidate' or 'interviewer'

class UserInDB(User):
    hashed_password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class Challenge(BaseModel):
    id: Optional[str] = None
    title: str
    description: str
    difficulty: str
    assistance_level: str
    starter_code: Optional[str] = None
    created_by: Optional[str] = None

class Session(BaseModel):
    id: Optional[str] = None
    challenge_id: str
    candidate_id: str
    interviewer_id: str
    status: str = "pending"
    started_at: Optional[str] = None

class AIPromptRequest(BaseModel):
    prompt: str
    session_id: str

class AIPromptResponse(BaseModel):
    response: str
    allowed: bool
    violation: Optional[str] = None

# PHASE 4: AI Chat + Ethics Gate
class PolicyViolation(Exception):
    pass

BLOCKED_INTENTS = {
    "solve_entire_problem",
    "write_complete_solution",
    "optimize_full_submission",
    "generate_answer"
}

def analyze_prompt_intent(prompt: str) -> str:
    """Simple intent analysis - in production, use LLM"""
    prompt_lower = prompt.lower()
    
    if any(phrase in prompt_lower for phrase in [
        "solve this", "complete solution", "write the code",
        "give me the answer", "full implementation"
    ]):
        return "solve_entire_problem"
    
    if any(phrase in prompt_lower for phrase in [
        "syntax for", "how do i", "what's the api",
        "import statement", "function signature"
    ]):
        return "syntax_lookup"
    
    if any(phrase in prompt_lower for phrase in [
        "explain", "how does", "what is", "when should"
    ]):
        return "conceptual_question"
    
    return "unknown"

def ethics_logic_gate(prompt: str, assistance_level: str) -> dict:
    """Ethics guardrail to prevent full solution requests"""
    intent = analyze_prompt_intent(prompt)
    
    if intent in BLOCKED_INTENTS:
        raise PolicyViolation(
            "Full-solution requests are prohibited during interviews."
        )
    
    # Check if intent matches assistance level
    if assistance_level == "syntax_only" and intent != "syntax_lookup":
        return {
            "allowed": False,
            "violation": f"Only syntax questions allowed at this level. Detected: {intent}"
        }
    
    return {"allowed": True, "intent": intent}

# Helper functions
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Routes
@app.get("/")
def read_root():
    return {
        "message": "InterviewPilot API",
        "version": "1.0.0",
        "phases_completed": ["0", "1", "2", "3", "4"]
    }

@app.get("/health")
def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    role: str

class AuthToken(BaseModel):
    access_token: str
    token_type: str
    user: User

# In-memory user store (replace with Supabase in production)
_users: dict = {}

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        uid: str   = payload.get("uid", "")
        role: str  = payload.get("role", "")
        name: str  = payload.get("name", "")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
        # Verify user still exists in store
        if email not in _users:
            raise HTTPException(status_code=401, detail="User not found")
        return User(id=uid, email=email, name=name, role=role)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# PHASE 1: Authentication endpoints
@app.post("/auth/register", response_model=AuthToken)
async def register(body: RegisterRequest):
    """Register a new user"""
    if body.email in _users:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{len(_users) + 1}"
    _users[body.email] = {
        "id": user_id,
        "email": body.email,
        "name": body.name,
        "role": body.role,
        "hashed_password": hash_password(body.password),
    }
    token = create_access_token(data={"sub": body.email, "role": body.role, "name": body.name, "uid": user_id})
    user = User(id=user_id, email=body.email, name=body.name, role=body.role)
    return AuthToken(access_token=token, token_type="bearer", user=user)

@app.post("/auth/login", response_model=AuthToken)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Login and get access token"""
    u = _users.get(form_data.username)
    if not u or not verify_password(form_data.password, u["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(
        data={"sub": form_data.username, "role": u["role"], "name": u["name"], "uid": u["id"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    user = User(id=u["id"], email=u["email"], name=u["name"], role=u["role"])
    return AuthToken(access_token=token, token_type="bearer", user=user)

@app.get("/auth/me", response_model=User)
async def me(current_user: User = Depends(get_current_user)):
    return current_user

# PHASE 2: Session + Interview Core
@app.post("/challenges", response_model=Challenge)
async def create_challenge(challenge: Challenge):
    """Create a new coding challenge"""
    challenge.id = f"challenge_{datetime.utcnow().timestamp()}"
    return challenge

@app.get("/challenges", response_model=List[Challenge])
async def list_challenges():
    """List all challenges"""
    return []

@app.post("/sessions", response_model=Session)
async def create_session(session: Session):
    """Create a new interview session"""
    session.id = f"session_{datetime.utcnow().timestamp()}"
    session.started_at = datetime.utcnow().isoformat()
    return session

@app.get("/sessions/{session_id}", response_model=Session)
async def get_session(session_id: str):
    """Get session details"""
    return Session(
        id=session_id,
        challenge_id="challenge_1",
        candidate_id="candidate_1",
        interviewer_id="interviewer_1",
        status="active"
    )

# PHASE 4: AI Chat + Ethics Gate
@app.post("/ai/prompt", response_model=AIPromptResponse)
async def process_ai_prompt(request: AIPromptRequest):
    """Process AI prompt with ethics gate"""
    try:
        # Get session to check assistance level
        assistance_level = "syntax_only"  # In production, fetch from session
        
        # Run through ethics gate
        gate_result = ethics_logic_gate(request.prompt, assistance_level)
        
        if not gate_result["allowed"]:
            return AIPromptResponse(
                response="",
                allowed=False,
                violation=gate_result["violation"]
            )
        
        # In production, call OpenAI API here
        mock_response = f"Mock AI response for: {request.prompt}"
        
        return AIPromptResponse(
            response=mock_response,
            allowed=True
        )
        
    except PolicyViolation as e:
        return AIPromptResponse(
            response="",
            allowed=False,
            violation=str(e)
        )

@app.get("/sessions/{session_id}/prompts")
async def get_session_prompts(session_id: str):
    """Get all AI prompts for a session (for interviewer review)"""
    return []


# ─── PROCTOR: WebSocket for live webcam gaze detection ─────────
# 
# How this works:
#   1. Frontend opens WebSocket to ws://localhost:8000/ws/proctor
#   2. Frontend captures webcam frames as base64 JPEG (~5 FPS)
#   3. Frontend sends each frame as a text message
#   4. Server decodes the JPEG, runs MediaPipe face detection
#   5. Server runs gaze + head pose analysis
#   6. Server sends back JSON with status, direction, angles
#
# The frontend uses this to show a green/red overlay on the webcam feed.
# ────────────────────────────────────────────────────────────────

log = logging.getLogger("proctor")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# MediaPipe face landmarker (IMAGE mode = one frame at a time)
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "mediapipe-core", "face_landmarker_v2_with_blendshapes.task")

_landmarker = None

def get_landmarker():
    """Lazy-load the MediaPipe landmarker (so server starts even if model missing)."""
    global _landmarker
    if _landmarker is None:
        opts = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=MODEL_PATH),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
        )
        _landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(opts)
        log.info("MediaPipe face landmarker loaded")
    return _landmarker


# One GazeAnalyzer per WebSocket connection (tracks cheat_counter per user)
@app.websocket("/ws/proctor")
async def proctor_websocket(ws: WebSocket):
    await ws.accept()
    analyzer = GazeAnalyzer()
    landmarker = get_landmarker()
    log.info("Proctor WebSocket connected")

    try:
        while True:
            # Receive base64-encoded JPEG from frontend
            data = await ws.receive_text()

            # Strip data URL prefix if present: "data:image/jpeg;base64,..."
            if "," in data:
                data = data.split(",", 1)[1]

            # Decode base64 → bytes → numpy array → RGB image (skip BGR→RGB conversion)
            img_bytes = base64.b64decode(data)
            np_arr = np.frombuffer(img_bytes, dtype=np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

            if frame is None:
                await ws.send_json({"error": "Could not decode frame"})
                continue

            # Downscale for faster processing (MediaPipe doesn't need full res)
            frame_small = cv2.resize(frame, (320, 240))
            h, w = frame_small.shape[:2]

            # Run MediaPipe face detection
            rgb = cv2.cvtColor(frame_small, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = landmarker.detect(mp_image)

            if not result.face_landmarks:
                # No face detected — suspicious
                analyzer.cheat_counter += 1
                await ws.send_json({
                    "status": "NO_FACE",
                    "gaze": "NO_FACE",
                    "lateral": 0,
                    "angle": 0,
                    "cheating": analyzer.cheat_counter >= analyzer.cheat_frame_threshold,
                    "cheat_counter": analyzer.cheat_counter,
                    "face_count": 0,
                })
                continue

            # Analyze the first face
            face = result.face_landmarks[0]
            analysis = analyzer.analyze(face, w, h)
            analysis["face_count"] = len(result.face_landmarks)

            # Multiple faces = also suspicious
            if len(result.face_landmarks) > 1:
                analysis["status"] = "MULTIPLE_FACES"
                analysis["gaze"] = "MULTIPLE_FACES"

            await ws.send_json(analysis)

    except WebSocketDisconnect:
        log.info("Proctor WebSocket disconnected")
    except Exception as e:
        log.error(f"Proctor WebSocket error: {e}")
        await ws.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
