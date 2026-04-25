'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'
import { ArrowRight, Clock, Code2, ShieldAlert } from 'lucide-react'

type SessionInfo = {
  id: string
  challenge_id: string
  interviewer_id: string
  status: string
  assistance_level: number
  max_prompts: number
}

const LEVEL_LABEL: Record<number, string> = {
  0: 'No AI',
  1: 'Syntax Only',
  2: 'Conceptual Hints',
  3: 'Pair Mode',
}

export default function JoinSessionPage() {
  const { id: sessionId } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, isLoading } = useAuthStore()

  const [session, setSession]   = useState<SessionInfo | null>(null)
  const [fetching, setFetching] = useState(true)
  const [joining, setJoining]   = useState(false)
  const [error, setError]       = useState('')

  // Fetch session info (public — no auth needed to preview)
  useEffect(() => {
    if (!sessionId) return
    api.get<SessionInfo>(`/sessions/${sessionId}`)
      .then(r => setSession(r.data))
      .catch(() => setError('Session not found or no longer available.'))
      .finally(() => setFetching(false))
  }, [sessionId])

  const handleJoin = async () => {
    if (!user) {
      // Save intended destination, redirect to login
      router.push(`/login?from=/join/${sessionId}`)
      return
    }
    if (user.role !== 'candidate') {
      setError('Only candidates can join sessions. You are logged in as an interviewer.')
      return
    }

    setJoining(true)
    setError('')
    try {
      await api.post(`/sessions/${sessionId}/join`, {})
      router.push(`/session/${sessionId}`)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to join session.')
    } finally {
      setJoining(false)
    }
  }

  if (fetching || isLoading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
        <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error && !session) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="w-12 h-12 bg-red-50 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={24} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Session unavailable</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-[calc(100vh-64px)] bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="border-2 border-gray-100 p-10 relative">
          <span className="cm cm-tl">+</span><span className="cm cm-tr">+</span>
          <span className="cm cm-bl">+</span><span className="cm cm-br">+</span>

          {/* Icon */}
          <div className="w-12 h-12 bg-black flex items-center justify-center mb-6">
            <Code2 size={22} className="text-white" strokeWidth={1.75} />
          </div>

          <p className="text-sm uppercase tracking-widest text-gray-400 mb-2 font-medium">
            You've been invited
          </p>
          <h1 className="text-3xl font-bold mb-6">Join Interview Session</h1>

          {session && (
            <div className="space-y-3 mb-8">
              <div className="flex items-center justify-between border border-gray-100 px-4 py-3">
                <span className="text-sm text-gray-500">AI Assistance</span>
                <span className="text-sm font-semibold">{LEVEL_LABEL[session.assistance_level]}</span>
              </div>
              <div className="flex items-center justify-between border border-gray-100 px-4 py-3">
                <span className="text-sm text-gray-500 flex items-center gap-2">
                  <Clock size={14} /> Max AI prompts
                </span>
                <span className="text-sm font-semibold">{session.max_prompts}</span>
              </div>
              <div className="flex items-center justify-between border border-gray-100 px-4 py-3">
                <span className="text-sm text-gray-500">Status</span>
                <span className={`text-sm font-semibold capitalize ${
                  session.status === 'pending' ? 'text-green-600' : 'text-gray-500'
                }`}>
                  {session.status}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium mb-6">
              {error}
            </div>
          )}

          {!user ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">
                You need to be signed in as a <strong>candidate</strong> to join.
              </p>
              <button
                onClick={handleJoin}
                className="w-full inline-flex items-center justify-center gap-2 bg-black text-white py-4 text-base font-semibold hover:bg-gray-800 active:scale-[0.98] transition-all"
              >
                Sign in to Join <ArrowRight size={16} />
              </button>
            </div>
          ) : user.role === 'interviewer' ? (
            <div className="border-2 border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              You're signed in as an <strong>interviewer</strong>. Only candidates can join sessions.
            </div>
          ) : (
            <button
              onClick={handleJoin}
              disabled={joining || session?.status !== 'pending'}
              className="w-full inline-flex items-center justify-center gap-2 bg-black text-white py-4 text-base font-semibold hover:bg-gray-800 active:scale-[0.98] disabled:opacity-40 transition-all"
            >
              {joining ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Joining…</>
              ) : (
                <>Join Session <ArrowRight size={16} /></>
              )}
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
