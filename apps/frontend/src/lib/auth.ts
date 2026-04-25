import { api } from './api'

export interface User {
  id: string
  email: string
  name: string
  role: 'candidate' | 'interviewer'
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: User
}

// ─── API calls ────────────────────────────────────────────────

export async function loginRequest(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login', { email, password })
  return data
}

export async function registerRequest(
  email: string,
  password: string,
  name: string,
  role: 'candidate' | 'interviewer'
): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/register', { email, password, name, role })
  return data
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<User>('/auth/me')
  return data
}

// ─── Token storage ────────────────────────────────────────────
// Store in both:
//   • localStorage  → read by axios interceptor (client-side API calls)
//   • document.cookie → read by Next.js middleware (SSR route protection)

const TOKEN_KEY = 'access_token'
const USER_KEY  = 'ip_user'

export function saveAuth(data: AuthResponse): void {
  if (typeof window === 'undefined') return
  // localStorage for axios
  localStorage.setItem(TOKEN_KEY, data.access_token)
  localStorage.setItem(USER_KEY, JSON.stringify(data.user))
  // Cookie for middleware — SameSite=Strict, no httpOnly so JS can clear it
  const maxAge = 60 * 60 * 8 // 8 hours
  document.cookie = `${TOKEN_KEY}=${data.access_token}; path=/; max-age=${maxAge}; SameSite=Strict`
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  // Expire the cookie
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Strict`
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export function isTokenExpired(token: string): boolean {
  try {
    // JWT payload is the second base64 segment
    const payload = JSON.parse(atob(token.split('.')[1]))
    // exp is in seconds; Date.now() is in ms
    return payload.exp * 1000 < Date.now()
  } catch {
    return true
  }
}
