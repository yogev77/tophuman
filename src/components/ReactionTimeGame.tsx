'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

import { Zap } from 'lucide-react'
import { ShareScore } from './ShareScore'
import { Spinner } from '@/components/Spinner'
import { GameLoading } from '@/components/GameLoading'
import { CC } from '@/lib/currency'
import { GameThumbnail } from '@/components/GameThumbnail'
import { useSound } from '@/hooks/useSound'

type GamePhase = 'idle' | 'loading' | 'waiting' | 'signal' | 'feedback' | 'checking' | 'completed' | 'failed'

interface RoundSpec {
  delay: number
  shouldTap: boolean
  color: string
}

interface TurnSpec {
  rounds: RoundSpec[]
  maxReactionMs: number
  timeLimitMs: number
  numRounds: number
}

interface RoundResult {
  shouldTap: boolean
  tapped: boolean
  reactionMs?: number
  correct: boolean
}

interface GameResult {
  valid: boolean
  reactionTimes?: number[]
  averageReactionMs?: number
  score?: number
  rank?: number
  correctTaps?: number
  correctSkips?: number
  wrongTaps?: number
  missedTaps?: number
  reason?: string
}

interface ReactionTimeGameProps {
  onGameComplete?: (result: GameResult) => void
  groupSessionId?: string
}

