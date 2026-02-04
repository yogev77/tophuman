'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

type GamePhase = 'idle' | 'loading' | 'playing' | 'checking' | 'completed' | 'failed'

interface DuckSpawn {
  spawnTimeMs: number
  fromLeft: boolean
  yPosition: number
  speed: number
}

interface TurnSpec {
  canvasWidth: number
  canvasHeight: number
  duckSize: number
  duckSpawns: DuckSpawn[]
  timeLimitMs: number
}

interface GameResult {
  valid: boolean
  hits?: number
  totalDucks?: number
  accuracy?: number
  score?: number
  rank?: number
  reason?: string
}

interface DuckShootGameProps {
  onGameComplete?: (result: GameResult) => void
}

interface ActiveDuck {
  index: number
  spawn: DuckSpawn
  x: number
  hit: boolean
}

export function DuckShootGame({ onGameComplete }: DuckShootGameProps) {
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState(30000)
  const [activeDucks, setActiveDucks] = useState<ActiveDuck[]>([])
  const [hits, setHits] = useState(0)
  const [shots, setShots] = useState(0)
  const [muzzleFlash, setMuzzleFlash] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const animationRef = useRef<number | null>(null)
  const gameStartTimeRef = useRef<number>(0)

  const drawGame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !spec) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Sky gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, '#87CEEB')
    gradient.addColorStop(0.7, '#98D8C8')
    gradient.addColorStop(1, '#228B22')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw grass
    ctx.fillStyle = '#228B22'
    ctx.fillRect(0, canvas.height - 60, canvas.width, 60)

    // Draw ducks
    for (const duck of activeDucks) {
      if (duck.hit) continue

      const duckX = duck.x
      const duckY = duck.spawn.yPosition

      // Duck body
      ctx.fillStyle = '#8B4513'
      ctx.beginPath()
      ctx.ellipse(
        duckX + spec.duckSize / 2,
        duckY + spec.duckSize / 2,
        spec.duckSize / 2,
        spec.duckSize / 3,
        0,
        0,
        Math.PI * 2
      )
      ctx.fill()

      // Duck head
      ctx.fillStyle = '#228B22'
      ctx.beginPath()
      const headX = duck.spawn.fromLeft
        ? duckX + spec.duckSize * 0.8
        : duckX + spec.duckSize * 0.2
      ctx.arc(headX, duckY + spec.duckSize * 0.3, spec.duckSize / 5, 0, Math.PI * 2)
      ctx.fill()

      // Beak
      ctx.fillStyle = '#FFA500'
      ctx.beginPath()
      const beakX = duck.spawn.fromLeft
        ? headX + spec.duckSize / 5
        : headX - spec.duckSize / 5
      ctx.moveTo(headX, duckY + spec.duckSize * 0.3)
      ctx.lineTo(beakX + (duck.spawn.fromLeft ? 10 : -10), duckY + spec.duckSize * 0.25)
      ctx.lineTo(beakX + (duck.spawn.fromLeft ? 10 : -10), duckY + spec.duckSize * 0.35)
      ctx.closePath()
      ctx.fill()

      // Eye
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.arc(headX, duckY + spec.duckSize * 0.25, 3, 0, Math.PI * 2)
      ctx.fill()

      // Wing
      ctx.fillStyle = '#A0522D'
      ctx.beginPath()
      ctx.ellipse(
        duckX + spec.duckSize / 2,
        duckY + spec.duckSize / 2 + 5,
        spec.duckSize / 3,
        spec.duckSize / 5,
        0,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }

    // Draw gun at bottom center
    const gunX = canvas.width / 2
    const gunY = canvas.height - 30

    // Gun barrel
    ctx.fillStyle = '#333'
    ctx.fillRect(gunX - 8, gunY - 40, 16, 50)

    // Gun base
    ctx.fillStyle = '#555'
    ctx.beginPath()
    ctx.arc(gunX, gunY, 25, 0, Math.PI * 2)
    ctx.fill()

    // Muzzle flash
    if (muzzleFlash) {
      ctx.fillStyle = '#FFD700'
      ctx.beginPath()
      ctx.moveTo(gunX, gunY - 45)
      ctx.lineTo(gunX - 15, gunY - 60)
      ctx.lineTo(gunX, gunY - 55)
      ctx.lineTo(gunX + 15, gunY - 60)
      ctx.closePath()
      ctx.fill()
    }

    // Crosshair at center
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(canvas.width / 2 - 20, canvas.height / 2)
    ctx.lineTo(canvas.width / 2 + 20, canvas.height / 2)
    ctx.moveTo(canvas.width / 2, canvas.height / 2 - 20)
    ctx.lineTo(canvas.width / 2, canvas.height / 2 + 20)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(canvas.width / 2, canvas.height / 2, 15, 0, Math.PI * 2)
    ctx.stroke()
  }, [spec, activeDucks, muzzleFlash])

  const gameLoop = useCallback(() => {
    if (phase !== 'playing' || !spec) return

    const elapsed = Date.now() - gameStartTimeRef.current

    // Update active ducks
    setActiveDucks(prev => {
      const updated: ActiveDuck[] = []

      // Check for new ducks to spawn
      for (let i = 0; i < spec.duckSpawns.length; i++) {
        const spawn = spec.duckSpawns[i]
        if (spawn.spawnTimeMs <= elapsed) {
          const existingDuck = prev.find(d => d.index === i)
          if (existingDuck) {
            // Update position
            const duckAge = elapsed - spawn.spawnTimeMs
            let newX: number
            if (spawn.fromLeft) {
              newX = -spec.duckSize + (duckAge / 1000) * spawn.speed
            } else {
              newX = spec.canvasWidth - (duckAge / 1000) * spawn.speed
            }

            // Keep duck if still on screen
            if (newX > -spec.duckSize && newX < spec.canvasWidth + spec.duckSize) {
              updated.push({ ...existingDuck, x: newX })
            }
          } else {
            // Spawn new duck
            let initialX: number
            if (spawn.fromLeft) {
              initialX = -spec.duckSize
            } else {
              initialX = spec.canvasWidth
            }
            updated.push({ index: i, spawn, x: initialX, hit: false })
          }
        }
      }

      return updated
    })

    drawGame()
    animationRef.current = requestAnimationFrame(gameLoop)
  }, [phase, spec, drawGame])

  useEffect(() => {
    if (phase === 'playing') {
      animationRef.current = requestAnimationFrame(gameLoop)
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [phase, gameLoop])

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setResult(null)
    setActiveDucks([])
    setHits(0)
    setShots(0)
    setTimeLeft(30000)

    if (timerRef.current) clearInterval(timerRef.current)

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'duck_shoot' }),
      })
      if (!createRes.ok) {
        const data = await createRes.json()
        throw new Error(data.error || 'Failed to create turn')
      }
      const turnData = await createRes.json()

      setTurnToken(turnData.turnToken)
      setSpec(turnData.spec)

      const startRes = await fetch('/api/game/turn/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: turnData.turnToken }),
      })

      if (!startRes.ok) {
        throw new Error('Failed to start turn')
      }

      gameStartTimeRef.current = Date.now()

      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - gameStartTimeRef.current
        const remaining = 30000 - elapsed
        setTimeLeft(Math.max(0, remaining))

        if (remaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current)
          completeGame()
        }
      }, 100)

      setPhase('playing')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('idle')
    }
  }, [])

  const handleShoot = async (e: React.MouseEvent | React.TouchEvent) => {
    if (phase !== 'playing' || !turnToken || !spec) return
    e.preventDefault()

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    let clientX: number, clientY: number
    if ('touches' in e) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    const x = (clientX - rect.left) * scaleX
    const y = (clientY - rect.top) * scaleY

    setShots(prev => prev + 1)
    setMuzzleFlash(true)
    setTimeout(() => setMuzzleFlash(false), 100)

    // Check for duck hit
    let hitDuckIndex: number | undefined
    for (const duck of activeDucks) {
      if (duck.hit) continue

      const duckCenterX = duck.x + spec.duckSize / 2
      const duckCenterY = duck.spawn.yPosition + spec.duckSize / 2
      const hitRadius = spec.duckSize * 0.6

      const distance = Math.sqrt(
        Math.pow(x - duckCenterX, 2) + Math.pow(y - duckCenterY, 2)
      )

      if (distance <= hitRadius) {
        hitDuckIndex = duck.index
        setHits(prev => prev + 1)
        setActiveDucks(prev =>
          prev.map(d => (d.index === duck.index ? { ...d, hit: true } : d))
        )
        break
      }
    }

    // Send shoot event
    await fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken,
        eventType: 'shoot',
        x,
        y,
        duckIndex: hitDuckIndex,
        clientTimestampMs: Date.now(),
      }),
    })
  }

  const completeGame = async () => {
    if (!turnToken) return

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    setPhase('checking')

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

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (phase === 'playing' || phase === 'idle') {
      drawGame()
    }
  }, [phase, drawGame])

  return (
    <div className="bg-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Duck Shoot</h2>
        {phase === 'playing' && spec && (
          <div className="flex items-center gap-4">
            <span className="text-green-400 font-bold">{hits} hits</span>
            <span className="text-slate-400">{shots} shots</span>
            <span className={`text-2xl font-mono ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
              {Math.ceil(timeLeft / 1000)}s
            </span>
          </div>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center py-12">
          <p className="text-slate-300 mb-6">
            Shoot the ducks! Tap/click to fire. The closer to the center of the duck, the higher your accuracy bonus.
            Ducks get faster over time!
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
          <p className="text-slate-300">Loading ducks...</p>
        </div>
      )}

      {phase === 'playing' && spec && (
        <div className="text-center">
          <div
            className="inline-block border-4 border-slate-600 rounded-lg overflow-hidden cursor-crosshair"
            onClick={handleShoot}
            onTouchStart={handleShoot}
          >
            <canvas
              ref={canvasRef}
              width={spec.canvasWidth}
              height={spec.canvasHeight}
              className="max-w-full h-auto"
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>
          <p className="text-slate-400 mt-2 text-sm">Tap anywhere to shoot!</p>
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="animate-spin w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-300">Counting hits...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">{result.hits && result.hits >= (result.totalDucks || 0) * 0.8 ? '🎯' : '🦆'}</div>
          <h3 className="text-2xl font-bold text-green-400 mb-4">Great Shooting!</h3>
          <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto mb-6">
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-3xl font-bold text-white">{result.score?.toLocaleString()}</div>
              <div className="text-sm text-slate-400">Score</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-3xl font-bold text-white">#{result.rank}</div>
              <div className="text-sm text-slate-400">Rank</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-xl font-bold text-green-400">
                {result.hits}/{result.totalDucks}
              </div>
              <div className="text-sm text-slate-400">Hits</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-xl font-bold text-blue-400">
                {result.accuracy ? Math.round(result.accuracy * 100) : 0}%
              </div>
              <div className="text-sm text-slate-400">Accuracy</div>
            </div>
          </div>
          <div className="flex gap-4 justify-center">
            <button
              onClick={startGame}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-lg transition"
            >
              Play Again
            </button>
            <Link href="/" className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-3 px-8 rounded-lg transition">
              New Game
            </Link>
          </div>
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">😅</div>
          <h3 className="text-2xl font-bold text-red-400 mb-4">Not Enough Hits!</h3>
          <p className="text-slate-300 mb-6">
            {result?.reason === 'no_shots'
              ? 'You need to shoot the ducks!'
              : result?.reason === 'not_enough_hits'
              ? `Only hit ${result.hits} of ${result.totalDucks} ducks. Try to hit more!`
              : 'Keep practicing your aim!'}
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={startGame}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-lg transition"
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
