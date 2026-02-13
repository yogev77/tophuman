'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { BarChartHorizontal } from 'lucide-react'
import { ShareScore } from './ShareScore'
import { Spinner } from '@/components/Spinner'
import { CC } from '@/lib/currency'
import { GameThumbnail } from '@/components/GameThumbnail'
import { useSound } from '@/hooks/useSound'

type GamePhase = 'idle' | 'loading' | 'play' | 'checking' | 'completed' | 'failed'

interface BarSpec {
  targetWidth: number
  color: string
  speed: number
  startPhase: number
}

interface TurnSpec {
  bars: BarSpec[]
  timeLimitMs: number
}

interface GameResult {
  valid: boolean
  score?: number
  avgAccuracy?: number
  rank?: number
  reason?: string
}

interface ReactionBarsGameProps {
  onGameComplete?: (result: GameResult) => void
}

function getBarWidth(bar: BarSpec, timeMs: number): number {
  const t = timeMs / 1000
  return 50 + 50 * Math.sin(2 * Math.PI * bar.speed * t + bar.startPhase * 2 * Math.PI)
}

export function ReactionBarsGame({ onGameComplete }: ReactionBarsGameProps) {
  const { play } = useSound()
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [activeBar, setActiveBar] = useState(0)
  const [barWidths, setBarWidths] = useState<number[]>([50, 50, 50])
  const [stoppedBars, setStoppedBars] = useState<number[]>([]) // stopped widths
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const animRef = useRef<number | null>(null)
  const startTimeRef = useRef(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const eventQueueRef = useRef<{ eventType: string; barIndex: number; stoppedWidth: number; clientTimestampMs: number }[]>([])
  const pendingEventRef = useRef<Promise<unknown> | null>(null)

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setActiveBar(0)
    setStoppedBars([])
    setBarWidths([50, 50, 50])
    setResult(null)
    eventQueueRef.current = []

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'reaction_bars' }),
      })
      if (!createRes.ok) {
        const data = await createRes.json()
        throw new Error(data.error || 'Failed to create turn')
      }
      const turnData = await createRes.json()

      setTurnToken(turnData.turnToken)
      setSpec(turnData.spec)
      setTimeLeft(turnData.spec.timeLimitMs)

      const startRes = await fetch('/api/game/turn/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: turnData.turnToken }),
      })

      if (!startRes.ok) {
        throw new Error('Failed to start turn')
      }

      startTimeRef.current = Date.now()
      setPhase('play')

      // Start timer
      const gameStartTime = Date.now()
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - gameStartTime
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Animation loop
  useEffect(() => {
    if (phase !== 'play' || !spec) return

    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current
      const newWidths = spec.bars.map((bar, i) => {
        // If bar is already stopped, keep its stopped width
        if (i < stoppedBars.length) return stoppedBars[i]
        return getBarWidth(bar, elapsed)
      })
      setBarWidths(newWidths)
      animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [phase, spec, stoppedBars])

  const handleBarStop = useCallback(() => {
    if (phase !== 'play' || !spec || !turnToken) return
    if (activeBar >= spec.bars.length) return

    play('tap')
    const currentWidth = barWidths[activeBar]
    const newStopped = [...stoppedBars, currentWidth]
    setStoppedBars(newStopped)

    // Queue event
    eventQueueRef.current.push({
      eventType: 'bar_stop',
      barIndex: activeBar,
      stoppedWidth: Math.round(currentWidth * 100) / 100,
      clientTimestampMs: Date.now(),
    })

    // Send event — keep reference so completeGame can await it
    const eventPromise = fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken,
        eventType: 'bar_stop',
        barIndex: activeBar,
        stoppedWidth: Math.round(currentWidth * 100) / 100,
        clientTimestampMs: Date.now(),
      }),
    }).catch(() => {})
    pendingEventRef.current = eventPromise

    const nextBar = activeBar + 1
    if (nextBar >= spec.bars.length) {
      play('success')
      // All bars stopped — let the user see the result before transitioning
      if (timerRef.current) clearInterval(timerRef.current)
      setTimeout(() => {
        setPhase('checking')
        setTimeout(() => completeGame(turnToken), 200)
      }, 1000)
    } else {
      setActiveBar(nextBar)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, spec, turnToken, activeBar, barWidths, stoppedBars, play])

  const completeGame = async (token: string) => {
    setPhase('checking')
    if (timerRef.current) clearInterval(timerRef.current)

    // Wait for the last event fetch to finish before completing
    if (pendingEventRef.current) {
      await pendingEventRef.current
      pendingEventRef.current = null
    }

    try {
      const completeRes = await fetch('/api/game/turn/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: token }),
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
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        {phase === 'play' && (
          <div className={`text-2xl font-mono ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
            {Math.ceil(timeLeft / 1000)}s
          </div>
        )}
        {phase === 'play' && spec && (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Bar {Math.min(activeBar + 1, spec.bars.length)} / {spec.bars.length}
          </div>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center pb-6">
          <div className="mb-4 max-w-sm mx-auto"><GameThumbnail gameId="reaction_bars" isPlayable={true} /></div>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            Stop each bar at the target marker! Tap to freeze each bar. Speed and accuracy both count.
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
          <p className="text-slate-600 dark:text-slate-300">Preparing bars...</p>
        </div>
      )}

      {phase === 'play' && spec && (
        <div className="space-y-6">
          <p className="text-slate-500 dark:text-slate-400 text-sm text-center">
            Tap to stop the bar at the target line!
          </p>
          {spec.bars.map((bar, i) => {
            const isActive = i === activeBar && i >= stoppedBars.length
            const isStopped = i < stoppedBars.length
            const width = barWidths[i]
            const targetWidth = bar.targetWidth

            return (
              <button
                key={i}
                onClick={isActive ? handleBarStop : undefined}
                disabled={!isActive}
                className={`relative w-full h-16 rounded-lg overflow-hidden transition-all bg-slate-200 dark:bg-slate-900 ${
                  isActive
                    ? 'ring-2 ring-slate-400 dark:ring-white/50 cursor-pointer'
                    : isStopped
                    ? 'opacity-70'
                    : 'opacity-30'
                }`}
              >
                {/* Bar fill */}
                <div
                  className="absolute top-0 left-0 h-full transition-none rounded-r-sm"
                  style={{
                    width: `${width}%`,
                    backgroundColor: bar.color,
                    opacity: isStopped ? 0.6 : 0.8,
                  }}
                />

                {/* Target marker */}
                <div
                  className="absolute top-0 h-full w-0.5 border-l-2 border-dashed border-slate-500 dark:border-white/80"
                  style={{ left: `${targetWidth}%` }}
                />

                {/* Target label */}
                <div
                  className="absolute top-1 text-[10px] text-slate-500 dark:text-white/60 font-mono"
                  style={{ left: `${targetWidth}%`, transform: 'translateX(-50%)' }}
                >
                  {Math.round(targetWidth)}
                </div>

                {/* Stopped accuracy indicator */}
                {isStopped && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="bg-black/50 px-3 py-1 rounded text-white font-bold text-sm">
                      {Math.round(Math.max(0, 1 - Math.abs(stoppedBars[i] - targetWidth) / 30) * 100)}%
                    </span>
                  </div>
                )}

                {/* Active indicator */}
                {isActive && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-white/80 text-sm font-bold animate-pulse">
                    TAP!
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="mx-auto mb-4"><Spinner /></div>
          <p className="text-slate-600 dark:text-slate-300">Calculating results...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-yellow-500/20 flex items-center justify-center">
            <BarChartHorizontal className="w-10 h-10 text-yellow-500" />
          </div>
          <h3 className="text-2xl font-bold text-green-500 dark:text-green-400 mb-4">Great Timing!</h3>
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
            <div className="py-3 px-2 text-center border-t border-slate-200 dark:border-slate-600/50">
              <div className="text-base font-bold text-slate-900 dark:text-white">{result.avgAccuracy ? Math.round(result.avgAccuracy * 100) : 0}%</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Accuracy</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            <button onClick={startGame} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition">Play Again</button>
            <Link href="/" className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 rounded-lg transition text-center">New Game</Link>
          </div>
          <ShareScore gameName="Reaction Bars" score={result.score || 0} rank={result.rank} />
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-yellow-500/20 flex items-center justify-center">
            <BarChartHorizontal className="w-10 h-10 text-yellow-500" />
          </div>
          <h3 className="text-2xl font-bold text-red-500 dark:text-red-400 mb-4">
            {result?.reason === 'timeout' ? "Time's Up!" : 'Failed!'}
          </h3>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            {result?.reason === 'timeout'
              ? 'You ran out of time.'
              : result?.reason === 'incomplete'
              ? 'You need to stop all bars!'
              : 'Better luck next time!'}
          </p>
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            <button onClick={startGame} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition">Try Again</button>
            <Link href="/" className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 rounded-lg transition text-center">New Game</Link>
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
