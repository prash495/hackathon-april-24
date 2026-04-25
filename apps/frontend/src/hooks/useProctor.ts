import { useEffect, useRef, useState } from 'react'

const PROCTOR_WS_URL = process.env.NEXT_PUBLIC_PROCTOR_WS_URL || 'ws://localhost:8002'
const FRAME_INTERVAL_MS = 200 // ~5 fps to the server (plenty for gaze detection)

export type ProctoringStatus = 'loading' | 'running' | 'error'

export function useProctor(sessionId: string) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [status, setStatus] = useState<ProctoringStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [cheating, setCheating] = useState(false)
  const [gazeLabel, setGazeLabel] = useState('Looking Straight')

  const stop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    wsRef.current?.close()
  }

  useEffect(() => {
    let stream: MediaStream | null = null
    let stopped = false

    async function init() {
      // 1. Get webcam
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(
          msg.includes('Permission') || msg.includes('NotAllowed')
            ? 'Camera permission denied'
            : msg.includes('NotFound') || msg.includes('Devices')
            ? 'No camera found'
            : `Camera unavailable: ${msg}`
        )
        setStatus('error')
        return
      }

      if (stopped) { stream.getTracks().forEach(t => t.stop()); return }

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }

      // 2. Connect WebSocket to proctor service
      const ws = new WebSocket(`${PROCTOR_WS_URL}/ws/${sessionId}`)
      wsRef.current = ws

      ws.onopen = () => {
        if (stopped) { ws.close(); return }
        setStatus('running')
        startSendingFrames()
      }

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data)
          setCheating(!!data.cheating)
          setGazeLabel(data.gaze || 'Looking Straight')

          // Draw overlay on canvas
          const canvas = canvasRef.current
          if (canvas) {
            const ctx = canvas.getContext('2d')
            if (ctx) {
              const video = videoRef.current
              if (video) {
                canvas.width = video.videoWidth
                canvas.height = video.videoHeight
              }
              ctx.clearRect(0, 0, canvas.width, canvas.height)
              ctx.font = 'bold 14px sans-serif'
              ctx.fillStyle = data.cheating ? 'red' : 'lime'
              ctx.fillText(
                data.cheating ? `Cheating – ${data.gaze}` : 'OK',
                8, 20
              )
            }
          }
        } catch {}
      }

      ws.onerror = () => {
        setError('Proctor service connection failed')
        setStatus('error')
      }

      ws.onclose = () => {
        stopSendingFrames()
      }
    }

    function startSendingFrames() {
      const captureCanvas = document.createElement('canvas')

      intervalRef.current = setInterval(() => {
        const video = videoRef.current
        const ws = wsRef.current
        if (!video || !ws || ws.readyState !== WebSocket.OPEN || video.readyState < 2) return

        captureCanvas.width = video.videoWidth
        captureCanvas.height = video.videoHeight
        const ctx = captureCanvas.getContext('2d')
        if (!ctx) return

        ctx.drawImage(video, 0, 0)
        captureCanvas.toBlob(
          (blob) => {
            if (blob && ws.readyState === WebSocket.OPEN) {
              blob.arrayBuffer().then(buf => ws.send(buf))
            }
          },
          'image/jpeg',
          0.7
        )
      }, FRAME_INTERVAL_MS)
    }

    function stopSendingFrames() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    init()

    return () => {
      stopped = true
      stopSendingFrames()
      wsRef.current?.close()
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [sessionId])

  return { videoRef, canvasRef, status, error, cheating, gazeLabel, stop }
}