export function ReactionTimeGame({ onGameComplete, groupSessionId }: ReactionTimeGameProps) {
  const { play } = useSound()
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [currentRound, setCurrentRound] = useState(0)
  const [roundResults, setRoundResults] = useState<RoundResult[]>([])
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentColor, setCurrentColor] = useState('#64748b')
  const [currentShouldTap, setCurrentShouldTap] = useState(true)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackColor, setFeedbackColor] = useState('')

  const signalTimeRef = useRef<number>(0)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const eventQueueRef = useRef<{ event: object; sent: boolean }[]>([])
  const phaseRef = useRef<GamePhase>('idle')

  // Background event sender
  const sendQueuedEvents = useCallback(async () => {
    if (!turnToken) return

    for (const item of eventQueueRef.current) {
      if (item.sent) continue
      try {
        await fetch('/api/game/turn/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ turnToken, ...item.event }),
        })
        item.sent = true
      } catch (err) {
        console.error('Failed to send event:', err)
      }
    }
  }, [turnToken])

  const queueEvent = useCallback((event: object) => {
    eventQueueRef.current.push({ event, sent: false })
    // Fire and forget - don't await
    sendQueuedEvents()
  }, [sendQueuedEvents])

  const startGame = useCallback(async () => {
    setPhase('loading')
    phaseRef.current = 'loading'
    setError(null)
    setCurrentRound(0)
    setRoundResults([])
    setResult(null)
    setCurrentColor('#64748b')
    eventQueueRef.current = []

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'reaction_time', ...(groupSessionId && { groupSessionId }) }),
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
      startRound(turnData.spec, 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('idle')
      phaseRef.current = 'idle'
    }
  }, [])

  const startRound = (gameSpec: TurnSpec, round: number) => {
    setPhase('waiting')
    phaseRef.current = 'waiting'
    setCurrentColor('#64748b') // Slate waiting color

    const roundSpec = gameSpec.rounds[round]

    // Schedule signal after delay
    timeoutRef.current = setTimeout(() => {
      showSignal(gameSpec, round, roundSpec)
    }, roundSpec.delay)
  }

  const showSignal = (gameSpec: TurnSpec, round: number, roundSpec: RoundSpec) => {
    signalTimeRef.current = Date.now()
    play('tick')
    setCurrentColor(roundSpec.color)
    setCurrentShouldTap(roundSpec.shouldTap)
    setPhase('signal')
    phaseRef.current = 'signal'

    // Queue signal event
    queueEvent({
      eventType: 'signal_shown',
      round,
      clientTimestampMs: signalTimeRef.current,
    })

    // Auto-advance after 2-4 seconds if no tap (random duration per round)
    const autoAdvanceMs = 2000 + Math.random() * 2000
    timeoutRef.current = setTimeout(() => {
      if (phaseRef.current === 'signal') {
        handleRoundComplete(gameSpec, round, false)
      }
    }, autoAdvanceMs)
  }

  const handleTap = (e: React.MouseEvent | React.TouchEvent) => {
    // Prevent touch from also firing mouse event
    if (e.type === 'touchstart') e.preventDefault()
    if (phase === 'waiting') {
      // Tapped during wait - show brief error but continue
      setFeedbackText('Too early!')
      setFeedbackColor('text-red-400')
      setPhase('feedback')
      phaseRef.current = 'feedback'

      setTimeout(() => {
        if (spec) {
          startRound(spec, currentRound)
        }
      }, 500)
      return
    }

    if (phase !== 'signal' || !spec) return

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    handleRoundComplete(spec, currentRound, true)
  }

  const handleRoundComplete = (gameSpec: TurnSpec, round: number, tapped: boolean) => {
    const roundSpec = gameSpec.rounds[round]
    const reactionMs = tapped ? Date.now() - signalTimeRef.current : undefined

    // Determine if correct
    const correct = (roundSpec.shouldTap && tapped) || (!roundSpec.shouldTap && !tapped)
    play(correct ? 'hit' : 'miss')

    // Show feedback
    if (tapped) {
      if (roundSpec.shouldTap) {
        setFeedbackText(`${reactionMs}ms`)
        setFeedbackColor('text-green-400')
      } else {
        setFeedbackText('Wrong!')
        setFeedbackColor('text-red-400')
      }
    } else {
      if (roundSpec.shouldTap) {
        setFeedbackText('Missed!')
        setFeedbackColor('text-red-400')
      } else {
        setFeedbackText('Good!')
        setFeedbackColor('text-green-400')
      }
    }

    setPhase('feedback')
    phaseRef.current = 'feedback'

    // Record result
    const roundResult: RoundResult = {
      shouldTap: roundSpec.shouldTap,
      tapped,
      reactionMs,
      correct,
    }
    setRoundResults(prev => [...prev, roundResult])

    // Queue round complete event
    queueEvent({
      eventType: 'round_complete',
      round,
      tapped,
      clientTimestampMs: Date.now(),
    })

    // Next round or complete
    const nextRound = round + 1
    if (nextRound >= gameSpec.numRounds) {
      setTimeout(() => completeGame(), 600)
    } else {
      setTimeout(() => {
        setCurrentRound(nextRound)
        startRound(gameSpec, nextRound)
      }, 600)
    }
  }

  const completeGame = async () => {
    setPhase('checking')
    phaseRef.current = 'checking'
    setCurrentColor('#64748b')

    // Wait for events to flush
    await sendQueuedEvents()
    await new Promise(resolve => setTimeout(resolve, 200))

    try {
      const completeRes = await fetch('/api/game/turn/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken }),
      })

      const data = await completeRes.json()
      setResult(data)
      const finalPhase = data.valid ? 'completed' : 'failed'
      setPhase(finalPhase)
      phaseRef.current = finalPhase

      if (onGameComplete) {
        onGameComplete(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('failed')
      phaseRef.current = 'failed'
    }
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  // Calculate live stats
  const correctTaps = roundResults.filter(r => r.shouldTap && r.tapped).length
  const correctSkips = roundResults.filter(r => !r.shouldTap && !r.tapped).length
  const wrongTaps = roundResults.filter(r => !r.shouldTap && r.tapped).length
  const missedTaps = roundResults.filter(r => r.shouldTap && !r.tapped).length

  return (
    <div className="bg-slate-800 rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        {spec && (phase === 'waiting' || phase === 'signal' || phase === 'feedback') && (
          <div className="text-sm text-slate-400">
            Round {currentRound + 1} / {spec.numRounds}
          </div>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center pb-6">
          <div className="mb-4 max-w-sm mx-auto"><GameThumbnail gameId="reaction_time" isPlayable={true} /></div>
          <div className="max-w-sm mx-auto">
            <p className="text-slate-300 mb-4 sm:mb-6 px-2">
              Tap when you see <span className="text-green-400 font-bold">&quot;Tap!&quot;</span> but
              hold back when you see <span className="text-red-400 font-bold">&quot;Don&apos;t Tap!&quot;</span>
            </p>
            <button
              onClick={startGame}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg text-lg transition"
            >
              Start (1 <CC />Credit)
            </button>
          </div>
        </div>
      )}

      {phase === 'loading' && <GameLoading gameId="reaction_time" message="Preparing game..." />}

      {(phase === 'waiting' || phase === 'signal' || phase === 'feedback') && (
        <div className="text-center">
          <button
            onMouseDown={handleTap}
            onTouchStart={handleTap}
            disabled={phase === 'feedback'}
            className="w-full h-48 sm:h-64 rounded-xl text-3xl sm:text-4xl font-bold transition-all transform active:scale-95 disabled:transform-none select-none"
            style={{ backgroundColor: currentColor }}
          >
            {phase === 'waiting' && (
              <span className="text-white/80">Get Ready...</span>
            )}
            {phase === 'signal' && (
              <span className="text-white drop-shadow-lg">
                {currentShouldTap ? 'Tap!' : "Don't Tap!"}
              </span>
            )}
            {phase === 'feedback' && (
              <span className={feedbackColor + ' drop-shadow-lg'}>{feedbackText}</span>
            )}
          </button>

          {/* Live stats */}
          <div className="mt-4 flex justify-center gap-3 flex-wrap text-sm">
            <span className="px-3 py-1 bg-green-500/20 rounded text-green-400">
              {correctTaps + correctSkips} correct
            </span>
            {(wrongTaps > 0 || missedTaps > 0) && (
              <span className="px-3 py-1 bg-red-500/20 rounded text-red-400">
                {wrongTaps + missedTaps} wrong
              </span>
            )}
          </div>

          {/* Recent results */}
          {roundResults.length > 0 && (
            <div className="mt-3 flex justify-center gap-1.5 flex-wrap">
              {roundResults.slice(-8).map((r, i) => (
                <span
                  key={i}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    r.correct ? 'bg-green-500/30 text-green-400' : 'bg-red-500/30 text-red-400'
                  }`}
                >
                  {r.tapped ? (r.reactionMs ? Math.round(r.reactionMs / 10) : '!') : '-'}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="mx-auto mb-4"><Spinner /></div>
          <p className="text-slate-300">Calculating results...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-6 sm:py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-yellow-500/20 flex items-center justify-center">
            <Zap className="w-10 h-10 text-yellow-500" />
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-green-400 mb-4">Great Job!</h3>
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
            <div className="grid grid-cols-2 text-center divide-x divide-slate-200 dark:divide-slate-600/50 border-t border-slate-200 dark:border-slate-600/50">
              <div className="py-3 px-2">
                <div className="text-base font-bold text-white">{result.averageReactionMs}ms</div>
                <div className="text-[10px] text-slate-400">Avg Reaction</div>
              </div>
              <div className="py-3 px-2">
                <div className="text-base font-bold text-white">{(result.correctTaps || 0) + (result.correctSkips || 0)}/{spec?.numRounds}</div>
                <div className="text-[10px] text-slate-400">Accuracy</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            <button onClick={startGame} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition">Play Again</button>
            <ShareScore gameName="Reaction Tap" score={result.score || 0} rank={result.rank} inline />
          </div>
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-yellow-500/20 flex items-center justify-center">
            <Zap className="w-10 h-10 text-yellow-500" />
          </div>
          <h3 className="text-2xl font-bold text-red-400 mb-4">Game Over</h3>
          <p className="text-slate-300 mb-6">
            {result?.reason === 'impossible_speed'
              ? 'Suspicious activity detected.'
              : 'Better luck next time!'}
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
