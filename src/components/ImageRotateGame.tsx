'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

import { RotateCw } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import Image from 'next/image'
import { ShareScore } from './ShareScore'
import { Spinner } from '@/components/Spinner'
import { GameLoading } from '@/components/GameLoading'
import { CC } from '@/lib/currency'
import { GameThumbnail } from '@/components/GameThumbnail'
import { useSound } from '@/hooks/useSound'

type GamePhase = 'idle' | 'loading' | 'play' | 'checking' | 'completed' | 'failed'

interface TurnSpec {
  imageUrl: string
  gridSize: number
  initialRotations: number[]
  timeLimitMs: number
  rotationPenaltyMs: number
}

interface GameResult {
  valid: boolean
  score?: number
  completionTimeMs?: number
  extraRotations?: number
  rank?: number
  reason?: string
}

interface ImageRotateGameProps {
  onGameComplete?: (result: GameResult) => void
  groupSessionId?: string
}

export function ImageRotateGame({ onGameComplete, groupSessionId }: ImageRotateGameProps) {
  const { play } = useSound()
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [rotations, setRotations] = useState<number[]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const rotateQueueRef = useRef<{ tileIndex: number; timestamp: number }[]>([])
  const processingQueueRef = useRef(false)
  const rotationsRef = useRef<number[]>([])

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setRotations([])
    setResult(null)
    rotateQueueRef.current = []
    processingQueueRef.current = false
    rotationsRef.current = []

    try {
      // Create turn
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'image_rotate', ...(groupSessionId && { groupSessionId }) }),
      })
      if (!createRes.ok) {
        const data = await createRes.json()
        throw new Error(data.error || 'Failed to create turn')
      }
      const turnData = await createRes.json()

      setTurnToken(turnData.turnToken)
      setSpec(turnData.spec)
      setRotations(turnData.spec.initialRotations)
      rotationsRef.current = [...turnData.spec.initialRotations]
      setTimeLeft(turnData.spec.timeLimitMs)

      // Start turn on server
      const startRes = await fetch('/api/game/turn/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: turnData.turnToken }),
      })

      if (!startRes.ok) {
        const data = await startRes.json()
        throw new Error(data.error || 'Failed to start turn')
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
          handleTimeout(turnData.turnToken)
        }
      }, 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('idle')
    }
  }, [])

  // Process rotate queue in background
  const processQueue = async () => {
    if (processingQueueRef.current || !turnToken) return
    processingQueueRef.current = true

    while (rotateQueueRef.current.length > 0) {
      const event = rotateQueueRef.current.shift()
      if (!event) break

      try {
        await fetch('/api/game/turn/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            turnToken,
            eventType: 'rotate',
            tileIndex: event.tileIndex,
            clientTimestampMs: event.timestamp,
          }),
        })
      } catch (err) {
        console.error('Failed to send rotate event:', err)
      }
    }

    processingQueueRef.current = false
  }

  const handleRotate = (tileIndex: number) => {
    if (phase !== 'play' || !spec || !turnToken) return
    play('tap')

    // Update local state immediately for responsiveness
    const newRotations = [...rotationsRef.current]
    newRotations[tileIndex] = (newRotations[tileIndex] + 90) % 360
    rotationsRef.current = newRotations
    setRotations(newRotations)

    // Queue the event for server
    rotateQueueRef.current.push({ tileIndex, timestamp: Date.now() })
    processQueue()

    // Check if puzzle is solved (all rotations are 0)
    if (newRotations.every(r => r === 0)) {
      play('success')
      // Stop timer immediately
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      // Let the user see the completed puzzle, then transition
      setTimeout(() => {
        setPhase('checking')
        completeGame()
      }, 1000)
    }
  }

  const completeGame = async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase('checking')

    // Wait for queue to finish processing
    while (rotateQueueRef.current.length > 0 || processingQueueRef.current) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }

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

  const handleTimeout = async (token: string) => {
    try {
      const completeRes = await fetch('/api/game/turn/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: token }),
      })

      const data = await completeRes.json()
      setResult({ valid: false, reason: 'timeout' })
      setPhase('failed')

      if (onGameComplete) {
        onGameComplete(data)
      }
    } catch {
      setPhase('failed')
    }
  }

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const gridSize = spec?.gridSize || 3
  const tileSize = 100 // pixels per tile

  return (
    <div className="bg-slate-800 rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        {phase === 'play' && (
          <div className={`text-2xl font-mono ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
            {formatTime(timeLeft)}
          </div>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center pb-6">
          <div className="mb-4 max-w-sm mx-auto"><GameThumbnail gameId="image_rotate" isPlayable={true} /></div>
          <div className="max-w-sm mx-auto">
            <p className="text-slate-300 mb-6">
              Rotate the scrambled tiles to restore the image! Click a tile to rotate it 90 degrees.
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

      {phase === 'loading' && <GameLoading gameId="image_rotate" message="Preparing puzzle..." />}

      {phase === 'play' && spec && (
        <div className="flex flex-col items-center">
          <p className="text-slate-400 text-sm mb-4">Click tiles to rotate them until the image is correct!</p>

          <div
            className="grid gap-1 bg-slate-900 p-1 rounded-lg max-w-full overflow-hidden"
            style={{
              gridTemplateColumns: `repeat(${gridSize}, ${tileSize}px)`,
              width: `${gridSize * tileSize + (gridSize + 1) * 4}px`,
              maxWidth: '100%',
            }}
          >
            {rotations.map((rotation, index) => {
              const row = Math.floor(index / gridSize)
              const col = index % gridSize

              return (
                <button
                  key={index}
                  onClick={() => handleRotate(index)}
                  className="relative overflow-hidden bg-slate-700 hover:brightness-110 transition-all"
                  style={{
                    width: tileSize,
                    height: tileSize,
                  }}
                >
                  <div
                    className="absolute transition-transform duration-200"
                    style={{
                      width: tileSize * gridSize,
                      height: tileSize * gridSize,
                      transform: `rotate(${rotation}deg)`,
                      transformOrigin: `${col * tileSize + tileSize / 2}px ${row * tileSize + tileSize / 2}px`,
                      left: -col * tileSize,
                      top: -row * tileSize,
                    }}
                  >
                    <Image
                      src={spec.imageUrl}
                      alt="Puzzle"
                      width={tileSize * gridSize}
                      height={tileSize * gridSize}
                      className="pointer-events-none"
                      priority
                    />
                  </div>
                </button>
              )
            })}
          </div>

          <p className="text-slate-500 text-xs mt-4">
            Penalty: +{spec.rotationPenaltyMs / 1000}s per extra rotation
          </p>
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="mx-auto mb-4"><Spinner /></div>
          <p className="text-slate-300">Verifying solution...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-600/20 flex items-center justify-center">
            <RotateCw className="w-10 h-10 text-blue-500" />
          </div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">Puzzle Solved!</h3>
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
                <div className="text-base font-bold text-white">{formatTime(result.completionTimeMs || 0)}</div>
                <div className="text-[10px] text-slate-400">Time</div>
              </div>
              <div className="py-3 px-2">
                <div className="text-base font-bold text-white">{result.extraRotations || 0}</div>
                <div className="text-[10px] text-slate-400">Extra Rotations</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            <button onClick={startGame} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition">Play Again</button>
            <ShareScore gameName="Puzzle Spin" score={result.score || 0} rank={result.rank} inline />
          </div>
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-600/20 flex items-center justify-center">
            <RotateCw className="w-10 h-10 text-blue-500" />
          </div>
          <h3 className="text-2xl font-bold text-red-400 mb-4">
            {result?.reason === 'timeout' ? 'Time\'s Up!' : 'Failed!'}
          </h3>
          <p className="text-slate-300 mb-6">
            {result?.reason === 'timeout'
              ? 'You ran out of time.'
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
