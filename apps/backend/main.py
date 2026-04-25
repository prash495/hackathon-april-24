from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
import os
from dotenv import load_dotenv
from datetime import datetime
from jose import JWTError, jwt
from supabase import create_client, Client

load_dotenv()

# ─── App setup ───────────────────────────────────────────────
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

# ─── Supabase client (service role — bypasses RLS for server ops) ─
SUPABASE_URL      = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY      = os.getenv("SUPABASE_KEY", "")          # anon key
SUPABASE_SERVICE  = os.getenv("SUPABASE_SERVICE_KEY", "")  # service role key
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")

# Public client (anon key) — for auth operations
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Service client — for server-side DB reads that bypass RLS
supabase_admin: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE or SUPABASE_KEY)

# ─── Security ────────────────────────────────────────────────
bearer_scheme = HTTPBearer(auto_error=False)

# ─── Models ──────────────────────────────────────────────────
class User(BaseModel):
    id: str
    email: str
    name: str
    role: str

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    role: str  # 'candidate' | 'interviewer'

class LoginRequest(BaseModel):
    email: str
    password: str

class AuthToken(BaseModel):
    access_token: str
    token_type: str
    user: User

class Challenge(BaseModel):
    id: Optional[str] = None
    title: str
    description: str
    difficulty: str
    assistance_level: str
    starter_code: Optional[str] = None
    created_by: Optional[str] = None

class SessionModel(BaseModel):
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

