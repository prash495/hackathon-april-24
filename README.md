# InterviewPilot

**AI-Powered Honest Coding Interviews with Real-Time Proctoring**

InterviewPilot is a full-stack platform for conducting remote technical interviews with built-in AI assistance (ethics-gated), server-side gaze/face proctoring via MediaPipe, live code sharing, and a real-time interviewer dashboard.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            FRONTEND (Next.js)                           │
│                                                                         │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────────────┐  │
│  │  Login /      │  │  Candidate       │  │  Interviewer Dashboard    │  │
│  │  Signup       │  │  Session Page    │  │  + Live Code Viewer       │  │
│  │              │  │  + Code Editor   │  │  + Proctor Events         │  │
│  │              │  │  + AI Chat       │  │  + AI Prompt Log          │  │
│  │              │  │  + Webcam Feed   │  │  + Session Controls       │  │
│  └──────┬───────┘  └───────┬──┬───────┘  └──────────┬────────────────┘  │
│         │                  │  │                      │                   │
└─────────┼──────────────────┼──┼──────────────────────┼───────────────────┘
          │ REST             │  │ WebSocket             │ REST (polling)
          │ (auth, sessions) │  │ (JPEG frames)         │ (code, events,
          │                  │  │                       │  prompts)
          ▼                  │  ▼                       │
┌─────────────────────┐     │  ┌──────────────────────┐│
│   BACKEND API       │     │  │  PROCTOR SERVICE     ││
│   (FastAPI :8000)   │     │  │  (FastAPI :8002)     ││
│                     │     │  │                      ││
│  • Auth (JWT)       │     │  │  • MediaPipe Face    ││
│  • Sessions CRUD    │◄────┘  │    Landmarker        ││
│  • AI Prompt +      │        │  • Gaze Detection    ││
│    Ethics Gate      │        │  • Cheating Analysis  ││
│  • Code Execution   │        │  • Event Logging     ││
│  • Live Code Sync   │◄───────┤                      ││
│  • Proctor Events   │        │                      ││
│                     │        └──────────┬───────────┘│
└─────────┬───────────┘                   │            │
          │                               │            │
          ▼                               ▼            │
┌─────────────────────────────────────────────────────┐│
│                    SUPABASE                          ││
│                                                      │
│  ┌────────────┐ ┌──────────────┐ ┌───────────────┐  │
│  │  profiles   │ │  challenges  │ │  interview_   │  │
│  │            │ │              │ │  sessions     │  │
│  └────────────┘ └──────────────┘ └───────────────┘  │
│  ┌────────────┐ ┌──────────────┐                    │
│  │ prompt_logs │ │ proctor_     │                    │
│  │            │ │ events       │                    │
│  └────────────┘ └──────────────┘                    │
│                                                      │
│  + Auth (GoTrue)  + Row Level Security  + Realtime   │
└──────────────────────────────────────────────────────┘
```

---

## Data Flow

```
Candidate Browser                    Server                         Interviewer Browser
─────────────────                    ──────                         ────────────────────

1. Webcam captures frame
   │
   ├──► [JPEG via WebSocket] ──►  Proctor Service
   │                              │
   │                              ├── MediaPipe face detection
   │                              ├── Gaze angle + iris ratio
   │                              ├── Cheating? → log to Supabase
   │                              │
   │    ◄── [JSON result] ◄──────┘
   │
   ├── Show "OK" / "Cheating" overlay
   │
2. Candidate types code
   │
   ├──► [PUT /code] ──────────►  Backend API ──────────►  [GET /code] ──► Live Code Viewer
   │    (debounced 1s)            (in-memory store)        (poll 2s)
   │
3. Candidate asks AI
   │
   ├──► [POST /ai/prompt] ───►  Ethics Gate
   │                              │
   │                              ├── Level 0: blocked
   │                              ├── Level 1: syntax only
   │                              ├── Level 2: conceptual
   │                              ├── Level 3: full help
   │                              │
   │                              └── Claude Haiku 4.5 ──► response
   │
   │    ◄── [response / violation]
   │                                                       [GET /prompts] ──► Prompt Log
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, Monaco Editor |
| Backend API | FastAPI, Python 3.11, Pydantic, python-jose (JWT) |
| Proctoring | MediaPipe Face Landmarker, OpenCV, FastAPI WebSocket |
| AI Assistant | Anthropic Claude Haiku 4.5 (ethics-gated) |
| Database | Supabase (PostgreSQL + Auth + RLS + Realtime) |
| Code Execution | Sandboxed subprocess (Python, JavaScript, C++, Java) |

---

## Project Structure

