'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

import { Hammer } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { ShareScore } from './ShareScore'
import { Spinner } from '@/components/Spinner'
import { GameLoading } from '@/components/GameLoading'
import { CC } from '@/lib/currency'
import { GameThumbnail } from '@/components/GameThumbnail'
import { useSound } from '@/hooks/useSound'

type GamePhase = 'idle' | 'loading' | 'play' | 'checking' | 'completed' | 'failed'

interface TurnSpec {
  gridSize: number
  numMoles: number
  numBombs: number
  moleDurationMs: number
  timeLimitMs: number
  spawnSequence: [number, number, number][] // [timeOffset, cellIndex, type] where type: 0=mole, 1=bomb
}

interface GameResult {
  valid: boolean
  hits?: number
  misses?: number
  bombHits?: number
  score?: number
  rank?: number
  reason?: string
}

interface WhackAMoleGameProps {
  onGameComplete?: (result: GameResult) => void
  groupSessionId?: string
}

export function WhackAMoleGame({ onGameComplete, groupSessionId }: WhackAMoleGameProps) {
  const { play } = useSound()
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [activeEntities, setActiveEntities] = useState<Map<number, { cellIndex: number; type: number }>>(new Map()) // id -> {cellIndex, type}
  const [hits, setHits] = useState(0)
  const [misses, setMisses] = useState(0)
  const [bombHits, setBombHits] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const spawnTimersRef = useRef<NodeJS.Timeout[]>([])
  const gameStartTimeRef = useRef<number>(0)
  const hitsRef = useRef(0)
  const completeCalledRef = useRef(false)

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setHits(0)
    hitsRef.current = 0
    completeCalledRef.current = false
    setMisses(0)
    setBombHits(0)
    setActiveEntities(new Map())
    setResult(null)

    // Clear any existing timers
    spawnTimersRef.current.forEach(t => clearTimeout(t))
    spawnTimersRef.current = []

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'whack_a_mole', ...(groupSessionId && { groupSessionId }) }),
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
      gameStartTimeRef.current = Date.now()

      // Schedule all entity spawns (moles and bombs)
      const newSpec = turnData.spec as TurnSpec
      newSpec.spawnSequence.forEach(([timeOffset, cellIndex, type], entityId) => {
        const spawnTimer = setTimeout(() => {
          spawnEntity(entityId, cellIndex, type, newSpec.moleDurationMs)
        }, timeOffset)
        spawnTimersRef.current.push(spawnTimer)
      })

      // Auto-end when last spawn has expired (no more entities will appear)
      const lastSpawnTime = Math.max(...newSpec.spawnSequence.map(s => s[0]))
      const allSpawnsEndTime = lastSpawnTime + newSpec.moleDurationMs + 200 // small buffer
      const endTimer = setTimeout(() => {
        completeGame(turnData.turnToken)
      }, allSpawnsEndTime)
      spawnTimersRef.current.push(endTimer)

      // Start countdown timer
      const startTime = Date.now()
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime
        const remaining = newSpec.timeLimitMs - elapsed
        setTimeLeft(Math.max(0, remaining))

        if (remaining <= 0) {
          completeGame(turnData.turnToken)
        }
      }, 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('idle')
    }
  }, [])

  const spawnEntity = (entityId: number, cellIndex: number, type: number, duration: number) => {
    setActiveEntities(prev => {
      const next = new Map(prev)
      next.set(entityId, { cellIndex, type })
      return next
    })

    // Auto-despawn after duration
    const despawnTimer = setTimeout(() => {
      setActiveEntities(prev => {
        const next = new Map(prev)
        next.delete(entityId)
        return next
      })
    }, duration)
    spawnTimersRef.current.push(despawnTimer)
  }

  const handleCellClick = async (cellIndex: number) => {
    if (phase !== 'play' || !turnToken) return

    // Check if there's an entity in this cell
    let hitEntityId: number | null = null
    let hitEntityType: number | null = null
    activeEntities.forEach((entity, entityId) => {
      if (entity.cellIndex === cellIndex) {
        hitEntityId = entityId
        hitEntityType = entity.type
      }
    })

    if (hitEntityId !== null) {
      // Remove the entity
      setActiveEntities(prev => {
        const next = new Map(prev)
        next.delete(hitEntityId!)
        return next
      })

      if (hitEntityType === 0) {
        // Hit a mole - good!
        play('hit')
        hitsRef.current += 1
        setHits(hitsRef.current)

        fetch('/api/game/turn/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            turnToken,
            eventType: 'hit',
            cellIndex,
            moleId: hitEntityId,
            clientTimestampMs: Date.now(),
          }),
        })

        // Check if all moles have been hit
        if (spec && hitsRef.current >= spec.numMoles) {
          completeGame(turnToken)
        }
      } else {
        // Hit a bomb - bad!
        play('miss')
        setBombHits(b => b + 1)
        await fetch('/api/game/turn/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            turnToken,
            eventType: 'bomb_hit',
            cellIndex,
            moleId: hitEntityId,
            clientTimestampMs: Date.now(),
          }),
        })
      }
    } else {
      // Miss!
      setMisses(m => m + 1)

      await fetch('/api/game/turn/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnToken,
          eventType: 'miss',
          cellIndex,
          clientTimestampMs: Date.now(),
        }),
      })
    }
  }

  const completeGame = async (token?: string) => {
    const finalToken = token || turnToken
    if (!finalToken || completeCalledRef.current) return
    completeCalledRef.current = true

    // Stop all timers
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    spawnTimersRef.current.forEach(t => clearTimeout(t))
    spawnTimersRef.current = []

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
      spawnTimersRef.current.forEach(t => clearTimeout(t))
    }
  }, [])

  const gridSize = spec?.gridSize || 3

  return (
    <div className="bg-slate-800 rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4 sm:mb-6 flex-wrap gap-2">
        {phase === 'play' && (
          <div className="flex items-center gap-2 sm:gap-4 text-sm sm:text-base">
            <span className="text-green-400">Hits: {hits}</span>
            <span className="text-yellow-400">Misses: {misses}</span>
            <span className="text-red-400">Bombs: {bombHits}</span>
            <span className={`text-xl sm:text-2xl font-mono ${timeLeft < 5000 ? 'text-red-400' : 'text-yellow-400'}`}>
              {formatTime(timeLeft)}
            </span>
          </div>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center pb-6">
          <div className="mb-4 max-w-sm mx-auto"><GameThumbnail gameId="whack_a_mole" isPlayable={true} /></div>
          <div className="max-w-sm mx-auto">
            <p className="text-slate-300 mb-6">
              Click the moles 🐹 as fast as you can, but avoid the bombs 💣!
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

      {phase === 'loading' && <GameLoading gameId="whack_a_mole" message="Preparing game..." />}

      {phase === 'play' && spec && (
        <div className="flex justify-center">
          <div
            className="grid gap-2 w-full max-w-[272px]"
            style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
          >
            {Array.from({ length: gridSize * gridSize }).map((_, index) => {
              let entityType: number | null = null
              activeEntities.forEach((entity) => {
                if (entity.cellIndex === index) entityType = entity.type
              })

              const hasMole = entityType === 0
              const hasBomb = entityType === 1

              return (
                <button
                  key={index}
                  onClick={() => handleCellClick(index)}
                  className={`aspect-square w-full rounded-xl transition-all transform ${
                    hasMole || hasBomb
                      ? 'bg-amber-600 hover:bg-amber-500 scale-110'
                      : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                >
                  {hasMole && <span className="text-2xl sm:text-3xl">🐹</span>}
                  {hasBomb && <span className="text-2xl sm:text-3xl">💣</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="mx-auto mb-4"><Spinner /></div>
          <p className="text-slate-300">Calculating results...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-yellow-500/20 flex items-center justify-center">
            <Hammer className="w-10 h-10 text-yellow-500" />
          </div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">Great Job!</h3>
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
                <div className="text-base font-bold text-white">{result.hits}</div>
                <div className="text-[10px] text-slate-400">Hits</div>
              </div>
              <div className="py-3 px-2">
                <div className="text-base font-bold text-white">{result.misses}</div>
                <div className="text-[10px] text-slate-400">Misses</div>
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
            <ShareScore gameName="Whack-a-Mole" score={result.score || 0} rank={result.rank} inline />
          </div>
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-yellow-500/20 flex items-center justify-center">
            <Hammer className="w-10 h-10 text-yellow-500" />
          </div>
          <h3 className="text-2xl font-bold text-red-400 mb-4">Failed!</h3>
          <p className="text-slate-300 mb-6">Better luck next time!</p>
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
