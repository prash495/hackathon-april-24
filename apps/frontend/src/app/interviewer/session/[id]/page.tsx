'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type Prompt = { prompt: string; allowed: boolean; violation?: string }

export default function InterviewerSessionView() {
  const params = useParams()
  const sessionId = params.id as string
  const [prompts, setPrompts] = useState<Prompt[]>([])

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:8000/sessions/${sessionId}/prompts`)
        setPrompts(await res.json())
      } catch {}
    }, 2000)
    return () => clearInterval(interval)
  }, [sessionId])

  const violations = prompts.filter(p => !p.allowed).length

  return (
    <main className="bg-white text-black min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="flex items-start justify-between mb-12 border-b border-gray-100 pb-8">
          <div>
            <Link href="/interviewer" className="text-xs text-gray-400 hover:text-black transition-colors mb-4 inline-block">
              ← Dashboard
            </Link>
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Live</p>
            <h1 className="text-3xl font-semibold tracking-tight">Interview Monitor</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs text-gray-400">Active</span>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid md:grid-cols-4 gap-px bg-gray-200 mb-12">
          {[
            { label: 'AI Prompts', value: prompts.length },
            { label: 'Violations', value: violations, alert: violations > 0 },
            { label: 'Time Elapsed', value: '0m' },
            { label: 'Authenticity', value: '100%' },
          ].map(m => (
            <div key={m.label} className="bg-white px-6 py-6 relative">
              <span className="absolute top-[-1px] left-[-1px] text-gray-200 text-xs select-none">+</span>
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">{m.label}</p>
              <p className={`text-3xl font-semibold ${m.alert ? 'text-red-500' : ''}`}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Prompt Log */}
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-6">AI Prompt Log</p>
          <div className="border border-gray-200 relative">
            <span className="absolute top-[-1px] left-[-1px] text-gray-300 text-xs">+</span>
            <span className="absolute top-[-1px] right-[-1px] text-gray-300 text-xs">+</span>
            <span className="absolute bottom-[-1px] left-[-1px] text-gray-300 text-xs">+</span>
            <span className="absolute bottom-[-1px] right-[-1px] text-gray-300 text-xs">+</span>

            {prompts.length === 0 ? (
              <div className="px-8 py-12 text-center">
                <p className="text-gray-300 text-sm">No prompts yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {prompts.map((p, i) => (
                  <div key={i} className="px-6 py-4 flex items-start gap-4">
                    <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.allowed ? 'bg-gray-300' : 'bg-red-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">{p.prompt}</p>
                      {!p.allowed && (
                        <p className="text-xs text-red-500 mt-1">{p.violation}</p>
                      )}
                    </div>
                    <span className={`text-xs flex-shrink-0 ${p.allowed ? 'text-gray-300' : 'text-red-400'}`}>
                      {p.allowed ? 'allowed' : 'blocked'}
                    </span>
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
