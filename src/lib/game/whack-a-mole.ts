import crypto from 'crypto'

export interface WhackAMoleConfig {
  grid_size: number
  num_moles: number
  num_bombs: number
  mole_duration_ms: number
  time_limit_seconds: number
  spawn_interval_ms: number
}

export interface WhackAMoleTurnSpec {
  seed: string
  gridSize: number
  numMoles: number
  numBombs: number
  moleDurationMs: number
  timeLimitMs: number
  spawnIntervalMs: number
  // Server-generated spawn sequence: [timestamp_offset, cell_index, type][]
  // type: 0 = mole, 1 = bomb
  spawnSequence: [number, number, number][]
}

export interface WhackEvent {
  eventType: string
  cellIndex?: number
  moleId?: number
  serverTimestamp: Date
  clientTimestampMs?: number
}

export interface WhackAMoleResult {
  valid: boolean
  reason?: string
  hits: number
  misses: number
  bombHits: number
  score?: number
  flag?: boolean
}

export const DEFAULT_WHACK_A_MOLE_CONFIG: WhackAMoleConfig = {
  grid_size: 3,
  num_moles: 35,
  num_bombs: 10,
  mole_duration_ms: 1200,
  time_limit_seconds: 30,
  spawn_interval_ms: 450,
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

export function generateWhackAMoleTurnSpec(
  userId: string,
  config: WhackAMoleConfig
): WhackAMoleTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  const totalCells = config.grid_size * config.grid_size
  const spawnSequence: [number, number, number][] = []

  const totalSpawns = config.num_moles + config.num_bombs

  // Create array of types: 0 = mole, 1 = bomb
  const types: number[] = []
  for (let i = 0; i < config.num_moles; i++) types.push(0)
  for (let i = 0; i < config.num_bombs; i++) types.push(1)

  // Shuffle types
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[types[i], types[j]] = [types[j], types[i]]
  }

  // Generate spawn sequence
  for (let i = 0; i < totalSpawns; i++) {
    const timeOffset = i * config.spawn_interval_ms + Math.round(random() * 200) - 100
    const cellIndex = Math.floor(random() * totalCells)
    spawnSequence.push([timeOffset, cellIndex, types[i]])
  }

  return {
    seed,
    gridSize: config.grid_size,
    numMoles: config.num_moles,
    numBombs: config.num_bombs,
    moleDurationMs: config.mole_duration_ms,
    timeLimitMs: config.time_limit_seconds * 1000,
    spawnIntervalMs: config.spawn_interval_ms,
    spawnSequence,
  }
}

export function getWhackAMoleClientSpec(spec: WhackAMoleTurnSpec): Partial<WhackAMoleTurnSpec> {
  // Send spawn sequence to client so it can display moles at the right time
  return {
    gridSize: spec.gridSize,
    numMoles: spec.numMoles,
    numBombs: spec.numBombs,
    moleDurationMs: spec.moleDurationMs,
    timeLimitMs: spec.timeLimitMs,
    spawnSequence: spec.spawnSequence,
  }
}

export function validateWhackAMoleTurn(
  spec: WhackAMoleTurnSpec,
  events: WhackEvent[]
): WhackAMoleResult {
  const hitEvents = events.filter(e => e.eventType === 'hit')
  const missEvents = events.filter(e => e.eventType === 'miss')
  const bombHitEvents = events.filter(e => e.eventType === 'bomb_hit')

  // Validate hits - check that each hit corresponds to an active mole
  const startEvent = events.find(e => e.eventType === 'mole_spawn' || hitEvents.length > 0)
  if (!startEvent && hitEvents.length === 0) {
    return { valid: false, reason: 'no_activity', hits: 0, misses: 0, bombHits: 0 }
  }

  const validHits: number[] = []
  const hitTimings: number[] = []

  for (const hit of hitEvents) {
    if (hit.cellIndex === undefined || hit.moleId === undefined) continue

    // Find the spawn for this mole
    const spawnEntry = spec.spawnSequence[hit.moleId]
    if (!spawnEntry) continue

    const [, expectedCell, type] = spawnEntry

    // Only count as hit if it's a mole (type 0), not a bomb
    if (hit.cellIndex === expectedCell && type === 0) {
      validHits.push(hit.moleId)
      if (hit.clientTimestampMs) {
        hitTimings.push(hit.clientTimestampMs)
      }
    }
  }

  // Check for impossibly fast or consistent hits
  if (hitTimings.length >= 3) {
    const intervals: number[] = []
    for (let i = 1; i < hitTimings.length; i++) {
      intervals.push(hitTimings[i] - hitTimings[i - 1])
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance = intervals.reduce((sum, t) => sum + Math.pow(t - avgInterval, 2), 0) / intervals.length
    const stdDev = Math.sqrt(variance)

    // Suspiciously consistent timing
    if (stdDev < 20 && intervals.length > 5) {
      return {
        valid: false,
        reason: 'suspicious_timing',
        hits: validHits.length,
        misses: missEvents.length,
        bombHits: bombHitEvents.length,
        flag: true,
      }
    }

    // Impossibly fast average hit rate
    if (avgInterval < 100) {
      return {
        valid: false,
        reason: 'impossible_speed',
        hits: validHits.length,
        misses: missEvents.length,
        bombHits: bombHitEvents.length,
        flag: true,
      }
    }
  }

  const hits = validHits.length
  const misses = missEvents.length
  const bombHits = bombHitEvents.length
  const score = calculateWhackAMoleScore(hits, misses, bombHits, spec)

  return {
    valid: true,
    hits,
    misses,
    bombHits,
    score,
  }
}

function calculateWhackAMoleScore(hits: number, misses: number, bombHits: number, spec: WhackAMoleTurnSpec): number {
  // Score based on accuracy and hits
  const maxHits = spec.numMoles
  const hitScore = (hits / maxHits) * 7000
  const accuracyBonus = hits > 0 ? (hits / (hits + misses + bombHits)) * 2000 : 0
  const missPenalty = misses * 30
  const bombPenalty = bombHits * 300 // Heavy penalty for hitting bombs

  return Math.max(0, Math.round(hitScore + accuracyBonus - missPenalty - bombPenalty))
}
