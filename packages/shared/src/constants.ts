export const BLOCKED_INTENTS = [
  'solve_entire_problem',
  'write_complete_solution',
  'optimize_full_submission',
  'generate_answer'
] as const;

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const ASSISTANCE_LEVEL_DESCRIPTIONS = {
  no_ai: 'Traditional whiteboard mode - no AI assistance',
  syntax_only: 'AI can help with syntax and API usage only',
  conceptual_hints: 'AI can explain concepts and algorithms',
  pair_programming: 'AI can suggest small snippets but not full solutions'
};
