'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

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
  candidate_code: string | null
}

type Prompt = {
  id: string
  prompt_text: string
  response_text: string | null
  intent: string
  was_blocked: boolean
  violation_reason: string | null
  created_at: string
}

type ProctorEvent = {
  id: string
  event_type: string
  severity: string
  metadata: string
  occurred_at: string
}

function duration(start: string | null, end: string | null): string {
  if (!start || !end) return '—'
  const secs = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const rem = secs % 60
  return rem ? `${mins}m ${rem}s` : `${mins}m`
}

const severityColor = (s: string) => {
  switch (s) {
    case 'high': return 'text-red-600 bg-red-50 border-red-200'
    case 'medium': return 'text-yellow-700 bg-yellow-50 border-yellow-200'
    default: return 'text-gray-600 bg-gray-50 border-gray-200'
  }
}

const eventIcon = (type: string) => {
  switch (type) {
    case 'gaze_away': return '👀'
    case 'face_absent': return '🚫'
    case 'multiple_faces': return '👥'
    case 'tab_switch': return '🔀'
    case 'copy_paste': return '📋'
    default: return '⚠️'
  }
}

export default function HistoryDetailPage() {
  const params = useParams()
  const sessionId = params.id as string
  const { user } = useRequireAuth('interviewer')

  const [session, setSession] = useState<Session | null>(null)
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [events, setEvents] = useState<ProctorEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'code' | 'prompts' | 'proctor'>('code')

  useEffect(() => {
    if (!user) return
    Promise.all([
      api.get(`/sessions/${sessionId}`),
      api.get(`/sessions/${sessionId}/prompts`),
      api.get(`/sessions/${sessionId}/proctor-events`),
    ]).then(([sessRes, promptRes, eventsRes]) => {
      setSession(sessRes.data)
      setPrompts(promptRes.data)
      setEvents(eventsRes.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [sessionId, user])

  if (loading || !user) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <span className="w-5 h-5 border border-black border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <p className="text-gray-400 text-sm">Session not found.</p>
      </div>
    )
  }

  const violations = prompts.filter(p => p.was_blocked).length
  const highSeverity = events.filter(e => e.severity === 'high').length
  const lang = session.challenge_language ?? 'python'

  return (
    <main className="bg-white text-black min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-10 border-b border-gray-100 pb-8">
          <Link href="/interviewer/history" className="text-xs text-gray-400 hover:text-black transition-colors mb-4 inline-block">
            ← History
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Session Review</p>
              <h1 className="text-3xl font-semibold tracking-tight">
                {session.challenge_title ?? 'Untitled Session'}
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                {lang}
                {session.challenge_difficulty && (
                  <span className="ml-2">{session.challenge_difficulty}</span>
                )}
                {' · '}
                {session.started_at ? new Date(session.started_at).toLocaleString() : '—'}
                {' · '}
                {duration(session.started_at, session.ended_at)}
              </p>
            </div>
            <span className="text-xs px-3 py-1 bg-gray-100 text-gray-600 self-start mt-1">
              {session.status}
            </span>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-px bg-gray-200 mb-10">
          {[
            { label: 'AI Prompts', value: prompts.length },
            { label: 'Violations', value: violations, alert: violations > 0 },
            { label: 'Proctor Alerts', value: events.length, alert: events.length > 0 },
            { label: 'High Severity', value: highSeverity, alert: highSeverity > 0 },
          ].map(m => (
            <div key={m.label} className="bg-white px-6 py-6 relative">
              <span className="absolute top-[-1px] left-[-1px] text-gray-200 text-xs select-none">+</span>
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">{m.label}</p>
              <p className={`text-3xl font-semibold ${m.alert ? 'text-red-500' : ''}`}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-200 mb-8">
          {(['code', 'prompts', 'proctor'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-xs uppercase tracking-widest transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-400 hover:text-black'
              }`}
            >
              {tab === 'code' ? 'Submitted Code' : tab === 'prompts' ? `AI Prompts (${prompts.length})` : `Proctor Events (${events.length})`}
            </button>
          ))}
        </div>

        {/* Tab: Submitted Code */}
        {activeTab === 'code' && (
          <div>
            {session.candidate_code ? (
              <div className="border border-gray-200" style={{ height: 480 }}>
                <Editor
                  height="100%"
                  language={lang}
                  theme="light"
                  value={session.candidate_code}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    padding: { top: 12 },
                    fontFamily: 'JetBrains Mono, Menlo, monospace',
                    domReadOnly: true,
                  }}
                />
              </div>
            ) : (
              <div className="border border-gray-200 px-8 py-20 text-center">
                <p className="text-gray-400 text-sm">No code was submitted for this session.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab: AI Prompts */}
        {activeTab === 'prompts' && (
          <div className="border border-gray-200 divide-y divide-gray-100">
            {prompts.length === 0 ? (
              <div className="px-8 py-20 text-center">
                <p className="text-gray-400 text-sm">No AI prompts were made.</p>
              </div>
            ) : (
              prompts.map(p => (
                <div key={p.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.was_blocked ? 'bg-red-500' : 'bg-gray-300'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-1.5 py-0.5 ${p.was_blocked ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'}`}>
                          {p.was_blocked ? 'blocked' : p.intent}
                        </span>
                        <span className="text-xs text-gray-300">
                          {new Date(p.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800 mb-1">{p.prompt_text}</p>
                      {p.was_blocked && p.violation_reason && (
                        <p className="text-xs text-red-500">{p.violation_reason}</p>
                      )}
                      {p.response_text && (
                        <p className="text-xs text-gray-500 mt-2 border-l-2 border-gray-200 pl-3 whitespace-pre-wrap">
                          {p.response_text}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab: Proctor Events */}
        {activeTab === 'proctor' && (
          <div className="border border-gray-200 divide-y divide-gray-100">
            {events.length === 0 ? (
              <div className="px-8 py-20 text-center">
                <p className="text-gray-400 text-sm">No proctor events recorded.</p>
              </div>
            ) : (
              events.map(e => (
                <div key={e.id} className={`px-5 py-3 flex items-center gap-3 border-l-2 ${severityColor(e.severity)}`}>
                  <span className="text-sm">{eventIcon(e.event_type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{e.event_type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-gray-400">{new Date(e.occurred_at).toLocaleString()}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 border ${severityColor(e.severity)}`}>
                    {e.severity}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </main>
  )
}
