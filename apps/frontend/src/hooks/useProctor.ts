import { useEffect, useRef, useState } from 'react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { api } from '@/lib/api'

const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const DELTA = 1.5
const ANGLE_THRESHOLD = 20
const EVENT_COOLDOWN_MS = 5000

export type ProctoringStatus = 'loading' | 'running' | 'error'

// Module-level singleton — prevents opening the camera more than once across
// re-mounts (React StrictMode double-invoke, HMR, etc.)
let activeStream: MediaStream | null = null

async function loadMediaPipe(): Promise<FaceLandmarker> {
  // Monaco's AMD loader intercepts anonymous define() calls from MediaPipe's
  // WASM script. Deleting define.amd tells the loader to stop acting as AMD,
  // so the WASM script's define() call is ignored rather than queued.
  const w = window as unknown as Record<string, unknown>
  const define = w['define'] as Record<string, unknown> | undefined
  if (define) delete define['amd']

  const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  })
}

export function useProctor(sessionId: string) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const landmarkerRef = useRef<FaceLandmarker | null>(null)
  const rafRef = useRef<number>(0)
  const lastEventRef = useRef<number>(0)

  const [status, setStatus] = useState<ProctoringStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [cheating, setCheating] = useState(false)
  const [gazeLabel, setGazeLabel] = useState('Looking Straight')

  const stop = () => {
    cancelAnimationFrame(rafRef.current)
    activeStream?.getTracks().forEach(t => t.stop())
    activeStream = null
    landmarkerRef.current?.close()
    landmarkerRef.current = null
  }

  useEffect(() => {
    async function init() {
      // Reuse existing stream if camera is already open
      if (!activeStream) {
        try {
          activeStream = await navigator.mediaDevices.getUserMedia({ video: true })
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          setError(msg.includes('Permission') || msg.includes('NotAllowed')
            ? 'Camera permission denied'
            : msg.includes('NotFound') || msg.includes('Devices')
            ? 'No camera found'
            : `Camera unavailable: ${msg}`)
          setStatus('error')
          return
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = activeStream
        await videoRef.current.play().catch(() => {})
      }

      // Start MediaPipe only after camera is ready — this ensures window.define
      // is hidden only after Monaco has finished its own AMD setup.
      try {
        landmarkerRef.current = await loadMediaPipe()
      } catch (e: unknown) {
        setError(`MediaPipe failed to load: ${e instanceof Error ? e.message : String(e)}`)
        setStatus('error')
        return
      }

      setStatus('running')
      detect()
    }

    function irisRatio(face: {x:number,y:number,z:number}[], irisIdx: number, innerIdx: number, outerIdx: number) {
      const iris = face[irisIdx], inner = face[innerIdx], outer = face[outerIdx]
      const dInner = Math.hypot(iris.x - inner.x, iris.y - inner.y)
      const dOuter = Math.hypot(iris.x - outer.x, iris.y - outer.y)
      return dInner - dOuter
    }

    function detect() {
      const video = videoRef.current
      const canvas = canvasRef.current
      const lm = landmarkerRef.current
      if (!video || !canvas || !lm || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(detect)
        return
      }

      const result = lm.detectForVideo(video, performance.now())
      const ctx = canvas.getContext('2d')!
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const faces = result.faceLandmarks
      let isCheating = false
      let gaze = 'Looking Straight'

      if (faces && faces.length > 0) {
        const face = faces[0]
        const w = canvas.width, h = canvas.height

        for (const lmk of face) {
          ctx.beginPath()
          ctx.arc(lmk.x * w, lmk.y * h, 1, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(200,200,200,0.8)'
          ctx.fill()
        }

        const pts = [54, 284, 152].map(i => face[i])
        const v1 = [pts[1].x - pts[0].x, pts[1].y - pts[0].y, pts[1].z - pts[0].z]
        const v2 = [pts[2].x - pts[0].x, pts[2].y - pts[0].y, pts[2].z - pts[0].z]
        const normal = [
          v1[1]*v2[2] - v1[2]*v2[1],
          v1[2]*v2[0] - v1[0]*v2[2],
          v1[0]*v2[1] - v1[1]*v2[0],
        ]
        const len = Math.sqrt(normal[0]**2 + normal[1]**2 + normal[2]**2)
        const n = normal.map(x => x / len)
        const dot = Math.max(-1, Math.min(1, n[2] * -1))
        const angle = 180 - Math.acos(dot) * (180 / Math.PI)

        const left = irisRatio(face, 473, 463, 263)
        const right = irisRatio(face, 468, 133, 33)
        const lateral = (left - right) * 100

        if (lateral < -DELTA) gaze = 'Looking Right'
        else if (lateral > DELTA) gaze = 'Looking Left'

        isCheating = angle >= ANGLE_THRESHOLD || Math.abs(lateral) > DELTA
      }

      setCheating(isCheating)
      setGazeLabel(gaze)

      ctx.font = 'bold 14px sans-serif'
      ctx.fillStyle = isCheating ? 'red' : 'lime'
      ctx.fillText(isCheating ? `Cheating – ${gaze}` : 'OK', 8, 20)

      if (isCheating) {
        const now = Date.now()
        if (now - lastEventRef.current > EVENT_COOLDOWN_MS) {
          lastEventRef.current = now
          api.post(`/sessions/${sessionId}/proctor-events`, {
            event_type: 'gaze_away',
            severity: 'medium',
            metadata: JSON.stringify({ gaze }),
          }).catch(() => {})
        }
      }

      rafRef.current = requestAnimationFrame(detect)
    }

    init()

    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [sessionId])

  return { videoRef, canvasRef, status, error, cheating, gazeLabel, stop }
}