# ─── JWT verification ─────────────────────────────────────────
def verify_supabase_jwt(token: str) -> dict:
    """
    Verify a Supabase-issued JWT.
    Tries python-jose first; falls back to Supabase get_user() if secret is wrong.
    """
    if SUPABASE_JWT_SECRET:
        try:
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            return payload
        except JWTError:
            pass  # fall through to Supabase API verification

    # Fallback: ask Supabase to verify the token
    try:
        result = supabase_admin.auth.get_user(token)
        if result and result.user:
            return {"sub": result.user.id, "email": result.user.email}
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    raise HTTPException(status_code=401, detail="Token verification failed")

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authorization header missing")

    payload = verify_supabase_jwt(credentials.credentials)
    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    # Fetch profile from Supabase (service role bypasses RLS)
    result = supabase_admin.table("profiles").select("*").eq("id", user_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    p = result.data
    return User(id=p["id"], email=p["email"], name=p["name"], role=p["role"])

# ─── Ethics gate ─────────────────────────────────────────────
class PolicyViolation(Exception):
    pass

BLOCKED_INTENTS = {
    "solve_entire_problem",
    "write_complete_solution",
    "optimize_full_submission",
    "generate_answer",
}

def analyze_prompt_intent(prompt: str) -> str:
    p = prompt.lower()
    if any(x in p for x in ["solve this", "complete solution", "write the code", "give me the answer", "full implementation"]):
        return "solve_entire_problem"
    if any(x in p for x in ["syntax for", "how do i", "what's the api", "import statement", "function signature"]):
        return "syntax_lookup"
    if any(x in p for x in ["explain", "how does", "what is", "when should"]):
        return "conceptual_question"
    return "unknown"

def ethics_logic_gate(prompt: str, assistance_level: str) -> dict:
    intent = analyze_prompt_intent(prompt)
    if intent in BLOCKED_INTENTS:
        raise PolicyViolation("Full-solution requests are prohibited during interviews.")
    if assistance_level == "syntax_only" and intent != "syntax_lookup":
        return {"allowed": False, "violation": f"Only syntax questions allowed. Detected: {intent}"}
    return {"allowed": True, "intent": intent}

# ─── Routes ──────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"message": "InterviewPilot API", "version": "1.0.0"}

@app.get("/health")
def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# ── Auth ──────────────────────────────────────────────────────

@app.post("/auth/register", response_model=AuthToken)
async def register(body: RegisterRequest):
    """
    1. Check if email already exists in profiles
    2. Create user in Supabase Auth
    3. Upsert profile row (trigger may or may not have fired)
    4. Return Supabase JWT + profile
    """
    import time

    if body.role not in ("candidate", "interviewer"):
        raise HTTPException(status_code=400, detail="Role must be 'candidate' or 'interviewer'")

    # ── Step 1: pre-check for duplicate email via Supabase Auth ─
    # Try to sign in — if it succeeds, the email already exists
    try:
        test = supabase.auth.sign_in_with_password({
            "email": body.email,
            "password": "___probe___",  # wrong password on purpose
        })
    except Exception as probe_err:
        probe_msg = str(probe_err).lower()
        # "invalid login credentials" means the email EXISTS but password is wrong
        if "invalid" in probe_msg and "credential" in probe_msg:
            raise HTTPException(
                status_code=409,
                detail="An account with this email already exists. Please sign in instead."
            )
        # Any other error (e.g. "email not found") means email is free — continue

    # ── Step 2: create Supabase Auth user ─────────────────────
    try:
        auth_response = supabase.auth.sign_up({
            "email": body.email,
            "password": body.password,
            "options": {"data": {"name": body.name, "role": body.role}},
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not auth_response.user:
        raise HTTPException(status_code=400, detail="Registration failed")

    user_obj = auth_response.user
    session  = auth_response.session

    # ── Step 3: upsert profile directly (don't rely solely on trigger) ──
    time.sleep(0.5)
    try:
        supabase_admin.table("profiles").upsert({
            "id":    user_obj.id,
            "email": body.email,
            "name":  body.name,
            "role":  body.role,
        }).execute()
    except Exception:
        pass  # trigger may have already inserted it; ignore duplicate

    # ── Step 4: return token ───────────────────────────────────
    if not session:
        raise HTTPException(
            status_code=202,
            detail="Account created. Please check your email to confirm before signing in."
        )

    p = {"id": user_obj.id, "email": body.email, "name": body.name, "role": body.role}
    return AuthToken(
        access_token=session.access_token,
        token_type="bearer",
        user=User(**p),
    )


@app.post("/auth/login", response_model=AuthToken)
async def login(body: LoginRequest):
    """
    Sign in via Supabase Auth, return Supabase JWT + profile.
    """
    try:
        auth_response = supabase.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
    except Exception as e:
        err_msg = str(e).lower()
        if "invalid" in err_msg or "credentials" in err_msg or "email" in err_msg:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        raise HTTPException(status_code=400, detail=str(e))

    if not auth_response.user or not auth_response.session:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Fetch profile
    profile = supabase_admin.table("profiles") \
        .select("*") \
        .eq("id", auth_response.user.id) \
        .single() \
        .execute()

    if not profile.data:
        raise HTTPException(status_code=404, detail="Profile not found. Please sign up first.")

    p = profile.data
    user = User(id=p["id"], email=p["email"], name=p["name"], role=p["role"])
    return AuthToken(
        access_token=auth_response.session.access_token,
        token_type="bearer",
        user=user,
    )


@app.get("/auth/me", response_model=User)
async def me(current_user: User = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return current_user


# ── Challenges ────────────────────────────────────────────────

@app.post("/challenges", response_model=Challenge)
async def create_challenge(
    challenge: Challenge,
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "interviewer":
        raise HTTPException(status_code=403, detail="Only interviewers can create challenges")
    challenge.id = f"challenge_{datetime.utcnow().timestamp()}"
    challenge.created_by = current_user.id
    return challenge


@app.get("/challenges", response_model=List[Challenge])
async def list_challenges(current_user: User = Depends(get_current_user)):
    return []


# ── Sessions ──────────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    challenge_id: str
    assistance_level: int = 1
    max_prompts: int = 20

class SessionResponse(BaseModel):
    id: str
    challenge_id: Optional[str]
    interviewer_id: str
    candidate_id: Optional[str]
    status: str
    assistance_level: int
    max_prompts: int
    join_link: Optional[str] = None
    created_at: Optional[str]

@app.post("/sessions", response_model=SessionResponse)
async def create_session(
    body: CreateSessionRequest,
    current_user: User = Depends(get_current_user),
):
    """Interviewer creates a session. Returns a join link for the candidate."""
    if current_user.role != "interviewer":
        raise HTTPException(status_code=403, detail="Only interviewers can create sessions")

    result = supabase_admin.table("interview_sessions").insert({
        "challenge_id":     body.challenge_id,
        "interviewer_id":   current_user.id,
        "assistance_level": body.assistance_level,
        "max_prompts":      body.max_prompts,
        "status":           "pending",
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create session")

    row = result.data[0]
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    return SessionResponse(
        **{k: row[k] for k in ("id","challenge_id","interviewer_id","candidate_id","status","assistance_level","max_prompts","created_at")},
        join_link=f"{frontend_url}/join/{row['id']}",
    )


@app.post("/sessions/{session_id}/join", response_model=SessionResponse)
async def join_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
):
    """Candidate joins a pending session — links their profile to it."""
    if current_user.role != "candidate":
        raise HTTPException(status_code=403, detail="Only candidates can join sessions")

    # Fetch session
    result = supabase_admin.table("interview_sessions") \
        .select("*").eq("id", session_id).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Session not found")

    session = result.data

    if session["status"] not in ("pending",):
        raise HTTPException(
            status_code=409,
            detail=f"Session is already {session['status']} and cannot be joined"
        )

    if session["candidate_id"] and session["candidate_id"] != current_user.id:
        raise HTTPException(status_code=409, detail="Session already has a candidate")

    # Link candidate + set active
    updated = supabase_admin.table("interview_sessions").update({
        "candidate_id": current_user.id,
        "status":       "active",
        "started_at":   datetime.utcnow().isoformat(),
    }).eq("id", session_id).execute()

    row = updated.data[0]
    return SessionResponse(
        **{k: row[k] for k in ("id","challenge_id","interviewer_id","candidate_id","status","assistance_level","max_prompts","created_at")},
    )


@app.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
):
    result = supabase_admin.table("interview_sessions") \
        .select("*").eq("id", session_id).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Session not found")

    row = result.data
    # Only participants can view
    if current_user.id not in (row["interviewer_id"], row.get("candidate_id")):
        raise HTTPException(status_code=403, detail="Not a participant in this session")

    return SessionResponse(
        **{k: row[k] for k in ("id","challenge_id","interviewer_id","candidate_id","status","assistance_level","max_prompts","created_at")},
    )


@app.get("/sessions", response_model=List[SessionResponse])
async def list_sessions(current_user: User = Depends(get_current_user)):
    """List all sessions for the current user (as interviewer or candidate)."""
    if current_user.role == "interviewer":
        result = supabase_admin.table("interview_sessions") \
            .select("*").eq("interviewer_id", current_user.id) \
            .order("created_at", desc=True).execute()
    else:
        result = supabase_admin.table("interview_sessions") \
            .select("*").eq("candidate_id", current_user.id) \
            .order("created_at", desc=True).execute()

    sessions = []
    for row in (result.data or []):
        sessions.append(SessionResponse(
            **{k: row[k] for k in ("id","challenge_id","interviewer_id","candidate_id","status","assistance_level","max_prompts","created_at")},
        ))
    return sessions


@app.patch("/sessions/{session_id}/end")
async def end_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
):
    """Interviewer ends the session."""
    result = supabase_admin.table("interview_sessions") \
        .select("interviewer_id").eq("id", session_id).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Session not found")
    if result.data["interviewer_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Only the interviewer can end this session")

    supabase_admin.table("interview_sessions").update({
        "status":   "completed",
        "ended_at": datetime.utcnow().isoformat(),
    }).eq("id", session_id).execute()

    return {"ok": True, "status": "completed"}


# ── AI / Ethics gate ──────────────────────────────────────────

@app.post("/ai/prompt", response_model=AIPromptResponse)
async def process_ai_prompt(
    request: AIPromptRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        assistance_level = "syntax_only"
        gate_result = ethics_logic_gate(request.prompt, assistance_level)
        if not gate_result["allowed"]:
            return AIPromptResponse(response="", allowed=False, violation=gate_result["violation"])
        mock_response = f"Mock AI response for: {request.prompt}"
        return AIPromptResponse(response=mock_response, allowed=True)
    except PolicyViolation as e:
        return AIPromptResponse(response="", allowed=False, violation=str(e))


@app.get("/sessions/{session_id}/prompts")
async def get_session_prompts(
    session_id: str,
    current_user: User = Depends(get_current_user),
):
    return []


# ── Code execution (Judge0) ───────────────────────────────────

JUDGE0_URL = os.getenv("JUDGE0_URL", "https://judge0-ce.p.rapidapi.com")
JUDGE0_KEY = os.getenv("JUDGE0_API_KEY", "")

class ExecuteRequest(BaseModel):
    source_code: str
    language_id: int
    stdin: Optional[str] = ""

class ExecuteResponse(BaseModel):
    stdout:  Optional[str] = None
    stderr:  Optional[str] = None
    status:  dict
    time:    Optional[str] = None
    memory:  Optional[int] = None

@app.post("/execute", response_model=ExecuteResponse)
async def execute_code(
    body: ExecuteRequest,
    current_user: User = Depends(get_current_user),
):
    """Submit code to Judge0 and return result."""
    import httpx, base64, asyncio

    headers = {
        "Content-Type": "application/json",
        "X-RapidAPI-Key": JUDGE0_KEY,
        "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
    }
    payload = {
        "source_code": base64.b64encode(body.source_code.encode()).decode(),
        "language_id": body.language_id,
        "stdin":       base64.b64encode((body.stdin or "").encode()).decode(),
        "base64_encoded": True,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        # Submit
        sub = await client.post(f"{JUDGE0_URL}/submissions?base64_encoded=true", json=payload, headers=headers)
        if sub.status_code != 201:
            raise HTTPException(status_code=502, detail="Judge0 submission failed")
        token = sub.json()["token"]

        # Poll for result
        for _ in range(10):
            await asyncio.sleep(1.5)
            res = await client.get(f"{JUDGE0_URL}/submissions/{token}?base64_encoded=true", headers=headers)
            data = res.json()
            if data["status"]["id"] not in (1, 2):  # 1=queued, 2=processing
                def decode(s): return base64.b64decode(s).decode() if s else None
                return ExecuteResponse(
                    stdout=decode(data.get("stdout")),
                    stderr=decode(data.get("stderr")),
                    status=data["status"],
                    time=data.get("time"),
                    memory=data.get("memory"),
                )

    raise HTTPException(status_code=504, detail="Execution timed out")


# ── Proctor events ────────────────────────────────────────────

class ProctorEventRequest(BaseModel):
    session_id: str
    event_type: str
    severity:   str = "low"
    metadata:   dict = {}

@app.post("/proctor/event")
async def log_proctor_event(
    body: ProctorEventRequest,
    current_user: User = Depends(get_current_user),
):
    """Log a proctor event to Supabase."""
    supabase_admin.table("proctor_events").insert({
        "session_id": body.session_id,
        "event_type": body.event_type,
        "severity":   body.severity,
        "metadata":   body.metadata,
    }).execute()
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
