'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Crosshair } from 'lucide-react'
import { ShareScore } from './ShareScore'
import { CC } from '@/lib/currency'

type GamePhase = 'idle' | 'loading' | 'playing' | 'checking' | 'completed' | 'failed'

interface DuckSpawn {
  spawnTimeMs: number
  fromLeft: boolean
  yPosition: number
  speed: number
  isDecoy: boolean
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
  decoyHit: boolean
}

interface BulletTrail {
  hit: boolean
  decoy: boolean
  hitY?: number
  startTime: number
}

const MAX_SHOTS = 10

// Minimal target: thin rings + colored center
function drawTarget(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, isDecoy: boolean) {
  const r = size / 2

  // Outer ring
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Middle ring
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2)
  ctx.stroke()

  // Inner ring
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2)
  ctx.stroke()

  // Center dot — red = shoot, green = avoid
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.15, 0, Math.PI * 2)
  ctx.fillStyle = isDecoy ? '#16a34a' : '#dc2626'
  ctx.fill()
}

// Gun: half-circle base + thin barrel
function drawGun(ctx: CanvasRenderingContext2D, cx: number, bottomY: number) {
  const baseR = 16
  const barrelW = 4
  const barrelH = 22

  // Barrel (rounded rect)
  const bx = cx - barrelW / 2
  const by = bottomY - baseR - barrelH + 4
  ctx.beginPath()
  ctx.roundRect(bx, by, barrelW, barrelH, 2)
  ctx.fillStyle = '#000'
  ctx.fill()

  // Half-circle base
  ctx.beginPath()
  ctx.arc(cx, bottomY, baseR, Math.PI, 0)
  ctx.fillStyle = '#000'
  ctx.fill()

  // Sight line on barrel tip
  ctx.beginPath()
  ctx.arc(cx, by, 2, 0, Math.PI * 2)
  ctx.fillStyle = '#dc2626'
  ctx.fill()
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
  const [penalties, setPenalties] = useState(0)
  const [shots, setShots] = useState(0)
  const [bulletTrails, setBulletTrails] = useState<BulletTrail[]>([])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const animationRef = useRef<number | null>(null)
  const gameStartTimeRef = useRef<number>(0)
  const lastShotTimeRef = useRef<number>(0)

  const drawGame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !spec) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const now = Date.now()
    const w = canvas.width
    const h = canvas.height

    // White background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)

    // Grid lines — thin, dark gray
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.07)'
    ctx.lineWidth = 1
    const gridSpacing = 40
    for (let y = gridSpacing; y < h; y += gridSpacing) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
    for (let x = gridSpacing; x < w; x += gridSpacing) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }

    // Center firing line — faint dashed
    ctx.setLineDash([4, 6])
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(w / 2, 0)
    ctx.lineTo(w / 2, h - 40)
    ctx.stroke()
    ctx.setLineDash([])

    const cannonX = w / 2
    const cannonY = h - 6

    // Bullet trails
    const activeTrails = bulletTrails.filter(t => now - t.startTime < 250)
    for (const trail of activeTrails) {
      const age = now - trail.startTime
      const opacity = 1 - age / 250
      const targetY = trail.hit && trail.hitY !== undefined ? trail.hitY : 0

      ctx.strokeStyle = trail.decoy
        ? `rgba(22, 163, 98, ${opacity})`
        : trail.hit
        ? `rgba(220, 38, 38, ${opacity})`
        : `rgba(0, 0, 0, ${opacity * 0.3})`
      ctx.lineWidth = trail.hit ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(cannonX, cannonY - 40)
      ctx.lineTo(cannonX, targetY)
      ctx.stroke()

      // Impact
      if (trail.hit && trail.hitY !== undefined && age < 180) {
        const s = 10 * (1 - age / 180)
        if (trail.decoy) {
          ctx.strokeStyle = `rgba(22, 163, 98, ${opacity})`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(cannonX - s, trail.hitY - s)
          ctx.lineTo(cannonX + s, trail.hitY + s)
          ctx.moveTo(cannonX + s, trail.hitY - s)
          ctx.lineTo(cannonX - s, trail.hitY + s)
          ctx.stroke()
        } else {
          ctx.beginPath()
          ctx.arc(cannonX, trail.hitY, s, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(220, 38, 38, ${opacity})`
          ctx.lineWidth = 2
          ctx.stroke()
        }
      }
    }

    // Targets
    for (const duck of activeDucks) {
      if (duck.hit || duck.decoyHit) continue
      const cx = duck.x + spec.duckSize / 2
      const cy = duck.spawn.yPosition + spec.duckSize / 2
      drawTarget(ctx, cx, cy, spec.duckSize, duck.spawn.isDecoy)
    }

    // Gun
    drawGun(ctx, cannonX, cannonY)

  }, [spec, activeDucks, bulletTrails])

  const gameLoop = useCallback(() => {
    if (phase !== 'playing' || !spec) return

    const elapsed = Date.now() - gameStartTimeRef.current
    // Speed tiers: shots 1-3 = 1x, shots 4-7 = 1.5x, shots 8-10 = 2x
    const speedMultiplier = shots < 4 ? 1 : shots < 8 ? 1.5 : 2

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
            updated.push({ index: i, spawn, x: initialX, hit: false, decoyHit: false })
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
    setPenalties(0)
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
    if (shots >= MAX_SHOTS) return
    e.preventDefault()
    e.stopPropagation()

    const now = Date.now()
    if (now - lastShotTimeRef.current < 250) return
    lastShotTimeRef.current = now

    const canvas = canvasRef.current
    if (!canvas) return

    const newShots = shots + 1
    setShots(newShots)

    const cannonX = canvas.width / 2

    let hitDuckIndex: number | undefined
    let hitDuck: ActiveDuck | undefined
    let hitAccuracy = 0

    for (const duck of activeDucks) {
      if (duck.hit || duck.decoyHit) continue

      const duckLeft = duck.x
      const duckRight = duck.x + spec.duckSize
      const duckCenterX = duck.x + spec.duckSize / 2

      if (cannonX >= duckLeft && cannonX <= duckRight) {
        hitDuckIndex = duck.index
        hitDuck = duck
        const distanceFromCenter = Math.abs(cannonX - duckCenterX)
        const maxDistance = spec.duckSize / 2
        hitAccuracy = Math.max(0, 1 - (distanceFromCenter / maxDistance))

        if (duck.spawn.isDecoy) {
          setPenalties(prev => prev + 1)
          setActiveDucks(prev =>
            prev.map(d => (d.index === duck.index ? { ...d, decoyHit: true } : d))
          )
        } else {
          setHits(prev => prev + 1)
          setActiveDucks(prev =>
            prev.map(d => (d.index === duck.index ? { ...d, hit: true } : d))
          )
        }
        break
      }
    }

    setBulletTrails(prev => [...prev, {
      hit: !!hitDuck,
      decoy: hitDuck?.spawn.isDecoy ?? false,
      hitY: hitDuck ? hitDuck.spawn.yPosition + spec.duckSize / 2 : undefined,
      startTime: Date.now()
    }])

    await fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken,
        eventType: 'shoot',
        x: cannonX,
        y: hitDuck ? hitDuck.spawn.yPosition + spec.duckSize / 2 : 0,
        duckIndex: hitDuckIndex,
        hitAccuracy: hitAccuracy,
        clientTimestampMs: Date.now(),
      }),
    })

    if (newShots >= MAX_SHOTS) {
      completeGame()
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

  useEffect(() => {
    if (bulletTrails.length === 0) return
    const timer = setTimeout(() => {
      setBulletTrails(prev => prev.filter(t => Date.now() - t.startTime < 250))
    }, 100)
    return () => clearTimeout(timer)
  }, [bulletTrails])

  const remaining = MAX_SHOTS - shots

  return (
    <div className="bg-slate-800 rounded-xl p-4 sm:p-6">
      {phase === 'playing' && spec && (
        <div className="flex items-center justify-end mb-3 gap-3 text-sm font-mono tracking-wide">
          <span className="text-white">{hits}<span className="text-slate-500 ml-1">hit</span></span>
          {penalties > 0 && <span className="text-red-400">-{penalties}</span>}
          <span className="text-slate-400">{remaining}<span className="text-slate-500 ml-1">left</span></span>
          <span className={`text-lg font-bold ${timeLeft < 10000 ? 'text-red-400' : 'text-white'}`}>
            {Math.ceil(timeLeft / 1000)}
          </span>
        </div>
      )}

      {phase === 'idle' && (
        <div className="text-center py-12">
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
          <div className="animate-spin w-10 h-10 border-2 border-black border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      )}

      {phase === 'playing' && spec && (
        <div
          className="touch-none select-none"
          onClick={handleShoot}
          onTouchStart={handleShoot}
        >
          {/* Shot indicators */}
          <div className="flex justify-center gap-1.5 mb-3">
            {Array.from({ length: MAX_SHOTS }).map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${
                  i < shots ? 'bg-slate-600' : 'bg-red-500'
                }`}
              />
            ))}
          </div>
          <div className="rounded-lg overflow-hidden border border-black/10">
            <canvas
              ref={canvasRef}
              width={spec.canvasWidth}
              height={spec.canvasHeight}
              className="w-full h-auto pointer-events-none"
            />
          </div>
          <p className="text-slate-500 mt-2 text-xs text-center tracking-wide">TAP ANYWHERE TO FIRE</p>
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="animate-spin w-10 h-10 border-2 border-black border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-400 text-sm">Calculating...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
            <Crosshair className="w-10 h-10 text-emerald-400" />
          </div>
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
              <div className="text-xl font-bold text-white">
                {result.hits}/{MAX_SHOTS}
              </div>
              <div className="text-sm text-slate-400">Hits</div>
            </div>
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="text-xl font-bold text-white">
                {result.accuracy ? Math.round(result.accuracy * 100) : 0}%
              </div>
              <div className="text-sm text-slate-400">Accuracy</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
            <button
              onClick={startGame}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg transition"
            >
              Play Again
            </button>
            <Link href="/" className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 px-8 rounded-lg transition text-center">
              New Game
            </Link>
          </div>
          <ShareScore gameName="Target Shoot" score={result.score || 0} rank={result.rank} />
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
            <Crosshair className="w-10 h-10 text-emerald-400" />
          </div>
          <h3 className="text-2xl font-bold text-red-400 mb-4">Not Enough Hits!</h3>
          <p className="text-slate-300 mb-6">
            {result?.reason === 'no_shots'
              ? 'You need to fire at the targets!'
              : result?.reason === 'not_enough_hits'
              ? `Only hit ${result.hits} targets. Try to hit more!`
              : 'Keep practicing your aim!'}
          </p>
          <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
            <button
              onClick={startGame}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg transition"
            >
              Try Again
            </button>
            <Link href="/" className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 px-8 rounded-lg transition text-center">
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
