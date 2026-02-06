'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { GripVertical } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { ShareScore } from './ShareScore'

type GamePhase = 'idle' | 'loading' | 'play' | 'checking' | 'completed' | 'failed'

interface RoundSpec {
  items: string[]
  correctOrder: number[]
  sortType: string
}

interface TurnSpec {
  items: string[]
  sortType: string
  timeLimitMs: number
  rounds?: RoundSpec[]
}

interface GameResult {
  valid: boolean
  correctPositions?: number
  total?: number
  score?: number
  rank?: number
  reason?: string
}

interface DragSortGameProps {
  onGameComplete?: (result: GameResult) => void
}

export function DragSortGame({ onGameComplete }: DragSortGameProps) {
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [items, setItems] = useState<string[]>([])
  const [order, setOrder] = useState<number[]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [currentRound, setCurrentRound] = useState(1)
  const [totalRounds, setTotalRounds] = useState(1)

  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setItems([])
    setOrder([])
    setResult(null)

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'drag_sort' }),
      })
      if (!createRes.ok) {
        const data = await createRes.json()
        throw new Error(data.error || 'Failed to create turn')
      }
      const turnData = await createRes.json()

      setTurnToken(turnData.turnToken)
      setSpec(turnData.spec)
      setCurrentRound(1)

      // Check if multi-round mode
      if (turnData.spec.rounds && turnData.spec.rounds.length > 0) {
        setTotalRounds(turnData.spec.rounds.length)
        setItems(turnData.spec.rounds[0].items)
        setOrder(turnData.spec.rounds[0].items.map((_: string, i: number) => i))
      } else {
        setTotalRounds(1)
        setItems(turnData.spec.items)
        setOrder(turnData.spec.items.map((_: string, i: number) => i))
      }
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

  const moveItem = async (fromIndex: number, toIndex: number) => {
    if (!turnToken || fromIndex === toIndex) return

    const newOrder = [...order]
    const [removed] = newOrder.splice(fromIndex, 1)
    newOrder.splice(toIndex, 0, removed)
    setOrder(newOrder)

    // Send swap event
    await fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken,
        eventType: 'swap',
        fromIndex,
        toIndex,
        clientTimestampMs: Date.now(),
      }),
    })
  }

  const submitRound = async () => {
    if (!turnToken || !spec) return

    // Send round submission event
    await fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken,
        eventType: 'submit_round',
        round: currentRound,
        finalOrder: order,
        clientTimestampMs: Date.now(),
      }),
    })

    // Check if more rounds
    if (spec.rounds && currentRound < spec.rounds.length) {
      const nextRound = currentRound + 1
      setCurrentRound(nextRound)
      const nextRoundSpec = spec.rounds[nextRound - 1]
      setItems(nextRoundSpec.items)
      setOrder(nextRoundSpec.items.map((_, i) => i))
    } else {
      // Final round complete
      completeGame(turnToken)
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

    // Send final order
    await fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken: finalToken,
        eventType: 'submit',
        finalOrder: order,
        clientTimestampMs: Date.now(),
      }),
    })

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

  const handleDragStart = (index: number) => {
    setDraggingIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggingIndex !== null && draggingIndex !== index) {
      moveItem(draggingIndex, index)
      setDraggingIndex(index)
    }
  }

  const handleDragEnd = () => {
    setDraggingIndex(null)
  }

  // Mobile touch support
  const handleMoveUp = (index: number) => {
    if (index > 0) {
      moveItem(index, index - 1)
    }
  }

  const handleMoveDown = (index: number) => {
    if (index < order.length - 1) {
      moveItem(index, index + 1)
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const getSortHint = () => {
    if (!spec) return ''

    // For multi-round, check current round's sort type
    if (spec.rounds && spec.rounds.length > 0 && currentRound <= spec.rounds.length) {
      const roundSpec = spec.rounds[currentRound - 1]
      if (roundSpec.sortType === 'numbers') return 'Sort numbers from smallest to largest'
      if (roundSpec.sortType === 'alphabet') return 'Sort letters alphabetically (A-Z)'
    }

    switch (spec.sortType) {
      case 'numbers': return 'Sort from smallest to largest'
      case 'alphabet': return 'Sort alphabetically (A-Z)'
      case 'dates': return 'Sort chronologically'
      case 'mixed': return currentRound === 1 ? 'Sort numbers from smallest to largest' : 'Sort letters alphabetically (A-Z)'
      default: return 'Sort in order'
    }
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Drag & Sort</h2>
        {phase === 'play' && (
          <span className={`text-2xl font-mono ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
            {formatTime(timeLeft)}
          </span>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center py-12">
          <p className="text-slate-300 mb-6">
            Drag and drop items to sort them in the correct order!
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
          <p className="text-slate-300">Preparing items...</p>
        </div>
      )}

      {phase === 'play' && spec && (
        <div>
          {totalRounds > 1 && (
            <div className="flex justify-center gap-2 mb-3">
              {Array.from({ length: totalRounds }).map((_, i) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    i + 1 < currentRound
                      ? 'bg-green-500 text-white'
                      : i + 1 === currentRound
                      ? 'bg-yellow-500 text-slate-900'
                      : 'bg-slate-600 text-slate-400'
                  }`}
                >
                  {i + 1}
                </div>
              ))}
            </div>
          )}
          <p className="text-slate-400 text-sm text-center mb-4">
            {totalRounds > 1 && `Round ${currentRound}/${totalRounds}: `}
            {getSortHint()}
          </p>

          <div className="space-y-2 max-w-md mx-auto">
            {order.map((itemIndex, displayIndex) => (
              <div
                key={itemIndex}
                draggable
                onDragStart={() => handleDragStart(displayIndex)}
                onDragOver={(e) => handleDragOver(e, displayIndex)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-2 p-4 rounded-lg cursor-move transition-all ${
                  draggingIndex === displayIndex
                    ? 'bg-yellow-500 scale-105'
                    : 'bg-slate-700 hover:bg-slate-600'
                }`}
              >
                <span className="text-slate-500 text-sm w-6">{displayIndex + 1}.</span>
                <span className="flex-1 text-white font-medium">{items[itemIndex]}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleMoveUp(displayIndex)}
                    disabled={displayIndex === 0}
                    className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => handleMoveDown(displayIndex)}
                    disabled={displayIndex === order.length - 1}
                    className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => totalRounds > 1 ? submitRound() : completeGame()}
            className="w-full mt-6 bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-6 rounded-lg transition"
          >
            {totalRounds > 1 && currentRound < totalRounds ? `Submit Round ${currentRound}` : 'Submit Order'}
          </button>
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="animate-spin w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-300">Checking order...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-lime-500/20 flex items-center justify-center">
            <GripVertical className="w-10 h-10 text-lime-400" />
          </div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">Perfectly Sorted!</h3>
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
              <div className="text-xl font-bold text-green-400">{result.correctPositions}/{result.total}</div>
              <div className="text-sm text-slate-400">Correct Positions</div>
            </div>
          </div>
          <div className="flex gap-4 justify-center">
            <button
              onClick={startGame}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg transition"
            >
              Play Again
            </button>
            <Link href="/" className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-3 px-8 rounded-lg transition">
              New Game
            </Link>
          </div>
          <ShareScore gameName="Drag Sort" score={result.score || 0} rank={result.rank} />
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-lime-500/20 flex items-center justify-center">
            <GripVertical className="w-10 h-10 text-lime-400" />
          </div>
          <h3 className="text-2xl font-bold text-red-400 mb-4">Incorrect Order!</h3>
          <p className="text-slate-300 mb-6">
            {result?.reason === 'incorrect_order'
              ? `Got ${result.correctPositions}/${result.total} in correct position.`
              : 'Better luck next time!'}
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={startGame}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg transition"
            >
              Try Again
            </button>
            <Link href="/" className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-3 px-8 rounded-lg transition">
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
