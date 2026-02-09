'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { ShareScore } from './ShareScore'
import { Spinner } from '@/components/Spinner'
import { CC } from '@/lib/currency'
import { useTheme } from '@/hooks/useTheme'

type GamePhase = 'idle' | 'loading' | 'ready' | 'draw' | 'checking' | 'completed' | 'failed'

interface Point {
  x: number
  y: number
}

interface TurnSpec {
  canvasSize: number
  paths: Point[][]
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
}

const TOTAL_ROUNDS = 3

export function FollowMeGame({ onGameComplete }: FollowMeGameProps) {
  const { theme } = useTheme()
  const light = theme === 'light'
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [userPath, setUserPath] = useState<Point[]>([])
  const [allPaths, setAllPaths] = useState<Point[][]>([])
  const [currentRound, setCurrentRound] = useState(1)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [timeLeft, setTimeLeft] = useState(45000)
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
    ctx.fillStyle = light ? '#ffffff' : '#1e293b'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Get the current round's path
    const currentPath = spec.paths[currentRound - 1]
    if (!currentPath || currentPath.length < 2) return

    // Check if this path loops (start ≈ end)
    const dx = currentPath[0].x - currentPath[currentPath.length - 1].x
    const dy = currentPath[0].y - currentPath[currentPath.length - 1].y
    const isLoop = Math.sqrt(dx * dx + dy * dy) < 20

    // Draw target path
    ctx.strokeStyle = '#3b82f6' // blue-500
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(currentPath[0].x, currentPath[0].y)
    for (let i = 1; i < currentPath.length; i++) {
      ctx.lineTo(currentPath[i].x, currentPath[i].y)
    }
    ctx.stroke()

    if (isLoop) {
      // For loops, just draw a single start/end indicator
      ctx.fillStyle = '#22c55e' // green-500
      ctx.beginPath()
      ctx.arc(currentPath[0].x, currentPath[0].y, 12, 0, Math.PI * 2)
      ctx.fill()
    } else {
      // Draw start indicator
      ctx.fillStyle = '#22c55e' // green-500
      ctx.beginPath()
      ctx.arc(currentPath[0].x, currentPath[0].y, 12, 0, Math.PI * 2)
      ctx.fill()

      // Draw end indicator
      ctx.fillStyle = '#ef4444' // red-500
      ctx.beginPath()
      ctx.arc(currentPath[currentPath.length - 1].x, currentPath[currentPath.length - 1].y, 12, 0, Math.PI * 2)
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
  }, [spec, userPath, currentRound, light])

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
    setAllPaths([])
    setCurrentRound(1)
    setResult(null)
    setTimeLeft(45000)
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
        const remaining = 45000 - elapsed
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
      // Save this round's path
      setAllPaths(prev => [...prev, userPath])

      if (currentRound < TOTAL_ROUNDS) {
        // Move to next round
        setCurrentRound(prev => prev + 1)
        setUserPath([])
        setPhase('ready')

        // Send round complete event
        if (turnToken) {
          fetch('/api/game/turn/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              turnToken,
              eventType: 'round_complete',
              round: currentRound,
              points: userPath,
              clientTimestampMs: Date.now(),
            }),
          })
        }
      } else {
        // All rounds done
        completeGame()
      }
    }
  }

  const completeGame = async () => {
    if (!turnToken) return

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    setPhase('checking')

    // Include current round's path if it has enough points
    const finalPaths = userPath.length > 10 ? [...allPaths, userPath] : allPaths

    try {
      // Send last round's path as draw_complete
      const lastPath = finalPaths[finalPaths.length - 1] || []
      await fetch('/api/game/turn/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnToken,
          eventType: 'draw_complete',
          points: lastPath,
          rounds: finalPaths.length,
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
    <div className="bg-slate-800 rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        {(phase === 'ready' || phase === 'draw') && spec && (
          <>
            <span className={`text-2xl font-mono ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
              {Math.ceil(timeLeft / 1000)}s
            </span>
            <div className="flex gap-2">
              {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    i + 1 < currentRound
                      ? 'bg-green-500 text-white'
                      : i + 1 === currentRound
                      ? 'bg-yellow-500 text-slate-900'
                      : light
                      ? 'bg-slate-200 text-slate-500'
                      : 'bg-slate-600 text-slate-400'
                  }`}
                >
                  {i + 1}
                </div>
              ))}
            </div>
            <div className="w-[52px]" />
          </>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center py-12">
          <p className="text-slate-300 mb-6">
            Trace {TOTAL_ROUNDS} different paths! Start from the green dot and follow the blue line.
            Speed and accuracy both count toward your score.
          </p>
          <button
            onClick={startGame}
            className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg text-lg transition"
          >
            Start Game (1 <CC />Credit)
          </button>
        </div>
      )}

      {phase === 'loading' && (
        <div className="text-center py-12">
          <div className="mx-auto mb-4"><Spinner /></div>
          <p className="text-slate-300">Generating path...</p>
        </div>
      )}

      {(phase === 'ready' || phase === 'draw') && spec && (
        <div className="text-center">
          <p className={`text-lg mb-4 ${phase === 'ready' ? 'text-yellow-400' : 'text-green-400'}`}>
            {phase === 'ready'
              ? `Line ${currentRound}/${TOTAL_ROUNDS}: Start from the green dot!`
              : `Line ${currentRound}/${TOTAL_ROUNDS}: Keep tracing!`}
          </p>
          <div className="inline-block border-4 border-slate-600 rounded-lg overflow-hidden touch-none max-w-full">
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
          <div className="mx-auto mb-4"><Spinner /></div>
          <p className="text-slate-300">Calculating accuracy...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-cyan-500/20 flex items-center justify-center">
            <Pencil className="w-10 h-10 text-cyan-400" />
          </div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">Great Tracing!</h3>
          <div className="bg-slate-900/50 rounded-lg max-w-xs mx-auto mb-6">
            <div className="grid grid-cols-2 text-center divide-x divide-slate-600/50">
              <div className="py-4 px-2">
                <div className="text-2xl font-bold text-white">{result.score?.toLocaleString()}</div>
                <div className="text-[10px] text-slate-400">Score</div>
              </div>
              <div className="py-4 px-2">
                <div className="text-2xl font-bold text-white">#{result.rank}</div>
                <div className="text-[10px] text-slate-400">Rank</div>
              </div>
            </div>
            <div className="grid grid-cols-2 text-center divide-x divide-slate-600/50 border-t border-slate-600/50">
              <div className="py-3 px-2">
                <div className="text-base font-bold text-white">{result.accuracy ? Math.round(result.accuracy * 100) : 0}%</div>
                <div className="text-[10px] text-slate-400">Accuracy</div>
              </div>
              <div className="py-3 px-2">
                <div className="text-base font-bold text-white">{result.coverage ? Math.round(result.coverage * 100) : 0}%</div>
                <div className="text-[10px] text-slate-400">Coverage</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            <button
              onClick={startGame}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition"
            >
              Play Again
            </button>
            <Link href="/" className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 rounded-lg transition text-center">
              New Game
            </Link>
          </div>
          <ShareScore gameName="Follow Me" score={result.score || 0} rank={result.rank} />
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-cyan-500/20 flex items-center justify-center">
            <Pencil className="w-10 h-10 text-cyan-400" />
          </div>
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
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            <button
              onClick={startGame}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition"
            >
              Try Again
            </button>
            <Link href="/" className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 rounded-lg transition text-center">
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
