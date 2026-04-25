'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'

type Session = {
  id: string
  status: string
  challenge_id: string | null
  challenge_title: string | null
  challenge_difficulty: string | null
  challenge_language: string | null
  candidate_id: string | null
  started_at: string | null
  ended_at: string | null
  assistance_level: number
}

const difficultyColor = (d: string | null) => {
  switch (d) {
    case 'easy': return 'text-green-600'
    case 'hard': return 'text-red-500'
    default: return 'text-yellow-600'
  }
}

const statusBadge = (s: string) => {
  switch (s) {
    case 'completed': return 'bg-gray-100 text-gray-600'
    case 'active': return 'bg-green-50 text-green-700'
    case 'cancelled': return 'bg-red-50 text-red-600'
    default: return 'bg-gray-50 text-gray-400'
  }
}

function duration(start: string | null, end: string | null): string {
  if (!start || !end) return '—'
  const secs = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const rem = secs % 60
  return rem ? `${mins}m ${rem}s` : `${mins}m`
}

export default function HistoryPage() {
  const { user, isLoading } = useRequireAuth('interviewer')
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    api.get('/sessions')
      .then(r => setSessions(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user])

  if (isLoading || !user) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <span className="w-5 h-5 border border-black border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const completed = sessions.filter(s => s.status === 'completed')
  const other = sessions.filter(s => s.status !== 'completed')

  return (
    <main className="bg-white text-black min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="flex items-start justify-between mb-10 border-b border-gray-100 pb-8">
          <div>
            <Link href="/interviewer" className="text-xs text-gray-400 hover:text-black transition-colors mb-4 inline-block">
              ← Dashboard
            </Link>
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Interviewer</p>
            <h1 className="text-3xl font-semibold tracking-tight">Session History</h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Total</p>
            <p className="text-4xl font-semibold">{sessions.length}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <span className="w-5 h-5 border border-black border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="border border-gray-200 px-8 py-20 text-center">
            <p className="text-gray-400 text-sm mb-4">No sessions yet</p>
            <Link href="/interviewer" className="text-sm underline underline-offset-4 text-black hover:text-gray-600">
              Start your first session →
            </Link>
          </div>
        ) : (
          <>
            {/* Active / pending sessions */}
            {other.length > 0 && (
              <div className="mb-10">
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-4">Active / Pending</p>
                <SessionTable sessions={other} />
              </div>
            )}

            {/* Completed sessions */}
            {completed.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-4">Completed</p>
                <SessionTable sessions={completed} />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

function SessionTable({ sessions }: { sessions: Session[] }) {
  return (
    <div className="border border-gray-200 relative divide-y divide-gray-100">
      <span className="absolute top-[-1px] left-[-1px] text-gray-300 text-xs">+</span>
      <span className="absolute top-[-1px] right-[-1px] text-gray-300 text-xs">+</span>
      <span className="absolute bottom-[-1px] left-[-1px] text-gray-300 text-xs">+</span>
      <span className="absolute bottom-[-1px] right-[-1px] text-gray-300 text-xs">+</span>

      {sessions.map(s => (
        <Link
          key={s.id}
          href={`/interviewer/history/${s.id}`}
          className="flex items-center gap-6 px-6 py-4 hover:bg-gray-50 transition-colors group"
        >
          {/* Challenge info */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">
              {s.challenge_title ?? <span className="text-gray-400 italic">No challenge</span>}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {s.challenge_language ?? 'python'}
              {s.challenge_difficulty && (
                <span className={`ml-2 ${difficultyColor(s.challenge_difficulty)}`}>
                  {s.challenge_difficulty}
                </span>
              )}
            </p>
          </div>

          {/* Status */}
          <span className={`text-xs px-2 py-0.5 ${statusBadge(s.status)}`}>
            {s.status}
          </span>

          {/* Duration */}
          <span className="text-xs text-gray-400 w-16 text-right">
            {duration(s.started_at, s.ended_at)}
          </span>

          {/* Date */}
          <span className="text-xs text-gray-400 w-28 text-right">
            {s.started_at ? new Date(s.started_at).toLocaleDateString() : '—'}
          </span>

          <span className="text-gray-300 group-hover:text-black transition-colors text-sm">→</span>
        </Link>
      ))}
    </div>
  )
}
