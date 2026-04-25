'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { loginRequest, saveAuth } from '@/lib/auth'
import { useAuthStore } from '@/store/authStore'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.email) e.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email'
    if (!form.password) e.password = 'Password is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    setServerError('')
    try {
      const data = await loginRequest(form.email, form.password)
      saveAuth(data)
      setAuth(data.user, data.access_token)
      router.push(data.user.role === 'interviewer' ? '/interviewer' : '/candidate')
    } catch (err: any) {
      setServerError(err?.response?.data?.detail || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-[calc(100vh-64px)] bg-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Card */}
        <div className="border-2 border-gray-100 p-8 md:p-12 relative animate-fade-in-up rounded-xl">
          <span className="cm cm-tl">+</span>
          <span className="cm cm-tr">+</span>
          <span className="cm cm-bl">+</span>
          <span className="cm cm-br">+</span>

          {/* Header */}
          <div className="mb-8">
            <p className="text-sm uppercase tracking-widest text-gray-400 mb-2 font-medium">
              Welcome back
            </p>
            <h1 className="text-4xl">Sign in</h1>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              error={errors.email}
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              error={errors.password}
              autoComplete="current-password"
            />

            {serverError && (
              <div className="border-2 border-red-300 bg-red-50 px-4 py-3 text-base text-red-700 font-medium">
                {serverError}
              </div>
            )}

            <Button type="submit" loading={loading} fullWidth size="lg">
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {/* Divider */}
          <div className="mt-8 pt-8 border-t border-gray-100 text-center">
            <p className="text-base text-gray-500">
              Don't have an account?{' '}
              <Link
                href="/signup"
                className="text-black font-semibold underline underline-offset-4 hover:text-gray-600"
              >
                Sign up free
              </Link>
            </p>
          </div>
        </div>

      </div>
    </main>
  )
}
