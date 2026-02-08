import crypto from 'crypto'

export interface MemoryCardsConfig {
  rounds: { num_pairs: number }[]
  time_limit_seconds: number
  flip_back_delay_ms: number
}

export interface MemoryCardsRound {
  cards: string[]
  numPairs: number
}

export interface MemoryCardsTurnSpec {
  seed: string
  rounds: MemoryCardsRound[]
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
  rounds: [
    { num_pairs: 4 },
    { num_pairs: 6 },
  ],
  time_limit_seconds: 90,
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

  const rounds: MemoryCardsRound[] = config.rounds.map(roundConfig => {
    const shuffledPool = shuffle(EMOJI_POOL, random)
    const chosen = shuffledPool.slice(0, roundConfig.num_pairs)
    const cards = shuffle([...chosen, ...chosen], random)
    return { cards, numPairs: roundConfig.num_pairs }
  })

  return {
    seed,
    rounds,
    timeLimitMs: config.time_limit_seconds * 1000,
    flipBackDelayMs: config.flip_back_delay_ms,
  }
}

export function getMemoryCardsClientSpec(spec: MemoryCardsTurnSpec): {
  rounds: MemoryCardsRound[]
  timeLimitMs: number
  flipBackDelayMs: number
} {
  return {
    rounds: spec.rounds,
    timeLimitMs: spec.timeLimitMs,
    flipBackDelayMs: spec.flipBackDelayMs,
  }
}

export function validateMemoryCardsTurn(
  spec: MemoryCardsTurnSpec,
  events: MemoryCardsEvent[]
): MemoryCardsResult {
  const matchAttempts = events.filter(e => e.eventType === 'match_attempt')
  // Validate matches server-side (don't trust client's matched field)
  const successfulMatches = matchAttempts.filter(e => {
    if (e.card1 === undefined || e.card2 === undefined || e.card1 === e.card2) return false
    return spec.rounds.some(round =>
      e.card1! < round.cards.length &&
      e.card2! < round.cards.length &&
      round.cards[e.card1!] === round.cards[e.card2!]
    )
  })
  const roundCompletes = events.filter(e => e.eventType === 'round_complete')

  const totalPairs = spec.rounds.reduce((sum, r) => sum + r.numPairs, 0)

  if (roundCompletes.length === 0 && successfulMatches.length < spec.rounds[0].numPairs) {
    return { valid: false, reason: 'incomplete', matchAttempts: matchAttempts.length }
  }

  // Anti-cheat: check flip timing
  const flips = events.filter(e => e.eventType === 'flip')
  const flipTimes = flips.map(e => new Date(e.serverTimestamp).getTime()).filter(t => t > 0)

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

  // Calculate time (server-authoritative)
  const allTimes = events.map(e => new Date(e.serverTimestamp).getTime()).filter(t => t > 0)
  const totalTimeMs = allTimes.length >= 2
    ? allTimes[allTimes.length - 1] - allTimes[0]
    : spec.timeLimitMs

  // Scoring: reward completing more rounds + efficiency
  const roundsCompleted = roundCompletes.length + (successfulMatches.length >= totalPairs ? 1 : 0)
  const pairsMatched = successfulMatches.length
  const basePoints = 4000 * (pairsMatched / Math.max(matchAttempts.length, 1))
  const roundBonus = roundsCompleted * 1000
  const score = Math.round((basePoints + roundBonus) * Math.sqrt(spec.timeLimitMs / Math.max(totalTimeMs, 1000)))

  return {
    valid: true,
    score,
    matchAttempts: matchAttempts.length,
  }
}
