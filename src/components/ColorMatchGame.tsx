'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

import { Palette } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { ShareScore } from './ShareScore'
import { Spinner } from '@/components/Spinner'
import { CC } from '@/lib/currency'
import { GameThumbnail } from '@/components/GameThumbnail'
import { GameLoading } from '@/components/GameLoading'
import { useSound } from '@/hooks/useSound'

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
  groupSessionId?: string
}

// HSV to RGB conversion
function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = v - c
  let r = 0, g = 0, b = 0

  if (h < 60) { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  }
}

// Color Picker Component
function ColorPicker({ color, onChange }: {
  color: { r: number; g: number; b: number }
  onChange: (color: { r: number; g: number; b: number }) => void
}) {
  const [hue, setHue] = useState(0)
  const [saturation, setSaturation] = useState(0.5)
  const [brightness, setBrightness] = useState(1)
  const squareRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const isDraggingSquare = useRef(false)
  const isDraggingHue = useRef(false)

  // Update color when HSV changes
  useEffect(() => {
    onChange(hsvToRgb(hue, saturation, brightness))
  }, [hue, saturation, brightness, onChange])

  const handleSquareInteraction = useCallback((clientX: number, clientY: number) => {
    if (!squareRef.current) return
    const rect = squareRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    setSaturation(x)
    setBrightness(1 - y)
  }, [])

  const handleHueInteraction = useCallback((clientX: number) => {
    if (!hueRef.current) return
    const rect = hueRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    setHue(x * 360)
  }, [])

  // Mouse events for square
  const onSquareMouseDown = (e: React.MouseEvent) => {
    isDraggingSquare.current = true
    handleSquareInteraction(e.clientX, e.clientY)
  }

  // Mouse events for hue
  const onHueMouseDown = (e: React.MouseEvent) => {
    isDraggingHue.current = true
    handleHueInteraction(e.clientX)
  }

  // Touch events for square
  const onSquareTouchStart = (e: React.TouchEvent) => {
    isDraggingSquare.current = true
    const touch = e.touches[0]
    handleSquareInteraction(touch.clientX, touch.clientY)
  }

  const onSquareTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingSquare.current) return
    const touch = e.touches[0]
    handleSquareInteraction(touch.clientX, touch.clientY)
  }

  // Touch events for hue
  const onHueTouchStart = (e: React.TouchEvent) => {
    isDraggingHue.current = true
    const touch = e.touches[0]
    handleHueInteraction(touch.clientX)
  }

  const onHueTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingHue.current) return
    const touch = e.touches[0]
    handleHueInteraction(touch.clientX)
  }

  // Global mouse move/up
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingSquare.current) {
        handleSquareInteraction(e.clientX, e.clientY)
      }
      if (isDraggingHue.current) {
        handleHueInteraction(e.clientX)
      }
    }
    const onMouseUp = () => {
      isDraggingSquare.current = false
      isDraggingHue.current = false
    }
    const onTouchEnd = () => {
      isDraggingSquare.current = false
      isDraggingHue.current = false
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('touchend', onTouchEnd)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [handleSquareInteraction, handleHueInteraction])

  const pureHueColor = hsvToRgb(hue, 1, 1)

  return (
    <div className="space-y-4">
      {/* Saturation/Brightness Square */}
      <div
        ref={squareRef}
        className="w-full h-48 rounded-lg cursor-crosshair relative touch-none select-none"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, rgb(${pureHueColor.r}, ${pureHueColor.g}, ${pureHueColor.b}))`
        }}
        onMouseDown={onSquareMouseDown}
        onTouchStart={onSquareTouchStart}
        onTouchMove={onSquareTouchMove}
      >
        {/* Picker indicator */}
        <div
          className="absolute w-5 h-5 border-2 border-white rounded-full shadow-lg pointer-events-none"
          style={{
            left: `calc(${saturation * 100}% - 10px)`,
            top: `calc(${(1 - brightness) * 100}% - 10px)`,
            backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})`
          }}
        />
      </div>

      {/* Hue Bar */}
      <div
        ref={hueRef}
        className="w-full h-8 rounded-lg cursor-pointer relative touch-none select-none"
        style={{
          background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)'
        }}
        onMouseDown={onHueMouseDown}
        onTouchStart={onHueTouchStart}
        onTouchMove={onHueTouchMove}
      >
        {/* Hue indicator */}
        <div
          className="absolute top-0 w-2 h-full bg-white rounded shadow-lg pointer-events-none"
          style={{ left: `calc(${(hue / 360) * 100}% - 4px)` }}
        />
      </div>
    </div>
  )
}

