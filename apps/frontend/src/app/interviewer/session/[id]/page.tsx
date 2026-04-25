'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  ShieldAlert, Eye, TabletSmartphone, Copy, UserX,
  Square, Pause, SlidersHorizontal, ArrowLeft,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

// ─── Types ────────────────────────────────────────────────────
type PromptLog = {
  id: string; prompt_text: string; intent: string
  was_blocked: boolean; violation_reason?: string; created_at: string
}
type ProctorEvent = {
  id: string; event_type: string; severity: 'low' | 'medium' | 'high'
  metadata: Record<string, unknown>; occurred_at: string
}

const SEVERITY_COLOR = { low: 'text-amber-600 bg-amber-50', medium: 'text-orange-600 bg-orange-50', high: 'text-red-600 bg-red-50' }
const EVENT_ICON: Record<string, React.ElementType> = {
  tab_switch: TabletSmartphone, copy_paste: Copy,
  face_absent: UserX, gaze_away: Eye, window_blur: TabletSmartphone, multiple_faces: Eye,
}

// ─── Mock data ────────────────────────────────────────────────
const MOCK_PROMPTS: PromptLog[] = [
  { id: '1', prompt_text: 'How do I use a hashmap in Python?',       intent: 'syntax_lookup',      was_blocked: false, created_at: '14:02:11' },
  { id: '2', prompt_text: 'Explain two-pointer technique',           intent: 'conceptual_question', was_blocked: false, created_at: '14:05:33' },
  { id: '3', prompt_text: 'Solve this problem for me',               intent: 'solve_entire_problem',was_blocked: true,  violation_reason: 'Full-solution requests are prohibited.', created_at: '14:08:47' },
  { id: '4', prompt_text: 'What is the time complexity of dict lookup?', intent: 'conceptual_question', was_blocked: false, created_at: '14:11:02' },
]
const MOCK_EVENTS: ProctorEvent[] = [
  { id: 'e1', event_type: 'tab_switch', severity: 'medium', metadata: {}, occurred_at: '14:03:20' },
  { id: 'e2', event_type: 'copy_paste', severity: 'low',    metadata: { paste_length: 45 }, occurred_at: '14:07:55' },
  { id: 'e3', event_type: 'face_absent', severity: 'high',  metadata: { duration_ms: 3200 }, occurred_at: '14:10:10' },
]
const HEATMAP_DATA = [
  { time: '14:00', prompts: 0 }, { time: '14:02', prompts: 1 },
  { time: '14:04', prompts: 0 }, { time: '14:06', prompts: 2 },
  { time: '14:08', prompts: 1 }, { time: '14:10', prompts: 1 },
  { time: '14:12', prompts: 0 },
]

