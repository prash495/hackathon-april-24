'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { api } from '@/lib/api'
import Button from '@/components/ui/Button'

type Challenge = {
  id: string
  title: string
  description: string
  difficulty: string
  assistance_level: number
}

type Session = {
  id: string
  challenge_id: string | null
  candidate_id: string | null
  interviewer_id: string
  status: string
  started_at: string | null
}

export default function InterviewerDashboard() {
  const { user, isLoading } = useRequireAuth('interviewer')
  const router = useRouter()
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [creating, setCreating] = useState(false)
  const [selectedChallenge, setSelectedChallenge] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    api.get('/challenges').then(r => setChallenges(r.data)).catch(() => {})
  }, [user])

  const createSession = async (challengeId?: string) => {
    setCreating(true)
    try {
      const { data } = await api.post('/sessions', {
        interviewer_id: user!.id,
        challenge_id: challengeId || null,
        assistance_level: 1,
      })
      router.push(`/interviewer/session/${data.id}`)
    } catch (e) {
      console.error('Failed to create session', e)
    } finally {
      setCreating(false)
    }
  }

  if (isLoading || !user) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <span className="w-5 h-5 border border-black border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <main className="bg-white text-black min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="flex items-start justify-between mb-12 border-b border-gray-100 pb-8">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Dashboard</p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Welcome, {user.name.split(' ')[0]}
            </h1>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => createSession()} loading={creating}>
              + Quick Session
            </Button>
            <Link
              href="/interviewer/create-challenge"
              className="bg-white text-black border-2 border-black px-5 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              + New Challenge
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-px bg-gray-200 mb-12">
          {[
            { label: 'Challenges', value: challenges.length },
            { label: 'Active Sessions', value: sessions.filter(s => s.status === 'active').length },
            { label: 'Completed', value: sessions.filter(s => s.status === 'completed').length },
          ].map(s => (
            <div key={s.label} className="bg-white px-8 py-8 relative">
              <span className="absolute top-[-1px] left-[-1px] text-gray-200 text-xs select-none">+</span>
              <span className="absolute top-[-1px] right-[-1px] text-gray-200 text-xs select-none">+</span>
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">{s.label}</p>
              <p className="text-4xl font-semibold">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Challenges */}
        <div className="mb-12">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-6">Your Challenges</p>
          <div className="border border-gray-200 relative">
            <span className="absolute top-[-1px] left-[-1px] text-gray-300 text-xs">+</span>
            <span className="absolute top-[-1px] right-[-1px] text-gray-300 text-xs">+</span>
            <span className="absolute bottom-[-1px] left-[-1px] text-gray-300 text-xs">+</span>
            <span className="absolute bottom-[-1px] right-[-1px] text-gray-300 text-xs">+</span>

            {challenges.length === 0 ? (
              <div className="px-8 py-16 text-center">
                <p className="text-gray-400 text-sm mb-4">No challenges yet</p>
                <Link
                  href="/interviewer/create-challenge"
                  className="text-sm underline underline-offset-4 text-black hover:text-gray-600"
                >
                  Create your first challenge →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {challenges.map(c => (
                  <div key={c.id} className="px-6 py-5 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{c.title}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {c.difficulty} · Level {c.assistance_level}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => createSession(c.id)}
                      loading={creating}
                    >
                      Start Session
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </main>
  )
}