export function ColorMatchGame({ onGameComplete, groupSessionId }: ColorMatchGameProps) {
  const { play } = useSound()
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [currentRound, setCurrentRound] = useState(0)
  const [userColor, setUserColor] = useState({ r: 128, g: 128, b: 128 })
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
        body: JSON.stringify({ gameType: 'color_match', ...(groupSessionId && { groupSessionId }) }),
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
    if (!turnToken || !spec || submitting) return
    play('drop')
    setSubmitting(true)

    try {
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
        play('success')
        completeGame()
      } else {
        setCurrentRound(currentRound + 1)
        setUserColor({ r: 128, g: 128, b: 128 })
        setSubmitting(false)
      }
    } catch {
      setSubmitting(false)
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
    <div className="bg-slate-800 rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        {phase === 'play' && spec && (
          <div className="flex items-center gap-4">
            <span className="text-slate-400 text-sm">
              Round {currentRound + 1}/{spec.targetColors.length}
            </span>
            <span className={`text-2xl font-mono ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
              {formatTime(timeLeft)}
            </span>
          </div>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center pb-6">
          <div className="mb-4 max-w-sm mx-auto"><GameThumbnail gameId="color_match" isPlayable={true} /></div>
          <p className="text-slate-300 mb-6">
            Drag on the color picker to match the target color. Get as close as you can!
          </p>
          <button
            onClick={startGame}
            className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg text-lg transition"
          >
            Start (1 <CC />Credit)
          </button>
        </div>
      )}

      {phase === 'loading' && <GameLoading gameId="color_match" message="Preparing game..." />}

      {phase === 'play' && targetColor && (
        <div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="text-center">
              <p className="text-slate-400 text-xs mb-1">Target</p>
              <div
                className="w-full h-16 rounded-lg border-2 border-slate-600"
                style={{ backgroundColor: `rgb(${targetColor.r}, ${targetColor.g}, ${targetColor.b})` }}
              />
            </div>
            <div className="text-center">
              <p className="text-slate-400 text-xs mb-1">Yours</p>
              <div
                className="w-full h-16 rounded-lg border-2 border-slate-600"
                style={{ backgroundColor: `rgb(${userColor.r}, ${userColor.g}, ${userColor.b})` }}
              />
            </div>
          </div>

          <div className="mb-4">
            <ColorPicker color={userColor} onChange={setUserColor} />
          </div>

          <button
            onClick={submitColor}
            disabled={submitting}
            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-green-600/50 text-white font-bold py-3 px-6 rounded-lg transition flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Spinner size="sm" />
                Sending...
              </>
            ) : currentRound + 1 >= (spec?.targetColors.length ?? 0) ? (
              'Submit Final Color'
            ) : (
              `Submit & Next (${currentRound + 1}/${spec?.targetColors.length})`
            )}
          </button>
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="mx-auto mb-4"><Spinner /></div>
          <p className="text-slate-300">Calculating accuracy...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/20 flex items-center justify-center">
            <Palette className="w-10 h-10 text-red-500" />
          </div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">Great Eye!</h3>
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
              <div className="text-base font-bold text-white">{Math.round((result.averageAccuracy || 0) * 100)}%</div>
              <div className="text-[10px] text-slate-400">Accuracy</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            <button
              onClick={startGame}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition"
            >
              Play Again
            </button>
            <ShareScore gameName="Color Match" score={result.score || 0} rank={result.rank} inline />
          </div>
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/20 flex items-center justify-center">
            <Palette className="w-10 h-10 text-red-500" />
          </div>
          <h3 className="text-2xl font-bold text-red-400 mb-4">Failed!</h3>
          <p className="text-slate-300 mb-6">
            {result?.reason === 'low_accuracy'
              ? `Accuracy too low: ${Math.round((result.averageAccuracy || 0) * 100)}%`
              : 'Better luck next time!'}
          </p>
          <div className="max-w-xs mx-auto">
            <button
              onClick={startGame}
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition"
            >
              Try Again
            </button>
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
