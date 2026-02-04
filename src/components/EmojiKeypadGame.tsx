'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { formatTime } from '@/lib/utils'

type GamePhase = 'idle' | 'loading' | 'memorize' | 'play' | 'checking' | 'completed' | 'failed'

interface TurnSpec {
  sequence: string[]
  keypad: string[]
  keypadLayout: number[][]
  timeLimitMs: number
  penaltyMs: number
  maxMistakes: number
}

interface GameResult {
  valid: boolean
  score?: number
  completionTimeMs?: number
  mistakes?: number
  rank?: number
  reason?: string
}

interface EmojiKeypadGameProps {
  onGameComplete?: (result: GameResult) => void
}

export function EmojiKeypadGame({ onGameComplete }: EmojiKeypadGameProps) {
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [userInput, setUserInput] = useState<number[]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [memorizeTimeLeft, setMemorizeTimeLeft] = useState(3)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const memorizeTimerRef = useRef<NodeJS.Timeout | null>(null)
  const tapQueueRef = useRef<{ index: number; timestamp: number }[]>([])
  const processingQueueRef = useRef(false)
  const userInputRef = useRef<number[]>([])

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setUserInput([])
    setResult(null)
    tapQueueRef.current = []
    processingQueueRef.current = false
    userInputRef.current = []

    try {
      // Create turn
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'emoji_keypad' }),
      })
      if (!createRes.ok) {
        const data = await createRes.json()
        throw new Error(data.error || 'Failed to create turn')
      }
      const turnData = await createRes.json()

      setTurnToken(turnData.turnToken)
      setSpec(turnData.spec)
      setTimeLeft(turnData.spec.timeLimitMs)

      // Show memorize phase
      setPhase('memorize')
      setMemorizeTimeLeft(3)

      // Start memorize countdown
      let memorizeCount = 3
      memorizeTimerRef.current = setInterval(() => {
        memorizeCount--
        setMemorizeTimeLeft(memorizeCount)
        if (memorizeCount <= 0) {
          if (memorizeTimerRef.current) clearInterval(memorizeTimerRef.current)
          startPlayPhase(turnData.turnToken, turnData.spec.timeLimitMs)
        }
      }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('idle')
    }
  }, [])

  const startPlayPhase = async (token: string, timeLimitMs: number) => {
    try {
      // Start turn on server
      const startRes = await fetch('/api/game/turn/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: token }),
      })

      if (!startRes.ok) {
        const data = await startRes.json()
        throw new Error(data.error || 'Failed to start turn')
      }

      setPhase('play')

      // Start timer
      const startTime = Date.now()
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime
        const remaining = timeLimitMs - elapsed
        setTimeLeft(Math.max(0, remaining))

        if (remaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current)
          handleTimeout(token)
        }
      }, 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('idle')
    }
  }

  // Process tap queue in background
  const processQueue = async () => {
    if (processingQueueRef.current || !turnToken) return
    processingQueueRef.current = true

    while (tapQueueRef.current.length > 0) {
      const tap = tapQueueRef.current.shift()
      if (!tap) break

      try {
        await fetch('/api/game/turn/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            turnToken,
            eventType: 'tap',
            tapIndex: tap.index,
            clientTimestampMs: tap.timestamp,
          }),
        })
      } catch (err) {
        console.error('Failed to send tap event:', err)
      }
    }

    processingQueueRef.current = false
  }

  const handleTap = (index: number) => {
    if (phase !== 'play' || !spec || !turnToken) return

    // Check if we've already reached the sequence length
    if (userInputRef.current.length >= spec.sequence.length) return

    // Update UI immediately
    const newInput = [...userInputRef.current, index]
    userInputRef.current = newInput
    setUserInput(newInput)

    // Queue the tap for server
    tapQueueRef.current.push({ index, timestamp: Date.now() })
    processQueue()

    // Auto-submit when sequence length is reached
    if (newInput.length >= spec.sequence.length) {
      // Wait a moment for queue to flush, then complete
      setTimeout(() => {
        completeGame()
      }, 100)
    }
  }


  const completeGame = async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase('checking')

    // Wait for queue to finish processing
    while (tapQueueRef.current.length > 0 || processingQueueRef.current) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }

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

  const handleTimeout = async (token: string) => {
    try {
      const completeRes = await fetch('/api/game/turn/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: token }),
      })

      const data = await completeRes.json()
      setResult({ valid: false, reason: 'timeout' })
      setPhase('failed')

      if (onGameComplete) {
        onGameComplete(data)
      }
    } catch {
      setPhase('failed')
    }
  }

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (memorizeTimerRef.current) clearInterval(memorizeTimerRef.current)
    }
  }, [])

  const cols = spec ? Math.ceil(Math.sqrt(spec.keypad.length)) : 3

  return (
    <div className="bg-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Emoji Keypad Sequence</h2>
        {phase === 'play' && (
          <div className={`text-2xl font-mono ${timeLeft < 5000 ? 'text-red-400' : 'text-green-400'}`}>
            {formatTime(timeLeft)}
          </div>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center py-12">
          <p className="text-slate-300 mb-6">
            Memorize the emoji sequence, then <strong>find and tap</strong> each emoji on the shuffled keypad in the same order!
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

      {phase === 'memorize' && spec && (
        <div className="text-center py-8">
          <p className="text-slate-300 mb-2">Memorize this sequence!</p>
          <p className="text-slate-500 text-sm mb-4">You&apos;ll need to find and tap these in order</p>
          <div className="flex justify-center gap-3 mb-6">
            {spec.sequence.map((emoji, i) => (
              <div
                key={i}
                className="w-16 h-16 bg-slate-700 rounded-xl flex items-center justify-center text-3xl animate-pulse"
              >
                {emoji}
              </div>
            ))}
          </div>
          <div className="text-4xl font-bold text-yellow-400">{memorizeTimeLeft}</div>
        </div>
      )}

      {phase === 'play' && spec && (
        <div>
          {/* User input display */}
          <div className="mb-6">
            <p className="text-slate-400 text-sm text-center mb-2">Find and tap the emojis in order! ({userInput.length}/{spec.sequence.length})</p>
            <div className="flex justify-center gap-2 min-h-[64px] flex-wrap">
              {userInput.length === 0 ? (
                <div className="text-slate-500 italic">Tap the first emoji from the sequence...</div>
              ) : (
                userInput.map((idx, i) => (
                  <div
                    key={i}
                    className="w-14 h-14 bg-slate-700 rounded-xl flex items-center justify-center text-2xl"
                  >
                    {spec.keypad[idx]}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Keypad */}
          <div
            className="grid gap-3 max-w-md mx-auto"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
          >
            {spec.keypad.map((emoji, i) => (
              <button
                key={i}
                onClick={() => handleTap(i)}
                className="w-full aspect-square bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-xl text-4xl transition-all transform hover:scale-105 active:scale-95"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="animate-spin w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-300">Verifying sequence...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">🎉</div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">Completed!</h3>
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
              <div className="text-xl font-bold text-white">{formatTime(result.completionTimeMs || 0)}</div>
              <div className="text-sm text-slate-400">Time</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-xl font-bold text-white">{result.mistakes}</div>
              <div className="text-sm text-slate-400">Mistakes</div>
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
          <h3 className="text-2xl font-bold text-red-400 mb-4">
            {result?.reason === 'timeout' ? 'Time\'s Up!' : 'Wrong Sequence!'}
          </h3>
          <p className="text-slate-300 mb-6">
            {result?.reason === 'too_many_mistakes'
              ? `You got ${result.mistakes} wrong. Try again!`
              : result?.reason === 'timeout'
              ? 'You ran out of time.'
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
