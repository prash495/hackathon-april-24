/**
 * ProctorOverlay — Shows the webcam feed with a gaze status overlay.
 *
 * - Green border + "OK" when looking at camera
 * - Red border + "CHEATING" when looking away or head turned
 * - Yellow border + "NO FACE" when no face detected
 * - Orange border + "MULTIPLE FACES" when more than one face
 *
 * Drop this component anywhere in your page:
 *   <ProctorOverlay />
 */

'use client'

import { useProctor } from '@/hooks/useProctor'

export default function ProctorOverlay() {
  const {
    videoRef,
    connected,
    status,
    gaze,
    lateral,
    angle,
    cheating,
    cheat_counter,
    face_count,
  } = useProctor()

  const borderColor =
    status === 'CHEATING' || cheating
      ? 'border-red-500'
      : status === 'NO_FACE'
        ? 'border-yellow-500'
        : status === 'MULTIPLE_FACES'
          ? 'border-orange-500'
          : 'border-green-500'

  const bgOverlay =
    status === 'CHEATING' || cheating
      ? 'bg-red-500/10'
      : status === 'NO_FACE'
        ? 'bg-yellow-500/10'
        : 'bg-transparent'

  const statusLabel =
    status === 'CHEATING' ? '🚨 CHEATING'
      : status === 'NO_FACE' ? '⚠️ NO FACE'
        : status === 'MULTIPLE_FACES' ? '⚠️ MULTIPLE FACES'
          : status === 'CONNECTING' ? '⏳ Connecting...'
            : status === 'NO_CAMERA' ? '📷 No Camera'
              : '✅ OK'

  return (
    <div className={`relative rounded-lg overflow-hidden border-4 ${borderColor} ${bgOverlay}`}>
      {/* Webcam video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-auto -scale-x-100"
      />

      {/* Status badge — top left */}
      <div className="absolute top-2 left-2 px-3 py-1 rounded-full text-sm font-semibold bg-black/60 text-white">
        {statusLabel}
      </div>

      {/* Gaze direction label — top right */}
      {gaze && gaze !== 'Looking Straight' && (
        <div className="absolute top-2 right-2 px-3 py-1 rounded-full text-sm bg-black/60 text-red-400">
          {gaze}
        </div>
      )}

      {/* Debug info — bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 px-3 py-1.5 bg-black/50 text-white text-xs flex justify-between">
        <span>Angle: {angle}°</span>
        <span>Lateral: {lateral}</span>
        <span>Faces: {face_count} | Streak: {cheat_counter}</span>
      </div>

      {/* Connection indicator */}
      <div className="absolute bottom-8 right-2">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
      </div>
    </div>
  )
}
