from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from typing import Optional, List
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
