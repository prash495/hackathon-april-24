from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from typing import Optional, List
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
from jose import JWTError, jwt
import bcrypt
from supabase import create_client, Client

load_dotenv()

# ── Supabase client ─────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY (or SUPABASE_SERVICE_KEY) must be set")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── App setup ────────────────────────────────────────────────
app = FastAPI(
    title="InterviewPilot API",
    description="AI-Powered Honest Coding Interviews",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# ── Models ───────────────────────────────────────────────────
class User(BaseModel):
    id: Optional[str] = None
    email: str
    name: str
    role: str

class Token(BaseModel):
    access_token: str
    token_type: str

class Challenge(BaseModel):
    id: Optional[str] = None
    title: str
    description: str
    difficulty: str = "medium"
    assistance_level: Optional[int] = 1
    starter_code: Optional[str] = None
    language: Optional[str] = "python"
    created_by: Optional[str] = None

class Session(BaseModel):
    id: Optional[str] = None
    challenge_id: Optional[str] = None
    candidate_id: Optional[str] = None
    interviewer_id: str
    status: str = "pending"
    assistance_level: Optional[int] = 1
    max_prompts: Optional[int] = 20
    started_at: Optional[str] = None

class AIPromptRequest(BaseModel):
    prompt: str
    session_id: str

class AIPromptResponse(BaseModel):
    response: str
    allowed: bool
    violation: Optional[str] = None

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    role: str

class LoginRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None
    role: Optional[str] = None

class AuthToken(BaseModel):
    access_token: str
    token_type: str
    user: User

class PolicyViolation(Exception):
    pass

# ── Helpers ──────────────────────────────────────────────────
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        uid: str = payload.get("uid", "")
        role: str = payload.get("role", "")
        name: str = payload.get("name", "")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
        # Verify user still exists in Supabase
        res = supabase.table("profiles").select("id").eq("email", email).execute()
        if not res.data:
            raise HTTPException(status_code=401, detail="User not found")
        return User(id=uid, email=email, name=name, role=role)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ── Ethics gate ──────────────────────────────────────────────
BLOCKED_INTENTS = {
    "solve_entire_problem",
    "write_complete_solution",
    "optimize_full_submission",
    "generate_answer",
}

def analyze_prompt_intent(prompt: str) -> str:
    prompt_lower = prompt.lower()
    if any(p in prompt_lower for p in [
        "solve this", "complete solution", "write the code",
        "give me the answer", "full implementation",
    ]):
        return "solve_entire_problem"
    if any(p in prompt_lower for p in [
        "syntax for", "how do i", "what's the api",
        "import statement", "function signature",
    ]):
        return "syntax_lookup"
    if any(p in prompt_lower for p in ["explain", "how does", "what is", "when should"]):
        return "conceptual_question"
    return "unknown"

def ethics_logic_gate(prompt: str, assistance_level: int) -> dict:
    intent = analyze_prompt_intent(prompt)
    if intent in BLOCKED_INTENTS:
        raise PolicyViolation("Full-solution requests are prohibited during interviews.")
    if assistance_level == 0:
        return {"allowed": False, "violation": "AI assistance is disabled for this session."}
    if assistance_level == 1 and intent not in ("syntax_lookup", "unknown"):
        return {"allowed": False, "violation": f"Only syntax questions allowed at this level. Detected: {intent}"}
    return {"allowed": True, "intent": intent}

# ── Routes: health ───────────────────────────────────────────
@app.get("/")
def read_root():
    return {"message": "InterviewPilot API", "version": "1.0.0"}

@app.get("/health")
def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# ── Routes: auth ─────────────────────────────────────────────
@app.post("/auth/register", response_model=AuthToken)
async def register(body: RegisterRequest):
    # Check if email already exists
    existing = supabase.table("profiles").select("id").eq("email", body.email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create auth user via Supabase Auth (server-side)
    try:
        auth_res = supabase.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
            "user_metadata": {"name": body.name, "role": body.role},
        })
        user_id = auth_res.user.id
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Registration failed: {str(e)}")

    # The DB trigger (handle_new_user) auto-creates the profile row,
    # but let's make sure we can read it back
    profile = supabase.table("profiles").select("*").eq("id", user_id).execute()
    if not profile.data:
        # Fallback: insert manually if trigger didn't fire
        supabase.table("profiles").insert({
            "id": user_id,
            "email": body.email,
            "name": body.name,
            "role": body.role,
        }).execute()

    token = create_access_token(
        data={"sub": body.email, "role": body.role, "name": body.name, "uid": str(user_id)},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    user = User(id=str(user_id), email=body.email, name=body.name, role=body.role)
    return AuthToken(access_token=token, token_type="bearer", user=user)

@app.post("/auth/login", response_model=AuthToken)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Login with email + password via Supabase Auth"""
    try:
        auth_res = supabase.auth.sign_in_with_password({
            "email": form_data.username,
            "password": form_data.password,
        })
        sb_user = auth_res.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Fetch profile
    profile = supabase.table("profiles").select("*").eq("id", sb_user.id).execute()
    if not profile.data:
        raise HTTPException(status_code=401, detail="Profile not found")

    p = profile.data[0]
    token = create_access_token(
        data={"sub": p["email"], "role": p["role"], "name": p["name"], "uid": str(p["id"])},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    user = User(id=str(p["id"]), email=p["email"], name=p["name"], role=p["role"])
    return AuthToken(access_token=token, token_type="bearer", user=user)

@app.get("/auth/me", response_model=User)
async def me(current_user: User = Depends(get_current_user)):
    return current_user

# ── Routes: challenges ───────────────────────────────────────
@app.post("/challenges", response_model=Challenge)
async def create_challenge(challenge: Challenge, current_user: User = Depends(get_current_user)):
    row = {
        "interviewer_id": current_user.id,
        "title": challenge.title,
        "description": challenge.description,
        "difficulty": challenge.difficulty,
        "starter_code": challenge.starter_code,
        "language": challenge.language or "python",
        "assistance_level": challenge.assistance_level or 1,
    }
    res = supabase.table("challenges").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create challenge")
    d = res.data[0]
    return Challenge(
        id=str(d["id"]), title=d["title"], description=d["description"],
        difficulty=d["difficulty"], assistance_level=d["assistance_level"],
        starter_code=d.get("starter_code"), language=d.get("language"),
        created_by=str(d["interviewer_id"]),
    )

@app.get("/challenges", response_model=List[Challenge])
async def list_challenges(current_user: User = Depends(get_current_user)):
    res = supabase.table("challenges").select("*").eq("interviewer_id", current_user.id).eq("is_archived", False).execute()
    return [
        Challenge(
            id=str(d["id"]), title=d["title"], description=d["description"],
            difficulty=d["difficulty"], assistance_level=d["assistance_level"],
            starter_code=d.get("starter_code"), language=d.get("language"),
            created_by=str(d["interviewer_id"]),
        )
        for d in (res.data or [])
    ]

# ── Routes: sessions ────────────────────────────────────────
@app.post("/sessions", response_model=Session)
async def create_session(session: Session, current_user: User = Depends(get_current_user)):
    row = {
        "challenge_id": session.challenge_id,
        "interviewer_id": current_user.id,
        "candidate_id": session.candidate_id,
        "assistance_level": session.assistance_level or 1,
        "max_prompts": session.max_prompts or 20,
        "status": "pending",
    }
    res = supabase.table("interview_sessions").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create session")
    d = res.data[0]
    return Session(
        id=str(d["id"]), challenge_id=str(d["challenge_id"]) if d.get("challenge_id") else None,
        candidate_id=str(d["candidate_id"]) if d.get("candidate_id") else None,
        interviewer_id=str(d["interviewer_id"]), status=d["status"],
        assistance_level=d["assistance_level"], max_prompts=d["max_prompts"],
        started_at=d.get("started_at"),
    )

@app.get("/sessions/{session_id}", response_model=Session)
async def get_session(session_id: str, current_user: User = Depends(get_current_user)):
    res = supabase.table("interview_sessions").select("*").eq("id", session_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    d = res.data[0]
    return Session(
        id=str(d["id"]), challenge_id=str(d["challenge_id"]) if d.get("challenge_id") else None,
        candidate_id=str(d["candidate_id"]) if d.get("candidate_id") else None,
        interviewer_id=str(d["interviewer_id"]), status=d["status"],
        assistance_level=d["assistance_level"], max_prompts=d["max_prompts"],
        started_at=d.get("started_at"),
    )

# ── Routes: AI prompt + ethics gate ──────────────────────────
@app.post("/ai/prompt", response_model=AIPromptResponse)
async def process_ai_prompt(request: AIPromptRequest, current_user: User = Depends(get_current_user)):
    try:
        # Fetch session to get assistance level
        sess_res = supabase.table("interview_sessions").select("assistance_level").eq("id", request.session_id).execute()
        assistance_level = sess_res.data[0]["assistance_level"] if sess_res.data else 1

        gate_result = ethics_logic_gate(request.prompt, assistance_level)

        intent = gate_result.get("intent", "unknown")
        was_blocked = not gate_result["allowed"]
        violation = gate_result.get("violation")
        response_text = ""

        if gate_result["allowed"]:
            # TODO: call OpenAI here
            response_text = f"Mock AI response for: {request.prompt}"

        # Log to prompt_logs
        supabase.table("prompt_logs").insert({
            "session_id": request.session_id,
            "candidate_id": current_user.id,
            "prompt_text": request.prompt,
            "response_text": response_text or None,
            "intent": intent,
            "was_blocked": was_blocked,
            "violation_reason": violation,
        }).execute()

        return AIPromptResponse(response=response_text, allowed=not was_blocked, violation=violation)

    except PolicyViolation as e:
        # Log blocked attempt
        supabase.table("prompt_logs").insert({
            "session_id": request.session_id,
            "candidate_id": current_user.id,
            "prompt_text": request.prompt,
            "response_text": None,
            "intent": "solve_entire_problem",
            "was_blocked": True,
            "violation_reason": str(e),
        }).execute()
        return AIPromptResponse(response="", allowed=False, violation=str(e))

@app.get("/sessions/{session_id}/prompts")
async def get_session_prompts(session_id: str, current_user: User = Depends(get_current_user)):
    res = (
        supabase.table("prompt_logs")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
    )
    return res.data or []

# ── Entrypoint ───────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
