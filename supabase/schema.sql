-- ============================================================
-- InterviewPilot — Supabase Schema
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- ------------------------------------------------------------
-- 0. Extensions
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- uuid_generate_v4() fallback


-- ============================================================
-- 1. PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name        TEXT        NOT NULL,
  role        TEXT        NOT NULL CHECK (role IN ('candidate', 'interviewer')),
  email       TEXT        NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create a profile row whenever a new auth.user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'candidate')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- 2. CHALLENGES
-- Reusable problem definitions created by interviewers
-- ============================================================
CREATE TABLE public.challenges (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  interviewer_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  description      TEXT        NOT NULL,
  difficulty       TEXT        DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  starter_code     TEXT,
  language         TEXT        DEFAULT 'python',
  assistance_level INT         DEFAULT 1 CHECK (assistance_level BETWEEN 0 AND 3),
  is_archived      BOOLEAN     DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_challenges_updated_at
  BEFORE UPDATE ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 3. INTERVIEW SESSIONS
-- One session = one candidate attempting one challenge
-- ============================================================
CREATE TABLE public.interview_sessions (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id       UUID        REFERENCES public.challenges(id) ON DELETE SET NULL,
  interviewer_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  candidate_id       UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Session config (can override challenge defaults)
  assistance_level   INT         DEFAULT 1 CHECK (assistance_level BETWEEN 0 AND 3),
  max_prompts        INT         DEFAULT 20,

  -- State
  status             TEXT        DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  candidate_code     TEXT,                        -- final code snapshot on submit
  authenticity_score NUMERIC(5,2),                -- 0.00–100.00, computed at session end

  -- Timing
  started_at         TIMESTAMPTZ,
  ended_at           TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Computed duration helper (seconds)
CREATE OR REPLACE FUNCTION public.session_duration_seconds(s public.interview_sessions)
RETURNS INT LANGUAGE sql STABLE AS $$
  SELECT EXTRACT(EPOCH FROM (s.ended_at - s.started_at))::INT;
$$;


-- ============================================================
-- 4. PROMPT LOGS
-- Every AI interaction during a session
-- ============================================================
CREATE TABLE public.prompt_logs (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id       UUID        NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  candidate_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  prompt_text      TEXT        NOT NULL,
  response_text    TEXT,                          -- what the AI replied (null if blocked)
  intent           TEXT        NOT NULL,          -- classified intent label
  was_blocked      BOOLEAN     DEFAULT FALSE,
  violation_reason TEXT,                          -- populated when was_blocked = true
  points_awarded   INT         DEFAULT 0,
  latency_ms       INT,                           -- AI response time in milliseconds

  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast per-session lookups
CREATE INDEX idx_prompt_logs_session_id ON public.prompt_logs(session_id);
CREATE INDEX idx_prompt_logs_candidate_id ON public.prompt_logs(candidate_id);


-- ============================================================
-- 5. PROCTOR EVENTS
-- Behavioural signals captured during a session
-- ============================================================
CREATE TABLE public.proctor_events (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id  UUID        NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,

  event_type  TEXT        NOT NULL
              CHECK (event_type IN (
                'tab_switch',
                'copy_paste',
                'face_absent',
                'multiple_faces',
                'gaze_away',
                'window_blur'
              )),
  severity    TEXT        DEFAULT 'low'
              CHECK (severity IN ('low', 'medium', 'high')),

  -- Flexible payload: { duration_ms, paste_length, confidence, etc. }
  metadata    JSONB       DEFAULT '{}',

  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_proctor_events_session_id ON public.proctor_events(session_id);


-- ============================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================

-- ── profiles ────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: read own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: update own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Interviewers can read candidate profiles for their sessions
CREATE POLICY "profiles: interviewer reads candidate"
  ON public.profiles FOR SELECT
  USING (
    id IN (
      SELECT candidate_id FROM public.interview_sessions
      WHERE interviewer_id = auth.uid()
    )
  );

-- ── challenges ──────────────────────────────────────────────
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "challenges: interviewer full access"
  ON public.challenges FOR ALL
  USING (interviewer_id = auth.uid());

-- Candidates can read challenges they are assigned to
CREATE POLICY "challenges: candidate read assigned"
  ON public.challenges FOR SELECT
  USING (
    id IN (
      SELECT challenge_id FROM public.interview_sessions
      WHERE candidate_id = auth.uid()
    )
  );

-- ── interview_sessions ──────────────────────────────────────
ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions: interviewer full access"
  ON public.interview_sessions FOR ALL
  USING (interviewer_id = auth.uid());

CREATE POLICY "sessions: candidate read own"
  ON public.interview_sessions FOR SELECT
  USING (candidate_id = auth.uid());

CREATE POLICY "sessions: candidate update code"
  ON public.interview_sessions FOR UPDATE
  USING (candidate_id = auth.uid())
  WITH CHECK (candidate_id = auth.uid());

-- ── prompt_logs ─────────────────────────────────────────────
ALTER TABLE public.prompt_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_logs: candidate insert own"
  ON public.prompt_logs FOR INSERT
  WITH CHECK (candidate_id = auth.uid());

CREATE POLICY "prompt_logs: candidate read own"
  ON public.prompt_logs FOR SELECT
  USING (candidate_id = auth.uid());

CREATE POLICY "prompt_logs: interviewer read session"
  ON public.prompt_logs FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM public.interview_sessions
      WHERE interviewer_id = auth.uid()
    )
  );

-- ── proctor_events ──────────────────────────────────────────
ALTER TABLE public.proctor_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proctor_events: insert for active session"
  ON public.proctor_events FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM public.interview_sessions
      WHERE candidate_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY "proctor_events: interviewer read"
  ON public.proctor_events FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM public.interview_sessions
      WHERE interviewer_id = auth.uid()
    )
  );


-- ============================================================
-- 7. REALTIME
-- Enable Supabase Realtime on tables the dashboard subscribes to
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.interview_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.prompt_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.proctor_events;


-- ============================================================
-- 8. HELPER VIEWS
-- ============================================================

-- Session summary for the interviewer dashboard
CREATE OR REPLACE VIEW public.session_summary AS
SELECT
  s.id,
  s.status,
  s.assistance_level,
  s.authenticity_score,
  s.started_at,
  s.ended_at,
  EXTRACT(EPOCH FROM (s.ended_at - s.started_at))::INT AS duration_seconds,
  c.title                                               AS challenge_title,
  c.difficulty,
  p.name                                                AS candidate_name,
  p.email                                               AS candidate_email,
  COUNT(pl.id)                                          AS total_prompts,
  COUNT(pl.id) FILTER (WHERE pl.was_blocked)            AS blocked_prompts,
  COUNT(pe.id)                                          AS proctor_event_count
FROM public.interview_sessions s
LEFT JOIN public.challenges       c  ON c.id  = s.challenge_id
LEFT JOIN public.profiles         p  ON p.id  = s.candidate_id
LEFT JOIN public.prompt_logs      pl ON pl.session_id = s.id
LEFT JOIN public.proctor_events   pe ON pe.session_id = s.id
GROUP BY s.id, c.title, c.difficulty, p.name, p.email;


-- ============================================================
-- Done.
-- ============================================================
