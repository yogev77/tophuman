'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { GripVertical } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { ShareScore } from './ShareScore'
import { Spinner } from '@/components/Spinner'
import { CC } from '@/lib/currency'
import { useTheme } from '@/hooks/useTheme'

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
  const { theme } = useTheme()
  const light = theme === 'light'
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [items, setItems] = useState<string[]>([])
  const [order, setOrder] = useState<number[]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [currentRound, setCurrentRound] = useState(1)
  const [totalRounds, setTotalRounds] = useState(1)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef<number>(0)
  const touchDragIndex = useRef<number | null>(null)
  const itemRects = useRef<DOMRect[]>([])

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setItems([])
    setOrder([])
    setResult(null)
    setSubmitting(false)

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

  // Desktop drag handlers
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

  // Touch drag handlers
  const captureItemRects = () => {
    if (!listRef.current) return
    const children = listRef.current.children
    const rects: DOMRect[] = []
    for (let i = 0; i < children.length; i++) {
      rects.push(children[i].getBoundingClientRect())
    }
    itemRects.current = rects
  }

  const handleTouchStart = (e: React.TouchEvent, index: number) => {
    touchStartY.current = e.touches[0].clientY
    touchDragIndex.current = index
    setDraggingIndex(index)
    captureItemRects()
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault()
    if (touchDragIndex.current === null) return

    const touchY = e.touches[0].clientY
    const rects = itemRects.current
    const currentIdx = touchDragIndex.current

    // Find which item the finger is over
    for (let i = 0; i < rects.length; i++) {
      if (i === currentIdx) continue
      const rect = rects[i]
      const midY = rect.top + rect.height / 2
      if (
        (currentIdx < i && touchY > midY) ||
        (currentIdx > i && touchY < midY)
      ) {
        moveItem(currentIdx, i)
        touchDragIndex.current = i
        setDraggingIndex(i)
        // Re-capture rects after move
        requestAnimationFrame(captureItemRects)
        break
      }
    }
  }

  const handleTouchEnd = () => {
    touchDragIndex.current = null
    setDraggingIndex(null)
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
      if (roundSpec.sortType === 'numbers') return 'Smallest → Largest'
      if (roundSpec.sortType === 'alphabet') return 'A → Z'
    }

    switch (spec.sortType) {
      case 'numbers': return 'Smallest → Largest'
      case 'alphabet': return 'A → Z'
      case 'dates': return 'Earliest → Latest'
      case 'mixed': return currentRound === 1 ? 'Smallest → Largest' : 'A → Z'
      default: return 'Sort in order'
    }
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        {phase === 'play' && (
          <>
            <span className={`text-2xl font-mono ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
              {formatTime(timeLeft)}
            </span>
            {totalRounds > 1 && (
              <div className="flex justify-center gap-2">
                {Array.from({ length: totalRounds }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      i + 1 < currentRound
                        ? 'bg-green-500 text-white'
                        : i + 1 === currentRound
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
            <div className="w-16" />
          </>
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
            Start Game (1 <CC />Credit)
          </button>
        </div>
      )}

      {phase === 'loading' && (
        <div className="text-center py-12">
          <div className="mx-auto mb-4"><Spinner /></div>
          <p className="text-slate-300">Preparing items...</p>
        </div>
      )}

      {phase === 'play' && spec && (
        <div>
          <p className="text-slate-400 text-sm text-center mb-4">
            {getSortHint()}
          </p>

          <div ref={listRef} className="space-y-2 max-w-md mx-auto touch-none">
            {order.map((itemIndex, displayIndex) => (
              <div
                key={itemIndex}
                draggable
                onDragStart={() => handleDragStart(displayIndex)}
                onDragOver={(e) => handleDragOver(e, displayIndex)}
                onDragEnd={handleDragEnd}
                onTouchStart={(e) => handleTouchStart(e, displayIndex)}
                onTouchMove={(e) => handleTouchMove(e)}
                onTouchEnd={handleTouchEnd}
                className={`flex items-center gap-2 p-4 rounded-lg cursor-grab active:cursor-grabbing select-none transition-all duration-150 ${
                  draggingIndex === displayIndex
                    ? 'bg-yellow-500 scale-110 shadow-xl shadow-yellow-500/30 -rotate-1 z-10 relative'
                    : 'bg-slate-700 hover:bg-slate-600'
                }`}
              >
                <GripVertical className={`w-5 h-5 flex-shrink-0 ${
                  draggingIndex === displayIndex ? 'text-slate-900' : 'text-slate-500'
                }`} />
                <span className={`text-sm w-6 ${
                  draggingIndex === displayIndex ? 'text-slate-900/60' : 'text-slate-500'
                }`}>{displayIndex + 1}.</span>
                <span className={`flex-1 font-medium ${
                  draggingIndex === displayIndex ? 'text-slate-900' : 'text-white'
                }`}>{items[itemIndex]}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => {
              if (submitting) return
              setSubmitting(true)
              if (totalRounds > 1) {
                submitRound().finally(() => setSubmitting(false))
              } else {
                completeGame()
              }
            }}
            disabled={submitting}
            className={`w-full mt-6 font-bold py-3 px-6 rounded-lg transition-all active:scale-95 ${
              submitting
                ? 'bg-green-700 text-green-200 cursor-wait'
                : 'bg-green-600 hover:bg-green-500 text-white'
            }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Submitting...
              </span>
            ) : (
              totalRounds > 1 && currentRound < totalRounds ? `Submit Round ${currentRound}` : 'Submit Order'
            )}
          </button>
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="mx-auto mb-4"><Spinner /></div>
          <p className="text-slate-300">Checking order...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-lime-500/20 flex items-center justify-center">
            <GripVertical className="w-10 h-10 text-lime-400" />
          </div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">Perfectly Sorted!</h3>
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
              <div className="text-base font-bold text-white">{result.correctPositions}/{result.total}</div>
              <div className="text-[10px] text-slate-400">Correct</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            <button onClick={startGame} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition">Play Again</button>
            <Link href="/" className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 rounded-lg transition text-center">New Game</Link>
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
