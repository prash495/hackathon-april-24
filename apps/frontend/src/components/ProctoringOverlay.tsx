'use client'

import { forwardRef, useImperativeHandle } from 'react'
import { useProctor } from '@/hooks/useProctor'

export interface ProctoringOverlayHandle { stop: () => void }

const ProctoringOverlay = forwardRef<ProctoringOverlayHandle, { sessionId: string }>(
  function ProctoringOverlay({ sessionId }, ref) {
    const { videoRef, canvasRef, status, error, cheating, stop } = useProctor(sessionId)

    useImperativeHandle(ref, () => ({ stop }), [stop])

    return (
      <div className="fixed top-16 right-4 z-50 flex flex-col gap-0 shadow-lg" style={{ width: 160 }}>
        <div
          className={`text-xs px-2 py-1 font-medium flex items-center gap-1.5 ${
            status === 'error'
              ? 'bg-yellow-500 text-white'
              : cheating
              ? 'bg-red-600 text-white'
              : 'bg-green-600 text-white'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${status === 'error' ? 'bg-yellow-200' : cheating ? 'bg-red-200 animate-pulse' : 'bg-green-200'}`} />
          {status === 'error' ? (error ?? 'Camera error') : cheating ? 'Cheating detected' : 'Proctored'}
        </div>
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
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <span className="text-white text-xs">Loading…</span>
            </div>
          )}
        </div>
      </div>
    )
  }
)

export default ProctoringOverlay
