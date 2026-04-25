'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'

export default function Navbar() {
  const { user, logout } = useAuthStore()
  const router = useRouter()

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  return (
    <nav className="border-b border-gray-100 glass sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform">
            <span className="text-white text-xs font-bold tracking-tight">IP</span>
          </div>
          <span className="font-bold text-base tracking-tight text-black">InterviewPilot</span>
        </Link>

        {/* Auth state */}
        {user ? (
          <div className="flex items-center gap-4 md:gap-6">
            <Link
              href={user.role === 'interviewer' ? '/interviewer' : '/candidate'}
              className="hidden md:block text-base text-gray-500 hover:text-black font-medium"
            >
              Dashboard
            </Link>
            <span className="hidden md:inline text-sm text-gray-400 border border-gray-200 px-2.5 py-1 capitalize">
              {user.role}
            </span>
            <span className="hidden md:inline text-base text-gray-700 font-medium">{user.name}</span>
            <button
              onClick={handleLogout}
              className="text-base text-gray-500 hover:text-black font-medium min-h-[44px] px-2"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 md:gap-3">
            <Link
              href="/login"
              className="text-base text-gray-600 hover:text-black font-medium px-3 py-2 min-h-[44px] flex items-center"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="text-base bg-black text-white font-semibold px-5 py-2.5 min-h-[44px] flex items-center hover:bg-gray-800 active:bg-gray-900 active:scale-[0.98] transition-all"
            >
              Get started
            </Link>
          </div>
        )}
      </div>
    </nav>
  )
}
