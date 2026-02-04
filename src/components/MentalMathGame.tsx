'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { formatTime } from '@/lib/utils'

type GamePhase = 'idle' | 'loading' | 'play' | 'checking' | 'completed' | 'failed'

interface Problem {
  a: number
  b: number
  operation: string
}

interface TurnSpec {
  problems: Problem[]
  timeLimitMs: number
}

interface GameResult {
  valid: boolean
  correct?: number
  total?: number
  averageTimeMs?: number
  score?: number
  rank?: number
  reason?: string
}

interface MentalMathGameProps {
  onGameComplete?: (result: GameResult) => void
}

export function MentalMathGame({ onGameComplete }: MentalMathGameProps) {
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [currentProblem, setCurrentProblem] = useState(0)
  const [userAnswer, setUserAnswer] = useState('')
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setCurrentProblem(0)
    setUserAnswer('')
    setAnswers([])
    setResult(null)

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'mental_math' }),
      })
      if (!createRes.ok) {
        const data = await createRes.json()
        throw new Error(data.error || 'Failed to create turn')
      }
      const turnData = await createRes.json()

      setTurnToken(turnData.turnToken)
      setSpec(turnData.spec)
      setTimeLeft(turnData.spec.timeLimitMs)
      setAnswers(new Array(turnData.spec.problems.length).fill(null))

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

      setTimeout(() => inputRef.current?.focus(), 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('idle')
    }
  }, [])

  const submitAnswer = async () => {
    if (!turnToken || !spec || userAnswer === '') return

    const answer = parseInt(userAnswer, 10)
    if (isNaN(answer)) return

    // Record answer locally
    const newAnswers = [...answers]
    newAnswers[currentProblem] = answer
    setAnswers(newAnswers)

    // Send to server
    await fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken,
        eventType: 'answer',
        problemIndex: currentProblem,
        userAnswer: answer,
        clientTimestampMs: Date.now(),
      }),
    })

    // Move to next problem or complete
    if (currentProblem + 1 >= spec.problems.length) {
      completeGame()
    } else {
      setCurrentProblem(currentProblem + 1)
      setUserAnswer('')
      inputRef.current?.focus()
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    submitAnswer()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitAnswer()
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const currentProb = spec?.problems[currentProblem]

  return (
    <div className="bg-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Mental Math</h2>
        {phase === 'play' && spec && (
          <div className="flex items-center gap-4">
            <span className="text-slate-400">
              {currentProblem + 1} / {spec.problems.length}
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
            Solve math problems as fast as you can! Test your mental arithmetic skills.
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
          <p className="text-slate-300">Preparing problems...</p>
        </div>
      )}

      {phase === 'play' && currentProb && (
        <div className="text-center py-8">
          <div className="text-6xl font-bold text-white mb-8 font-mono">
            {currentProb.a} {currentProb.operation} {currentProb.b} = ?
          </div>

          <form onSubmit={handleSubmit} className="max-w-xs mx-auto">
            <input
              ref={inputRef}
              type="number"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full text-center text-4xl font-mono bg-slate-700 text-white p-4 rounded-lg border-2 border-slate-600 focus:border-blue-500 outline-none"
              placeholder="?"
              autoComplete="off"
            />
            <button
              type="submit"
              className="w-full mt-4 bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-6 rounded-lg transition"
            >
              Next
            </button>
          </form>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 mt-6">
            {spec?.problems.map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full ${
                  i < currentProblem
                    ? 'bg-green-500'
                    : i === currentProblem
                    ? 'bg-blue-500'
                    : 'bg-slate-600'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="animate-spin w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-300">Checking answers...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">🧮</div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">Great Job!</h3>
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
              <div className="text-xl font-bold text-green-400">{result.correct}/{result.total}</div>
              <div className="text-sm text-slate-400">Correct</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-xl font-bold text-blue-400">
                {result.averageTimeMs ? `${(result.averageTimeMs / 1000).toFixed(1)}s` : '-'}
              </div>
              <div className="text-sm text-slate-400">Avg Time</div>
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
          <div className="text-6xl mb-4">😢</div>
          <h3 className="text-2xl font-bold text-red-400 mb-4">Failed!</h3>
          <p className="text-slate-300 mb-6">
            {result?.reason === 'too_few_correct'
              ? `Only ${result.correct}/${result.total} correct. Need at least 50%.`
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