// ─── Component ────────────────────────────────────────────────
export default function InterviewerMonitor() {
  const { id: sessionId } = useParams<{ id: string }>()
  const router = useRouter()

  const [liveCode, setLiveCode]     = useState('# Waiting for candidate to start coding…\n')
  const [liveLang, setLiveLang]     = useState('python')
  const [prompts, setPrompts]       = useState<PromptLog[]>(MOCK_PROMPTS)
  const [events, setEvents]         = useState<ProctorEvent[]>(MOCK_EVENTS)
  const [elapsed, setElapsed]       = useState(0)
  const [activeTab, setActiveTab]   = useState<'prompts' | 'proctor' | 'heatmap'>('prompts')
  const promptEndRef = useRef<HTMLDivElement>(null)

  // ── Timer ──────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  // ── Supabase Realtime ──────────────────────────────────────
  useEffect(() => {
    // Code sync channel
    const codeChannel = supabase
      .channel(`session:${sessionId}`)
      .on('broadcast', { event: 'code_update' }, ({ payload }) => {
        setLiveCode(payload.code ?? '')
        setLiveLang(payload.language ?? 'python')
      })
      .subscribe()

    // Prompt logs realtime
    const promptChannel = supabase
      .channel(`prompts:${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'prompt_logs',
        filter: `session_id=eq.${sessionId}`,
      }, ({ new: row }) => {
        setPrompts(p => [...p, row as PromptLog])
        setTimeout(() => promptEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      })
      .subscribe()

    // Proctor events realtime
    const proctorChannel = supabase
      .channel(`proctor:${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'proctor_events',
        filter: `session_id=eq.${sessionId}`,
      }, ({ new: row }) => {
        setEvents(e => [row as ProctorEvent, ...e])
      })
      .subscribe()

    return () => {
      supabase.removeChannel(codeChannel)
      supabase.removeChannel(promptChannel)
      supabase.removeChannel(proctorChannel)
    }
  }, [sessionId])

  const violations  = prompts.filter(p => p.was_blocked).length
  const aiUsage     = prompts.length
  const highAlerts  = events.filter(e => e.severity === 'high').length
  const authScore   = Math.max(0, 100 - violations * 15 - highAlerts * 10)

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-white text-black overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────── */}
      <div className="border-b-2 border-gray-100 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/interviewer" className="text-gray-400 hover:text-black transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <p className="font-bold text-sm">Priya Sharma — Graph BFS Traversal</p>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="flex items-center gap-1.5 text-xs text-green-600">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> Live
              </span>
              <span className="text-xs text-gray-400 font-mono">{fmt(elapsed)}</span>
              <span className="text-xs text-gray-400">Level 2: Conceptual</span>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="hidden md:flex items-center gap-6">
          {[
            { label: 'AI Prompts',    value: aiUsage,   color: '' },
            { label: 'Violations',    value: violations, color: violations > 0 ? 'text-red-600' : '' },
            { label: 'Alerts',        value: highAlerts, color: highAlerts > 0 ? 'text-orange-600' : '' },
            { label: 'Auth Score',    value: `${authScore}%`, color: authScore < 70 ? 'text-red-600' : 'text-green-600' },
          ].map(m => (
            <div key={m.label} className="text-center">
              <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
              <p className="text-xs text-gray-400">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Session controls */}
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 border border-gray-200 px-3 py-2 text-xs font-medium hover:border-black transition-colors">
            <SlidersHorizontal size={13} /> Set Level
          </button>
          <button className="inline-flex items-center gap-1.5 border border-amber-300 text-amber-700 px-3 py-2 text-xs font-medium hover:bg-amber-50 transition-colors">
            <Pause size={13} /> Pause
          </button>
          <button
            onClick={() => router.push('/interviewer')}
            className="inline-flex items-center gap-1.5 bg-red-600 text-white px-3 py-2 text-xs font-semibold hover:bg-red-700 transition-colors"
          >
            <Square size={13} /> End Session
          </button>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Left: Live code viewer (read-only) */}
        <div className="flex-1 flex flex-col border-r-2 border-gray-100 min-w-0">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <p className="text-xs text-gray-500 font-mono">Live: solution.{liveLang === 'cpp' ? 'cpp' : liveLang === 'javascript' ? 'js' : liveLang}</p>
            </div>
            <span className="text-xs text-gray-300 border border-gray-100 px-2 py-0.5">Read-only</span>
          </div>
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              language={liveLang}
              theme="light"
              value={liveCode}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                padding: { top: 16 },
                fontFamily: "'JetBrains Mono', Menlo, monospace",
                renderLineHighlight: 'none',
                cursorStyle: 'line',
              }}
            />
          </div>
        </div>

        {/* Right: Tabs panel */}
        <div className="w-96 flex flex-col shrink-0">

          {/* Tab switcher */}
          <div className="flex border-b-2 border-gray-100">
            {(['prompts', 'proctor', 'heatmap'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-xs font-semibold uppercase tracking-widest transition-colors ${
                  activeTab === tab ? 'border-b-2 border-black text-black' : 'text-gray-400 hover:text-black'
                }`}
              >
                {tab === 'prompts' ? `AI Log (${aiUsage})` : tab === 'proctor' ? `Alerts (${events.length})` : 'Heatmap'}
              </button>
            ))}
          </div>

          {/* ── AI Prompt log ─────────────────────────────── */}
          {activeTab === 'prompts' && (
            <div className="flex-1 overflow-y-auto">
              {prompts.length === 0 ? (
                <p className="text-xs text-gray-300 text-center mt-12">No prompts yet</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {prompts.map(p => (
                    <div key={p.id} className={`px-4 py-3 ${p.was_blocked ? 'bg-red-50' : ''}`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 ${
                          p.was_blocked ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {p.was_blocked ? '🚫 Blocked' : '✓ Allowed'}
                        </span>
                        <span className="text-xs text-gray-400 font-mono shrink-0">{p.created_at}</span>
                      </div>
                      <p className="text-sm text-gray-800 leading-snug">{p.prompt_text}</p>
                      {p.was_blocked && p.violation_reason && (
                        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                          <ShieldAlert size={11} /> {p.violation_reason}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">Intent: {p.intent.replace(/_/g, ' ')}</p>
                    </div>
                  ))}
                  <div ref={promptEndRef} />
                </div>
              )}
            </div>
          )}

          {/* ── Proctor alert feed ────────────────────────── */}
          {activeTab === 'proctor' && (
            <div className="flex-1 overflow-y-auto">
              {events.length === 0 ? (
                <p className="text-xs text-gray-300 text-center mt-12">No events detected</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {events.map(e => {
                    const Icon = EVENT_ICON[e.event_type] ?? Eye
                    return (
                      <div key={e.id} className="px-4 py-3 flex items-start gap-3">
                        <div className={`w-7 h-7 flex items-center justify-center shrink-0 ${SEVERITY_COLOR[e.severity].split(' ')[1]}`}>
                          <Icon size={14} className={SEVERITY_COLOR[e.severity].split(' ')[0]} strokeWidth={1.75} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold capitalize">{e.event_type.replace(/_/g, ' ')}</p>
                            <span className="text-xs text-gray-400 font-mono shrink-0">{e.occurred_at}</span>
                          </div>
                          <span className={`text-xs font-semibold px-1.5 py-0.5 capitalize ${SEVERITY_COLOR[e.severity]}`}>
                            {e.severity}
                          </span>
                          {e.metadata && Object.keys(e.metadata).length > 0 && (
                            <p className="text-xs text-gray-400 mt-1">
                              {Object.entries(e.metadata).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Assistance heatmap ────────────────────────── */}
          {activeTab === 'heatmap' && (
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-4 font-medium">AI Usage Over Time</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={HEATMAP_DATA} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 11, border: '1px solid #e5e7eb', borderRadius: 0 }}
                    />
                    <Bar dataKey="prompts" radius={0}>
                      {HEATMAP_DATA.map((entry, i) => (
                        <Cell key={i} fill={entry.prompts > 1 ? '#ef4444' : entry.prompts === 1 ? '#f59e0b' : '#e5e7eb'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-2">
                  {[['#e5e7eb', 'None'], ['#f59e0b', '1 prompt'], ['#ef4444', '2+ prompts']].map(([c, l]) => (
                    <div key={l} className="flex items-center gap-1.5">
                      <div className="w-3 h-3" style={{ background: c }} />
                      <span className="text-xs text-gray-500">{l}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Authenticity breakdown */}
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-4 font-medium">Authenticity Score</p>
                <div className="space-y-3">
                  {[
                    { label: 'No violations',    score: violations === 0 ? 40 : Math.max(0, 40 - violations * 15), max: 40 },
                    { label: 'Low proctor alerts', score: Math.max(0, 30 - highAlerts * 10), max: 30 },
                    { label: 'Consistent timing', score: 20, max: 20 },
                    { label: 'Low paste activity', score: 10, max: 10 },
                  ].map(({ label, score, max }) => (
                    <div key={label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600">{label}</span>
                        <span className="font-semibold">{score}/{max}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${score / max > 0.6 ? 'bg-black' : 'bg-red-400'}`}
                          style={{ width: `${(score / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
                    <span className="text-sm font-bold">Total</span>
                    <span className={`text-2xl font-bold ${authScore >= 70 ? 'text-black' : 'text-red-600'}`}>
                      {authScore}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
