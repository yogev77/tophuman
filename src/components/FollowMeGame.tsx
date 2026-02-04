'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

type GamePhase = 'idle' | 'loading' | 'ready' | 'draw' | 'checking' | 'completed' | 'failed'

interface Point {
  x: number
  y: number
}

interface TurnSpec {
  canvasSize: number
  path: Point[]
  timeLimitMs: number
}

interface GameResult {
  valid: boolean
  accuracy?: number
  coverage?: number
  score?: number
  rank?: number
  reason?: string
}

interface FollowMeGameProps {
  onGameComplete?: (result: GameResult) => void
  colorBg?: string
  colorBorder?: string
}

export function FollowMeGame({ onGameComplete, colorBg, colorBorder }: FollowMeGameProps) {
  const bgClass = colorBg || 'bg-slate-800'
  const borderClass = colorBorder ? `border ${colorBorder}` : ''
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [userPath, setUserPath] = useState<Point[]>([])
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [timeLeft, setTimeLeft] = useState(30000)
  const [drawStartTime, setDrawStartTime] = useState<number | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const gameStartTimeRef = useRef<number>(0)

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !spec) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.fillStyle = '#1e293b' // slate-800
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw target path
    if (spec.path.length > 1) {
      ctx.strokeStyle = '#3b82f6' // blue-500
      ctx.lineWidth = 8
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(spec.path[0].x, spec.path[0].y)
      for (let i = 1; i < spec.path.length; i++) {
        ctx.lineTo(spec.path[i].x, spec.path[i].y)
      }
      ctx.stroke()

      // Draw start indicator
      ctx.fillStyle = '#22c55e' // green-500
      ctx.beginPath()
      ctx.arc(spec.path[0].x, spec.path[0].y, 12, 0, Math.PI * 2)
      ctx.fill()

      // Draw end indicator
      ctx.fillStyle = '#ef4444' // red-500
      ctx.beginPath()
      ctx.arc(spec.path[spec.path.length - 1].x, spec.path[spec.path.length - 1].y, 12, 0, Math.PI * 2)
      ctx.fill()
    }

    // Draw user path
    if (userPath.length > 1) {
      ctx.strokeStyle = '#fbbf24' // yellow-400
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(userPath[0].x, userPath[0].y)
      for (let i = 1; i < userPath.length; i++) {
        ctx.lineTo(userPath[i].x, userPath[i].y)
      }
      ctx.stroke()
    }
  }, [spec, userPath])

  useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  // Draw canvas when phase becomes ready (canvas just mounted)
  useEffect(() => {
    if (phase === 'ready' || phase === 'draw') {
      // Small delay to ensure canvas is mounted
      const timer = setTimeout(() => {
        drawCanvas()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [phase, drawCanvas])

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setUserPath([])
    setResult(null)
    setTimeLeft(30000)
    setDrawStartTime(null)

    if (timerRef.current) clearInterval(timerRef.current)

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'follow_me' }),
      })
      if (!createRes.ok) {
        const data = await createRes.json()
        throw new Error(data.error || 'Failed to create turn')
      }
      const turnData = await createRes.json()

      setTurnToken(turnData.turnToken)
      setSpec(turnData.spec)

      const startRes = await fetch('/api/game/turn/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: turnData.turnToken }),
      })

      if (!startRes.ok) {
        throw new Error('Failed to start turn')
      }

      gameStartTimeRef.current = Date.now()

      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - gameStartTimeRef.current
        const remaining = 30000 - elapsed
        setTimeLeft(Math.max(0, remaining))

        if (remaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current)
          completeGame()
        }
      }, 100)

      setPhase('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('idle')
    }
  }, [])

  const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    let clientX: number, clientY: number
    if ('touches' in e) {
      if (e.touches.length === 0) return null
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }

  const handleDrawStart = async (e: React.MouseEvent | React.TouchEvent) => {
    if (phase !== 'ready' && phase !== 'draw') return
    e.preventDefault()

    const point = getCanvasPoint(e)
    if (!point) return

    setIsDrawing(true)
    setUserPath([point])

    if (phase === 'ready') {
      setPhase('draw')
      setDrawStartTime(Date.now())

      if (turnToken) {
        await fetch('/api/game/turn/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            turnToken,
            eventType: 'draw_start',
            clientTimestampMs: Date.now(),
          }),
        })
      }
    }
  }

  const handleDrawMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || (phase !== 'draw' && phase !== 'ready')) return
    e.preventDefault()

    const point = getCanvasPoint(e)
    if (!point) return

    setUserPath(prev => [...prev, point])
  }

  const handleDrawEnd = async (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    e.preventDefault()

    setIsDrawing(false)

    if (phase === 'draw' && userPath.length > 10) {
      completeGame()
    }
  }

  const completeGame = async () => {
    if (!turnToken) return

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    setPhase('checking')

    try {
      // Send draw complete event with user path
      await fetch('/api/game/turn/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnToken,
          eventType: 'draw_complete',
          points: userPath,
          clientTimestampMs: Date.now(),
        }),
      })

      const completeRes = await fetch('/api/game/turn/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken }),
      })

      const data = await completeRes.json()
      setResult(data)
      setPhase(data.valid ? 'completed' : 'failed')

      if (onGameComplete) {
        onGameComplete(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('failed')
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  return (
    <div className={`${bgClass} ${borderClass} rounded-xl p-6`}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Follow Me</h2>
        {(phase === 'ready' || phase === 'draw') && spec && (
          <span className={`text-2xl font-mono ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
            {Math.ceil(timeLeft / 1000)}s
          </span>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center py-12">
          <p className="text-slate-300 mb-6">
            Trace the blue path as accurately as possible! Start from the green dot and end at the red dot.
            Speed and accuracy both count toward your score.
          </p>
          <button
            onClick={startGame}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-lg text-lg transition"
          >
            Start Game (1 $Credit)
          </button>
        </div>
      )}

      {phase === 'loading' && (
        <div className="text-center py-12">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-300">Generating path...</p>
        </div>
      )}

      {(phase === 'ready' || phase === 'draw') && spec && (
        <div className="text-center">
          <p className={`text-lg mb-4 ${phase === 'ready' ? 'text-yellow-400' : 'text-green-400'}`}>
            {phase === 'ready' ? 'Start drawing from the green dot!' : 'Keep tracing to the red dot!'}
          </p>
          <div className="inline-block border-4 border-slate-600 rounded-lg overflow-hidden touch-none">
            <canvas
              ref={canvasRef}
              width={spec.canvasSize}
              height={spec.canvasSize}
              className="max-w-full h-auto cursor-crosshair"
              style={{ maxWidth: '100%', height: 'auto' }}
              onMouseDown={handleDrawStart}
              onMouseMove={handleDrawMove}
              onMouseUp={handleDrawEnd}
              onMouseLeave={handleDrawEnd}
              onTouchStart={handleDrawStart}
              onTouchMove={handleDrawMove}
              onTouchEnd={handleDrawEnd}
            />
          </div>
          <div className="flex justify-center gap-4 mt-4 text-sm">
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-green-500"></span>
              Start
            </span>
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-red-500"></span>
              End
            </span>
            <span className="flex items-center gap-2">
              <span className="w-4 h-1 bg-blue-500 rounded"></span>
              Target
            </span>
            <span className="flex items-center gap-2">
              <span className="w-4 h-1 bg-yellow-400 rounded"></span>
              Your trace
            </span>
          </div>
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="animate-spin w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-300">Calculating accuracy...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">{result.accuracy && result.accuracy > 0.8 ? '🎯' : '👍'}</div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">Great Tracing!</h3>
          <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto mb-6">
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-3xl font-bold text-white">{result.score?.toLocaleString()}</div>
              <div className="text-sm text-slate-400">Score</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-3xl font-bold text-white">#{result.rank}</div>
              <div className="text-sm text-slate-400">Rank</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-xl font-bold text-blue-400">
                {result.accuracy ? Math.round(result.accuracy * 100) : 0}%
              </div>
              <div className="text-sm text-slate-400">Accuracy</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-xl font-bold text-purple-400">
                {result.coverage ? Math.round(result.coverage * 100) : 0}%
              </div>
              <div className="text-sm text-slate-400">Coverage</div>
            </div>
          </div>
          <div className="flex gap-4 justify-center">
            <button
              onClick={startGame}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-lg transition"
            >
              Play Again
            </button>
            <Link href="/" className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-3 px-8 rounded-lg transition">
              New Game
            </Link>
          </div>
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">😅</div>
          <h3 className="text-2xl font-bold text-red-400 mb-4">Not Quite!</h3>
          <p className="text-slate-300 mb-6">
            {result?.reason === 'no_drawing'
              ? 'You need to trace the path!'
              : result?.reason === 'low_coverage'
              ? 'Try to cover more of the path!'
              : result?.reason === 'impossible_speed'
              ? 'That was too fast to be human!'
              : 'Try to trace more accurately!'}
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={startGame}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-lg transition"
            >
              Try Again
            </button>
            <Link href="/" className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-3 px-8 rounded-lg transition">
              New Game
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-center">
          {error}
        </div>
      )}
    </div>
  )
}
