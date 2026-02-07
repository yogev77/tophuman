'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Music } from 'lucide-react'
import { ShareScore } from './ShareScore'

type GamePhase = 'idle' | 'loading' | 'countdown' | 'listen' | 'play' | 'checking' | 'completed' | 'failed'

interface TurnSpec {
  sequence: number[]
  numButtons: number
  toneDurationMs: number
  timeLimitMs: number
  frequencies: number[]
}

interface GameResult {
  valid: boolean
  correct?: number
  total?: number
  score?: number
  rank?: number
  reason?: string
}

interface AudioPatternGameProps {
  onGameComplete?: (result: GameResult) => void
}

const BUTTON_COLORS = ['bg-red-500', 'bg-green-500', 'bg-blue-500', 'bg-yellow-500']
const BUTTON_ACTIVE_COLORS = ['bg-red-300', 'bg-green-300', 'bg-blue-300', 'bg-yellow-300']

export function AudioPatternGame({ onGameComplete }: AudioPatternGameProps) {
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [userInput, setUserInput] = useState<number[]>([])
  const [activeButton, setActiveButton] = useState<number | null>(null)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playingIndex, setPlayingIndex] = useState(-1)
  const [currentLevel, setCurrentLevel] = useState(3) // Start with 3 notes
  const [timeLeft, setTimeLeft] = useState(30000)
  const [countdownNum, setCountdownNum] = useState(3)

  const audioContextRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const gameStartTimeRef = useRef<number>(0)

  const playTone = useCallback((frequency: number, duration: number) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    const ctx = audioContextRef.current

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.frequency.value = frequency
    oscillator.type = 'sine'

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + duration / 1000)
  }, [])

  const runCountdown = useCallback(async () => {
    setPhase('countdown')
    for (let i = 3; i >= 1; i--) {
      setCountdownNum(i)
      await new Promise(resolve => setTimeout(resolve, 700))
    }
  }, [])

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setUserInput([])
    setResult(null)
    setPlayingIndex(-1)
    setCurrentLevel(3)
    setTimeLeft(30000)

    // Clear any existing timer
    if (timerRef.current) clearInterval(timerRef.current)

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'audio_pattern' }),
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

      // Countdown before starting
      await runCountdown()

      gameStartTimeRef.current = Date.now()

      // Start 30 second timer
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - gameStartTimeRef.current
        const remaining = 30000 - elapsed
        setTimeLeft(Math.max(0, remaining))

        if (remaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current)
          completeGame()
        }
      }, 100)

      // Play the sequence (only first 3 notes)
      setPhase('listen')
      await playSequence(turnData.spec, 3)

      setPhase('play')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('idle')
    }
  }, [])

  const playSequence = async (gameSpec: TurnSpec, length?: number) => {
    const seqLength = length || gameSpec.sequence.length
    for (let i = 0; i < seqLength; i++) {
      const buttonIndex = gameSpec.sequence[i]
      setPlayingIndex(i)
      setActiveButton(buttonIndex)
      playTone(gameSpec.frequencies[buttonIndex], gameSpec.toneDurationMs)

      await new Promise(resolve => setTimeout(resolve, gameSpec.toneDurationMs + 150))
      setActiveButton(null)
    }
    setPlayingIndex(-1)
  }

  const handleButtonClick = async (buttonIndex: number) => {
    if (phase !== 'play' || !turnToken || !spec) return

    // Play the tone
    playTone(spec.frequencies[buttonIndex], 200)
    setActiveButton(buttonIndex)
    setTimeout(() => setActiveButton(null), 200)

    const newInput = [...userInput, buttonIndex]
    setUserInput(newInput)

    // Send tap event
    await fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken,
        eventType: 'tap',
        buttonIndex,
        clientTimestampMs: Date.now(),
      }),
    })

    // Check if sequence complete or wrong
    const currentIndex = newInput.length - 1
    if (newInput[currentIndex] !== spec.sequence[currentIndex]) {
      // Wrong! End game
      completeGame()
    } else if (newInput.length >= currentLevel) {
      // Level complete! Send level complete event
      await fetch('/api/game/turn/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnToken,
          eventType: 'level_complete',
          level: currentLevel,
          clientTimestampMs: Date.now(),
        }),
      })

      // Check if we've reached max sequence or time is up
      if (currentLevel >= spec.sequence.length) {
        completeGame()
      } else {
        // Progress to next level
        const nextLevel = currentLevel + 1
        setCurrentLevel(nextLevel)
        setUserInput([])

        // Countdown then play the new longer sequence
        await runCountdown()
        setPhase('listen')
        await playSequence(spec, nextLevel)
        setPhase('play')
      }
    }
  }

  const completeGame = async () => {
    if (!turnToken) return

    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

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
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  return (
    <div className="bg-slate-800 rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Audio Pattern</h2>
        {(phase === 'play' || phase === 'listen') && spec && (
          <div className="flex items-center gap-4">
            <span className="text-slate-400">Level {currentLevel - 2}</span>
            <span className={`text-2xl font-mono ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
              {Math.ceil(timeLeft / 1000)}s
            </span>
          </div>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center py-12">
          <p className="text-slate-300 mb-6">
            Listen and repeat! Start with 3 tones, each level adds one more. 30 seconds - go fast!
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
          <p className="text-slate-300">Preparing game...</p>
        </div>
      )}

      {(phase === 'countdown' || phase === 'listen' || phase === 'play') && spec && (
        <div className="text-center py-8">
          {/* Permanent caption area */}
          <p className="text-xl mb-6 h-7">
            {phase === 'countdown' && (
              <span className="text-white font-bold text-3xl animate-pulse">{countdownNum}</span>
            )}
            {phase === 'listen' && (
              <span className="text-slate-400">Listen...</span>
            )}
            {phase === 'play' && (
              <span className="text-green-400">Your turn! Repeat the {currentLevel} tones</span>
            )}
          </p>

          <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto px-4">
            {Array.from({ length: spec.numButtons }).map((_, i) => {
              const isActive = activeButton === i
              const baseColor = isActive ? BUTTON_ACTIVE_COLORS[i] : BUTTON_COLORS[i]
              const countdownPulse = phase === 'countdown' ? (countdownNum % 2 === 0 ? 'opacity-40' : 'opacity-100') : ''
              const listenScale = phase === 'listen' && isActive ? 'scale-110' : ''
              const playInteractive = phase === 'play' ? 'hover:scale-105 active:scale-95' : ''

              if (phase === 'play') {
                return (
                  <button
                    key={i}
                    onClick={() => handleButtonClick(i)}
                    className={`aspect-square rounded-xl transition-all transform ${baseColor} ${playInteractive}`}
                  />
                )
              }
              return (
                <div
                  key={i}
                  className={`aspect-square rounded-xl transition-all ${baseColor} ${countdownPulse} ${listenScale}`}
                />
              )
            })}
          </div>

          {/* Progress dots - always reserve space */}
          <div className="flex justify-center gap-2 mt-6 h-4">
            {phase === 'play' && Array.from({ length: currentLevel }).map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full ${
                  i < userInput.length
                    ? userInput[i] === spec.sequence[i]
                      ? 'bg-green-500'
                      : 'bg-red-500'
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
          <p className="text-slate-300">Checking pattern...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
            <Music className="w-10 h-10 text-indigo-400" />
          </div>
          <h3 className={`text-2xl font-bold mb-4 ${result.correct && result.correct >= (result.total || 0) ? 'text-green-400' : 'text-yellow-400'}`}>
            {result.correct && result.correct >= (result.total || 0) ? 'Perfect Pattern!' : `Level ${(result.correct || 0) + 1} reached!`}
          </h3>
          <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto mb-6">
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-3xl font-bold text-white">{result.score?.toLocaleString()}</div>
              <div className="text-sm text-slate-400">Score</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-3xl font-bold text-white">#{result.rank}</div>
              <div className="text-sm text-slate-400">Rank</div>
            </div>
            {(result.correct ?? 0) > 0 && (
              <div className="bg-slate-700 rounded-lg p-4 col-span-2">
                <div className="text-xl font-bold text-green-400">{result.correct} {result.correct === 1 ? 'level' : 'levels'}</div>
                <div className="text-sm text-slate-400">Completed</div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
            <button
              onClick={startGame}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg transition"
            >
              Play Again
            </button>
            <Link href="/" className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 px-8 rounded-lg transition text-center">
              New Game
            </Link>
          </div>
          <ShareScore gameName="Audio Pattern" score={result.score || 0} rank={result.rank} />
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
            <Music className="w-10 h-10 text-indigo-400" />
          </div>
          <h3 className="text-2xl font-bold text-red-400 mb-4">No Score</h3>
          <p className="text-slate-300 mb-6">
            Complete at least a few correct taps to earn points. Listen carefully and try again!
          </p>
          <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
            <button
              onClick={startGame}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg transition"
            >
              Try Again
            </button>
            <Link href="/" className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 px-8 rounded-lg transition text-center">
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
