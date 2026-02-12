'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { LayoutGrid } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { ShareScore } from './ShareScore'
import { Spinner } from '@/components/Spinner'
import { CC } from '@/lib/currency'
import { GameThumbnail } from '@/components/GameThumbnail'
import { useTheme } from '@/hooks/useTheme'
import { useSound } from '@/hooks/useSound'

type GamePhase = 'idle' | 'loading' | 'play' | 'round_complete' | 'checking' | 'completed' | 'failed'

interface RoundSpec {
  cards: string[]
  numPairs: number
}

interface TurnSpec {
  rounds: RoundSpec[]
  timeLimitMs: number
  flipBackDelayMs: number
}

interface GameResult {
  valid: boolean
  score?: number
  rank?: number
  matchAttempts?: number
  reason?: string
}

interface MemoryCardsGameProps {
  onGameComplete?: (result: GameResult) => void
}

export function MemoryCardsGame({ onGameComplete }: MemoryCardsGameProps) {
  const { theme } = useTheme()
  const light = theme === 'light'
  const { play } = useSound()
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [flipped, setFlipped] = useState<boolean[]>([])
  const [matched, setMatched] = useState<boolean[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [locked, setLocked] = useState(false)
  const [currentRound, setCurrentRound] = useState(0)
  const [matchCount, setMatchCount] = useState(0)
  const [totalMatches, setTotalMatches] = useState(0)
  const [attempts, setAttempts] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const completeCalledRef = useRef(false)

  const completeGame = useCallback(async (token?: string) => {
    const finalToken = token || turnToken
    if (!finalToken || completeCalledRef.current) return
    completeCalledRef.current = true

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
  }, [turnToken, onGameComplete])

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setResult(null)
    setCurrentRound(0)
    setMatchCount(0)
    setTotalMatches(0)
    setAttempts(0)
    setSelected([])
    setLocked(false)
    completeCalledRef.current = false

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'memory_cards' }),
      })
      if (!createRes.ok) {
        const data = await createRes.json()
        throw new Error(data.error || 'Failed to create turn')
      }
      const turnData = await createRes.json()

      setTurnToken(turnData.turnToken)
      setSpec(turnData.spec)
      const firstRound = turnData.spec.rounds[0]
      setFlipped(new Array(firstRound.cards.length).fill(false))
      setMatched(new Array(firstRound.cards.length).fill(false))
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
  }, [completeGame])

  const handleCardClick = useCallback(async (index: number) => {
    if (!turnToken || !spec || locked || phase !== 'play') return
    if (flipped[index] || matched[index]) return

    const round = spec.rounds[currentRound]

    // Send flip event
    fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken,
        eventType: 'flip',
        cardIndex: index,
        round: currentRound,
        clientTimestampMs: Date.now(),
      }),
    })

    play('tap')
    const newFlipped = [...flipped]
    newFlipped[index] = true
    setFlipped(newFlipped)

    const newSelected = [...selected, index]
    setSelected(newSelected)

    if (newSelected.length === 2) {
      setLocked(true)
      const [first, second] = newSelected
      const isMatch = round.cards[first] === round.cards[second]
      const newAttempts = attempts + 1
      setAttempts(newAttempts)

      const matchPromise = fetch('/api/game/turn/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnToken,
          eventType: 'match_attempt',
          card1: first,
          card2: second,
          matched: isMatch,
          round: currentRound,
          clientTimestampMs: Date.now(),
        }),
      })

      if (isMatch) {
        play('hit')
        const newMatched = [...matched]
        newMatched[first] = true
        newMatched[second] = true
        setMatched(newMatched)
        const newMatchCount = matchCount + 1
        setMatchCount(newMatchCount)
        setTotalMatches(prev => prev + 1)
        setSelected([])
        setLocked(false)

        // Check if all pairs in this round are found
        if (newMatchCount === round.numPairs) {
          await matchPromise

          // Send round_complete event
          fetch('/api/game/turn/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              turnToken,
              eventType: 'round_complete',
              round: currentRound,
              clientTimestampMs: Date.now(),
            }),
          })

          if (currentRound + 1 < spec.rounds.length) {
            // Show round complete briefly then load next round
            setPhase('round_complete')
            setTimeout(() => {
              const nextRound = currentRound + 1
              const nextCards = spec.rounds[nextRound].cards
              setCurrentRound(nextRound)
              setMatchCount(0)
              setFlipped(new Array(nextCards.length).fill(false))
              setMatched(new Array(nextCards.length).fill(false))
              setSelected([])
              setLocked(false)
              setPhase('play')
            }, 1200)
          } else {
            completeGame()
          }
        }
      } else {
        play('miss')
        // Flip back after delay
        setTimeout(() => {
          const resetFlipped = [...newFlipped]
          resetFlipped[first] = false
          resetFlipped[second] = false
          setFlipped(resetFlipped)
          setSelected([])
          setLocked(false)
        }, spec.flipBackDelayMs)
      }
    }
  }, [turnToken, spec, locked, phase, flipped, matched, selected, attempts, matchCount, currentRound, completeGame])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const currentCards = spec ? spec.rounds[currentRound]?.cards : []
  const numPairs = spec ? spec.rounds[currentRound]?.numPairs : 4

  return (
    <div className={`rounded-xl p-4 sm:p-6 ${light ? 'bg-white shadow-md' : 'bg-slate-800'}`}>
      <div className="flex items-center justify-between mb-6">
        {(phase === 'play' || phase === 'round_complete') && (
          <div className="flex items-center gap-4">
            <span className={`text-sm ${light ? 'text-slate-500' : 'text-slate-400'}`}>{matchCount}/{numPairs} pairs</span>
            <span className={`text-2xl font-mono ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
              {formatTime(timeLeft)}
            </span>
          </div>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center pb-6">
          <div className="mb-4 max-w-sm mx-auto"><GameThumbnail gameId="memory_cards" isPlayable={true} /></div>
          <p className={`mb-6 ${light ? 'text-slate-600' : 'text-slate-300'}`}>
            Flip cards to find matching pairs!
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
          <p className="text-slate-300">Shuffling cards...</p>
        </div>
      )}

      {(phase === 'play' || phase === 'round_complete') && spec && (
        <div>
          {/* Round indicators */}
          {spec.rounds.length > 1 && (
            <div className="flex justify-center gap-2 mb-4">
              {spec.rounds.map((_, i) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    i < currentRound
                      ? 'bg-green-500 text-white'
                      : i === currentRound
                      ? 'bg-yellow-500 text-slate-900'
                      : light
                      ? 'bg-slate-200 text-slate-500'
                      : 'bg-slate-600 text-slate-400'
                  }`}
                >
                  {i + 1}
                </div>
              ))}
            </div>
          )}

          {phase === 'round_complete' && (
            <div className="text-center py-4 mb-4">
              <p className="text-green-500 font-bold text-lg animate-pulse">
                Level {currentRound + 1} Complete!
              </p>
            </div>
          )}

          {phase === 'play' && (
            <div
              className="grid gap-3 max-w-sm mx-auto"
              style={{ gridTemplateColumns: `repeat(${currentCards.length <= 8 ? 4 : 4}, 1fr)` }}
            >
              {currentCards.map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => handleCardClick(i)}
                  disabled={locked || flipped[i] || matched[i]}
                  className={`aspect-square rounded-xl text-3xl flex items-center justify-center transition-all duration-200 ${
                    matched[i]
                      ? 'bg-green-500/20 border-2 border-green-500 opacity-60'
                      : flipped[i]
                      ? light
                        ? 'bg-white border-2 border-yellow-500'
                        : 'bg-slate-600 border-2 border-yellow-500'
                      : light
                      ? 'bg-slate-100 hover:bg-slate-200 border-2 border-slate-300 cursor-pointer'
                      : 'bg-slate-700 hover:bg-slate-600 border-2 border-slate-600 cursor-pointer'
                  }`}
                >
                  {(flipped[i] || matched[i]) ? emoji : '?'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="mx-auto mb-4"><Spinner /></div>
          <p className={light ? 'text-slate-600' : 'text-slate-300'}>Calculating score...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-fuchsia-500/20 flex items-center justify-center">
            <LayoutGrid className="w-10 h-10 text-fuchsia-400" />
          </div>
          <h3 className={`text-2xl font-bold mb-4 ${
            spec && totalMatches >= spec.rounds.reduce((sum, r) => sum + r.numPairs, 0)
              ? 'text-green-400'
              : 'text-yellow-400'
          }`}>
            {spec && totalMatches >= spec.rounds.reduce((sum, r) => sum + r.numPairs, 0)
              ? 'All Pairs Found!'
              : timeLeft <= 0
              ? "Time\u2019s Up!"
              : `Found ${totalMatches}/${spec?.rounds.reduce((sum, r) => sum + r.numPairs, 0) ?? 0} Pairs`}
          </h3>
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
              <div className="text-base font-bold text-white">{result.matchAttempts}</div>
              <div className="text-[10px] text-slate-400">Attempts</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            <button onClick={startGame} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition">Play Again</button>
            <Link href="/" className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 rounded-lg transition text-center">New Game</Link>
          </div>
          <ShareScore gameName="Memory Cards" score={result.score || 0} rank={result.rank} />
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-fuchsia-500/20 flex items-center justify-center">
            <LayoutGrid className="w-10 h-10 text-fuchsia-400" />
          </div>
          <h3 className="text-2xl font-bold text-red-400 mb-4">Time&apos;s Up!</h3>
          <p className="text-slate-300 mb-6">
            {result?.reason === 'incomplete'
              ? `Found ${matchCount}/${numPairs} pairs before time ran out.`
              : 'Better luck next time!'}
          </p>
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            <button onClick={startGame} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition">Try Again</button>
            <Link href="/" className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 rounded-lg transition text-center">New Game</Link>
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
