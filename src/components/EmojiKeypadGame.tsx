'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Target } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { ShareScore } from './ShareScore'
import { Spinner } from '@/components/Spinner'
import { CC } from '@/lib/currency'
import { GameThumbnail } from '@/components/GameThumbnail'
import { useSound } from '@/hooks/useSound'

type GamePhase = 'idle' | 'loading' | 'memorize' | 'play' | 'checking' | 'completed' | 'failed'

interface TurnSpec {
  sequence: string[]
  keypad: string[]
  keypadLayout: number[][]
  timeLimitMs: number
  penaltyMs: number
  maxMistakes: number
  levels?: number[]
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
  const { play } = useSound()
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [userInput, setUserInput] = useState<number[]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flashIndex, setFlashIndex] = useState(-1)
  const [currentLevel, setCurrentLevel] = useState(0) // index into levels array
  const [flashTotal, setFlashTotal] = useState(0) // how many symbols being flashed this level

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const memorizeTimerRef = useRef<NodeJS.Timeout | null>(null)
  const tapQueueRef = useRef<{ index: number; timestamp: number }[]>([])
  const processingQueueRef = useRef(false)
  const userInputRef = useRef<number[]>([])
  const currentLevelRef = useRef(0)
  const turnTokenRef = useRef<string | null>(null)
  const specRef = useRef<TurnSpec | null>(null)

  const getLevels = (s: TurnSpec): number[] => s.levels || [s.sequence.length]

  const flashSequence = (gameSpec: TurnSpec, count: number): Promise<void> => {
    return new Promise((resolve) => {
      setPhase('memorize')
      setFlashIndex(0)
      setFlashTotal(count)

      let idx = 0
      memorizeTimerRef.current = setInterval(() => {
        idx++
        if (idx >= count) {
          if (memorizeTimerRef.current) clearInterval(memorizeTimerRef.current)
          setTimeout(() => {
            setFlashIndex(-1)
            resolve()
          }, 600)
        } else {
          setFlashIndex(idx)
        }
      }, 1400)
    })
  }

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setUserInput([])
    setResult(null)
    setCurrentLevel(0)
    currentLevelRef.current = 0
    tapQueueRef.current = []
    processingQueueRef.current = false
    userInputRef.current = []

    try {
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
      turnTokenRef.current = turnData.turnToken
      setSpec(turnData.spec)
      specRef.current = turnData.spec

      const levels = getLevels(turnData.spec)

      // Flash level 1 symbols
      await flashSequence(turnData.spec, levels[0])

      // Start turn on server (timer begins here)
      const startRes = await fetch('/api/game/turn/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: turnData.turnToken }),
      })

      if (!startRes.ok) {
        throw new Error('Failed to start turn')
      }

      setPhase('play')

      // Start client timer (60s gameplay)
      const startTime = Date.now()
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime
        const remaining = 60000 - elapsed
        setTimeLeft(Math.max(0, remaining))

        if (remaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current)
          handleTimeout(turnData.turnToken)
        }
      }, 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('idle')
    }
  }, [])

  const processQueue = async () => {
    if (processingQueueRef.current || !turnTokenRef.current) return
    processingQueueRef.current = true

    while (tapQueueRef.current.length > 0) {
      const tap = tapQueueRef.current.shift()
      if (!tap) break

      try {
        await fetch('/api/game/turn/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            turnToken: turnTokenRef.current,
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

  const advanceToNextLevel = async () => {
    const gameSpec = specRef.current
    if (!gameSpec) return

    const levels = getLevels(gameSpec)
    const nextLevel = currentLevelRef.current + 1

    if (nextLevel >= levels.length) {
      // All levels done
      completeGame()
      return
    }

    // Send level_complete event
    await fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken: turnTokenRef.current,
        eventType: 'level_complete',
        level: currentLevelRef.current + 1,
        clientTimestampMs: Date.now(),
      }),
    })

    setCurrentLevel(nextLevel)
    currentLevelRef.current = nextLevel
    setUserInput([])
    userInputRef.current = []

    // Flash next level's symbols
    await flashSequence(gameSpec, levels[nextLevel])

    setPhase('play')
  }

  const handleTap = (index: number) => {
    if (phase !== 'play' || !specRef.current || !turnTokenRef.current) return
    play('tap')

    const gameSpec = specRef.current
    const levels = getLevels(gameSpec)
    const currentLevelSize = levels[currentLevelRef.current]

    if (userInputRef.current.length >= currentLevelSize) return

    const newInput = [...userInputRef.current, index]
    userInputRef.current = newInput
    setUserInput(newInput)

    tapQueueRef.current.push({ index, timestamp: Date.now() })
    processQueue()

    // Auto-advance when this level's taps are complete
    if (newInput.length >= currentLevelSize) {
      play('success')
      setTimeout(() => {
        advanceToNextLevel()
      }, 100)
    }
  }

  const completeGame = async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase('checking')

    while (tapQueueRef.current.length > 0 || processingQueueRef.current) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    try {
      const completeRes = await fetch('/api/game/turn/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: turnTokenRef.current }),
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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (memorizeTimerRef.current) clearInterval(memorizeTimerRef.current)
    }
  }, [])

  const cols = spec ? Math.ceil(Math.sqrt(spec.keypad.length)) : 3
  const levels = spec ? getLevels(spec) : [5]
  const currentLevelSize = levels[currentLevel] || 5

  return (
    <div className="bg-slate-800 rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        {phase === 'play' && (
          <>
            <div className={`text-2xl font-mono ${timeLeft < 5000 ? 'text-red-400' : 'text-green-400'}`}>
              {formatTime(timeLeft)}
            </div>
            {levels.length > 1 && (
              <div className="flex gap-2">
                {levels.map((_, i) => (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      i < currentLevel
                        ? 'bg-green-500 text-white'
                        : i === currentLevel
                        ? 'bg-yellow-500 text-slate-900'
                        : 'bg-slate-600 text-slate-400'
                    }`}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            )}
            <div className="w-[52px]" />
          </>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center pb-6">
          <div className="mb-4 max-w-sm mx-auto"><GameThumbnail gameId="emoji_keypad" isPlayable={true} /></div>
          <p className="text-slate-300 mb-6">
            Memorize the emoji sequence, then <strong>find and tap</strong> each emoji on the shuffled keypad in the same order!
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
          <p className="text-slate-300">Preparing game...</p>
        </div>
      )}

      {phase === 'memorize' && spec && flashIndex >= 0 && (
        <div className="text-center py-8 px-2">
          <p className="text-slate-300 mb-2">
            {levels.length > 1 ? `Level ${currentLevel + 1}: Memorize ${flashTotal} emojis!` : 'Memorize this sequence!'}
          </p>
          <p className="text-slate-500 text-sm mb-6">You&apos;ll need to find and tap these in order</p>
          <div
            key={`${currentLevel}-${flashIndex}`}
            className="w-24 h-24 sm:w-28 sm:h-28 mx-auto bg-slate-700 rounded-2xl flex items-center justify-center text-5xl sm:text-6xl animate-[scaleIn_0.3s_ease-out]"
          >
            {spec.sequence[flashIndex]}
          </div>
          <div className="flex justify-center gap-2 mt-6">
            {Array.from({ length: flashTotal }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  i < flashIndex ? 'bg-yellow-500' : i === flashIndex ? 'bg-yellow-400 scale-125' : 'bg-slate-600'
                }`}
              />
            ))}
          </div>
          <p className="text-slate-500 text-sm mt-3">{flashIndex + 1} of {flashTotal}</p>
        </div>
      )}

      {phase === 'play' && spec && (
        <div className="px-2">
          <div className="mb-4 sm:mb-6">
            <p className="text-slate-400 text-sm text-center mb-2">
              {levels.length > 1 ? `Level ${currentLevel + 1}: ` : ''}
              Find and tap the emojis in order! ({userInput.length}/{currentLevelSize})
            </p>
            <div className="flex justify-center gap-1.5 sm:gap-2 min-h-[48px] sm:min-h-[56px] flex-wrap">
              {userInput.length === 0 ? (
                <div className="text-slate-500 italic text-sm sm:text-base">Tap the first emoji from the sequence...</div>
              ) : (
                userInput.map((idx, i) => (
                  <div
                    key={i}
                    className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-slate-700 rounded-lg sm:rounded-xl flex items-center justify-center text-xl sm:text-2xl"
                  >
                    {spec.keypad[idx]}
                  </div>
                ))
              )}
            </div>
          </div>

          <div
            className="grid gap-2 sm:gap-3 max-w-sm sm:max-w-md mx-auto"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
          >
            {spec.keypad.map((emoji, i) => (
              <button
                key={i}
                onClick={() => handleTap(i)}
                className="w-full aspect-square bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-lg sm:rounded-xl text-2xl sm:text-3xl md:text-4xl transition-all transform hover:scale-105 active:scale-95"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="mx-auto mb-4"><Spinner /></div>
          <p className="text-slate-300">Verifying sequence...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-rose-500/20 flex items-center justify-center">
            <Target className="w-10 h-10 text-rose-400" />
          </div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">Completed!</h3>
          <div className="bg-slate-900/50 rounded-lg max-w-xs mx-auto mb-6">
            <div className="grid grid-cols-2 text-center divide-x divide-slate-600/50">
              <div className="py-4 px-2">
                <div className="text-2xl font-bold text-white">{result.score?.toLocaleString()}</div>
                <div className="text-[10px] text-slate-400">Score</div>
              </div>
              <div className="py-4 px-2">
                <div className="text-2xl font-bold text-white">#{result.rank}</div>
                <div className="text-[10px] text-slate-400">Rank</div>
              </div>
            </div>
            <div className="grid grid-cols-2 text-center divide-x divide-slate-600/50 border-t border-slate-600/50">
              <div className="py-3 px-2">
                <div className="text-base font-bold text-white">{formatTime(result.completionTimeMs || 0)}</div>
                <div className="text-[10px] text-slate-400">Time</div>
              </div>
              <div className="py-3 px-2">
                <div className="text-base font-bold text-white">{result.mistakes}</div>
                <div className="text-[10px] text-slate-400">Mistakes</div>
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
          <ShareScore gameName="Emoji Keypad" score={result.score || 0} rank={result.rank} />
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-rose-500/20 flex items-center justify-center">
            <Target className="w-10 h-10 text-rose-400" />
          </div>
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
