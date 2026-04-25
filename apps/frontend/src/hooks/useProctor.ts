/**
 * useProctor — React hook for webcam proctoring via WebSocket.
 *
 * How it works:
 *   1. Opens the user's webcam via getUserMedia()
 *   2. Connects a WebSocket to the backend at ws://localhost:8000/ws/proctor
 *   3. Every CAPTURE_INTERVAL_MS, grabs a frame from the video → canvas → base64 JPEG
 *   4. Sends the base64 frame to the backend
 *   5. Backend runs MediaPipe + gaze analysis, sends back JSON
 *   6. Hook exposes the latest result so components can render overlays
 *
 * Usage:
 *   const { videoRef, status, direction, cheating } = useProctor()
 *   return <video ref={videoRef} />
 */

import { useEffect, useRef, useState, useCallback } from 'react'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8001/ws/proctor'
const CAPTURE_INTERVAL_MS = 150 // ~7 FPS — faster response with minimal extra load

export interface ProctorResult {
  status: string       // "OK" | "CHEATING" | "NO_FACE" | "MULTIPLE_FACES"
  gaze: string         // "Looking Straight" | "Looking Left" | "Looking Right"
  lateral: number      // iris lateral value (+ = left, - = right)
  angle: number        // head angle from camera (0 = facing camera)
  cheating: boolean
  cheat_counter: number
  face_count: number
}

const DEFAULT_RESULT: ProctorResult = {
  status: 'CONNECTING',
  gaze: '',
  lateral: 0,
  angle: 0,
  cheating: false,
  cheat_counter: 0,
  face_count: 0,
}

export function useProctor() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [result, setResult] = useState<ProctorResult>(DEFAULT_RESULT)
  const [connected, setConnected] = useState(false)

  // Capture a frame from the video element and return as base64 JPEG
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current
    if (!video || video.readyState < 2) return null // not ready yet

    // Create canvas on first use (320x240 for speed — MediaPipe doesn't need full res)
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
    }
    const canvas = canvasRef.current
    canvas.width = 320
    canvas.height = 240

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0, 320, 240)
    return canvas.toDataURL('image/jpeg', 0.5)
  }, [])

  useEffect(() => {
    let stream: MediaStream | null = null

    async function start() {
      // ── Step 1: Open webcam ──
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch (err) {
        console.error('Failed to open webcam:', err)
        setResult(prev => ({ ...prev, status: 'NO_CAMERA' }))
        return
      }

      // ── Step 2: Connect WebSocket ──
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        console.log('[proctor] WebSocket connected')

        // ── Step 3: Start sending frames ──
        intervalRef.current = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return
          const frame = captureFrame()
          if (frame) ws.send(frame)
        }, CAPTURE_INTERVAL_MS)
      }

      ws.onmessage = (event) => {
        // ── Step 4: Receive analysis results ──
        try {
          const data: ProctorResult = JSON.parse(event.data)
          setResult(data)
        } catch {
          console.warn('[proctor] Bad message:', event.data)
        }
      }

      ws.onclose = () => {
        setConnected(false)
        console.log('[proctor] WebSocket disconnected')
      }

      ws.onerror = (err) => {
        console.error('[proctor] WebSocket error:', err)
      }
    }

    start()

    // ── Cleanup on unmount ──
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (wsRef.current) wsRef.current.close()
      if (stream) stream.getTracks().forEach(t => t.stop())
    }
  }, [captureFrame])

  return {
    videoRef,
    connected,
    ...result,
  }
}
