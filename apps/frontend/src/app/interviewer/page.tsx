'use client'

import Link from 'next/link'
import { useRequireAuth } from '@/hooks/useRequireAuth'

const stats = [
  { label: 'Active Sessions', value: '0' },
  { label: 'Challenges', value: '0' },
  { label: 'Completed', value: '0' },
]

export default function InterviewerDashboard() {
  const { user, isLoading } = useRequireAuth('interviewer')

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
          <Link
            href="/interviewer/create-challenge"
            className="bg-black text-white px-5 py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            + New Challenge
          </Link>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-px bg-gray-200 mb-12">
          {stats.map(s => (
            <div key={s.label} className="bg-white px-8 py-8 relative">
              <span className="absolute top-[-1px] left-[-1px] text-gray-200 text-xs select-none">+</span>
              <span className="absolute top-[-1px] right-[-1px] text-gray-200 text-xs select-none">+</span>
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">{s.label}</p>
              <p className="text-4xl font-semibold">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Challenges */}
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-6">Your Challenges</p>
          <div className="border border-gray-200 relative">
            <span className="absolute top-[-1px] left-[-1px] text-gray-300 text-xs">+</span>
            <span className="absolute top-[-1px] right-[-1px] text-gray-300 text-xs">+</span>
            <span className="absolute bottom-[-1px] left-[-1px] text-gray-300 text-xs">+</span>
            <span className="absolute bottom-[-1px] right-[-1px] text-gray-300 text-xs">+</span>
            <div className="px-8 py-16 text-center">
              <p className="text-gray-400 text-sm mb-4">No challenges yet</p>
              <Link
                href="/interviewer/create-challenge"
                className="text-sm underline underline-offset-4 text-black hover:text-gray-600 transition-colors"
              >
                Create your first challenge →
              </Link>
            </div>
          </div>
        </div>

      </div>
    </main>
  )
}