```
hackathon-april-24/
├── apps/
│   ├── backend/              # FastAPI backend API
│   │   ├── main.py           # All routes + auth + AI + code exec
│   │   ├── requirements.txt
│   │   ├── Dockerfile
│   │   └── .env              # Supabase + Anthropic keys (gitignored)
│   └── frontend/             # Next.js frontend
│       ├── src/
│       │   ├── app/          # Pages (login, signup, candidate, interviewer, session)
│       │   ├── components/   # ProctoringOverlay, UI components
│       │   ├── hooks/        # useProctor (WebSocket), useRequireAuth
│       │   ├── lib/          # api.ts (axios), auth.ts (token mgmt)
│       │   ├── store/        # Zustand auth store
│       │   └── middleware.ts  # Route protection via cookie JWT
│       ├── .env.local        # API + Proctor WS URLs (gitignored)
│       └── package.json
├── mediapipe-core/           # Proctoring microservice
│   ├── proctor.py            # FastAPI WebSocket server + MediaPipe analysis
│   ├── face_landmarker_v2_with_blendshapes.task  # Model file (gitignored)
│   ├── requirements.txt
│   └── Dockerfile
├── supabase/
│   └── schema.sql            # Full database schema + RLS policies
└── packages/shared/          # Shared TypeScript types + constants
```

---

## Features

### For Candidates
- In-browser code editor with Python, JavaScript, C++, and Java support
- Run code with stdin input and see output in real time
- AI assistant with ethics-gated assistance levels (0–3)
- Webcam proctoring overlay showing detection status

### For Interviewers
- Create challenges with configurable difficulty and assistance levels
- Generate shareable session links for candidates
- Live view of candidate's code as they type
- Real-time proctor event feed (gaze away, face absent, multiple faces)
- AI prompt log showing all candidate queries and any blocked attempts
- Session metrics dashboard (prompts, violations, severity counts)

### Proctoring
- Server-side face/gaze detection via MediaPipe Face Landmarker
- Iris ratio analysis for lateral gaze direction
- Face normal angle for head pose estimation
- Automatic event logging with 5-second cooldown per event type
- Detects: gaze away, face absent, multiple faces

### AI Ethics Gate
| Level | Allowed | Blocked |
|---|---|---|
| 0 | Nothing | All AI assistance disabled |
| 1 | Syntax lookups, API references | Conceptual questions, solutions |
| 2 | Concepts, hints, high-level approaches | Full solutions, step-by-step code |
| 3 | Everything | Full-solution requests still blocked |

---

## Local Development Setup

### Prerequisites

- **Python 3.11+** with [uv](https://docs.astral.sh/uv/getting-started/installation/)
- **Node.js 18+** with npm
- **Supabase** project (free tier works)
- **Anthropic API key** for Claude

### 1. Clone and Install

```bash
git clone https://github.com/prash495/hackathon-april-24.git
cd hackathon-april-24

# Python dependencies
uv sync

# Frontend dependencies
cd apps/frontend
npm install
cd ../..
```

### 2. Database Setup

1. Create a new project on [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the contents of `supabase/schema.sql`
3. Go to Authentication → Providers → Email → Enable Sign Ups → ON

### 3. Environment Variables

**Backend** — create `apps/backend/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
ANTHROPIC_KEY=sk-ant-...
SECRET_KEY=any-random-string-for-jwt
```

**Frontend** — create `apps/frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8001
NEXT_PUBLIC_PROCTOR_WS_URL=ws://localhost:8002
```

### 4. Download the MediaPipe Model

```bash
# From project root
wget -O mediapipe-core/face_landmarker_v2_with_blendshapes.task \
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
```

### 5. Start All Services

Open three terminals from the project root:

**Terminal 1 — Backend API (port 8001):**
```bash
uv run python -m uvicorn apps.backend.main:app --reload --port 8001 --host 0.0.0.0
```

**Terminal 2 — Proctor Service (port 8002):**
```bash
uv run python mediapipe-core/proctor.py
```

**Terminal 3 — Frontend (port 3000):**
```bash
cd apps/frontend
npm run dev
```

### 6. Use It

1. Open `http://localhost:3000` in your browser
2. Sign up as an **interviewer** → create a challenge → create a session → copy the session link
3. Open a different browser, sign up as a **candidate** → paste the session link
4. The candidate codes, the interviewer watches live

---

## Deployment

| Service | Platform | Config |
|---|---|---|
| Frontend | Vercel | Root: `hackathon-april-24/apps/frontend` |
| Backend API | Railway | Dockerfile: `apps/backend/Dockerfile`, context: repo root |
| Proctor Service | Railway | Dockerfile: `mediapipe-core/Dockerfile`, context: repo root |

Set environment variables in each platform's dashboard (never commit `.env` files).

Update the frontend env vars to point to your deployed URLs:
```
NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app
NEXT_PUBLIC_PROCTOR_WS_URL=wss://your-proctor.up.railway.app
```

---

## Database Schema

| Table | Purpose |
|---|---|
| `profiles` | User accounts (auto-created from Supabase Auth) |
| `challenges` | Reusable coding problems created by interviewers |
| `interview_sessions` | One candidate + one challenge + config + state |
| `prompt_logs` | Every AI interaction (prompt, response, intent, blocked?) |
| `proctor_events` | Behavioral signals (gaze_away, face_absent, etc.) |

All tables have Row Level Security policies. Realtime is enabled on sessions, prompts, and proctor events.

---

## Team

Built during the April 2024 Hackathon.

---

## License

MIT
