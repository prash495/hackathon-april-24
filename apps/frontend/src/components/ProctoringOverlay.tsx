'use client'

import { useProctor } from '@/hooks/useProctor'

export default function ProctoringOverlay({ sessionId }: { sessionId: string }) {
  const { videoRef, canvasRef, status, error, cheating } = useProctor(sessionId)

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-1.5" style={{ width: 160 }}>
      <div className="relative bg-black overflow-hidden" style={{ height: 90 }}>
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
        />
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white text-xs">Loading...</span>
          </div>
        )}
      </div>

      <div className={`text-xs px-2 py-1 font-medium ${
        status === 'error'
          ? 'bg-yellow-100 text-yellow-800'
          : cheating
          ? 'bg-red-100 text-red-700'
          : 'bg-green-100 text-green-700'
      }`}>
        {status === 'error' ? `⚠ ${error}` : cheating ? '🔴 Cheating detected' : '🟢 OK'}
      </div>
    </div>
  )
}
