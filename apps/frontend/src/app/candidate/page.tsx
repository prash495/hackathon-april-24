'use client'

import Link from 'next/link'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { Clock, CheckCircle, TrendingUp, ArrowRight, Code2 } from 'lucide-react'

const MOCK_SESSIONS = [
  { id: '1', title: 'Two Sum', difficulty: 'easy',  status: 'completed', score: 92, date: 'Apr 22' },
  { id: '2', title: 'LRU Cache', difficulty: 'hard', status: 'completed', score: 74, date: 'Apr 20' },
]

const DIFFICULTY_COLOR: Record<string, string> = {
  easy:   'bg-green-50 text-green-700',
  medium: 'bg-amber-50 text-amber-700',
  hard:   'bg-red-50 text-red-700',
}

export default function CandidateDashboard() {
  const { user, isLoading } = useRequireAuth('candidate')

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
        <div className="mb-12 pb-8 border-b-2 border-gray-100">
          <p className="text-sm uppercase tracking-widest text-gray-400 mb-2 font-medium">Candidate Dashboard</p>
          <h1 className="text-4xl">Welcome back, {user.name.split(' ')[0]}</h1>
          <p className="text-gray-500 mt-2">Your interview workspace and history.</p>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-px bg-gray-100 mb-12">
          {[
            { icon: Clock,       label: 'Upcoming',     value: '1',   sub: 'scheduled' },
            { icon: CheckCircle, label: 'Completed',    value: '2',   sub: 'interviews' },
            { icon: TrendingUp,  label: 'Avg Score',    value: '83%', sub: 'last 5 sessions' },
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

        {/* Active / Upcoming session */}
        <section className="mb-12">
          <p className="text-sm uppercase tracking-widest text-gray-400 mb-5 font-medium">Active Session</p>
          <div className="border-2 border-black p-6 relative flex items-center justify-between">
            <span className="cm cm-tl">+</span><span className="cm cm-tr">+</span>
            <span className="cm cm-bl">+</span><span className="cm cm-br">+</span>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-black flex items-center justify-center">
                <Code2 size={18} className="text-white" strokeWidth={1.75} />
              </div>
              <div>
                <p className="font-bold text-base">Graph BFS Traversal</p>
                <p className="text-sm text-gray-500">Interviewer: Alex Chen · Level 2: Conceptual</p>
              </div>
            </div>
            <Link
              href="/session/demo-session-1"
              className="inline-flex items-center gap-2 bg-black text-white px-6 py-3 text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] transition-all"
            >
              Join Session <ArrowRight size={14} />
            </Link>
          </div>
        </section>

        {/* Past sessions */}
        <section>
          <p className="text-sm uppercase tracking-widest text-gray-400 mb-5 font-medium">Past Sessions</p>
          <div className="border-2 border-gray-100 relative">
            <span className="cm cm-tl">+</span><span className="cm cm-tr">+</span>
            <span className="cm cm-bl">+</span><span className="cm cm-br">+</span>

            {/* Table header */}
            <div className="grid grid-cols-5 px-6 py-3 border-b border-gray-100 bg-gray-50">
              {['Challenge', 'Difficulty', 'Date', 'Score', ''].map(h => (
                <p key={h} className="text-xs uppercase tracking-widest text-gray-400 font-medium">{h}</p>
              ))}
            </div>

            {MOCK_SESSIONS.map((s, i) => (
              <div
                key={s.id}
                className={`grid grid-cols-5 px-6 py-4 items-center ${i < MOCK_SESSIONS.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <p className="font-semibold text-sm">{s.title}</p>
                <span className={`text-xs font-semibold px-2 py-0.5 w-fit capitalize ${DIFFICULTY_COLOR[s.difficulty]}`}>
                  {s.difficulty}
                </span>
                <p className="text-sm text-gray-500">{s.date}</p>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-black rounded-full" style={{ width: `${s.score}%` }} />
                  </div>
                  <span className="text-sm font-semibold">{s.score}</span>
                </div>
                <Link href={`/session/${s.id}/review`} className="text-xs text-gray-400 hover:text-black underline underline-offset-4 justify-self-end">
                  Review
                </Link>
              </div>
            ))}
          </div>
        </section>

      </div>
    </main>
  )
}
