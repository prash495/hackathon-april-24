'use client'

import { forwardRef, useImperativeHandle, useRef, useState, useCallback, useEffect } from 'react'
import { useProctor } from '@/hooks/useProctor'

export interface ProctoringOverlayHandle { stop: () => void }

const ProctoringOverlay = forwardRef<ProctoringOverlayHandle, { sessionId: string }>(
  function ProctoringOverlay({ sessionId }, ref) {
    const { videoRef, canvasRef, status, error, cheating, stop } = useProctor(sessionId)

    useImperativeHandle(ref, () => ({ stop }), [stop])

    const [minimized, setMinimized] = useState(false)
    const [pos, setPos] = useState({ x: 0, y: 0 })
    const dragging = useRef(false)
    const offset = useRef({ x: 0, y: 0 })
    const containerRef = useRef<HTMLDivElement>(null)

    const onMouseDown = useCallback((e: React.MouseEvent) => {
      // Only drag from the status bar, not the video
      if ((e.target as HTMLElement).closest('[data-nodrag]')) return
      dragging.current = true
      const rect = containerRef.current!.getBoundingClientRect()
      offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      e.preventDefault()
    }, [])

    const onMouseMove = useCallback((e: MouseEvent) => {
      if (!dragging.current) return
      setPos({
        x: e.clientX - offset.current.x,
        y: e.clientY - offset.current.y,
      })
    }, [])

    const onMouseUp = useCallback(() => {
      dragging.current = false
    }, [])

    // Attach global listeners
    useEffect(() => {
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
      return () => {
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }
    }, [onMouseMove, onMouseUp])

    const statusColor = status === 'error'
      ? 'bg-yellow-500'
      : cheating
      ? 'bg-red-600'
      : 'bg-green-600'

    const statusText = status === 'error'
      ? (error ?? 'Camera error')
      : cheating
      ? 'Cheating detected'
      : 'Proctored'

    const dotColor = status === 'error'
      ? 'bg-yellow-200'
      : cheating
      ? 'bg-red-200 animate-pulse'
      : 'bg-green-200'

    // Position: if user hasn't dragged, default to top-right
    const style = pos.x === 0 && pos.y === 0
      ? { position: 'fixed' as const, top: 64, right: 16, zIndex: 50, width: 180 }
      : { position: 'fixed' as const, left: pos.x, top: pos.y, zIndex: 50, width: 180 }

    return (
      <div ref={containerRef} style={style} className="select-none">
        {/* Drag handle / status bar */}
        <div
          onMouseDown={onMouseDown}
          className={`${statusColor} text-white text-xs px-2 py-1 font-medium flex items-center justify-between cursor-grab active:cursor-grabbing rounded-t`}
        >
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
            {statusText}
          </span>
          <button
            data-nodrag
            onClick={() => setMinimized(m => !m)}
            className="ml-2 w-5 h-5 flex items-center justify-center hover:bg-white/20 rounded text-white text-xs leading-none"
            title={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? '▢' : '—'}
          </button>
        </div>

        {/* Video (collapsible) */}
        {!minimized && (
          <div className="relative bg-black overflow-hidden rounded-b shadow-lg" style={{ height: 100 }}>
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
        )}
      </div>
    )
  }
)

export default ProctoringOverlay
