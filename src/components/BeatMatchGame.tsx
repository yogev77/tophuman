'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

import { Drum } from 'lucide-react'
import { ShareScore } from './ShareScore'
import { Spinner } from '@/components/Spinner'
import { GameLoading } from '@/components/GameLoading'
import { CC } from '@/lib/currency'
import { GameThumbnail } from '@/components/GameThumbnail'
import { useSound } from '@/hooks/useSound'

type GamePhase = 'idle' | 'loading' | 'countdown' | 'listen' | 'play' | 'between' | 'checking' | 'completed' | 'failed'

interface RoundSpec {
  beats: number[]
  intervals: number[]
}

interface TurnSpec {
  rounds: RoundSpec[]
  toneCount: number
  frequencies: number[]
  timeLimitMs: number
}

interface GameResult {
  valid: boolean
  correct?: number
  total?: number
  score?: number
  rank?: number
  reason?: string
}

interface BeatMatchGameProps {
  onGameComplete?: (result: GameResult) => void
  groupSessionId?: string
}

const PAD_COLORS = [
  { base: 'bg-white/90 dark:bg-slate-700', active: 'bg-green-400', ring: 'ring-green-400', glow: '0 0 20px rgba(74,222,128,0.6)', dot: 'bg-green-400' },
  { base: 'bg-white/90 dark:bg-slate-700', active: 'bg-cyan-400', ring: 'ring-cyan-400', glow: '0 0 20px rgba(34,211,238,0.6)', dot: 'bg-cyan-400' },
  { base: 'bg-white/90 dark:bg-slate-700', active: 'bg-amber-400', ring: 'ring-amber-400', glow: '0 0 20px rgba(251,191,36,0.6)', dot: 'bg-amber-400' },
  { base: 'bg-white/90 dark:bg-slate-700', active: 'bg-pink-400', ring: 'ring-pink-400', glow: '0 0 20px rgba(244,114,182,0.6)', dot: 'bg-pink-400' },
]

