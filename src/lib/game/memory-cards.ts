import crypto from 'crypto'

export interface MemoryCardsConfig {
  num_pairs: number
  time_limit_seconds: number
  flip_back_delay_ms: number
}

export interface MemoryCardsTurnSpec {
  seed: string
  cards: string[]
  timeLimitMs: number
  flipBackDelayMs: number
}

export interface MemoryCardsEvent {
  eventType: string
  cardIndex?: number
  card1?: number
  card2?: number
  matched?: boolean
  serverTimestamp: Date
  clientTimestampMs?: number
}

export interface MemoryCardsResult {
  valid: boolean
  reason?: string
  score?: number
  matchAttempts?: number
  flag?: boolean
}

export const DEFAULT_MEMORY_CARDS_CONFIG: MemoryCardsConfig = {
  num_pairs: 4,
  time_limit_seconds: 60,
  flip_back_delay_ms: 800,
}

const EMOJI_POOL = [
  '🍎', '🍊', '🍋', '🍇', '🍓', '🍒', '🍑', '🥝',
  '🌟', '🔥', '💎', '🎯', '🎲', '🎸', '🚀', '⚡',
  '🌈', '🎪', '🎭', '🏆',
]

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

function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function generateMemoryCardsTurnSpec(
  userId: string,
  config: MemoryCardsConfig
): MemoryCardsTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  // Pick random emojis
  const shuffledPool = shuffle(EMOJI_POOL, random)
  const chosen = shuffledPool.slice(0, config.num_pairs)

  // Duplicate and shuffle
  const cards = shuffle([...chosen, ...chosen], random)

  return {
    seed,
    cards,
    timeLimitMs: config.time_limit_seconds * 1000,
    flipBackDelayMs: config.flip_back_delay_ms,
  }
}

export function getMemoryCardsClientSpec(spec: MemoryCardsTurnSpec): {
  cards: string[]
  timeLimitMs: number
  flipBackDelayMs: number
} {
  return {
    cards: spec.cards,
    timeLimitMs: spec.timeLimitMs,
    flipBackDelayMs: spec.flipBackDelayMs,
  }
}

export function validateMemoryCardsTurn(
  spec: MemoryCardsTurnSpec,
  events: MemoryCardsEvent[]
): MemoryCardsResult {
  const matchAttempts = events.filter(e => e.eventType === 'match_attempt')
  const successfulMatches = matchAttempts.filter(e => e.matched === true)

  if (successfulMatches.length < spec.cards.length / 2) {
    return { valid: false, reason: 'incomplete', matchAttempts: matchAttempts.length }
  }

  // Anti-cheat: check flip timing
  const flips = events.filter(e => e.eventType === 'flip')
  const flipTimes = flips.map(e => e.clientTimestampMs || 0).filter(t => t > 0)

  if (flipTimes.length >= 4) {
    const intervals: number[] = []
    for (let i = 1; i < flipTimes.length; i++) {
      intervals.push(flipTimes[i] - flipTimes[i - 1])
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance = intervals.reduce((sum, t) => sum + Math.pow(t - avgInterval, 2), 0) / intervals.length
    const stdDev = Math.sqrt(variance)

    if (avgInterval < 200 || stdDev < 30) {
      return { valid: false, reason: 'suspicious_timing', matchAttempts: matchAttempts.length, flag: true }
    }
  }

  // Calculate time
  const allTimes = events.map(e => e.clientTimestampMs || 0).filter(t => t > 0)
  const totalTimeMs = allTimes.length >= 2
    ? allTimes[allTimes.length - 1] - allTimes[0]
    : spec.timeLimitMs

  // Scoring: basePoints degrades with mismatches, speed bonus via sqrt
  const numPairs = spec.cards.length / 2
  const basePoints = 4000 * (numPairs / matchAttempts.length)
  const score = Math.round(basePoints * Math.sqrt(spec.timeLimitMs / Math.max(totalTimeMs, 1000)))

  return {
    valid: true,
    score,
    matchAttempts: matchAttempts.length,
  }
}
