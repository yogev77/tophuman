'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { GameThumbnail } from './GameThumbnail'
import { GameLoading } from '@/components/GameLoading'
import { ShareScore } from './ShareScore'
import { Volume2, VolumeX, Grid2X2 } from 'lucide-react'

import { CC } from '@/lib/currency'

interface RoundSpec {
  pattern: number[]
  previewMs: number
  inputTimeLimitMs: number | null
  tileCount: number
}

interface GameSpec {
  gridSize: number
  rounds: RoundSpec[]
  timeLimitSec: number
}

interface GameResult {
  valid: boolean
  score?: number
  rank?: number
  flag?: boolean
  details?: {
    avgAccuracy: number
    completedRounds: number
  }
  reason?: string
}

type Phase = 'idle' | 'loading' | 'countdown' | 'playing' | 'checking' | 'completed' | 'failed'
type RoundPhase = 'show' | 'input' | 'feedback'

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export function GridRecallGame({ onGameComplete, groupSessionId }: { onGameComplete?: () => void; groupSessionId?: string }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [roundPhase, setRoundPhase] = useState<RoundPhase>('show')
  const [countdown, setCountdown] = useState(3)
  const [spec, setSpec] = useState<GameSpec | null>(null)
  const [currentRound, setCurrentRound] = useState(0)
  const [selectedTiles, setSelectedTiles] = useState<Set<number>>(new Set())
  const [lastRoundAccuracy, setLastRoundAccuracy] = useState<number | null>(null)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState('')
  const [gameTimerSec, setGameTimerSec] = useState(30)
  const [soundEnabled, setSoundEnabled] = useState(true)

  const turnTokenRef = useRef<string | null>(null)
  const eventIndexRef = useRef(0)
  const prevHashRef = useRef('0')
  const roundInputStartRef = useRef(0)
  const pendingEventRef = useRef<Promise<unknown> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const inputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gameStartRef = useRef(0)
  const selectedTilesRef = useRef<Set<number>>(new Set())
  const submittingRef = useRef(false)
  const completingRef = useRef(false)
  const onGameCompleteRef = useRef(onGameComplete)
  const phaseRef = useRef<Phase>('idle')
  const roundPhaseRef = useRef<RoundPhase>('show')

  // Keep refs in sync
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { roundPhaseRef.current = roundPhase }, [roundPhase])
  useEffect(() => { onGameCompleteRef.current = onGameComplete }, [onGameComplete])

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume()
    }
    return audioCtxRef.current
  }, [])

  const playTone = useCallback((freq: number, duration: number) => {
    if (!soundEnabled) return
    try {
      const ctx = getAudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
      osc.start()
      osc.stop(ctx.currentTime + duration)
    } catch {}
  }, [soundEnabled, getAudioCtx])

  const sendEvent = useCallback(async (eventType: string, payload: Record<string, unknown>) => {
    const token = turnTokenRef.current
    if (!token) return
    const clientTimestampMs = Date.now()
    const prevHash = prevHashRef.current
    const hashInput = prevHash + eventType + JSON.stringify(payload) + clientTimestampMs
    const hash = await sha256(hashInput)
    prevHashRef.current = hash
    eventIndexRef.current++

    const promise = fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken: token,
        eventType,
        clientTimestampMs,
        ...payload,
      }),
    })

    pendingEventRef.current = promise
    return promise
  }, [])

  const completeGame = useCallback(async () => {
    const token = turnTokenRef.current
    if (!token || completingRef.current) return
    completingRef.current = true

    setPhase('checking')

    if (pendingEventRef.current) {
      await pendingEventRef.current
      pendingEventRef.current = null
    }

    try {
      const res = await fetch('/api/game/turn/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: token }),
      })

      const data = await res.json()
      setResult(data)
      setPhase(data.valid ? 'completed' : 'failed')

      onGameCompleteRef.current?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      setPhase('failed')
    }
  }, [])

  const doSubmitRound = useCallback(async (tiles: number[], roundIdx: number, specData: GameSpec) => {
    if (submittingRef.current) return
    if (phaseRef.current !== 'playing' || roundPhaseRef.current !== 'input') return
    submittingRef.current = true

    if (inputTimerRef.current) {
      clearTimeout(inputTimerRef.current)
      inputTimerRef.current = null
    }

    const round = specData.rounds[roundIdx]
    const inputTimeMs = Date.now() - roundInputStartRef.current

    // Local accuracy for feedback
    const patternSet = new Set(round.pattern)
    let correct = 0
    let wrong = 0
    for (const t of tiles) {
      if (patternSet.has(t)) correct++
      else wrong++
    }
    const rawAcc = round.pattern.length > 0 ? correct / round.pattern.length : 0
    const acc = Math.max(0, rawAcc - wrong * 0.1)

    await sendEvent('round_submit', {
      round: roundIdx,
      selectedTiles: tiles,
      inputTimeMs,
    })

    setLastRoundAccuracy(acc)
    setRoundPhase('feedback')

    if (acc >= 0.8) playTone(523.25, 0.15)
    else if (acc >= 0.4) playTone(349.23, 0.15)
    else playTone(220, 0.2)

    setTimeout(() => {
      submittingRef.current = false
      const nextRound = roundIdx + 1
      if (nextRound >= specData.rounds.length) {
        completeGame()
      } else {
        setCurrentRound(nextRound)
        setRoundPhase('show')
        setSelectedTiles(new Set())
        selectedTilesRef.current = new Set()
        setLastRoundAccuracy(null)
      }
    }, 600)
  }, [sendEvent, playTone, completeGame])

  // Start game
  const startGame = useCallback(async () => {
    // Init AudioContext synchronously during user tap — mobile requires this
    getAudioCtx()

    setPhase('loading')
    completingRef.current = false
    setResult(null)
    setError('')
    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'grid_recall', ...(groupSessionId ? { groupSessionId } : {}) }),
      })
      if (!createRes.ok) {
        const data = await createRes.json()
        setError(data.error || 'Failed to start game')
        setPhase('failed')
        return
      }
      const createData = await createRes.json()
      turnTokenRef.current = createData.turnToken
      setSpec(createData.spec)

      await fetch('/api/game/turn/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: createData.turnToken }),
      })

      setPhase('countdown')
      setCountdown(3)
    } catch {
      setError('Network error')
      setPhase('failed')
    }
  }, [groupSessionId])

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) {
      setPhase('playing')
      setCurrentRound(0)
      setRoundPhase('show')
      gameStartRef.current = Date.now()
      setGameTimerSec(30)
      return
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 700)
    return () => clearTimeout(timer)
  }, [phase, countdown])

  // Game timer
  useEffect(() => {
    if (phase !== 'playing') return
    const interval = setInterval(() => {
      const elapsed = (Date.now() - gameStartRef.current) / 1000
      const remaining = Math.max(0, 30 - elapsed)
      setGameTimerSec(Math.ceil(remaining))
      if (remaining <= 0) {
        completeGame()
      }
    }, 200)
    return () => clearInterval(interval)
  }, [phase, completeGame])

  // Round show phase -> transition to input
  useEffect(() => {
    if (phase !== 'playing' || roundPhase !== 'show' || !spec) return
    const round = spec.rounds[currentRound]
    if (!round) return

    const timer = setTimeout(() => {
      setRoundPhase('input')
      setSelectedTiles(new Set())
      selectedTilesRef.current = new Set()
      roundInputStartRef.current = Date.now()
      submittingRef.current = false

      if (round.inputTimeLimitMs) {
        inputTimerRef.current = setTimeout(() => {
          const tiles = Array.from(selectedTilesRef.current)
          doSubmitRound(tiles, currentRound, spec)
        }, round.inputTimeLimitMs)
      }
    }, round.previewMs)

    return () => clearTimeout(timer)
  }, [phase, roundPhase, currentRound, spec, doSubmitRound])

  // Handle tile tap — also accepts taps during 'show' phase to let players skip ahead
  const handleTap = useCallback((tileIndex: number) => {
    if (phaseRef.current !== 'playing' || !spec || submittingRef.current) return
    if (roundPhaseRef.current !== 'show' && roundPhaseRef.current !== 'input') return

    // If tapped during show phase, immediately switch to input
    if (roundPhaseRef.current === 'show') {
      roundPhaseRef.current = 'input'
      setRoundPhase('input')
      setSelectedTiles(new Set())
      selectedTilesRef.current = new Set()
      roundInputStartRef.current = Date.now()

      const round = spec.rounds[currentRound]
      if (round?.inputTimeLimitMs) {
        inputTimerRef.current = setTimeout(() => {
          const tiles = Array.from(selectedTilesRef.current)
          doSubmitRound(tiles, currentRound, spec)
        }, round.inputTimeLimitMs)
      }
    }

    const round = spec.rounds[currentRound]
    playTone(440, 0.06)

    const next = new Set(selectedTilesRef.current)
    if (next.has(tileIndex)) {
      next.delete(tileIndex)
      sendEvent('tile_deselect', { tileIndex, round: currentRound })
    } else {
      next.add(tileIndex)
      sendEvent('tile_tap', { tileIndex, round: currentRound })
    }

    selectedTilesRef.current = next
    setSelectedTiles(new Set(next))

    // Auto-submit when correct count reached
    if (next.size === round.tileCount) {
      setTimeout(() => {
        const tiles = Array.from(selectedTilesRef.current)
        doSubmitRound(tiles, currentRound, spec)
      }, 200)
    }
  }, [spec, currentRound, sendEvent, playTone, doSubmitRound])

  const resetGame = () => {
    setPhase('idle')
    setResult(null)
    setError('')
    setCurrentRound(0)
    setSelectedTiles(new Set())
    selectedTilesRef.current = new Set()
    setLastRoundAccuracy(null)
    turnTokenRef.current = null
    setSpec(null)
    eventIndexRef.current = 0
    prevHashRef.current = '0'
    submittingRef.current = false
    completingRef.current = false
  }

  // Tile styling
  const getTileClass = (index: number): string => {
    if (!spec) return 'bg-slate-200 dark:bg-slate-700'
    const round = spec.rounds[currentRound]
    if (!round) return 'bg-slate-200 dark:bg-slate-700'

    const isInPattern = round.pattern.includes(index)
    const isSelected = selectedTiles.has(index)

    if (roundPhase === 'show') {
      return isInPattern
        ? 'bg-purple-500 shadow-lg shadow-purple-500/30 scale-[1.02]'
        : 'bg-slate-200 dark:bg-slate-700'
    }

    if (roundPhase === 'input') {
      return isSelected
        ? 'bg-purple-400 ring-2 ring-purple-300'
        : 'bg-slate-200 dark:bg-slate-700 active:bg-slate-300 dark:active:bg-slate-600'
    }

    if (roundPhase === 'feedback') {
      if (isSelected && isInPattern) return 'bg-green-500'
      if (isSelected && !isInPattern) return 'bg-red-500'
      if (!isSelected && isInPattern) return 'ring-2 ring-yellow-500 bg-yellow-500/20'
      return 'bg-slate-200 dark:bg-slate-700'
    }

    return 'bg-slate-200 dark:bg-slate-700'
  }

  const gridSize = spec?.gridSize ?? 5
  const totalCells = gridSize * gridSize

  // --- RENDER ---

  const round = phase === 'playing' ? spec?.rounds[currentRound] : null

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-6 select-none">
      {phase === 'idle' && (
        <div className="text-center">
          <div className="pb-6">
            <GameThumbnail gameId="grid_recall" isPlayable={true} />
          </div>
          <div className="max-w-sm mx-auto">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Grid Recall</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">Memorize the pattern, then tap it back.</p>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">6 rounds — gets harder each round.</p>
            <button
              onClick={startGame}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg text-lg transition"
            >
              Start (1 <CC />Credit)
            </button>
          </div>
        </div>
      )}

      {phase === 'loading' && <GameLoading gameId="grid_recall" message="Preparing grid..." />}

      {phase === 'countdown' && (
        <div className="flex items-center justify-center py-20">
          <div className="text-6xl font-bold text-yellow-500 font-title animate-pulse">
            {countdown || 'GO!'}
          </div>
        </div>
      )}

      {phase === 'completed' && result && (() => {
        const avgAccuracy = result.details?.avgAccuracy ?? 0
        return (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-purple-500/20 flex items-center justify-center">
              <Grid2X2 className="w-10 h-10 text-purple-500" />
            </div>
            <h3 className="text-2xl font-bold text-green-500 dark:text-green-400 mb-4">
              {avgAccuracy >= 0.9 ? 'Perfect Memory!' : avgAccuracy >= 0.7 ? 'Great Recall!' : 'Nice Try!'}
            </h3>
            <div className="bg-slate-100 dark:bg-slate-900/50 rounded-lg max-w-xs mx-auto mb-6">
              <div className="grid grid-cols-2 text-center divide-x divide-slate-200 dark:divide-slate-600/50">
                <div className="py-4 px-2">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">{result.score?.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Score</div>
                </div>
                <div className="py-4 px-2">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">#{result.rank}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Rank</div>
                </div>
              </div>
              <div className="py-3 px-2 text-center border-t border-slate-200 dark:border-slate-600/50">
                <div className="text-base font-bold text-slate-900 dark:text-white">{Math.round(avgAccuracy * 100)}%</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Accuracy</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
              <button onClick={startGame} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition">Play Again</button>
              <ShareScore gameName="Grid Recall" score={result.score || 0} rank={result.rank} inline />
            </div>
          </div>
        )
      })()}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-purple-500/20 flex items-center justify-center">
            <Grid2X2 className="w-10 h-10 text-purple-500" />
          </div>
          <h3 className="text-2xl font-bold text-red-500 dark:text-red-400 mb-4">
            {error || 'No Score'}
          </h3>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            Memorize the highlighted tiles and tap them back. Try again!
          </p>
          <div className="max-w-xs mx-auto">
            <button onClick={startGame} className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition">Try Again</button>
          </div>
        </div>
      )}

      {phase === 'checking' && (
        <div className="flex items-center justify-center py-20">
          <div className="text-slate-400 animate-pulse">Calculating score...</div>
        </div>
      )}

      {phase === 'playing' && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Round <span className="font-bold text-slate-900 dark:text-white">{currentRound + 1}</span> / {spec?.rounds.length}
            </div>
            <div className="flex items-center gap-3">
              {roundPhase === 'input' && round?.inputTimeLimitMs && (
                <span className="text-xs text-yellow-500 font-medium">Timed</span>
              )}
              <span className={`text-sm font-bold tabular-nums ${gameTimerSec <= 5 ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
                {gameTimerSec}s
              </span>
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 transition"
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-slate-500" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
              </button>
            </div>
          </div>

          {/* Phase label */}
          <div className="text-center mb-4 h-5">
            {roundPhase === 'show' && (
              <span className="text-sm font-medium text-purple-500">Memorize</span>
            )}
            {roundPhase === 'input' && (
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Tap {round?.tileCount} tiles · <span className="font-bold text-slate-900 dark:text-white">{selectedTiles.size}</span> / {round?.tileCount}
              </span>
            )}
            {roundPhase === 'feedback' && lastRoundAccuracy !== null && (
              <span className={`text-sm font-bold ${lastRoundAccuracy >= 0.8 ? 'text-green-500' : lastRoundAccuracy >= 0.4 ? 'text-yellow-500' : 'text-red-500'}`}>
                {lastRoundAccuracy >= 1 ? 'Perfect!' : lastRoundAccuracy >= 0.8 ? 'Great!' : lastRoundAccuracy >= 0.4 ? 'Close!' : 'Missed!'}
              </span>
            )}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-5 gap-1.5 max-w-[280px] mx-auto">
            {Array.from({ length: totalCells }, (_, i) => (
              <button
                key={i}
                className={`aspect-square rounded-lg transition-all duration-150 ${getTileClass(i)}`}
                onPointerDown={(roundPhase === 'show' || roundPhase === 'input') ? () => handleTap(i) : undefined}
              />
            ))}
          </div>

          {/* Round progress dots */}
          <div className="flex items-center justify-center gap-1.5 mt-6">
            {spec?.rounds.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i < currentRound ? 'bg-green-500' :
                  i === currentRound ? 'bg-purple-500' :
                  'bg-slate-300 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
