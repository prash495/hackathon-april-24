'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { fetchMe, getToken, isTokenExpired, clearAuth } from '@/lib/auth'

/**
 * Runs once on mount:
 * 1. Hydrates Zustand from localStorage
 * 2. If a token exists and is still valid, re-validates it against /auth/me
 *    so stale user data (e.g. role change) is always fresh
 * 3. If /auth/me fails (revoked token etc.) → clears auth
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { hydrate, setAuth, logout } = useAuthStore()

  useEffect(() => {
    // Step 1 — sync from localStorage immediately (no flash)
    hydrate()

    // Step 2 — verify token with server
    const token = getToken()
    if (!token || isTokenExpired(token)) return

    fetchMe()
      .then((user) => setAuth(user, token))
      .catch(() => {
        // Token rejected by server (revoked / secret rotated)
        clearAuth()
        logout()
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>
}
