'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import Button from '@/components/ui/Button'

export default function CandidateDashboard() {
  const { user, isLoading } = useRequireAuth('candidate')
  const router = useRouter()
  const [sessionCode, setSessionCode] = useState('')

  if (isLoading || !user) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <span className="w-5 h-5 border border-black border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const joinSession = () => {
    if (!sessionCode.trim()) return
    // Extract session ID from URL or raw ID
    let id = sessionCode.trim()
    if (id.includes('/session/')) {
      id = id.split('/session/').pop() || id
    }
    router.push(`/session/${id}`)
  }

  return (
    <main className="bg-white text-black min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-12 border-b border-gray-100 pb-8">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Dashboard</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Welcome, {user.name.split(' ')[0]}
          </h1>
        </div>

        {/* Join Session */}
        <div className="mb-12">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-6">Join an Interview</p>
          <div className="border-2 border-gray-100 p-8 relative max-w-lg">
            <span className="absolute top-[-1px] left-[-1px] text-gray-200 text-xs select-none">+</span>
            <span className="absolute top-[-1px] right-[-1px] text-gray-200 text-xs select-none">+</span>
            <span className="absolute bottom-[-1px] left-[-1px] text-gray-200 text-xs select-none">+</span>
            <span className="absolute bottom-[-1px] right-[-1px] text-gray-200 text-xs select-none">+</span>

            <p className="text-sm text-gray-500 mb-4">
              Paste the session link or ID from your interviewer to join.
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={sessionCode}
                onChange={e => setSessionCode(e.target.value)}
                placeholder="Paste session link or ID..."
                className="flex-1 border-2 border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:border-black transition-colors placeholder:text-gray-300"
                onKeyDown={e => { if (e.key === 'Enter') joinSession() }}
              />
              <Button onClick={joinSession}>Join</Button>
            </div>
          </div>
        </div>

        {/* Info */}
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-6">How it works</p>
          <div className="grid md:grid-cols-3 gap-px bg-gray-200">
            {[
              { step: '01', title: 'Get Link', desc: 'Your interviewer shares a session link with you' },
              { step: '02', title: 'Start Session', desc: 'Camera activates for proctoring when you begin' },
              { step: '03', title: 'Code & Submit', desc: 'Solve the challenge with optional AI assistance' },
            ].map(s => (
              <div key={s.step} className="bg-white px-6 py-8">
                <p className="text-xs text-gray-300 font-mono mb-2">{s.step}</p>
                <p className="font-semibold text-sm mb-1">{s.title}</p>
                <p className="text-xs text-gray-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  )
}
