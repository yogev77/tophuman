'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { Hash, Check } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { ShareScore } from './ShareScore'
import { Spinner } from '@/components/Spinner'
import { CC } from '@/lib/currency'
import { GameThumbnail } from '@/components/GameThumbnail'
import { useSound } from '@/hooks/useSound'

type GamePhase = 'idle' | 'loading' | 'play' | 'checking' | 'completed' | 'failed'

interface RoundSpec {
  grid: number[]
  chainStart: number
  chainLength: number
  direction: 'forward' | 'backward'
}

interface TurnSpec {
  rounds: RoundSpec[]
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
  const { play } = useSound()
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [currentRound, setCurrentRound] = useState(0)
  const [nextIndex, setNextIndex] = useState(0)
  const [tapped, setTapped] = useState<Set<number>>(new Set())
  const [flashRed, setFlashRed] = useState<number | null>(null)
  const [mistakes, setMistakes] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const completeCalledRef = useRef(false)

  const round = spec?.rounds[currentRound] ?? null
  const totalRounds = spec?.rounds.length ?? 2

  // Build the expected sequence for the current round
  const sequence = useMemo(() => {
    if (!round) return []
    const seq: number[] = []
    for (let i = 0; i < round.chainLength; i++) {
      seq.push(round.direction === 'forward' ? round.chainStart + i : round.chainStart - i)
    }
    return seq
  }, [round])

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
    setCurrentRound(0)
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
    if (!turnToken || !round || phase !== 'play') return

    const expectedNumber = sequence[nextIndex]

    if (number === expectedNumber) {
      play('tap')
      const isRoundComplete = nextIndex + 1 >= round.chainLength

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

      if (isRoundComplete) {
        await tapPromise
        // Check if there are more rounds
        if (currentRound + 1 < totalRounds) {
          setCurrentRound(currentRound + 1)
          setNextIndex(0)
          setTapped(new Set())
          setFlashRed(null)
        } else {
          completeGame()
        }
      } else {
        // Update UI immediately (only for non-completing taps)
        setTapped(prev => new Set(prev).add(number))
        setNextIndex(nextIndex + 1)
      }
    } else {
      // Wrong tap
      play('miss')
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
  }, [turnToken, round, phase, sequence, nextIndex, currentRound, totalRounds, completeGame])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Instruction text
  const instructionArrow = round?.direction === 'forward' ? '↑' : '↓'
  const instructionLabel = useMemo(() => {
    if (!round) return ''
    return round.direction === 'forward'
      ? `Count up from ${round.chainStart}`
      : `Count down from ${round.chainStart}`
  }, [round])

  return (
    <div className="bg-slate-800 rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        {phase === 'play' && round && (
          <>
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-400">
                Level {currentRound + 1}/{totalRounds} &middot; {nextIndex}/{round.chainLength}
              </span>
              <span className={`text-2xl font-mono ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
                {formatTime(timeLeft)}
              </span>
            </div>
            <div className="flex gap-1.5">
              {Array.from({ length: totalRounds }).map((_, i) => (
                <div
                  key={i}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i < currentRound
                      ? 'bg-green-500 text-white'
                      : i === currentRound
                      ? 'bg-yellow-500 text-slate-900'
                      : 'bg-slate-600 text-slate-400'
                  }`}
                >
                  {i + 1}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Instruction banner */}
      {phase === 'play' && round && (
        <div className="text-center mb-4">
          <span className={`text-lg font-bold ${round.direction === 'forward' ? 'text-green-400' : 'text-red-400'}`}>
            {instructionArrow} {instructionLabel}
          </span>
        </div>
      )}

      {phase === 'idle' && (
        <div className="text-center pb-6">
          <div className="mb-4 max-w-sm mx-auto"><GameThumbnail gameId="number_chain" isPlayable={true} /></div>
          <p className="text-slate-300 mb-6">
            Two levels — count up in one, count down in the other. Find and tap each number in order!
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
          <p className="text-slate-300">Scattering numbers...</p>
        </div>
      )}

      {phase === 'play' && round && (
        <div
          className="grid gap-2 max-w-sm mx-auto"
          style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
        >
          {round.grid.map((num, cellIdx) => {
            const isTapped = tapped.has(num)
            const isNext = num === sequence[nextIndex]
            const isFlashRed = flashRed === num

            return (
              <button
                key={`${currentRound}-${cellIdx}`}
                onClick={() => handleTap(num)}
                disabled={isTapped}
                className={`aspect-square rounded-full flex items-center justify-center font-bold text-lg transition-all duration-150 ${
                  isTapped
                    ? 'bg-green-500/30 text-green-400 border-2 border-green-500/50'
                    : isFlashRed
                    ? 'bg-red-500/40 text-white border-2 border-red-500'
                    : isNext && nextIndex === 0
                    ? 'bg-slate-700 text-white border-2 border-yellow-500 hover:bg-slate-600 animate-[glow-pulse_1.5s_ease-in-out_infinite]'
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
          <div className="mx-auto mb-4"><Spinner /></div>
          <p className="text-slate-300">Calculating score...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-600/20 flex items-center justify-center">
            <Hash className="w-10 h-10 text-blue-500" />
          </div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">Chain Complete!</h3>
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
              <div className="text-base font-bold text-white">{result.mistakes || 0}</div>
              <div className="text-[10px] text-slate-400">Mistakes</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            <button onClick={startGame} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition">Play Again</button>
            <Link href="/" className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 rounded-lg transition text-center">New Game</Link>
          </div>
          <ShareScore gameName="Number Chain" score={result.score || 0} rank={result.rank} />
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-600/20 flex items-center justify-center">
            <Hash className="w-10 h-10 text-blue-500" />
          </div>
          <h3 className="text-2xl font-bold text-red-400 mb-4">
            {result?.reason === 'incomplete' ? "Time's Up!" : 'Game Over'}
          </h3>
          <p className="text-slate-300 mb-6">
            {result?.reason === 'incomplete'
              ? `Completed ${currentRound} of ${totalRounds} levels before time ran out.`
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
