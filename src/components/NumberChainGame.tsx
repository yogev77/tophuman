'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { Hash, Check } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { ShareScore } from './ShareScore'

type GamePhase = 'idle' | 'loading' | 'play' | 'checking' | 'completed' | 'failed'

interface TurnSpec {
  grid: number[]
  chainStart: number
  chainLength: number
  direction: 'forward' | 'backward'
  timeLimitMs: number
}

interface GameResult {
  valid: boolean
  score?: number
  rank?: number
  mistakes?: number
  reason?: string
}

interface NumberChainGameProps {
  onGameComplete?: (result: GameResult) => void
}

export function NumberChainGame({ onGameComplete }: NumberChainGameProps) {
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [nextIndex, setNextIndex] = useState(0)
  const [tapped, setTapped] = useState<Set<number>>(new Set())
  const [flashRed, setFlashRed] = useState<number | null>(null)
  const [mistakes, setMistakes] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const completeCalledRef = useRef(false)

  // Build the expected sequence client-side from chainStart + direction + chainLength
  const sequence = useMemo(() => {
    if (!spec) return []
    const seq: number[] = []
    for (let i = 0; i < spec.chainLength; i++) {
      seq.push(spec.direction === 'forward' ? spec.chainStart + i : spec.chainStart - i)
    }
    return seq
  }, [spec])

  const completeGame = useCallback(async (token?: string) => {
    const finalToken = token || turnToken
    if (!finalToken || completeCalledRef.current) return
    completeCalledRef.current = true

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
  }, [turnToken, onGameComplete])

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setResult(null)
    setNextIndex(0)
    setTapped(new Set())
    setFlashRed(null)
    setMistakes(0)
    completeCalledRef.current = false

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'number_chain' }),
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
  }, [completeGame])

  const handleTap = useCallback(async (number: number) => {
    if (!turnToken || !spec || phase !== 'play') return

    const expectedNumber = sequence[nextIndex]

    if (number === expectedNumber) {
      const isComplete = nextIndex + 1 >= spec.chainLength

      // Send tap event
      const tapPromise = fetch('/api/game/turn/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnToken,
          eventType: 'tap',
          number,
          clientTimestampMs: Date.now(),
        }),
      })

      // Update UI immediately
      setTapped(prev => new Set(prev).add(number))

      if (isComplete) {
        await tapPromise
        completeGame()
      } else {
        setNextIndex(nextIndex + 1)
      }
    } else {
      // Wrong tap
      setFlashRed(number)
      setMistakes(m => m + 1)
      setTimeout(() => setFlashRed(null), 300)

      fetch('/api/game/turn/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnToken,
          eventType: 'wrong_tap',
          number,
          clientTimestampMs: Date.now(),
        }),
      })
    }
  }, [turnToken, spec, phase, sequence, nextIndex, completeGame])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Instruction text
  const instructionText = useMemo(() => {
    if (!spec) return ''
    return spec.direction === 'forward'
      ? `Count up from ${spec.chainStart}`
      : `Count down from ${spec.chainStart}`
  }, [spec])

  return (
    <div className="bg-slate-800 rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Number Chain</h2>
        {phase === 'play' && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">{nextIndex}/{spec?.chainLength}</span>
            <span className={`text-2xl font-mono ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
              {formatTime(timeLeft)}
            </span>
          </div>
        )}
      </div>

      {/* Instruction banner */}
      {phase === 'play' && spec && (
        <div className="text-center mb-4">
          <span className="text-sm font-semibold text-yellow-400">{instructionText}</span>
        </div>
      )}

      {phase === 'idle' && (
        <div className="text-center py-12">
          <p className="text-slate-300 mb-6">
            Find and tap 10 numbers in order — count up or down through the grid as fast as you can!
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
          <p className="text-slate-300">Scattering numbers...</p>
        </div>
      )}

      {phase === 'play' && spec && (
        <div
          className="grid gap-2 max-w-sm mx-auto"
          style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
        >
          {spec.grid.map((num, cellIdx) => {
            const isTapped = tapped.has(num)
            const isNext = num === sequence[nextIndex]
            const isFlashRed = flashRed === num

            return (
              <button
                key={cellIdx}
                onClick={() => handleTap(num)}
                disabled={isTapped}
                className={`aspect-square rounded-full flex items-center justify-center font-bold text-lg transition-all duration-150 ${
                  isTapped
                    ? 'bg-green-500/30 text-green-400 border-2 border-green-500/50'
                    : isFlashRed
                    ? 'bg-red-500/40 text-white border-2 border-red-500'
                    : isNext && nextIndex === 0
                    ? 'bg-yellow-500/20 text-white border-2 border-yellow-500/50 hover:bg-yellow-500/30 animate-pulse'
                    : 'bg-slate-700 text-white border-2 border-slate-600 hover:bg-slate-600'
                }`}
              >
                {isTapped ? <Check className="w-5 h-5" /> : num}
              </button>
            )
          })}
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="animate-spin w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-300">Calculating score...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/20 flex items-center justify-center">
            <Hash className="w-10 h-10 text-red-400" />
          </div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">Chain Complete!</h3>
          <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto mb-6">
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-3xl font-bold text-white">{result.score?.toLocaleString()}</div>
              <div className="text-sm text-slate-400">Score</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-3xl font-bold text-white">#{result.rank}</div>
              <div className="text-sm text-slate-400">Rank</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-4">
              <div className={`text-3xl font-bold ${(result.mistakes || 0) === 0 ? 'text-green-400' : 'text-red-400'}`}>{result.mistakes || 0}</div>
              <div className="text-sm text-slate-400">Mistakes</div>
            </div>
          </div>
          <div className="flex gap-4 justify-center">
            <button
              onClick={startGame}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg transition"
            >
              Play Again
            </button>
            <Link href="/" className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 px-8 rounded-lg transition">
              New Game
            </Link>
          </div>
          <ShareScore gameName="Number Chain" score={result.score || 0} rank={result.rank} />
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/20 flex items-center justify-center">
            <Hash className="w-10 h-10 text-red-400" />
          </div>
          <h3 className="text-2xl font-bold text-red-400 mb-4">
            {result?.reason === 'incomplete' ? "Time's Up!" : 'Game Over'}
          </h3>
          <p className="text-slate-300 mb-6">
            {result?.reason === 'incomplete'
              ? `Tapped ${nextIndex} of ${spec?.chainLength ?? 10} numbers before time ran out.`
              : 'Better luck next time!'}
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={startGame}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg transition"
            >
              Try Again
            </button>
            <Link href="/" className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 px-8 rounded-lg transition">
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
