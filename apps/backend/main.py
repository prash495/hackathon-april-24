from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import os
import logging
import subprocess
import threading
import tempfile
import shutil
from dotenv import load_dotenv
from datetime import datetime, timedelta
from jose import JWTError, jwt
import bcrypt
import httpx
import anthropic
from supabase import create_client, Client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Supabase client ─────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY (or SUPABASE_SERVICE_KEY) must be set")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Anthropic client ─────────────────────────────────────────
_anthropic = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_KEY"))

SYSTEM_PROMPTS = {
    1: (
        "You are a syntax-only coding assistant during a technical interview. "
        "You may ONLY answer questions about syntax: show short code snippets demonstrating language syntax, "
        "built-in functions, or standard library usage. "
        "You must NEVER explain algorithms, suggest problem-solving approaches, discuss logic, "
        "or help with the candidate's specific problem. "
        "If the question is not purely about syntax, respond: 'I can only help with syntax questions at this level.'"
    ),
    2: (
        "You are a conceptual coding assistant during a technical interview. "
        "You may explain concepts, data structures, algorithms in general terms, and suggest high-level approaches. "
        "You must NEVER write or complete the candidate's solution, provide the full algorithm for their specific problem, "
        "or give step-by-step implementation instructions that solve the problem directly. "
        "Give hints and conceptual guidance only."
    ),
    3: (
        "You are a helpful coding assistant during a technical interview. "
        "Answer the candidate's questions fully and helpfully. "
        "You may explain concepts, suggest approaches, review code, and provide examples."
    ),
}

def call_claude(prompt: str, code: str, level: int) -> str:
    system = SYSTEM_PROMPTS[level]
    user_content = prompt
    if code and code.strip():
        user_content = f"My current code:\n```\n{code}\n```\n\n{prompt}"
    msg = _anthropic.messages.create(
        # model="claude-3-5-haiku-latest",
        model = "claude-haiku-4-5-20251001",
        max_tokens=512,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    )
    return msg.content[0].text

# ── App setup ────────────────────────────────────────────────
app = FastAPI(
    title="InterviewPilot API",
    description="AI-Powered Honest Coding Interviews",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# ── Proctor subprocess manager ───────────────────────────────
_proctor_processes: dict[str, tuple[subprocess.Popen, int]] = {}
_next_stream_port = 9100

PROCTOR_SCRIPT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "mediapipe-core", "proctor.py"
)

def _get_proctor_cmd(session_id: str, candidate_id: str, stream_port: int) -> list[str]:
    script = os.path.abspath(PROCTOR_SCRIPT)
    is_wsl = "microsoft" in os.uname().release.lower() if hasattr(os, "uname") else False
    if is_wsl:
        win_script = subprocess.check_output(["wslpath", "-w", script], text=True).strip()
        win_project = subprocess.check_output(
            ["wslpath", "-w", os.path.abspath(os.path.join(os.path.dirname(script), ".."))], text=True
        ).strip()
        win_venv_python = win_project + "\\.venv\\Scripts\\python.exe"
        return [
            "powershell.exe", "-Command",
            f"cd '{win_project}'; & '{win_venv_python}' '{win_script}' {session_id} {SUPABASE_URL} {SUPABASE_KEY} {candidate_id} {stream_port}",
        ]
    else:
        return ["uv", "run", "python", script, session_id, SUPABASE_URL, SUPABASE_KEY, candidate_id, str(stream_port)]

def start_proctor(session_id: str, candidate_id: str) -> int:
    global _next_stream_port
    if session_id in _proctor_processes:
        proc, port = _proctor_processes[session_id]
        if proc.poll() is None:
            return port
    stream_port = _next_stream_port
    _next_stream_port += 1
    cmd = _get_proctor_cmd(session_id, candidate_id, stream_port)
    print(f"[BACKEND] Launching proctor cmd: {cmd}", flush=True)
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    _proctor_processes[session_id] = (proc, stream_port)
    print(f"[BACKEND] Proctor started session={session_id} pid={proc.pid} port={stream_port}", flush=True)
    def _check():
        import time; time.sleep(3)
        if proc.poll() is not None:
            stderr = proc.stderr.read().decode() if proc.stderr else ""
            print(f"[BACKEND] Proctor DIED session={session_id} exit={proc.returncode}", flush=True)
            if stderr: print(f"[BACKEND] stderr: {stderr[:500]}", flush=True)
    threading.Thread(target=_check, daemon=True).start()
    return stream_port

