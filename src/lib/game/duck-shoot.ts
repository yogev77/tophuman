import crypto from 'crypto'

export interface DuckShootConfig {
  canvas_width: number
  canvas_height: number
  time_limit_seconds: number
  initial_duck_speed: number // pixels per second
  speed_increase_rate: number // multiplier per duck
  duck_size: number
}

export interface DuckSpawn {
  spawnTimeMs: number
  fromLeft: boolean // true = enters from left, false = enters from right
  yPosition: number
  speed: number
}

export interface DuckShootTurnSpec {
  seed: string
  canvasWidth: number
  canvasHeight: number
  duckSize: number
  duckSpawns: DuckSpawn[]
  timeLimitMs: number
}

export interface ShootEvent {
  eventType: string
  x?: number
  y?: number
  duckIndex?: number
  serverTimestamp: Date
  clientTimestampMs?: number
}

export interface DuckShootResult {
  valid: boolean
  reason?: string
  hits: number
  totalDucks: number
  accuracy?: number
  score?: number
  flag?: boolean
}

export const DEFAULT_DUCK_SHOOT_CONFIG: DuckShootConfig = {
  canvas_width: 400,
  canvas_height: 300,
  time_limit_seconds: 30,
  initial_duck_speed: 100,
  speed_increase_rate: 1.08,
  duck_size: 50,
}

function seededRandom(seed: string): () => number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }

  return function() {
    hash = Math.sin(hash) * 10000
    return hash - Math.floor(hash)
  }
}

export function generateDuckShootTurnSpec(
  userId: string,
  config: DuckShootConfig
): DuckShootTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  const duckSpawns: DuckSpawn[] = []
  let currentTime = 1000 // Start after 1 second
  let currentSpeed = config.initial_duck_speed
  const minY = config.duck_size + 20
  const maxY = config.canvas_height - 100 // Leave room for gun at bottom

  // Generate duck spawns for the entire game duration
  while (currentTime < config.time_limit_seconds * 1000 - 2000) {
    const fromLeft = random() > 0.5
    const yPosition = minY + random() * (maxY - minY)

    duckSpawns.push({
      spawnTimeMs: currentTime,
      fromLeft,
      yPosition,
      speed: currentSpeed,
    })

    // Time until next duck based on screen width and speed
    const screenCrossTime = config.canvas_width / currentSpeed * 1000
    // Next duck spawns when current is about halfway across (or random interval)
    const interval = Math.max(800, screenCrossTime * (0.4 + random() * 0.3))
    currentTime += interval

    // Increase speed for next duck
    currentSpeed *= config.speed_increase_rate
  }

  return {
    seed,
    canvasWidth: config.canvas_width,
    canvasHeight: config.canvas_height,
    duckSize: config.duck_size,
    duckSpawns,
    timeLimitMs: config.time_limit_seconds * 1000,
  }
}

export function getDuckShootClientSpec(spec: DuckShootTurnSpec): {
  canvasWidth: number
  canvasHeight: number
  duckSize: number
  duckSpawns: DuckSpawn[]
  timeLimitMs: number
} {
  return {
    canvasWidth: spec.canvasWidth,
    canvasHeight: spec.canvasHeight,
    duckSize: spec.duckSize,
    duckSpawns: spec.duckSpawns,
    timeLimitMs: spec.timeLimitMs,
  }
}

export function validateDuckShootTurn(
  spec: DuckShootTurnSpec,
  events: ShootEvent[]
): DuckShootResult {
  const shoots = events.filter(e => e.eventType === 'shoot')

  if (shoots.length === 0) {
    return { valid: false, reason: 'no_shots', hits: 0, totalDucks: spec.duckSpawns.length }
  }

  // Check timing for bot detection
  const times = shoots.map(s => s.clientTimestampMs || 0).filter(t => t > 0)
  if (times.length >= 5) {
    const intervals: number[] = []
    for (let i = 1; i < times.length; i++) {
      intervals.push(times[i] - times[i - 1])
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length

    // Impossibly fast shooting
    if (avgInterval < 100) {
      return {
        valid: false,
        reason: 'impossible_speed',
        hits: 0,
        totalDucks: spec.duckSpawns.length,
        flag: true,
      }
    }

    // Check for suspiciously consistent timing
    const variance = intervals.reduce((sum, t) => sum + Math.pow(t - avgInterval, 2), 0) / intervals.length
    const stdDev = Math.sqrt(variance)
    if (stdDev < 20 && intervals.length >= 8) {
      return {
        valid: false,
        reason: 'suspicious_timing',
        hits: 0,
        totalDucks: spec.duckSpawns.length,
        flag: true,
      }
    }
  }

  // Calculate hits and accuracy
  let hits = 0
  let totalAccuracy = 0
  const hitDucks = new Set<number>()

  for (const shoot of shoots) {
    if (shoot.duckIndex !== undefined && !hitDucks.has(shoot.duckIndex)) {
      const duck = spec.duckSpawns[shoot.duckIndex]
      if (duck && shoot.x !== undefined && shoot.y !== undefined) {
        // Calculate duck position at time of shot
        const shotTime = shoot.clientTimestampMs || 0
        const duckAge = shotTime - duck.spawnTimeMs

        let duckX: number
        if (duck.fromLeft) {
          duckX = (duckAge / 1000) * duck.speed
        } else {
          duckX = spec.canvasWidth - (duckAge / 1000) * duck.speed
        }
        const duckY = duck.yPosition
        const duckCenterX = duckX + spec.duckSize / 2
        const duckCenterY = duckY + spec.duckSize / 2

        // Check if shot is within duck bounds (generous hitbox)
        const hitRadius = spec.duckSize * 0.6
        const distance = Math.sqrt(
          Math.pow(shoot.x - duckCenterX, 2) + Math.pow(shoot.y - duckCenterY, 2)
        )

        if (distance <= hitRadius) {
          hits++
          hitDucks.add(shoot.duckIndex)
          // Accuracy: 1 = perfect center, 0 = edge of hitbox
          const accuracy = Math.max(0, 1 - distance / hitRadius)
          totalAccuracy += accuracy
        }
      }
    }
  }

  const totalDucks = spec.duckSpawns.length

  // Must hit at least 20% of ducks
  if (hits < totalDucks * 0.2) {
    return { valid: false, reason: 'not_enough_hits', hits, totalDucks }
  }

  const avgAccuracy = hits > 0 ? totalAccuracy / hits : 0

  // Score components:
  // 1. Hits: up to 5000 points (based on hit ratio)
  const hitRatio = hits / totalDucks
  const hitScore = Math.round(hitRatio * 5000)

  // 2. Accuracy bonus: up to 3000 points
  const accuracyBonus = Math.round(avgAccuracy * 3000)

  // 3. Streak bonus: up to 2000 points for consecutive hits
  // (simplified: based on total hits as proxy for streaks)
  const streakBonus = Math.min(2000, hits * 100)

  const score = hitScore + accuracyBonus + streakBonus

  return {
    valid: true,
    hits,
    totalDucks,
    accuracy: avgAccuracy,
    score,
  }
}
