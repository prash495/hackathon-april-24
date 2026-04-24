import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { getToken, clearAuth, isTokenExpired } from './auth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
})

// ─── Request interceptor ──────────────────────────────────────
// Attach Bearer token; if token is expired, clear auth and redirect
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window === 'undefined') return config

    const token = getToken()
    if (!token) return config

    if (isTokenExpired(token)) {
      clearAuth()
      window.location.href = '/login?reason=expired'
      return Promise.reject(new Error('Token expired')) as never
    }

    config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (err) => Promise.reject(err)
)

// ─── Response interceptor ─────────────────────────────────────
// 401 → clear auth + redirect to login
api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      clearAuth()
      const from = encodeURIComponent(window.location.pathname)
      window.location.href = `/login?reason=unauthorized&from=${from}`
    }
    return Promise.reject(err)
  }
)