export function BeatMatchGame({ onGameComplete, groupSessionId }: BeatMatchGameProps) {
  const { enabled: soundEnabled } = useSound()
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentRound, setCurrentRound] = useState(0)
  const [activePad, setActivePad] = useState<number | null>(null)
  const [playingBeatIndex, setPlayingBeatIndex] = useState(-1)
  const [userTapCount, setUserTapCount] = useState(0)
  const [timeLeft, setTimeLeft] = useState(30000)
  const [countdownNum, setCountdownNum] = useState(3)
  const [roundResult, setRoundResult] = useState<{ correct: number; total: number } | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const gameStartTimeRef = useRef<number>(0)
  const completingRef = useRef(false)
  const turnTokenRef = useRef<string | null>(null)

  // Unlock AudioContext — must be called synchronously during a user gesture
  const unlockAudio = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    } else if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume()
    }
  }, [])

  const playTone = useCallback((frequency: number, duration: number) => {
    if (!soundEnabled) return
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume()
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
  }, [soundEnabled])

  const runCountdown = useCallback(async () => {
    setPhase('countdown')
    for (let i = 3; i >= 1; i--) {
      setCountdownNum(i)
      await new Promise(resolve => setTimeout(resolve, 700))
    }
  }, [])

  const playBeatPattern = useCallback(async (round: RoundSpec, frequencies: number[]) => {
    for (let i = 0; i < round.beats.length; i++) {
      const toneIdx = round.beats[i]
      setPlayingBeatIndex(i)
      setActivePad(toneIdx)
      playTone(frequencies[toneIdx], 250)
      await new Promise(resolve => setTimeout(resolve, 300))
      setActivePad(null)

      // Wait for the interval before next beat (except after last)
      if (i < round.intervals.length) {
        await new Promise(resolve => setTimeout(resolve, round.intervals[i] - 300))
      }
    }
    setPlayingBeatIndex(-1)
  }, [playTone])

  const completeGame = useCallback(async () => {
    const token = turnTokenRef.current
    if (!token || completingRef.current) return
    completingRef.current = true

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    setPhase('checking')

    try {
      const completeRes = await fetch('/api/game/turn/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: token }),
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
  }, [onGameComplete])

  const startGame = useCallback(async () => {
    // Init AudioContext synchronously during user tap — mobile requires this
    unlockAudio()

    setPhase('loading')
    setError(null)
    setResult(null)
    setCurrentRound(0)
    setUserTapCount(0)
    setTimeLeft(30000)
    setRoundResult(null)
    completingRef.current = false

    if (timerRef.current) clearInterval(timerRef.current)

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'beat_match', ...(groupSessionId && { groupSessionId }) }),
      })
      if (!createRes.ok) {
        const data = await createRes.json()
        throw new Error(data.error || 'Failed to create turn')
      }
      const turnData = await createRes.json()

      setTurnToken(turnData.turnToken)
      turnTokenRef.current = turnData.turnToken
      setSpec(turnData.spec)

      const startRes = await fetch('/api/game/turn/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: turnData.turnToken }),
      })

      if (!startRes.ok) {
        throw new Error('Failed to start turn')
      }

      // Countdown
      await runCountdown()

      gameStartTimeRef.current = Date.now()

      // Start 30s timer
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - gameStartTimeRef.current
        const remaining = 30000 - elapsed
        setTimeLeft(Math.max(0, remaining))

        if (remaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current)
          completeGame()
        }
      }, 100)

      // Send round_start event
      await fetch('/api/game/turn/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnToken: turnData.turnToken,
          eventType: 'round_start',
          roundIndex: 0,
          clientTimestampMs: Date.now(),
        }),
      })

      // Play the first round pattern
      setPhase('listen')
      await playBeatPattern(turnData.spec.rounds[0], turnData.spec.frequencies)

      setPhase('play')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('idle')
    }
  }, [unlockAudio, runCountdown, playBeatPattern, completeGame, groupSessionId])

  const handlePadTap = async (toneIndex: number) => {
    if (phase !== 'play' || !turnToken || !spec) return

    const round = spec.rounds[currentRound]
    if (!round) return

    playTone(spec.frequencies[toneIndex], 200)
    setActivePad(toneIndex)
    setTimeout(() => setActivePad(null), 150)

    const tapIdx = userTapCount
    const newCount = tapIdx + 1
    setUserTapCount(newCount)

    // Send tap event
    await fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken,
        eventType: 'tap',
        roundIndex: currentRound,
        tapIndex: tapIdx,
        toneIndex,
        clientTimestampMs: Date.now(),
      }),
    })

    // Check if this round is done
    if (newCount >= round.beats.length) {
      // Count correct taps for this round
      // We don't have the full tap list here, but we can track locally
      // Move to next round or finish
      if (currentRound < spec.rounds.length - 1) {
        // Show brief "between rounds" state
        setPhase('between')
        setRoundResult({ correct: newCount, total: round.beats.length })

        await new Promise(resolve => setTimeout(resolve, 1500))

        const nextRound = currentRound + 1
        setCurrentRound(nextRound)
        setUserTapCount(0)
        setRoundResult(null)

        // Send round_start for next round
        await fetch('/api/game/turn/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            turnToken,
            eventType: 'round_start',
            roundIndex: nextRound,
            clientTimestampMs: Date.now(),
          }),
        })

        setPhase('listen')
        await playBeatPattern(spec.rounds[nextRound], spec.frequencies)
        setPhase('play')
      } else {
        // All rounds done
        completeGame()
      }
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

  const roundLabel = currentRound === 0 ? 'Simple' : 'Advanced'
  const currentBeats = spec?.rounds[currentRound]?.beats.length ?? 0

  return (
    <div className="bg-slate-800 rounded-xl p-4 sm:p-6">
      {(phase === 'countdown' || phase === 'listen' || phase === 'play' || phase === 'between') && spec && (
        <div className="flex items-center justify-between mb-6">
          <span className="text-slate-400 text-sm">{roundLabel} — {currentBeats} beats</span>
          <span className={`text-2xl font-mono ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
            {Math.ceil(timeLeft / 1000)}s
          </span>
        </div>
      )}

      {phase === 'idle' && (
        <div className="text-center pb-6">
          <div className="mb-4 max-w-sm mx-auto"><GameThumbnail gameId="beat_match" isPlayable={true} /></div>
          <p className="text-slate-300 mb-6 max-w-xs mx-auto">
            Listen to the beat pattern, then tap it back in rhythm. Match the tones and the timing!
          </p>
          {!soundEnabled && (
            <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm">
              Sounds are off. Enable sounds in Settings to play this game.
            </div>
          )}
          <button
            onClick={startGame}
            disabled={!soundEnabled}
            className="bg-yellow-500 hover:bg-yellow-400 disabled:bg-yellow-500/30 disabled:text-slate-900/50 text-slate-900 font-bold py-3 px-8 rounded-lg text-lg transition"
          >
            Start (1 <CC />Credit)
          </button>
        </div>
      )}

      {phase === 'loading' && <GameLoading gameId="beat_match" message="Preparing game..." />}

      {(phase === 'countdown' || phase === 'listen' || phase === 'play' || phase === 'between') && spec && (
        <div className="text-center pt-2 pb-4">
          {/* Tone pads — primary focus, placed first */}
          <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto px-4">
            {Array.from({ length: spec.toneCount }).map((_, i) => {
              const color = PAD_COLORS[i]
              const isActive = activePad === i
              const isPlayable = phase === 'play'

              if (isPlayable) {
                return (
                  <button
                    key={i}
                    onPointerDown={() => handlePadTap(i)}
                    className={`relative aspect-square rounded-2xl transition-all duration-100 transform border-2 ${
                      isActive
                        ? `${color.active} scale-95 ring-4 ${color.ring} border-transparent`
                        : `${color.base} border-slate-300 dark:border-slate-600 hover:scale-105 active:scale-95`
                    }`}
                    style={isActive ? { boxShadow: color.glow } : undefined}
                  >
                    <span className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${isActive ? 'bg-white/60' : color.dot}`} />
                  </button>
                )
              }
              return (
                <div
                  key={i}
                  className={`relative aspect-square rounded-2xl transition-all duration-100 border-2 ${
                    isActive
                      ? `${color.active} scale-110 ring-4 ${color.ring} border-transparent`
                      : `${color.base} border-slate-300 dark:border-slate-600 ${phase === 'countdown' ? 'opacity-50' : ''}`
                  }`}
                  style={isActive ? { boxShadow: color.glow } : undefined}
                >
                  <span className={`absolute bottom-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${isActive ? 'bg-white/60' : color.dot}`} />
                </div>
              )
            })}
          </div>

          {/* Beat progress indicators */}
          <div className="flex justify-center gap-2 mt-5 h-4">
            {phase === 'listen' && Array.from({ length: currentBeats }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-all ${
                  i <= playingBeatIndex ? PAD_COLORS[spec.rounds[currentRound].beats[i]].dot : 'bg-slate-600'
                }`}
              />
            ))}
            {phase === 'play' && Array.from({ length: currentBeats }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-all ${
                  i < userTapCount ? 'bg-white' : 'bg-slate-600'
                }`}
              />
            ))}
          </div>

          {/* Status label — fixed line so layout never shifts */}
          <div className="mt-3 h-7 flex items-center justify-center">
            {phase === 'countdown' && (
              <span className="text-white font-bold text-lg animate-pulse">{countdownNum}</span>
            )}
            {phase === 'listen' && (
              <span className="text-slate-400 text-lg">Listen to the pattern...</span>
            )}
            {phase === 'play' && (
              <span className="text-green-400 text-lg">Your turn! Tap the beats</span>
            )}
            {phase === 'between' && (
              <span className="text-yellow-400 text-lg">Next round...</span>
            )}
          </div>

          {/* Round indicator */}
          <div className="flex justify-center gap-2 mt-3">
            {spec.rounds.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${
                  i < currentRound ? 'bg-green-500' : i === currentRound ? 'bg-yellow-400' : 'bg-slate-600'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="mx-auto mb-4"><Spinner /></div>
          <p className="text-slate-300">Checking your rhythm...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-green-500/20 flex items-center justify-center">
            <Drum className="w-10 h-10 text-green-500" />
          </div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">
            {result.correct === result.total ? 'Perfect Rhythm!' : 'Nice Beat!'}
          </h3>
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
            <div className="border-t border-slate-600/50 text-center py-3">
              <div className="text-base font-bold text-white">{result.correct}/{result.total} beats</div>
              <div className="text-[10px] text-slate-400">Accuracy</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            <button onClick={startGame} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition">Play Again</button>
            <ShareScore gameName="Beat Match" score={result.score || 0} rank={result.rank} inline />
          </div>
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-green-500/20 flex items-center justify-center">
            <Drum className="w-10 h-10 text-green-500" />
          </div>
          <h3 className="text-2xl font-bold text-red-400 mb-4">No Score</h3>
          <p className="text-slate-300 mb-6">
            Listen carefully to the pattern and tap the beats in order. Try again!
          </p>
          <div className="max-w-xs mx-auto">
            <button onClick={startGame} className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition">Try Again</button>
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
