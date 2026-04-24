'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { registerRequest, saveAuth } from '@/lib/auth'
import { useAuthStore } from '@/store/authStore'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

type Role = 'candidate' | 'interviewer'

const ROLES: { value: Role; label: string; desc: string }[] = [
  { value: 'candidate',   label: 'Candidate',   desc: 'I am being interviewed' },
  { value: 'interviewer', label: 'Interviewer',  desc: 'I am conducting interviews' },
]

export default function SignupPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [role, setRole] = useState<Role>('candidate')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Name is required'
    if (!form.email) e.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email'
    if (!form.password) e.password = 'Password is required'
    else if (form.password.length < 8) e.password = 'Minimum 8 characters'
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    setServerError('')
    try {
      const data = await registerRequest(form.email, form.password, form.name, role)
      saveAuth(data)
      setAuth(data.user, data.access_token)
      router.push(role === 'interviewer' ? '/interviewer' : '/candidate')
    } catch (err: any) {
      setServerError(err?.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-[calc(100vh-64px)] bg-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">

        {/* Card */}
        <div className="border-2 border-gray-100 p-8 md:p-12 relative">
          <span className="cm cm-tl">+</span>
          <span className="cm cm-tr">+</span>
          <span className="cm cm-bl">+</span>
          <span className="cm cm-br">+</span>

          {/* Header */}
          <div className="mb-8">
            <p className="text-sm uppercase tracking-widest text-gray-400 mb-2 font-medium">
              Create account
            </p>
            <h1 className="text-4xl">Sign up</h1>
          </div>

          {/* Role selector */}
          <div className="mb-8">
            <p className="text-sm font-semibold text-gray-700 tracking-wide mb-3">I am a</p>
            <div className="grid grid-cols-2 gap-3">
              {ROLES.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  className={[
                    'flex flex-col items-start px-4 py-4 border-2 text-left',
                    'transition-all duration-150 min-h-[80px]',
                    'active:scale-[0.98]',
                    role === r.value
                      ? 'border-black bg-black text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400',
                  ].join(' ')}
                >
                  <span className="text-base font-semibold">{r.label}</span>
                  <span className={`text-sm mt-0.5 whitespace-nowrap ${role === r.value ? 'text-gray-300' : 'text-gray-400'}`}>
                    {r.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <Input
              label="Full name"
              type="text"
              placeholder="Alex Johnson"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              error={errors.name}
              autoComplete="name"
            />
            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              error={errors.email}
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              placeholder="Minimum 8 characters"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              error={errors.password}
              hint="Use at least 8 characters"
              autoComplete="new-password"
            />
            <Input
              label="Confirm password"
              type="password"
              placeholder="Repeat your password"
              value={form.confirm}
              onChange={e => set('confirm', e.target.value)}
              error={errors.confirm}
              autoComplete="new-password"
            />

            {serverError && (
              <div className="border-2 border-red-300 bg-red-50 px-4 py-3 text-base text-red-700 font-medium">
                {serverError}
              </div>
            )}

            <Button type="submit" loading={loading} fullWidth size="lg">
              {loading ? 'Creating account…' : 'Create account'}
            </Button>
          </form>

          {/* Divider */}
          <div className="mt-8 pt-8 border-t border-gray-100 text-center">
            <p className="text-base text-gray-500">
              Already have an account?{' '}
              <Link
                href="/login"
                className="text-black font-semibold underline underline-offset-4 hover:text-gray-600"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>

      </div>
    </main>
  )
}