def stop_proctor(session_id: str):
    entry = _proctor_processes.pop(session_id, None)
    if entry:
        proc, _ = entry
        if proc.poll() is None:
            is_wsl = "microsoft" in os.uname().release.lower() if hasattr(os, "uname") else False
            if is_wsl:
                # Kill the entire Windows process tree spawned by powershell
                try:
                    # Get the Windows PID and kill the tree
                    subprocess.run(
                        ["powershell.exe", "-Command", f"Stop-Process -Id {proc.pid} -Force -ErrorAction SilentlyContinue"],
                        timeout=5, capture_output=True,
                    )
                except Exception:
                    pass
                # Also kill any python.exe running proctor.py
                try:
                    subprocess.run(
                        ["powershell.exe", "-Command",
                         "Get-Process python -ErrorAction SilentlyContinue | Where-Object {$_.CommandLine -like '*proctor.py*'} | Stop-Process -Force"],
                        timeout=5, capture_output=True,
                    )
                except Exception:
                    pass
            proc.terminate()
            try: proc.wait(timeout=5)
            except subprocess.TimeoutExpired: proc.kill()
        print(f"[BACKEND] Proctor stopped session={session_id}")

# ── Models ───────────────────────────────────────────────────
class User(BaseModel):
    id: Optional[str] = None
    email: str
    name: str
    role: str

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
    code: Optional[str] = None

class AIPromptResponse(BaseModel):
    response: str
    allowed: bool
    violation: Optional[str] = None

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    role: str

class AuthToken(BaseModel):
    access_token: str
    token_type: str
    user: User

class PolicyViolation(Exception):
    pass

class CodeRunRequest(BaseModel):
    code: str
    language: str
    stdin: Optional[str] = ""

class CodeRunResponse(BaseModel):
    stdout: str
    stderr: str
    exit_code: int
    timed_out: bool

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
        email = payload.get("sub")
        uid = payload.get("uid", "")
        role = payload.get("role", "")
        name = payload.get("name", "")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
        res = supabase.table("profiles").select("id").eq("email", email).execute()
        if not res.data:
            raise HTTPException(status_code=401, detail="User not found")
        return User(id=uid, email=email, name=name, role=role)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ── Ethics gate ──────────────────────────────────────────────
BLOCKED_INTENTS = {"solve_entire_problem", "write_complete_solution", "optimize_full_submission", "generate_answer"}

