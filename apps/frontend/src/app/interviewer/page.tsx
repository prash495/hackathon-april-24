'use client'

import Link from 'next/link'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { Users, BookOpen, CheckSquare, Plus, ArrowRight, Activity } from 'lucide-react'

const MOCK_SESSIONS = [
  { id: 's1', candidate: 'Priya Sharma',  challenge: 'Two Sum',          status: 'active',    score: null, date: 'Live now' },
  { id: 's2', candidate: 'James Liu',     challenge: 'LRU Cache',        status: 'completed', score: 88,   date: 'Apr 22' },
  { id: 's3', candidate: 'Sara Okonkwo',  challenge: 'Graph BFS',        status: 'completed', score: 71,   date: 'Apr 20' },
]

const STATUS_STYLE: Record<string, string> = {
  active:    'bg-green-50 text-green-700',
  completed: 'bg-gray-100 text-gray-600',
  pending:   'bg-amber-50 text-amber-700',
}

export default function InterviewerDashboard() {
  const { user, isLoading } = useRequireAuth('interviewer')

  if (isLoading || !user) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
        <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <main className="bg-white text-black min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="flex items-start justify-between mb-12 pb-8 border-b-2 border-gray-100">
          <div>
            <p className="text-sm uppercase tracking-widest text-gray-400 mb-2 font-medium">Interviewer Dashboard</p>
            <h1 className="text-4xl">Welcome, {user.name.split(' ')[0]}</h1>
            <p className="text-gray-500 mt-2">Manage challenges and monitor live sessions.</p>
          </div>
          <Link
            href="/interviewer/create-challenge"
            className="inline-flex items-center gap-2 bg-black text-white px-6 py-3 text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] transition-all min-h-[48px]"
          >
            <Plus size={16} /> New Challenge
          </Link>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-px bg-gray-100 mb-12">
          {[
            { icon: Activity,    label: 'Active Sessions', value: '1',  sub: 'live now' },
            { icon: BookOpen,    label: 'Challenges',      value: '3',  sub: 'created' },
            { icon: CheckSquare, label: 'Completed',       value: '12', sub: 'interviews' },
          ].map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="bg-white px-8 py-8 relative">
              <span className="cm cm-tl">+</span><span className="cm cm-tr">+</span>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-gray-100 flex items-center justify-center">
                  <Icon size={16} className="text-gray-600" strokeWidth={1.75} />
                </div>
                <p className="text-xs text-gray-400 uppercase tracking-widest font-medium">{label}</p>
              </div>
              <p className="text-4xl font-bold mb-1">{value}</p>
              <p className="text-xs text-gray-400">{sub}</p>
            </div>
          ))}
        </div>

        {/* Live session alert */}
        <section className="mb-12">
          <div className="border-2 border-green-200 bg-green-50 p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
              <div>
                <p className="font-bold text-sm text-green-900">Priya Sharma is in an active session</p>
                <p className="text-xs text-green-700">Graph BFS Traversal · Started 12 min ago · 3 AI prompts used</p>
              </div>
            </div>
            <Link
              href="/interviewer/session/s1"
              className="inline-flex items-center gap-2 bg-green-700 text-white px-5 py-2.5 text-sm font-semibold hover:bg-green-800 transition-colors"
            >
              Monitor <ArrowRight size={14} />
            </Link>
          </div>
        </section>

        {/* Sessions table */}
        <section className="mb-12">
          <p className="text-sm uppercase tracking-widest text-gray-400 mb-5 font-medium">All Sessions</p>
          <div className="border-2 border-gray-100 relative">
            <span className="cm cm-tl">+</span><span className="cm cm-tr">+</span>
            <span className="cm cm-bl">+</span><span className="cm cm-br">+</span>

            <div className="grid grid-cols-5 px-6 py-3 border-b border-gray-100 bg-gray-50">
              {['Candidate', 'Challenge', 'Status', 'Score', ''].map(h => (
                <p key={h} className="text-xs uppercase tracking-widest text-gray-400 font-medium">{h}</p>
              ))}
            </div>

            {MOCK_SESSIONS.map((s, i) => (
              <div
                key={s.id}
                className={`grid grid-cols-5 px-6 py-4 items-center ${i < MOCK_SESSIONS.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-black text-white flex items-center justify-center text-xs font-bold">
                    {s.candidate.charAt(0)}
                  </div>
                  <p className="font-semibold text-sm">{s.candidate}</p>
                </div>
                <p className="text-sm text-gray-600">{s.challenge}</p>
                <span className={`text-xs font-semibold px-2 py-0.5 w-fit capitalize ${STATUS_STYLE[s.status]}`}>
                  {s.status}
                </span>
                <p className="text-sm font-semibold">{s.score ?? '—'}</p>
                <Link
                  href={`/interviewer/session/${s.id}`}
                  className="text-xs text-gray-400 hover:text-black underline underline-offset-4 justify-self-end"
                >
                  {s.status === 'active' ? 'Monitor →' : 'Review →'}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* Quick links */}
        <section>
          <p className="text-sm uppercase tracking-widest text-gray-400 mb-5 font-medium">Quick Actions</p>
          <div className="grid md:grid-cols-3 gap-px bg-gray-100">
            {[
              { href: '/interviewer/create-challenge', icon: Plus,       label: 'Create Challenge',  desc: 'Write a new problem' },
              { href: '/interviewer/session/s1',       icon: Users,      label: 'Monitor Session',   desc: 'Live candidate view' },
              { href: '/interviewer/create-challenge', icon: BookOpen,   label: 'View Challenges',   desc: 'Browse your library' },
            ].map(({ href, icon: Icon, label, desc }) => (
              <Link key={label} href={href} className="bg-white px-6 py-6 hover:bg-gray-50 transition-colors relative group">
                <span className="cm cm-tl">+</span><span className="cm cm-tr">+</span>
                <div className="w-9 h-9 bg-black flex items-center justify-center mb-4">
                  <Icon size={16} className="text-white" strokeWidth={1.75} />
                </div>
                <p className="font-bold text-sm mb-1">{label}</p>
                <p className="text-xs text-gray-400">{desc}</p>
              </Link>
            ))}
          </div>
        </section>

      </div>
    </main>
  )
}
