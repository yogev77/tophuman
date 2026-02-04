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

interface BulletTrail {
  x: number
  hit: boolean
  startTime: number
}

const MAX_SHOTS = 10

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
  const [bulletTrails, setBulletTrails] = useState<BulletTrail[]>([])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const animationRef = useRef<number | null>(null)
  const gameStartTimeRef = useRef<number>(0)

  const drawGame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !spec) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const now = Date.now()

    // Sky gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, '#4A90D9')
    gradient.addColorStop(0.5, '#87CEEB')
    gradient.addColorStop(0.75, '#98D8C8')
    gradient.addColorStop(1, '#2D5016')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.beginPath()
    ctx.arc(50, 40, 25, 0, Math.PI * 2)
    ctx.arc(75, 35, 30, 0, Math.PI * 2)
    ctx.arc(100, 40, 25, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(280, 60, 20, 0, Math.PI * 2)
    ctx.arc(305, 55, 28, 0, Math.PI * 2)
    ctx.arc(335, 60, 22, 0, Math.PI * 2)
    ctx.fill()

    // Draw grass with texture
    ctx.fillStyle = '#2D5016'
    ctx.fillRect(0, canvas.height - 50, canvas.width, 50)
    ctx.fillStyle = '#3D6B1E'
    for (let i = 0; i < canvas.width; i += 8) {
      ctx.fillRect(i, canvas.height - 50, 4, 5)
    }

    // Draw bullet trails
    const activeTrails = bulletTrails.filter(t => now - t.startTime < 500)
    for (const trail of activeTrails) {
      const age = now - trail.startTime
      const opacity = 1 - age / 500

      // Bullet line from gun to top
      const gunY = canvas.height - 30
      ctx.strokeStyle = trail.hit
        ? `rgba(255, 215, 0, ${opacity})`
        : `rgba(255, 100, 100, ${opacity})`
      ctx.lineWidth = trail.hit ? 4 : 2
      ctx.beginPath()
      ctx.moveTo(trail.x, gunY - 45)
      ctx.lineTo(trail.x, 0)
      ctx.stroke()

      // Muzzle flash at the start
      if (age < 100) {
        ctx.fillStyle = `rgba(255, 200, 50, ${opacity})`
        ctx.beginPath()
        ctx.moveTo(trail.x, gunY - 45)
        ctx.lineTo(trail.x - 12, gunY - 65)
        ctx.lineTo(trail.x, gunY - 55)
        ctx.lineTo(trail.x + 12, gunY - 65)
        ctx.closePath()
        ctx.fill()
      }
    }

    // Draw ducks
    for (const duck of activeDucks) {
      if (duck.hit) continue

      const duckX = duck.x
      const duckY = duck.spawn.yPosition

      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
      ctx.beginPath()
      ctx.ellipse(
        duckX + spec.duckSize / 2,
        duckY + spec.duckSize / 2 + 8,
        spec.duckSize / 2.5,
        spec.duckSize / 6,
        0, 0, Math.PI * 2
      )
      ctx.fill()

      // Duck body (brown)
      ctx.fillStyle = '#8B4513'
      ctx.beginPath()
      ctx.ellipse(
        duckX + spec.duckSize / 2,
        duckY + spec.duckSize / 2,
        spec.duckSize / 2,
        spec.duckSize / 3,
        0, 0, Math.PI * 2
      )
      ctx.fill()

      // Duck head (green)
      ctx.fillStyle = '#1B6B1B'
      const headX = duck.spawn.fromLeft
        ? duckX + spec.duckSize * 0.8
        : duckX + spec.duckSize * 0.2
      ctx.beginPath()
      ctx.arc(headX, duckY + spec.duckSize * 0.3, spec.duckSize / 4.5, 0, Math.PI * 2)
      ctx.fill()

      // White neck ring
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(headX, duckY + spec.duckSize * 0.3, spec.duckSize / 4.5 + 1, Math.PI * 0.6, Math.PI * 1.4)
      ctx.stroke()

      // Beak (orange)
      ctx.fillStyle = '#FF8C00'
      const beakDir = duck.spawn.fromLeft ? 1 : -1
      ctx.beginPath()
      ctx.moveTo(headX + beakDir * spec.duckSize / 4.5, duckY + spec.duckSize * 0.28)
      ctx.lineTo(headX + beakDir * (spec.duckSize / 4.5 + 15), duckY + spec.duckSize * 0.32)
      ctx.lineTo(headX + beakDir * spec.duckSize / 4.5, duckY + spec.duckSize * 0.38)
      ctx.closePath()
      ctx.fill()

      // Eye
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.arc(headX + beakDir * 3, duckY + spec.duckSize * 0.25, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#FFF'
      ctx.beginPath()
      ctx.arc(headX + beakDir * 2, duckY + spec.duckSize * 0.24, 1, 0, Math.PI * 2)
      ctx.fill()

      // Wing
      ctx.fillStyle = '#6B3A0F'
      ctx.beginPath()
      ctx.ellipse(
        duckX + spec.duckSize / 2,
        duckY + spec.duckSize / 2 + 3,
        spec.duckSize / 3.5,
        spec.duckSize / 6,
        duck.spawn.fromLeft ? 0.2 : -0.2,
        0, Math.PI * 2
      )
      ctx.fill()
    }

    // Draw gun platform
    const gunX = canvas.width / 2
    const gunY = canvas.height - 30

    // Gun stand
    ctx.fillStyle = '#4A3728'
    ctx.beginPath()
    ctx.moveTo(gunX - 40, canvas.height)
    ctx.lineTo(gunX - 20, gunY + 10)
    ctx.lineTo(gunX + 20, gunY + 10)
    ctx.lineTo(gunX + 40, canvas.height)
    ctx.closePath()
    ctx.fill()

    // Gun barrel
    ctx.fillStyle = '#2C2C2C'
    ctx.fillRect(gunX - 6, gunY - 45, 12, 55)
    ctx.fillStyle = '#1A1A1A'
    ctx.fillRect(gunX - 8, gunY - 48, 16, 8)

    // Gun body
    ctx.fillStyle = '#3D3D3D'
    ctx.beginPath()
    ctx.arc(gunX, gunY, 20, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2C2C2C'
    ctx.beginPath()
    ctx.arc(gunX, gunY, 12, 0, Math.PI * 2)
    ctx.fill()

    // Ammo display on gun
    ctx.fillStyle = '#FFD700'
    ctx.font = 'bold 14px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`${MAX_SHOTS - shots}`, gunX, gunY + 5)

    // Clean up old trails
    setBulletTrails(prev => prev.filter(t => now - t.startTime < 500))
  }, [spec, activeDucks, bulletTrails, shots])

  const gameLoop = useCallback(() => {
    if (phase !== 'playing' || !spec) return

    const elapsed = Date.now() - gameStartTimeRef.current

    // Speed multiplier increases with each shot (10% faster per shot)
    const speedMultiplier = 1 + (shots * 0.15)

    // Update active ducks
    setActiveDucks(prev => {
      const updated: ActiveDuck[] = []

      for (let i = 0; i < spec.duckSpawns.length; i++) {
        const spawn = spec.duckSpawns[i]
        if (spawn.spawnTimeMs <= elapsed) {
          const existingDuck = prev.find(d => d.index === i)
          if (existingDuck) {
            const duckAge = elapsed - spawn.spawnTimeMs
            const adjustedSpeed = spawn.speed * speedMultiplier
            let newX: number
            if (spawn.fromLeft) {
              newX = -spec.duckSize + (duckAge / 1000) * adjustedSpeed
            } else {
              newX = spec.canvasWidth - (duckAge / 1000) * adjustedSpeed
            }

            if (newX > -spec.duckSize && newX < spec.canvasWidth + spec.duckSize) {
              updated.push({ ...existingDuck, x: newX })
            }
          } else {
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
  }, [phase, spec, drawGame, shots])

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
    setBulletTrails([])
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
    if (shots >= MAX_SHOTS) return // No more shots
    e.preventDefault()

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width

    let clientX: number
    if ('touches' in e) {
      clientX = e.touches[0].clientX
    } else {
      clientX = e.clientX
    }

    const x = (clientX - rect.left) * scaleX

    const newShots = shots + 1
    setShots(newShots)

    // Check for duck hit - duck is hit if it's in the line of fire (vertical line)
    let hitDuckIndex: number | undefined
    let hitDuck: ActiveDuck | undefined

    for (const duck of activeDucks) {
      if (duck.hit) continue

      const duckLeft = duck.x
      const duckRight = duck.x + spec.duckSize

      // Check if bullet x is within duck's horizontal bounds
      if (x >= duckLeft && x <= duckRight) {
        hitDuckIndex = duck.index
        hitDuck = duck
        setHits(prev => prev + 1)
        setActiveDucks(prev =>
          prev.map(d => (d.index === duck.index ? { ...d, hit: true } : d))
        )
        break
      }
    }

    // Add bullet trail
    setBulletTrails(prev => [...prev, { x, hit: !!hitDuck, startTime: Date.now() }])

    // Send shoot event
    await fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken,
        eventType: 'shoot',
        x,
        y: hitDuck ? hitDuck.spawn.yPosition + spec.duckSize / 2 : 0,
        duckIndex: hitDuckIndex,
        clientTimestampMs: Date.now(),
      }),
    })

    // Auto-complete if out of shots
    if (newShots >= MAX_SHOTS) {
      setTimeout(() => completeGame(), 600)
    }
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
            <span className="text-yellow-400 font-bold">{MAX_SHOTS - shots} shots left</span>
            <span className={`text-2xl font-mono ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
              {Math.ceil(timeLeft / 1000)}s
            </span>
          </div>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center py-12">
          <p className="text-slate-300 mb-6">
            Shoot the ducks! You have {MAX_SHOTS} shots. Tap where you want to shoot -
            if a duck is in your line of fire, it's a hit!
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
          <p className="text-slate-400 mt-2 text-sm">Tap to shoot straight up from that position!</p>
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
          <div className="text-6xl mb-4">{result.hits && result.hits >= (result.totalDucks || 0) * 0.5 ? '🎯' : '🦆'}</div>
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
                {result.hits}/{MAX_SHOTS}
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
              ? `Only hit ${result.hits} ducks. Try to hit more!`
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