def analyze_prompt_intent(prompt: str) -> str:
    p = prompt.lower()
    if any(x in p for x in ["solve this", "complete solution", "write the code", "give me the answer", "full implementation"]):
        return "solve_entire_problem"
    if any(x in p for x in ["syntax for", "how do i", "what's the api", "import statement", "function signature"]):
        return "syntax_lookup"
    if any(x in p for x in ["explain", "how does", "what is", "when should"]):
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
    existing = supabase.table("profiles").select("id").eq("email", body.email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")
    try:
        auth_res = supabase.auth.admin.create_user({
            "email": body.email, "password": body.password, "email_confirm": True,
            "user_metadata": {"name": body.name, "role": body.role},
        })
        user_id = auth_res.user.id
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Registration failed: {str(e)}")
    profile = supabase.table("profiles").select("*").eq("id", user_id).execute()
    if not profile.data:
        supabase.table("profiles").insert({"id": user_id, "email": body.email, "name": body.name, "role": body.role}).execute()
    token = create_access_token(
        data={"sub": body.email, "role": body.role, "name": body.name, "uid": str(user_id)},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return AuthToken(access_token=token, token_type="bearer", user=User(id=str(user_id), email=body.email, name=body.name, role=body.role))

@app.post("/auth/login", response_model=AuthToken)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    try:
        auth_res = supabase.auth.sign_in_with_password({"email": form_data.username, "password": form_data.password})
        sb_user = auth_res.user
    except Exception as e:
        print(f"[LOGIN ERROR] email={form_data.username} error={e}")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    profile = supabase.table("profiles").select("*").eq("id", sb_user.id).execute()
    if not profile.data:
        raise HTTPException(status_code=401, detail="Profile not found")
    p = profile.data[0]
    token = create_access_token(
        data={"sub": p["email"], "role": p["role"], "name": p["name"], "uid": str(p["id"])},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return AuthToken(access_token=token, token_type="bearer", user=User(id=str(p["id"]), email=p["email"], name=p["name"], role=p["role"]))

@app.get("/auth/me", response_model=User)
async def me(current_user: User = Depends(get_current_user)):
    return current_user

# ── Routes: challenges ───────────────────────────────────────
@app.post("/challenges", response_model=Challenge)
async def create_challenge(challenge: Challenge, current_user: User = Depends(get_current_user)):
    row = {
        "interviewer_id": current_user.id, "title": challenge.title, "description": challenge.description,
        "difficulty": challenge.difficulty, "starter_code": challenge.starter_code,
        "language": challenge.language or "python", "assistance_level": challenge.assistance_level or 1,
    }
    res = supabase.table("challenges").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create challenge")
    d = res.data[0]
    return Challenge(id=str(d["id"]), title=d["title"], description=d["description"],
        difficulty=d["difficulty"], assistance_level=d["assistance_level"],
        starter_code=d.get("starter_code"), language=d.get("language"), created_by=str(d["interviewer_id"]))

@app.get("/challenges", response_model=List[Challenge])
async def list_challenges(current_user: User = Depends(get_current_user)):
    res = supabase.table("challenges").select("*").eq("interviewer_id", current_user.id).eq("is_archived", False).execute()
    return [Challenge(id=str(d["id"]), title=d["title"], description=d["description"],
        difficulty=d["difficulty"], assistance_level=d["assistance_level"],
        starter_code=d.get("starter_code"), language=d.get("language"), created_by=str(d["interviewer_id"]))
        for d in (res.data or [])]

# ── Routes: sessions ────────────────────────────────────────
@app.post("/sessions", response_model=Session)
async def create_session(session: Session, current_user: User = Depends(get_current_user)):
    row = {"challenge_id": session.challenge_id, "interviewer_id": current_user.id,
        "candidate_id": session.candidate_id, "assistance_level": session.assistance_level or 1,
        "max_prompts": session.max_prompts or 20, "status": "pending"}
    res = supabase.table("interview_sessions").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create session")
    d = res.data[0]
    return Session(id=str(d["id"]), challenge_id=str(d["challenge_id"]) if d.get("challenge_id") else None,
        candidate_id=str(d["candidate_id"]) if d.get("candidate_id") else None,
        interviewer_id=str(d["interviewer_id"]), status=d["status"],
        assistance_level=d["assistance_level"], max_prompts=d["max_prompts"], started_at=d.get("started_at"))

@app.get("/sessions/{session_id}", response_model=Session)
async def get_session(session_id: str, current_user: User = Depends(get_current_user)):
    res = supabase.table("interview_sessions").select("*").eq("id", session_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    d = res.data[0]
    return Session(id=str(d["id"]), challenge_id=str(d["challenge_id"]) if d.get("challenge_id") else None,
        candidate_id=str(d["candidate_id"]) if d.get("candidate_id") else None,
        interviewer_id=str(d["interviewer_id"]), status=d["status"],
        assistance_level=d["assistance_level"], max_prompts=d["max_prompts"], started_at=d.get("started_at"))

@app.post("/sessions/{session_id}/start")
async def start_session(session_id: str, current_user: User = Depends(get_current_user)):
    res = supabase.table("interview_sessions").select("*").eq("id", session_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    d = res.data[0]
    candidate_id = str(d["candidate_id"]) if d.get("candidate_id") else current_user.id
    supabase.table("interview_sessions").update({
        "status": "active", "started_at": datetime.utcnow().isoformat(),
    }).eq("id", session_id).execute()
    stream_port = start_proctor(session_id, candidate_id)
    return {"status": "active", "session_id": session_id, "proctor": "started", "stream_port": stream_port}

@app.post("/sessions/{session_id}/stop")
async def stop_session(session_id: str, current_user: User = Depends(get_current_user)):
    stop_proctor(session_id)
    supabase.table("interview_sessions").update({
        "status": "completed", "ended_at": datetime.utcnow().isoformat(),
    }).eq("id", session_id).execute()
    return {"status": "completed", "session_id": session_id, "proctor": "stopped"}

@app.get("/sessions/{session_id}/proctor-status")
async def proctor_status(session_id: str, current_user: User = Depends(get_current_user)):
    entry = _proctor_processes.get(session_id)
    if entry:
        proc, port = entry
        running = proc.poll() is None
    else:
        running = False
        port = None
    return {"session_id": session_id, "proctor_running": running,
        "stream_url": f"/sessions/{session_id}/stream" if running else None}

@app.get("/sessions/{session_id}/proctor-events")
async def get_proctor_events(session_id: str, current_user: User = Depends(get_current_user)):
    res = supabase.table("proctor_events").select("*").eq("session_id", session_id).order("occurred_at").execute()
    return res.data or []

class ProctorEventRequest(BaseModel):
    event_type: str
    severity: str = "medium"
    metadata: Optional[str] = None

@app.post("/sessions/{session_id}/proctor-events", status_code=201)
async def create_proctor_event(session_id: str, body: ProctorEventRequest, current_user: User = Depends(get_current_user)):
    try:
        supabase.table("proctor_events").insert({
            "session_id": session_id,
            "event_type": body.event_type,
            "severity": body.severity,
            "metadata": body.metadata or "{}",
        }).execute()
    except Exception as e:
        logger.error("Failed to persist proctor event for session %s: %s", session_id, e)
        raise
    return {"ok": True}

@app.get("/sessions/{session_id}/stream")
async def proxy_proctor_stream(session_id: str):
    """Proxy the MJPEG stream from the proctor subprocess."""
    entry = _proctor_processes.get(session_id)
    if not entry:
        raise HTTPException(status_code=404, detail="No proctor running")
    proc, port = entry
    if proc.poll() is not None:
        raise HTTPException(status_code=404, detail="Proctor stopped")
    proctor_host = "127.0.0.1"
    # On WSL, proctor runs on Windows — need Windows host IP
    is_wsl = "microsoft" in os.uname().release.lower() if hasattr(os, "uname") else False
    if is_wsl:
        try:
            # WSL2: the Windows host is reachable via the default gateway
            import re
            with open("/proc/net/route") as f:
                for line in f:
                    fields = line.strip().split()
                    if fields[1] == "00000000":  # default route
                        hex_ip = fields[2]
                        proctor_host = ".".join(str(int(hex_ip[i:i+2], 16)) for i in (6, 4, 2, 0))
                        break
        except Exception:
            proctor_host = "127.0.0.1"
    async def generate():
        async with httpx.AsyncClient() as client:
            try:
                async with client.stream("GET", f"http://{proctor_host}:{port}/stream", timeout=None) as resp:
                    async for chunk in resp.aiter_bytes(chunk_size=4096):
                        yield chunk
            except httpx.ConnectError:
                yield b""
    return StreamingResponse(generate(), media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*"})

# ── Routes: AI prompt + ethics gate ──────────────────────────
@app.post("/ai/prompt", response_model=AIPromptResponse)
async def process_ai_prompt(request: AIPromptRequest, current_user: User = Depends(get_current_user)):
    try:
        sess_res = supabase.table("interview_sessions").select("assistance_level").eq("id", request.session_id).execute()
        assistance_level = sess_res.data[0]["assistance_level"] if sess_res.data else 1

        # Level 0: disabled — log and return blocked immediately
        if assistance_level == 0:
            supabase.table("prompt_logs").insert({
                "session_id": request.session_id, "candidate_id": current_user.id,
                "prompt_text": request.prompt, "response_text": None,
                "intent": "blocked_level_0", "was_blocked": True,
                "violation_reason": "AI assistance is disabled for this session.",
            }).execute()
            return AIPromptResponse(response="", allowed=False, violation="AI assistance is disabled for this session.")

        gate_result = ethics_logic_gate(request.prompt, assistance_level)
        intent = gate_result.get("intent", "unknown")
        was_blocked = not gate_result["allowed"]
        violation = gate_result.get("violation")

        response_text = ""
        if gate_result["allowed"]:
            response_text = call_claude(request.prompt, request.code or "", assistance_level)

        supabase.table("prompt_logs").insert({
            "session_id": request.session_id, "candidate_id": current_user.id,
            "prompt_text": request.prompt, "response_text": response_text or None,
            "intent": intent, "was_blocked": was_blocked, "violation_reason": violation,
        }).execute()
        return AIPromptResponse(response=response_text, allowed=not was_blocked, violation=violation)
    except PolicyViolation as e:
        supabase.table("prompt_logs").insert({
            "session_id": request.session_id, "candidate_id": current_user.id,
            "prompt_text": request.prompt, "response_text": None,
            "intent": "solve_entire_problem", "was_blocked": True, "violation_reason": str(e),
        }).execute()
        return AIPromptResponse(response="", allowed=False, violation=str(e))

@app.get("/sessions/{session_id}/prompts")
async def get_session_prompts(session_id: str, current_user: User = Depends(get_current_user)):
    res = supabase.table("prompt_logs").select("*").eq("session_id", session_id).order("created_at").execute()
    return res.data or []

# ── Routes: code execution ───────────────────────────────────
CODE_TIMEOUT = 10

@app.post("/code/run", response_model=CodeRunResponse)
async def run_code(req: CodeRunRequest, current_user: User = Depends(get_current_user)):
    tmpdir = tempfile.mkdtemp(prefix="ip_code_")
    try:
        if req.language == "python":
            fp = os.path.join(tmpdir, "solution.py")
            with open(fp, "w") as f: f.write(req.code)
            cmd = ["python3", fp]
        elif req.language == "javascript":
            fp = os.path.join(tmpdir, "solution.js")
            with open(fp, "w") as f: f.write(req.code)
            cmd = ["node", fp]
        elif req.language == "cpp":
            fp = os.path.join(tmpdir, "solution.cpp")
            out = os.path.join(tmpdir, "solution")
            with open(fp, "w") as f: f.write(req.code)
            cp = subprocess.run(["g++", "-o", out, fp, "-std=c++17"], capture_output=True, text=True, timeout=CODE_TIMEOUT)
            if cp.returncode != 0:
                return CodeRunResponse(stdout="", stderr=cp.stderr, exit_code=cp.returncode, timed_out=False)
            cmd = [out]
        elif req.language == "java":
            fp = os.path.join(tmpdir, "Solution.java")
            with open(fp, "w") as f: f.write(req.code)
            cp = subprocess.run(["javac", fp], capture_output=True, text=True, timeout=CODE_TIMEOUT)
            if cp.returncode != 0:
                return CodeRunResponse(stdout="", stderr=cp.stderr, exit_code=cp.returncode, timed_out=False)
            cmd = ["java", "-cp", tmpdir, "Solution"]
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported language: {req.language}")
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=CODE_TIMEOUT, input=req.stdin or "")
            return CodeRunResponse(stdout=proc.stdout[:5000], stderr=proc.stderr[:5000], exit_code=proc.returncode, timed_out=False)
        except subprocess.TimeoutExpired:
            return CodeRunResponse(stdout="", stderr="Execution timed out (10s limit)", exit_code=-1, timed_out=True)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

# ── Entrypoint ───────────────────────────────────────────────
@app.on_event("shutdown")
def cleanup_proctors():
    for sid in list(_proctor_processes.keys()):
        stop_proctor(sid)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_config=None)
