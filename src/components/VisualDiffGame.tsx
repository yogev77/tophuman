'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { ScanEye } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { ShareScore } from './ShareScore'
import { Spinner } from '@/components/Spinner'
import { CC } from '@/lib/currency'
import { GameThumbnail } from '@/components/GameThumbnail'
import { useSound } from '@/hooks/useSound'

type GamePhase = 'idle' | 'loading' | 'play' | 'checking' | 'completed' | 'failed'

interface Shape {
  x: number
  y: number
  type: 'circle' | 'square' | 'triangle'
  color: string
  size: number
}

interface TurnSpec {
  gridWidth: number
  gridHeight: number
  baseShapes: Shape[]
  modifiedShapes: Shape[]
  numDifferences: number
  timeLimitMs: number
}

interface GameResult {
  valid: boolean
  found?: number
  total?: number
  score?: number
  rank?: number
  reason?: string
}

interface VisualDiffGameProps {
  onGameComplete?: (result: GameResult) => void
  groupSessionId?: string
}

export function VisualDiffGame({ onGameComplete, groupSessionId }: VisualDiffGameProps) {
  const { play } = useSound()
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [foundCount, setFoundCount] = useState(0)
  const [clicks, setClicks] = useState<{ x: number; y: number; side: 'left' | 'right' }[]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setFoundCount(0)
    setClicks([])
    setResult(null)

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'visual_diff', ...(groupSessionId && { groupSessionId }) }),
      })
      if (!createRes.ok) {
        const data = await createRes.json()
        throw new Error(data.error || 'Failed to create turn')
      }
      const turnData = await createRes.json()

      setTurnToken(turnData.turnToken)
      setSpec(turnData.spec)
      setTimeLeft(turnData.spec.timeLimitMs)

      // Start turn on server
      const startRes = await fetch('/api/game/turn/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: turnData.turnToken }),
      })

      if (!startRes.ok) {
        throw new Error('Failed to start turn')
      }

      setPhase('play')

      // Start timer
      const startTime = Date.now()
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime
        const remaining = turnData.spec.timeLimitMs - elapsed
        setTimeLeft(Math.max(0, remaining))

        if (remaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current)
          completeGame(turnData.turnToken)
        }
      }, 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('idle')
    }
  }, [])

  const handleClick = async (e: React.MouseEvent<SVGSVGElement>, side: 'left' | 'right') => {
    if (phase !== 'play' || !turnToken || !spec) return

    const rect = e.currentTarget.getBoundingClientRect()
    // Convert screen coordinates to SVG viewBox coordinates
    const scaleX = spec.gridWidth / rect.width
    const scaleY = spec.gridHeight / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    play('hit')
    setClicks(prev => [...prev, { x, y, side }])

    // Send click event
    await fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken,
        eventType: 'click',
        x,
        y,
        side,
        clientTimestampMs: Date.now(),
      }),
    })

    const newCount = foundCount + 1
    setFoundCount(newCount)

    // Auto-submit when all differences have been marked
    if (newCount >= spec.numDifferences) {
      play('success')
      completeGame()
    }
  }

  const completeGame = async (token?: string) => {
    const finalToken = token || turnToken
    if (!finalToken) return

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    setPhase('checking')

    try {
      const completeRes = await fetch('/api/game/turn/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: finalToken }),
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

  const renderShape = (shape: Shape, index: number) => {
    if (shape.type === 'circle') {
      return (
        <circle
          key={index}
          cx={shape.x}
          cy={shape.y}
          r={shape.size}
          fill={shape.color}
        />
      )
    } else if (shape.type === 'square') {
      return (
        <rect
          key={index}
          x={shape.x - shape.size}
          y={shape.y - shape.size}
          width={shape.size * 2}
          height={shape.size * 2}
          rx={4}
          ry={4}
          fill={shape.color}
        />
      )
    } else {
      // Rounded triangle using a path with arc corners
      const s = shape.size
      const cx = shape.x
      const cy = shape.y
      const r = 3 // corner radius
      // Three vertices of equilateral-ish triangle
      const top = { x: cx, y: cy - s }
      const bl = { x: cx - s, y: cy + s }
      const br = { x: cx + s, y: cy + s }
      const d = [
        `M ${top.x} ${top.y + r}`,
        `Q ${top.x} ${top.y} ${top.x + r} ${top.y + r * 0.5}`,
        `L ${br.x - r} ${br.y - r * 0.5}`,
        `Q ${br.x} ${br.y} ${br.x - r} ${br.y}`,
        `L ${bl.x + r} ${bl.y}`,
        `Q ${bl.x} ${bl.y} ${bl.x + r * 0.5} ${bl.y - r}`,
        'Z',
      ].join(' ')
      return (
        <path
          key={index}
          d={d}
          fill={shape.color}
        />
      )
    }
  }

  return (
    <div className="bg-slate-800 rounded-xl p-3 sm:p-4">
      {phase === 'play' && spec && (
        <div className="mb-2">
          <div className="flex items-center justify-between">
            <span className={`text-2xl font-mono font-bold ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
              {formatTime(timeLeft)}
            </span>
          </div>
          <div className="text-slate-400 text-sm">
            Spot {spec.numDifferences} differences. Clicks: {clicks.length}
          </div>
        </div>
      )}

      {phase === 'idle' && (
        <div className="text-center pb-6">
          <div className="mb-4 max-w-sm mx-auto"><GameThumbnail gameId="visual_diff" isPlayable={true} /></div>
          <p className="text-slate-300 mb-6">
            Find the differences between the two images! Click on the differences you spot.
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
          <p className="text-slate-300">Generating images...</p>
        </div>
      )}

      {phase === 'play' && spec && (
        <div>
          <div className="grid grid-cols-2 gap-2">
            <svg
              viewBox={`0 0 ${spec.gridWidth} ${spec.gridHeight}`}
              className="w-full bg-slate-900 rounded-lg cursor-crosshair"
              onClick={(e) => handleClick(e, 'left')}
            >
              {spec.baseShapes.map((shape, i) => renderShape(shape, i))}
              {clicks.filter(c => c.side === 'left').map((click, i) => (
                <g key={`marker-left-${i}`}>
                  <circle cx={click.x} cy={click.y} r={8} fill="none" stroke="#ffffff" strokeWidth={2} />
                  <circle cx={click.x} cy={click.y} r={3} fill="#ffffff" />
                </g>
              ))}
            </svg>
            <svg
              viewBox={`0 0 ${spec.gridWidth} ${spec.gridHeight}`}
              className="w-full bg-slate-900 rounded-lg cursor-crosshair"
              onClick={(e) => handleClick(e, 'right')}
            >
              {spec.modifiedShapes.map((shape, i) => renderShape(shape, i))}
              {clicks.filter(c => c.side === 'right').map((click, i) => (
                <g key={`marker-right-${i}`}>
                  <circle cx={click.x} cy={click.y} r={8} fill="none" stroke="#ffffff" strokeWidth={2} />
                  <circle cx={click.x} cy={click.y} r={3} fill="#ffffff" />
                </g>
              ))}
            </svg>
          </div>
          <button
            onClick={() => completeGame()}
            className="w-full mt-3 bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-6 rounded-lg transition"
          >
            Done - Submit
          </button>
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="mx-auto mb-4"><Spinner /></div>
          <p className="text-slate-300">Checking your answers...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/20 flex items-center justify-center">
            <ScanEye className="w-10 h-10 text-red-500" />
          </div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">Sharp Eyes!</h3>
          <div className="bg-slate-900/50 rounded-lg max-w-xs mx-auto mb-6">
            <div className="grid grid-cols-2 text-center divide-x divide-slate-200 dark:divide-slate-600/50">
              <div className="py-4 px-2">
                <div className="text-2xl font-bold text-white">{result.score?.toLocaleString()}</div>
                <div className="text-[10px] text-slate-400">Score</div>
              </div>
              <div className="py-4 px-2">
                <div className="text-2xl font-bold text-white">#{result.rank}</div>
                <div className="text-[10px] text-slate-400">Rank</div>
              </div>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-600/50 text-center py-3">
              <div className="text-base font-bold text-white">{result.found}/{result.total}</div>
              <div className="text-[10px] text-slate-400">Found</div>
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
          <ShareScore gameName="Spot the Diff" score={result.score || 0} rank={result.rank} />
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/20 flex items-center justify-center">
            <ScanEye className="w-10 h-10 text-red-500" />
          </div>
          <h3 className="text-2xl font-bold text-red-400 mb-4">Failed!</h3>
          <p className="text-slate-300 mb-6">
            {result?.reason === 'not_enough_found'
              ? `Only found ${result.found}/${result.total} differences. Need at least 60%.`
              : 'Better luck next time!'}
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
