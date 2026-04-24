export enum AssistanceLevel {
  LEVEL_0 = 'no_ai',
  LEVEL_1 = 'syntax_only',
  LEVEL_2 = 'conceptual_hints',
  LEVEL_3 = 'pair_programming'
}

export interface Challenge {
  id?: string;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  assistance_level: AssistanceLevel;
  starter_code?: string;
  test_cases?: TestCase[];
  created_by?: string;
  created_at?: string;
}

export interface TestCase {
  input: string;
  expected_output: string;
  is_hidden?: boolean;
}

export interface Session {
  id: string;
  challenge_id: string;
  candidate_id: string;
  interviewer_id: string;
  status: 'pending' | 'active' | 'completed';
  started_at?: string;
  ended_at?: string;
}

export interface AIPrompt {
  prompt: string;
  session_id: string;
  timestamp: string;
  response?: string;
  allowed: boolean;
  violation?: string;
}

export interface User {
  id: string;
  email: string;
  role: 'candidate' | 'interviewer';
  name: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}
