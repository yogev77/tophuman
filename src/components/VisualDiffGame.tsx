'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { formatTime } from '@/lib/utils'
import { ShareScore } from './ShareScore'

type GamePhase = 'idle' | 'loading' | 'play' | 'checking' | 'completed' | 'failed'

interface Shape {
  x: number
  y: number
  type: 'circle' | 'square' | 'triangle'
  color: string
  size: number
}

interface TurnSpec {
  gridSize: number
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
}

export function VisualDiffGame({ onGameComplete }: VisualDiffGameProps) {
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
        body: JSON.stringify({ gameType: 'visual_diff' }),
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
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

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

    setFoundCount(prev => prev + 1)
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
          fill={shape.color}
        />
      )
    } else {
      // Triangle
      const points = [
        `${shape.x},${shape.y - shape.size}`,
        `${shape.x - shape.size},${shape.y + shape.size}`,
        `${shape.x + shape.size},${shape.y + shape.size}`,
      ].join(' ')
      return (
        <polygon
          key={index}
          points={points}
          fill={shape.color}
        />
      )
    }
  }

  return (
    <div className="bg-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Spot the Difference</h2>
        {phase === 'play' && spec && (
          <div className="flex items-center gap-4">
            <span className="text-slate-400">
              Clicks: {clicks.length}
            </span>
            <span className={`text-2xl font-mono ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
              {formatTime(timeLeft)}
            </span>
          </div>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center py-12">
          <p className="text-slate-300 mb-6">
            Find the differences between the two images! Click on the differences you spot.
          </p>
          <button
            onClick={startGame}
            className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg text-lg transition"
          >
            Start Game (1 $Credit)
          </button>
        </div>
      )}

      {phase === 'loading' && (
        <div className="text-center py-12">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-300">Generating images...</p>
        </div>
      )}

      {phase === 'play' && spec && (
        <div>
          <p className="text-slate-400 text-sm text-center mb-4">
            Find {spec.numDifferences} differences - click on them in either image
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-slate-400 text-xs text-center mb-1">Original</p>
              <svg
                width={spec.gridSize}
                height={spec.gridSize}
                className="bg-slate-900 rounded-lg cursor-crosshair mx-auto"
                onClick={(e) => handleClick(e, 'left')}
              >
                {spec.baseShapes.map((shape, i) => renderShape(shape, i))}
                {/* Click markers for left side */}
                {clicks.filter(c => c.side === 'left').map((click, i) => (
                  <g key={`marker-left-${i}`}>
                    <circle cx={click.x} cy={click.y} r={12} fill="none" stroke="#22c55e" strokeWidth={3} />
                    <circle cx={click.x} cy={click.y} r={4} fill="#22c55e" />
                  </g>
                ))}
              </svg>
            </div>
            <div>
              <p className="text-slate-400 text-xs text-center mb-1">Modified</p>
              <svg
                width={spec.gridSize}
                height={spec.gridSize}
                className="bg-slate-900 rounded-lg cursor-crosshair mx-auto"
                onClick={(e) => handleClick(e, 'right')}
              >
                {spec.modifiedShapes.map((shape, i) => renderShape(shape, i))}
                {/* Click markers for right side */}
                {clicks.filter(c => c.side === 'right').map((click, i) => (
                  <g key={`marker-right-${i}`}>
                    <circle cx={click.x} cy={click.y} r={12} fill="none" stroke="#22c55e" strokeWidth={3} />
                    <circle cx={click.x} cy={click.y} r={4} fill="#22c55e" />
                  </g>
                ))}
              </svg>
            </div>
          </div>
          <button
            onClick={() => completeGame()}
            className="w-full mt-4 bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-6 rounded-lg transition"
          >
            Done - Submit
          </button>
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="animate-spin w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-300">Checking your answers...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">Sharp Eyes!</h3>
          <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto mb-6">
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-3xl font-bold text-white">{result.score?.toLocaleString()}</div>
              <div className="text-sm text-slate-400">Score</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-3xl font-bold text-white">#{result.rank}</div>
              <div className="text-sm text-slate-400">Rank</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-4 col-span-2">
              <div className="text-xl font-bold text-green-400">{result.found}/{result.total}</div>
              <div className="text-sm text-slate-400">Differences Found</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
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
          <ShareScore gameName="Visual Diff" score={result.score || 0} rank={result.rank} />
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">😢</div>
          <h3 className="text-2xl font-bold text-red-400 mb-4">Failed!</h3>
          <p className="text-slate-300 mb-6">
            {result?.reason === 'not_enough_found'
              ? `Only found ${result.found}/${result.total} differences. Need at least 60%.`
              : 'Better luck next time!'}
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={startGame}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg transition"
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
