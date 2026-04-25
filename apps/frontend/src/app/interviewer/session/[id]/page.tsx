'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import Button from '@/components/ui/Button'

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

type SessionData = {
  id: string
  status: string
  candidate_id: string | null
  challenge_id: string | null
  assistance_level: number
  started_at: string | null
}

export default function InterviewerSessionView() {
  const params = useParams()
  const sessionId = params.id as string
  const { user } = useRequireAuth('interviewer')

  const [session, setSession] = useState<SessionData | null>(null)
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [proctorEvents, setProctorEvents] = useState<ProctorEvent[]>([])
  const [copied, setCopied] = useState(false)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)

  const candidateLink = typeof window !== 'undefined'
    ? `${window.location.origin}/session/${sessionId}`
    : ''

  // Poll session, prompts, and proctor events
  useEffect(() => {
    if (!user) return
    const poll = async () => {
      try {
        const [sessRes, promptRes, eventsRes, proctorRes] = await Promise.all([
          api.get(`/sessions/${sessionId}`),
          api.get(`/sessions/${sessionId}/prompts`),
          api.get(`/sessions/${sessionId}/proctor-events`),
          api.get(`/sessions/${sessionId}/proctor-status`),
        ])
        setSession(sessRes.data)
        setPrompts(promptRes.data)
        setProctorEvents(eventsRes.data)
        if (proctorRes.data.stream_url) setStreamUrl(proctorRes.data.stream_url)
      } catch {}
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [sessionId, user])

  const copyLink = () => {
    navigator.clipboard.writeText(candidateLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const startSession = async () => {
    setStarting(true)
    try {
      const { data } = await api.post(`/sessions/${sessionId}/start`)
      setSession(s => s ? { ...s, status: 'active' } : s)
      if (data.stream_url) setStreamUrl(data.stream_url)
    } catch (e) { console.error(e) }
    finally { setStarting(false) }
  }

  const stopSession = async () => {
    setStopping(true)
    try {
      await api.post(`/sessions/${sessionId}/stop`)
      setSession(s => s ? { ...s, status: 'completed' } : s)
    } catch (e) { console.error(e) }
    finally { setStopping(false) }
  }

  const violations = prompts.filter(p => p.was_blocked).length
  const highSeverityEvents = proctorEvents.filter(e => e.severity === 'high').length

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

  const severityColor = (s: string) => {
    switch (s) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200'
      case 'medium': return 'text-yellow-700 bg-yellow-50 border-yellow-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  return (
    <main className="bg-white text-black min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="flex items-start justify-between mb-8 border-b border-gray-100 pb-8">
          <div>
            <Link href="/interviewer" className="text-xs text-gray-400 hover:text-black transition-colors mb-4 inline-block">
              ← Dashboard
            </Link>
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
              {session?.status === 'active' ? 'Live' : session?.status || 'Loading'}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Interview Monitor</h1>
          </div>
          <div className="flex items-center gap-3">
            {session?.status === 'active' && (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-gray-400">Active</span>
              </span>
            )}
            {session?.status === 'pending' && (
              <Button onClick={startSession} loading={starting}>Start Session</Button>
            )}
            {session?.status === 'active' && (
              <Button onClick={stopSession} loading={stopping} variant="outline">End Session</Button>
            )}
          </div>
        </div>

        {/* Share link */}
        <div className="mb-8 border border-gray-200 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Candidate Link</p>
            <p className="text-sm font-mono text-gray-600 truncate max-w-lg">{candidateLink}</p>
          </div>
          <button
            onClick={copyLink}
            className="text-xs bg-black text-white px-4 py-2 hover:bg-gray-800 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>

        {/* Metrics */}
        <div className="grid md:grid-cols-4 gap-px bg-gray-200 mb-12">
          {[
            { label: 'AI Prompts', value: prompts.length },
            { label: 'Violations', value: violations, alert: violations > 0 },
            { label: 'Proctor Alerts', value: proctorEvents.length, alert: highSeverityEvents > 0 },
            { label: 'High Severity', value: highSeverityEvents, alert: highSeverityEvents > 0 },
          ].map(m => (
            <div key={m.label} className="bg-white px-6 py-6 relative">
              <span className="absolute top-[-1px] left-[-1px] text-gray-200 text-xs select-none">+</span>
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">{m.label}</p>
              <p className={`text-3xl font-semibold ${m.alert ? 'text-red-500' : ''}`}>{m.value}</p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Video Feed */}
          <div className="md:col-span-2 mb-4">
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-4">Candidate Camera Feed</p>
            <div className="border border-gray-200 relative bg-gray-900 overflow-hidden" style={{ maxHeight: 400 }}>
              {streamUrl && session?.status === 'active' ? (
                <img
                  src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/sessions/${sessionId}/stream`}
                  alt="Proctor camera feed"
                  className="w-full h-auto object-contain"
                  style={{ maxHeight: 400 }}
                />
              ) : (
                <div className="flex items-center justify-center py-20">
                  <p className="text-gray-500 text-sm">
                    {session?.status === 'pending'
                      ? 'Camera will activate when session starts'
                      : session?.status === 'completed'
                      ? 'Session ended'
                      : 'Waiting for camera feed...'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Prompt Log */}
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-4">AI Prompt Log</p>
            <div className="border border-gray-200 relative max-h-96 overflow-y-auto">
              {prompts.length === 0 ? (
                <div className="px-8 py-12 text-center">
                  <p className="text-gray-300 text-sm">No prompts yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {prompts.map((p) => (
                    <div key={p.id} className="px-5 py-3 flex items-start gap-3">
                      <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.was_blocked ? 'bg-red-500' : 'bg-gray-300'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 truncate">{p.prompt_text}</p>
                        {p.was_blocked && (
                          <p className="text-xs text-red-500 mt-0.5">{p.violation_reason}</p>
                        )}
                      </div>
                      <span className={`text-xs flex-shrink-0 ${p.was_blocked ? 'text-red-400' : 'text-gray-300'}`}>
                        {p.was_blocked ? 'blocked' : 'allowed'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Proctor Events */}
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-4">Proctor Events</p>
            <div className="border border-gray-200 relative max-h-96 overflow-y-auto">
              {proctorEvents.length === 0 ? (
                <div className="px-8 py-12 text-center">
                  <p className="text-gray-300 text-sm">No proctor events</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {proctorEvents.map((e) => (
                    <div key={e.id} className={`px-5 py-3 flex items-center gap-3 border-l-2 ${severityColor(e.severity)}`}>
                      <span className="text-sm">{eventIcon(e.event_type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{e.event_type.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(e.occurred_at).toLocaleTimeString()}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 border ${severityColor(e.severity)}`}>
                        {e.severity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </main>
  )
}
