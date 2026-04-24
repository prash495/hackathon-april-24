'use client'

import { useRequireAuth } from '@/hooks/useRequireAuth'

const stats = [
  { label: 'Upcoming', value: '0' },
  { label: 'Completed', value: '0' },
  { label: 'Success Rate', value: '—' },
]

export default function CandidateDashboard() {
  const { user, isLoading } = useRequireAuth('candidate')

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
        <div className="mb-12 border-b border-gray-100 pb-8">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Dashboard</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Welcome, {user.name.split(' ')[0]}
          </h1>
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

        {/* Sessions */}
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-6">Interview Sessions</p>
          <div className="border border-gray-200 relative">
            <span className="absolute top-[-1px] left-[-1px] text-gray-300 text-xs">+</span>
            <span className="absolute top-[-1px] right-[-1px] text-gray-300 text-xs">+</span>
            <span className="absolute bottom-[-1px] left-[-1px] text-gray-300 text-xs">+</span>
            <span className="absolute bottom-[-1px] right-[-1px] text-gray-300 text-xs">+</span>
            <div className="px-8 py-16 text-center">
              <p className="text-gray-400 text-sm">No active sessions</p>
              <p className="text-gray-300 text-xs mt-2">Interview invitations will appear here</p>
            </div>
          </div>
        </div>

      </div>
    </main>
  )
}
