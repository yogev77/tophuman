'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { formatTime } from '@/lib/utils'

type GamePhase = 'idle' | 'loading' | 'play' | 'checking' | 'completed' | 'failed'

interface TurnSpec {
  targetColors: { r: number; g: number; b: number }[]
  timeLimitMs: number
}

interface GameResult {
  valid: boolean
  roundScores?: number[]
  averageAccuracy?: number
  score?: number
  rank?: number
  reason?: string
}

interface ColorMatchGameProps {
  onGameComplete?: (result: GameResult) => void
}

export function ColorMatchGame({ onGameComplete }: ColorMatchGameProps) {
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [currentRound, setCurrentRound] = useState(0)
  const [userColor, setUserColor] = useState({ r: 128, g: 128, b: 128 })
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setCurrentRound(0)
    setUserColor({ r: 128, g: 128, b: 128 })
    setResult(null)

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'color_match' }),
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

  const submitColor = async () => {
    if (!turnToken || !spec) return

    // Send color submission
    await fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken,
        eventType: 'submit_color',
        round: currentRound,
        r: userColor.r,
        g: userColor.g,
        b: userColor.b,
        clientTimestampMs: Date.now(),
      }),
    })

    // Move to next round or complete
    if (currentRound + 1 >= spec.targetColors.length) {
      completeGame()
    } else {
      setCurrentRound(currentRound + 1)
      setUserColor({ r: 128, g: 128, b: 128 })
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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const targetColor = spec?.targetColors[currentRound]

  return (
    <div className="bg-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Color Match</h2>
        {phase === 'play' && spec && (
          <div className="flex items-center gap-4">
            <span className="text-slate-400">
              Round {currentRound + 1} / {spec.targetColors.length}
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
            Match the target color using RGB sliders. Get as close as you can!
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

      {phase === 'play' && targetColor && (
        <div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="text-center">
              <p className="text-slate-400 text-sm mb-2">Target Color</p>
              <div
                className="w-full h-32 rounded-lg border-4 border-slate-600"
                style={{ backgroundColor: `rgb(${targetColor.r}, ${targetColor.g}, ${targetColor.b})` }}
              />
            </div>
            <div className="text-center">
              <p className="text-slate-400 text-sm mb-2">Your Color</p>
              <div
                className="w-full h-32 rounded-lg border-4 border-slate-600"
                style={{ backgroundColor: `rgb(${userColor.r}, ${userColor.g}, ${userColor.b})` }}
              />
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <div className="flex justify-between text-sm text-slate-400 mb-1">
                <span>Red</span>
                <span>{userColor.r}</span>
              </div>
              <input
                type="range"
                min="0"
                max="255"
                value={userColor.r}
                onChange={(e) => setUserColor({ ...userColor, r: parseInt(e.target.value) })}
                className="w-full h-3 bg-gradient-to-r from-black via-red-500 to-red-500 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between text-sm text-slate-400 mb-1">
                <span>Green</span>
                <span>{userColor.g}</span>
              </div>
              <input
                type="range"
                min="0"
                max="255"
                value={userColor.g}
                onChange={(e) => setUserColor({ ...userColor, g: parseInt(e.target.value) })}
                className="w-full h-3 bg-gradient-to-r from-black via-green-500 to-green-500 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between text-sm text-slate-400 mb-1">
                <span>Blue</span>
                <span>{userColor.b}</span>
              </div>
              <input
                type="range"
                min="0"
                max="255"
                value={userColor.b}
                onChange={(e) => setUserColor({ ...userColor, b: parseInt(e.target.value) })}
                className="w-full h-3 bg-gradient-to-r from-black via-blue-500 to-blue-500 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>

          <button
            onClick={submitColor}
            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-6 rounded-lg transition"
          >
            Submit Color
          </button>
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="animate-spin w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-300">Calculating accuracy...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">🎨</div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">Great Eye!</h3>
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
              <div className="text-xl font-bold text-green-400">
                {Math.round((result.averageAccuracy || 0) * 100)}%
              </div>
              <div className="text-sm text-slate-400">Average Accuracy</div>
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
              ? `Accuracy too low: ${Math.round((result.averageAccuracy || 0) * 100)}%`
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
