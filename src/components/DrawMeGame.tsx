'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Brush } from 'lucide-react'
import { ShareScore } from './ShareScore'
import { Spinner } from '@/components/Spinner'
import { CC } from '@/lib/currency'
import { GameThumbnail } from '@/components/GameThumbnail'
import { useTheme } from '@/hooks/useTheme'
import { useSound } from '@/hooks/useSound'

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

interface DrawMeGameProps {
  onGameComplete?: (result: GameResult) => void
}

const TOTAL_ROUNDS = 3

export function DrawMeGame({ onGameComplete }: DrawMeGameProps) {
  const { theme } = useTheme()
  const light = theme === 'light'
  const { play } = useSound()
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [userPath, setUserPath] = useState<Point[]>([])
  const [allPaths, setAllPaths] = useState<Point[][]>([])
  const [currentRound, setCurrentRound] = useState(1)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [timeLeft, setTimeLeft] = useState(30000)

  const refCanvasRef = useRef<HTMLCanvasElement>(null)
  const drawCanvasRef = useRef<HTMLCanvasElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const gameStartTimeRef = useRef<number>(0)

  // Canvas is wider than the path area to give a landscape shape
  const canvasWidth = spec ? Math.round(spec.canvasSize * 1.6) : 480
  const canvasHeight = spec ? spec.canvasSize : 300
  const xOffset = spec ? Math.round((canvasWidth - spec.canvasSize) / 2) : 90

  // Draw the reference canvas (read-only, shows target path)
  const drawRefCanvas = useCallback(() => {
    const canvas = refCanvasRef.current
    if (!canvas || !spec) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = light ? '#f8fafc' : '#1e293b'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const currentPath = spec.paths[currentRound - 1]
    if (!currentPath || currentPath.length < 2) return

    // Draw target path (offset to center in wider canvas)
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(currentPath[0].x + xOffset, currentPath[0].y)
    for (let i = 1; i < currentPath.length; i++) {
      ctx.lineTo(currentPath[i].x + xOffset, currentPath[i].y)
    }
    ctx.stroke()

    // End dot (red)
    ctx.fillStyle = '#ef4444'
    ctx.beginPath()
    ctx.arc(currentPath[currentPath.length - 1].x + xOffset, currentPath[currentPath.length - 1].y, 10, 0, Math.PI * 2)
    ctx.fill()

    // Start dot (green)
    ctx.fillStyle = '#22c55e'
    ctx.beginPath()
    ctx.arc(currentPath[0].x + xOffset, currentPath[0].y, 10, 0, Math.PI * 2)
    ctx.fill()

    // Label
    ctx.fillStyle = light ? '#64748b' : '#94a3b8'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('REFERENCE', canvas.width / 2, canvas.height - 8)
  }, [spec, currentRound, light, xOffset])

  // Draw the user's drawing canvas
  const drawUserCanvas = useCallback(() => {
    const canvas = drawCanvasRef.current
    if (!canvas || !spec) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = light ? '#ffffff' : '#0f172a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw user path (points are in 0-canvasSize space, offset for display)
    if (userPath.length > 1) {
      ctx.strokeStyle = '#fbbf24'
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(userPath[0].x + xOffset, userPath[0].y)
      for (let i = 1; i < userPath.length; i++) {
        ctx.lineTo(userPath[i].x + xOffset, userPath[i].y)
      }
      ctx.stroke()
    }

    // Draw faint start/end markers from the reference (offset)
    const currentPath = spec.paths[currentRound - 1]
    if (currentPath && currentPath.length > 0) {
      // Start marker (faint green)
      ctx.fillStyle = 'rgba(34, 197, 94, 0.3)'
      ctx.beginPath()
      ctx.arc(currentPath[0].x + xOffset, currentPath[0].y, 10, 0, Math.PI * 2)
      ctx.fill()

      // End marker (faint red)
      ctx.fillStyle = 'rgba(239, 68, 68, 0.3)'
      ctx.beginPath()
      ctx.arc(currentPath[currentPath.length - 1].x + xOffset, currentPath[currentPath.length - 1].y, 10, 0, Math.PI * 2)
      ctx.fill()
    }

    // Label
    ctx.fillStyle = light ? '#64748b' : '#94a3b8'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('DRAW HERE', canvas.width / 2, canvas.height - 8)
  }, [spec, userPath, currentRound, light, xOffset])

  useEffect(() => {
    drawRefCanvas()
    drawUserCanvas()
  }, [drawRefCanvas, drawUserCanvas])

  useEffect(() => {
    if (phase === 'ready' || phase === 'draw') {
      const timer = setTimeout(() => {
        drawRefCanvas()
        drawUserCanvas()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [phase, drawRefCanvas, drawUserCanvas])

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setUserPath([])
    setAllPaths([])
    setCurrentRound(1)
    setResult(null)
    setTimeLeft(30000)

    if (timerRef.current) clearInterval(timerRef.current)

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'draw_me' }),
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
        const remaining = turnData.spec.timeLimitMs - elapsed
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = drawCanvasRef.current
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
      x: (clientX - rect.left) * scaleX - xOffset,
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
    play('tap')

    if (phase === 'ready') {
      setPhase('draw')

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
      play('success')
      setAllPaths(prev => [...prev, userPath])

      if (currentRound < TOTAL_ROUNDS) {
        // Send round_complete event
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

        setCurrentRound(prev => prev + 1)
        setUserPath([])
        setPhase('ready')
      } else {
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

    const finalPaths = userPath.length > 10 ? [...allPaths, userPath] : allPaths

    try {
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
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-6">
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
        <div className="text-center pb-6">
          <div className="mb-4 max-w-sm mx-auto"><GameThumbnail gameId="draw_me" isPlayable={true} /></div>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            Look at the reference path, then draw it on the blank canvas!
            {TOTAL_ROUNDS} rounds of increasing complexity. Speed and accuracy both count.
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
          <p className="text-slate-600 dark:text-slate-300">Generating paths...</p>
        </div>
      )}

      {(phase === 'ready' || phase === 'draw') && spec && (
        <div>
          {/* Stacked wide canvases: reference above, draw below */}
          <div className="flex flex-col gap-2 w-full max-w-lg mx-auto touch-none">
            {/* Reference canvas (top, read-only) */}
            <div className="border-2 border-blue-500/40 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-900" style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}>
              <canvas
                ref={refCanvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="w-full h-full"
              />
            </div>

            {/* Drawing canvas (bottom) */}
            <div className="border-2 border-yellow-500/40 rounded-lg overflow-hidden bg-white dark:bg-slate-900" style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}>
              <canvas
                ref={drawCanvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="w-full h-full cursor-crosshair touch-none"
                onMouseDown={handleDrawStart}
                onMouseMove={handleDrawMove}
                onMouseUp={handleDrawEnd}
                onMouseLeave={handleDrawEnd}
                onTouchStart={handleDrawStart}
                onTouchMove={handleDrawMove}
                onTouchEnd={handleDrawEnd}
              />
            </div>
          </div>
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="mx-auto mb-4"><Spinner /></div>
          <p className="text-slate-600 dark:text-slate-300">Calculating accuracy...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-green-500/20 flex items-center justify-center">
            <Brush className="w-10 h-10 text-green-500" />
          </div>
          <h3 className="text-2xl font-bold text-green-500 dark:text-green-400 mb-4">Great Drawing!</h3>
          <div className="bg-slate-100 dark:bg-slate-900/50 rounded-lg max-w-xs mx-auto mb-6">
            <div className="grid grid-cols-2 text-center divide-x divide-slate-200 dark:divide-slate-600/50">
              <div className="py-4 px-2">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{result.score?.toLocaleString()}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Score</div>
              </div>
              <div className="py-4 px-2">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">#{result.rank}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Rank</div>
              </div>
            </div>
            <div className="grid grid-cols-2 text-center divide-x divide-slate-200 dark:divide-slate-600/50 border-t border-slate-200 dark:border-slate-600/50">
              <div className="py-3 px-2">
                <div className="text-base font-bold text-slate-900 dark:text-white">{result.accuracy ? Math.round(result.accuracy * 100) : 0}%</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Accuracy</div>
              </div>
              <div className="py-3 px-2">
                <div className="text-base font-bold text-slate-900 dark:text-white">{result.coverage ? Math.round(result.coverage * 100) : 0}%</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Coverage</div>
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
          <ShareScore gameName="Draw Me" score={result.score || 0} rank={result.rank} />
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-green-500/20 flex items-center justify-center">
            <Brush className="w-10 h-10 text-green-500" />
          </div>
          <h3 className="text-2xl font-bold text-red-500 dark:text-red-400 mb-4">Not Quite!</h3>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            {result?.reason === 'no_drawing'
              ? 'You need to draw the path!'
              : result?.reason === 'low_coverage'
              ? 'Try to cover more of the path!'
              : result?.reason === 'impossible_speed'
              ? 'That was too fast to be human!'
              : 'Try to draw more accurately!'}
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
