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
  isDecoy: boolean // green dot target - should NOT be shot
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
  hitAccuracy?: number
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

    const isDecoy = random() < 0.25 // ~25% are decoy (green) targets

    duckSpawns.push({
      spawnTimeMs: currentTime,
      fromLeft,
      yPosition,
      speed: currentSpeed,
      isDecoy,
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

  // Calculate hits and accuracy - trust client's hit detection
  const hitDucks = new Set<number>()
  const hitDecoys = new Set<number>()
  let totalAccuracy = 0

  for (const shoot of shoots) {
    if (shoot.duckIndex !== undefined && !hitDucks.has(shoot.duckIndex) && !hitDecoys.has(shoot.duckIndex)) {
      // Validate duck index is valid
      if (shoot.duckIndex >= 0 && shoot.duckIndex < spec.duckSpawns.length) {
        const spawn = spec.duckSpawns[shoot.duckIndex]
        if (spawn.isDecoy) {
          hitDecoys.add(shoot.duckIndex)
        } else {
          hitDucks.add(shoot.duckIndex)
          totalAccuracy += shoot.hitAccuracy ?? 0.5
        }
      }
    }
  }

  const hits = hitDucks.size
  const decoyHits = hitDecoys.size

  const maxShots = 10
  const maxTimeMs = 30000 // 30 seconds

  // Must hit at least 2 ducks (20% of max shots)
  if (hits < 2) {
    return { valid: false, reason: 'not_enough_hits', hits, totalDucks: maxShots }
  }

  // Calculate time taken (from first to last shot)
  const shotTimes = shoots.map(s => s.clientTimestampMs || 0).filter(t => t > 0)
  const timeTakenMs = shotTimes.length >= 2
    ? shotTimes[shotTimes.length - 1] - shotTimes[0]
    : maxTimeMs

  // Average accuracy per hit (how close to duck center)
  const avgHitAccuracy = hits > 0 ? totalAccuracy / hits : 0

  const hitScore = hits * 600
  const precisionBonus = Math.round(avgHitAccuracy * 4000)
  const speed = Math.sqrt(maxTimeMs / Math.max(timeTakenMs, 2000))
  const decoyPenalty = decoyHits * 400

  const score = Math.max(0, Math.round((hitScore + precisionBonus) * speed - decoyPenalty))

  return {
    valid: true,
    hits,
    totalDucks: maxShots,
    accuracy: avgHitAccuracy,
    score,
  }
}
