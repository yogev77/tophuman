'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

type GamePhase = 'idle' | 'loading' | 'waiting' | 'ready' | 'checking' | 'completed' | 'failed'

interface TurnSpec {
  maxReactionMs: number
  timeLimitMs: number
  numRounds: number
}

interface GameResult {
  valid: boolean
  reactionTimes?: number[]
  averageReactionMs?: number
  score?: number
  rank?: number
  reason?: string
}

interface ReactionTimeGameProps {
  onGameComplete?: (result: GameResult) => void
}

export function ReactionTimeGame({ onGameComplete }: ReactionTimeGameProps) {
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [currentRound, setCurrentRound] = useState(0)
  const [reactionTimes, setReactionTimes] = useState<number[]>([])
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSignal, setShowSignal] = useState(false)

  const signalTimeRef = useRef<number>(0)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setCurrentRound(0)
    setReactionTimes([])
    setResult(null)
    setShowSignal(false)

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'reaction_time' }),
      })
      if (!createRes.ok) {
        const data = await createRes.json()
        throw new Error(data.error || 'Failed to create turn')
      }
      const turnData = await createRes.json()

      setTurnToken(turnData.turnToken)
      setSpec(turnData.spec)

      // Start turn on server
      const startRes = await fetch('/api/game/turn/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: turnData.turnToken }),
      })

      if (!startRes.ok) {
        throw new Error('Failed to start turn')
      }

      // Start first round
      startRound(turnData.turnToken, 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('idle')
    }
  }, [])

  const startRound = async (token: string, round: number) => {
    setPhase('waiting')
    setShowSignal(false)

    // Request server to schedule signal
    try {
      const res = await fetch('/api/game/turn/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnToken: token,
          eventType: 'request_signal',
          round,
          clientTimestampMs: Date.now(),
        }),
      })

      if (!res.ok) throw new Error('Failed to request signal')

      const data = await res.json()
      const delay = data.delay || 2000

      // Wait for server-specified delay, then show signal
      timeoutRef.current = setTimeout(() => {
        showSignalAndWait(token, round)
      }, delay)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('failed')
    }
  }

  const showSignalAndWait = async (token: string, round: number) => {
    // Record signal time and notify server
    signalTimeRef.current = Date.now()
    setShowSignal(true)
    setPhase('ready')

    await fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken: token,
        eventType: 'signal_shown',
        round,
        clientTimestampMs: signalTimeRef.current,
      }),
    })
  }

  const handleTap = async () => {
    if (phase === 'waiting') {
      // Tapped too early!
      setError('Too early! Wait for the green signal.')
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      setPhase('failed')
      setResult({ valid: false, reason: 'early_tap' })
      return
    }

    if (phase !== 'ready' || !turnToken || !spec) return

    const tapTime = Date.now()
    const reactionMs = tapTime - signalTimeRef.current

    // Send tap event to server
    await fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken,
        eventType: 'tap',
        round: currentRound,
        clientTimestampMs: tapTime,
      }),
    })

    const newReactionTimes = [...reactionTimes, reactionMs]
    setReactionTimes(newReactionTimes)
    setShowSignal(false)

    const nextRound = currentRound + 1

    if (nextRound >= spec.numRounds) {
      // All rounds complete
      completeGame()
    } else {
      setCurrentRound(nextRound)
      // Brief pause before next round
      setTimeout(() => {
        startRound(turnToken, nextRound)
      }, 500)
    }
  }

  const completeGame = async () => {
    setPhase('checking')

    try {
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
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return (
    <div className="bg-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Reaction Time</h2>
        {(phase === 'waiting' || phase === 'ready') && spec && (
          <div className="text-sm text-slate-400">
            Round {currentRound + 1} / {spec.numRounds}
          </div>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center py-12">
          <p className="text-slate-300 mb-6">
            Test your reflexes! Click as fast as you can when the screen turns green.
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
          <p className="text-slate-300">Preparing game...</p>
        </div>
      )}

      {(phase === 'waiting' || phase === 'ready') && (
        <div className="text-center">
          <button
            onClick={handleTap}
            className={`w-full h-64 rounded-xl text-3xl font-bold transition-all ${
              showSignal
                ? 'bg-green-500 hover:bg-green-400 text-white'
                : 'bg-red-500 hover:bg-red-400 text-white'
            }`}
          >
            {showSignal ? 'CLICK NOW!' : 'Wait for green...'}
          </button>

          {reactionTimes.length > 0 && (
            <div className="mt-4 flex justify-center gap-2 flex-wrap">
              {reactionTimes.map((time, i) => (
                <span key={i} className="px-3 py-1 bg-slate-700 rounded text-sm text-slate-300">
                  R{i + 1}: {time}ms
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="animate-spin w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-300">Calculating results...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">⚡</div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">Great Reflexes!</h3>
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
              <div className="text-xl font-bold text-white">{result.averageReactionMs}ms</div>
              <div className="text-sm text-slate-400">Average Reaction Time</div>
            </div>
          </div>
          <div className="flex justify-center gap-2 flex-wrap mb-6">
            {result.reactionTimes?.map((time, i) => (
              <span key={i} className="px-3 py-1 bg-slate-700 rounded text-sm text-slate-300">
                R{i + 1}: {time}ms
              </span>
            ))}
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
          <div className="text-6xl mb-4">😢</div>
          <h3 className="text-2xl font-bold text-red-400 mb-4">
            {result?.reason === 'early_tap' ? 'Too Early!' : 'Failed!'}
          </h3>
          <p className="text-slate-300 mb-6">
            {result?.reason === 'early_tap'
              ? 'You clicked before the signal appeared.'
              : result?.reason === 'too_slow'
              ? 'Your reaction was too slow.'
              : 'Better luck next time!'}
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
