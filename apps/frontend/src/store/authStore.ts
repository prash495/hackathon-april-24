import { create } from 'zustand'
import { User, getStoredUser, getToken, clearAuth, isTokenExpired } from '@/lib/auth'

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  // Actions
  setAuth: (user: User, token: string) => void
  logout: () => void
  hydrate: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,

  setAuth: (user, token) => {
    set({ user, token, isLoading: false })
  },

  logout: () => {
    clearAuth()
    set({ user: null, token: null, isLoading: false })
  },

  hydrate: () => {
    const token = getToken()
    const user  = getStoredUser()

    // If token is present but expired, wipe everything
    if (token && isTokenExpired(token)) {
      clearAuth()
      set({ user: null, token: null, isLoading: false })
      return
    }

    set({ user: user ?? null, token: token ?? null, isLoading: false })
  },
}))
