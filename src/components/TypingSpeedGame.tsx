'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { formatTime } from '@/lib/utils'

type GamePhase = 'idle' | 'loading' | 'play' | 'checking' | 'completed' | 'failed'

interface TurnSpec {
  phrase: string
  timeLimitMs: number
}

interface GameResult {
  valid: boolean
  accuracy?: number
  wpm?: number
  completionTimeMs?: number
  score?: number
  rank?: number
  reason?: string
}

interface TypingSpeedGameProps {
  onGameComplete?: (result: GameResult) => void
}

export function TypingSpeedGame({ onGameComplete }: TypingSpeedGameProps) {
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [userInput, setUserInput] = useState('')
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [started, setStarted] = useState(false)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setUserInput('')
    setResult(null)
    setStarted(false)

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'typing_speed' }),
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

      // Focus input
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('idle')
    }
  }, [])

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (phase !== 'play' || !turnToken || !spec) return

    // Start timer on first keystroke
    if (!started) {
      setStarted(true)
      const startTime = Date.now()

      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime
        const remaining = spec.timeLimitMs - elapsed
        setTimeLeft(Math.max(0, remaining))

        if (remaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current)
          submitResult()
        }
      }, 100)
    }

    // Send keystroke event (debounced - only send every few keystrokes)
    if (userInput.length % 5 === 0) {
      fetch('/api/game/turn/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnToken,
          eventType: 'keystroke',
          key: e.key,
          currentText: userInput + (e.key.length === 1 ? e.key : ''),
          clientTimestampMs: Date.now(),
        }),
      })
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (phase !== 'play') return
    setUserInput(e.target.value)
  }

  const submitResult = async () => {
    if (!turnToken || !spec) return

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    setPhase('checking')

    // Send final submission
    await fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken,
        eventType: 'submit',
        currentText: userInput,
        clientTimestampMs: Date.now(),
      }),
    })

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (phase === 'play' && started) {
      submitResult()
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Render phrase with color-coded characters
  const renderPhrase = () => {
    if (!spec) return null

    return spec.phrase.split('').map((char, i) => {
      let className = 'text-slate-400'
      if (i < userInput.length) {
        className = userInput[i] === char ? 'text-green-400' : 'text-red-400 bg-red-400/20'
      } else if (i === userInput.length) {
        className = 'text-white bg-blue-500/30'
      }
      return (
        <span key={i} className={className}>
          {char}
        </span>
      )
    })
  }

  return (
    <div className="bg-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Typing Speed</h2>
        {phase === 'play' && (
          <div className={`text-2xl font-mono ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
            {formatTime(timeLeft)}
          </div>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center py-12">
          <p className="text-slate-300 mb-6">
            Type the phrase as fast and accurately as you can!
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

      {phase === 'play' && spec && (
        <div>
          <div className="bg-slate-900 rounded-lg p-4 mb-4 font-mono text-lg leading-relaxed">
            {renderPhrase()}
          </div>

          <form onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={userInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className="w-full bg-slate-700 text-white font-mono text-lg p-4 rounded-lg border-2 border-slate-600 focus:border-blue-500 outline-none"
              placeholder={started ? '' : 'Start typing...'}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />

            <div className="flex justify-between items-center mt-4">
              <div className="text-sm text-slate-400">
                {userInput.length} / {spec.phrase.length} characters
              </div>
              <button
                type="submit"
                disabled={!started || userInput.length === 0}
                className="bg-green-600 hover:bg-green-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-lg transition"
              >
                Submit
              </button>
            </div>
          </form>
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
          <div className="text-6xl mb-4">⌨️</div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">Well Done!</h3>
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
              <div className="text-xl font-bold text-blue-400">{result.wpm} WPM</div>
              <div className="text-sm text-slate-400">Speed</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-xl font-bold text-green-400">{Math.round((result.accuracy || 0) * 100)}%</div>
              <div className="text-sm text-slate-400">Accuracy</div>
            </div>
          </div>
          <button
            onClick={startGame}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-lg transition"
          >
            Play Again
          </button>
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">😢</div>
          <h3 className="text-2xl font-bold text-red-400 mb-4">Failed!</h3>
          <p className="text-slate-300 mb-6">
            {result?.reason === 'low_accuracy'
              ? `Accuracy too low: ${Math.round((result.accuracy || 0) * 100)}%`
              : 'Better luck next time!'}
          </p>
          <button
            onClick={startGame}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-lg transition"
          >
            Try Again
          </button>
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
