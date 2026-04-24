import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/ui/Navbar'
import AuthProvider from '@/components/AuthProvider'

export const metadata: Metadata = {
  title: 'InterviewPilot — AI-Powered Honest Coding Interviews',
  description: 'Real-world coding. Honest assessment. Responsible AI.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* No Google Font import — using web-safe stack from globals.css */}
      <body>
        <AuthProvider>
          <Navbar />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
