import crypto from 'crypto'

export interface NumberChainConfig {
  time_limit_seconds: number
  gridSize: number      // total cells (16)
  chainLength: number   // numbers to chain (10)
}

export interface NumberChainRound {
  grid: number[]          // 16 numbers in cell order (shuffled positions)
  numbers: number[]       // the 16 consecutive numbers (sorted)
  baseNumber: number      // first of the 16 consecutive numbers
  chainStart: number      // the number the player starts chaining from
  chainLength: number     // 10
  direction: 'forward' | 'backward'
  sequence: number[]      // the 10 target numbers in order (server-only)
}

export interface NumberChainTurnSpec {
  seed: string
  rounds: NumberChainRound[]
  timeLimitMs: number
}

export interface NumberChainEvent {
  eventType: string
  number?: number
  serverTimestamp: Date
  clientTimestampMs?: number
}

export interface NumberChainResult {
  valid: boolean
  reason?: string
  score?: number
  mistakes?: number
  flag?: boolean
}

export const DEFAULT_NUMBER_CHAIN_CONFIG: NumberChainConfig = {
  time_limit_seconds: 45,
  gridSize: 16,
  chainLength: 10,
}

function seededRandom(seed: string): () => number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }

  return function () {
    hash = Math.sin(hash) * 10000
    return hash - Math.floor(hash)
  }
}

function generateRound(
  random: () => number,
  config: NumberChainConfig,
  direction: 'forward' | 'backward'
): NumberChainRound {
  // Random base: 10-84 (keeps all 16 numbers 2-digit: max = 84+15 = 99)
  const baseNumber = Math.floor(random() * 75) + 10

  // 16 consecutive numbers
  const numbers = Array.from({ length: config.gridSize }, (_, i) => baseNumber + i)

  // Shuffle into grid positions (Fisher-Yates)
  const grid = [...numbers]
  for (let i = grid.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[grid[i], grid[j]] = [grid[j], grid[i]]
  }

  // Random chain offset: 0 to (gridSize - chainLength) = 0-6
  const maxOffset = config.gridSize - config.chainLength
  const chainOffset = Math.floor(random() * (maxOffset + 1))

  let chainStart: number
  let sequence: number[]

  if (direction === 'forward') {
    chainStart = baseNumber + chainOffset
    sequence = Array.from({ length: config.chainLength }, (_, i) => chainStart + i)
  } else {
    chainStart = baseNumber + config.gridSize - 1 - chainOffset
    sequence = Array.from({ length: config.chainLength }, (_, i) => chainStart - i)
  }

  return {
    grid,
    numbers,
    baseNumber,
    chainStart,
    chainLength: config.chainLength,
    direction,
    sequence,
  }
}

export function generateNumberChainTurnSpec(
  userId: string,
  config: NumberChainConfig
): NumberChainTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  // Two rounds: one forward, one backward, random order
  const forwardFirst = random() < 0.5
  const directions: ('forward' | 'backward')[] = forwardFirst
    ? ['forward', 'backward']
    : ['backward', 'forward']

  const rounds = directions.map(dir => generateRound(random, config, dir))

  return {
    seed,
    rounds,
    timeLimitMs: config.time_limit_seconds * 1000,
  }
}

export function getNumberChainClientSpec(spec: NumberChainTurnSpec): {
  rounds: {
    grid: number[]
    chainStart: number
    chainLength: number
    direction: 'forward' | 'backward'
  }[]
  timeLimitMs: number
} {
  return {
    rounds: spec.rounds.map(r => ({
      grid: r.grid,
      chainStart: r.chainStart,
      chainLength: r.chainLength,
      direction: r.direction,
      // sequence is NOT sent to client
    })),
    timeLimitMs: spec.timeLimitMs,
  }
}

export function validateNumberChainTurn(
  spec: NumberChainTurnSpec,
  events: NumberChainEvent[]
): NumberChainResult {
  // Sort taps by client timestamp
  const taps = events
    .filter(e => e.eventType === 'tap')
    .sort((a, b) => new Date(a.serverTimestamp).getTime() - new Date(b.serverTimestamp).getTime())

  // Build full expected sequence across all rounds
  const fullSequence: number[] = []
  let totalChainLength = 0
  for (const round of spec.rounds) {
    fullSequence.push(...round.sequence)
    totalChainLength += round.chainLength
  }

  if (taps.length < totalChainLength) {
    return { valid: false, reason: 'incomplete' }
  }

  // Verify taps match expected sequence
  for (let i = 0; i < totalChainLength; i++) {
    if (taps[i].number !== fullSequence[i]) {
      return { valid: false, reason: 'wrong_order' }
    }
  }

  // Anti-cheat: check tap timing (server-authoritative)
  const tapTimes = taps.map(e => new Date(e.serverTimestamp).getTime()).filter(t => t > 0)

  if (tapTimes.length >= 5) {
    const intervals: number[] = []
    for (let i = 1; i < tapTimes.length; i++) {
      intervals.push(tapTimes[i] - tapTimes[i - 1])
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance = intervals.reduce((sum, t) => sum + Math.pow(t - avgInterval, 2), 0) / intervals.length
    const stdDev = Math.sqrt(variance)

    if (avgInterval < 100 || stdDev < 20) {
      return { valid: false, reason: 'suspicious_timing', flag: true }
    }
  }

  // Count wrong taps (mistakes)
  const wrongTaps = events.filter(e => e.eventType === 'wrong_tap')
  const mistakeCount = wrongTaps.length

  // Score: sqrt-based scoring with accuracy penalty
  const firstTap = tapTimes[0]
  const lastTap = tapTimes[tapTimes.length - 1]
  const totalTimeMs = lastTap - firstTap

  const accuracyFactor = totalChainLength / (totalChainLength + mistakeCount)
  const basePoints = 5000 * accuracyFactor
  const score = Math.round(basePoints * Math.sqrt(spec.timeLimitMs / Math.max(totalTimeMs, 1000)))

  return {
    valid: true,
    score,
    mistakes: mistakeCount,
  }
}
