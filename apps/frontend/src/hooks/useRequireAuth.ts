'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { isTokenExpired } from '@/lib/auth'

export function useRequireAuth(role?: 'candidate' | 'interviewer') {
  const { user, token, isLoading, logout } = useAuthStore()
  const router   = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (isLoading) return

    // Token expired client-side
    if (token && isTokenExpired(token)) {
      logout()
      router.replace(`/login?reason=expired&from=${encodeURIComponent(pathname)}`)
      return
    }

    // Not authenticated
    if (!user) {
      router.replace(`/login?from=${encodeURIComponent(pathname)}`)
      return
    }

    // Wrong role
    if (role && user.role !== role) {
      router.replace(user.role === 'interviewer' ? '/interviewer' : '/candidate')
    }
  }, [user, token, isLoading, role, router, pathname, logout])

  return { user, token, isLoading }
}
