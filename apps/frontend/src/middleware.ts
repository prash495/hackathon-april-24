import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED_ROUTES  = ['/interviewer', '/candidate', '/session']
const GUEST_ONLY_ROUTES = ['/login', '/signup']

// Decode JWT payload without a library (Edge runtime safe)
function getTokenPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = Buffer.from(base64, 'base64').toString('utf-8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

function isExpired(payload: Record<string, unknown>): boolean {
  const exp = payload.exp as number | undefined
  if (!exp) return true
  return exp * 1000 < Date.now()
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('access_token')?.value

  const isProtected = PROTECTED_ROUTES.some(r => pathname.startsWith(r))
  const isGuestOnly = GUEST_ONLY_ROUTES.some(r => pathname.startsWith(r))

  // ── Validate token ──────────────────────────────────────────
  let validToken = false
  if (token) {
    const payload = getTokenPayload(token)
    validToken = !!payload && !isExpired(payload)
  }

  // ── Protected route: no valid token → redirect to login ─────
  if (isProtected && !validToken) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('from', pathname)
    if (!validToken && token) {
      // Token existed but expired — tell the user
      url.searchParams.set('reason', 'expired')
    }
    const response = NextResponse.redirect(url)
    // Clear the stale cookie
    response.cookies.delete('access_token')
    return response
  }

  // ── Guest-only route: valid token → redirect to dashboard ───
  if (isGuestOnly && validToken) {
    // Peek at role from token to redirect correctly
    const payload = getTokenPayload(token!)
    const role = (payload?.role as string) || ''
    const dest = role === 'interviewer' ? '/interviewer' : '/candidate'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/interviewer/:path*',
    '/candidate/:path*',
    '/session/:path*',
    '/login',
    '/signup',
  ],
}
