import crypto from 'crypto'

export interface ReactionTimeConfig {
  num_rounds: number
  min_delay_ms: number
  max_delay_ms: number
  max_reaction_ms: number
  time_limit_seconds: number
}

export interface ReactionTimeTurnSpec {
  seed: string
  delays: number[] // Server-generated random delays for each round
  maxReactionMs: number
  timeLimitMs: number
  numRounds: number
}

export interface ReactionEvent {
  eventType: string
  round?: number
  serverTimestamp: Date
  clientTimestampMs?: number
}

export interface ReactionTimeResult {
  valid: boolean
  reason?: string
  reactionTimes: number[]
  averageReactionMs?: number
  score?: number
  flag?: boolean
}

export const DEFAULT_REACTION_TIME_CONFIG: ReactionTimeConfig = {
  num_rounds: 5,
  min_delay_ms: 1000,
  max_delay_ms: 4000,
  max_reaction_ms: 1000,
  time_limit_seconds: 60,
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

export function generateReactionTimeTurnSpec(
  userId: string,
  config: ReactionTimeConfig
): ReactionTimeTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  // Generate random delays for each round
  const delays: number[] = []
  for (let i = 0; i < config.num_rounds; i++) {
    const delay = config.min_delay_ms + random() * (config.max_delay_ms - config.min_delay_ms)
    delays.push(Math.round(delay))
  }

  return {
    seed,
    delays,
    maxReactionMs: config.max_reaction_ms,
    timeLimitMs: config.time_limit_seconds * 1000,
    numRounds: config.num_rounds,
  }
}

export function getReactionTimeClientSpec(spec: ReactionTimeTurnSpec): Partial<ReactionTimeTurnSpec> {
  // Don't send delays to client - server controls when signals appear
  return {
    maxReactionMs: spec.maxReactionMs,
    timeLimitMs: spec.timeLimitMs,
    numRounds: spec.numRounds,
  }
}

export function validateReactionTimeTurn(
  spec: ReactionTimeTurnSpec,
  events: ReactionEvent[]
): ReactionTimeResult {
  const reactionTimes: number[] = []

  // Group events by round
  const roundEvents = new Map<number, { signalTime?: Date; tapTime?: Date }>()

  for (const event of events) {
    const roundNum = event.round ?? -1
    if (roundNum < 0) continue

    if (!roundEvents.has(roundNum)) {
      roundEvents.set(roundNum, {})
    }
    const round = roundEvents.get(roundNum)!

    if (event.eventType === 'signal_shown') {
      round.signalTime = event.serverTimestamp
    } else if (event.eventType === 'tap') {
      round.tapTime = event.serverTimestamp
    }
  }

  // Validate each round
  for (let i = 0; i < spec.numRounds; i++) {
    const round = roundEvents.get(i)

    if (!round || !round.signalTime || !round.tapTime) {
      return { valid: false, reason: 'incomplete_rounds', reactionTimes }
    }

    const reactionMs = round.tapTime.getTime() - round.signalTime.getTime()
    reactionTimes.push(reactionMs)

    // Check for impossibly fast reaction (bot detection)
    if (reactionMs < 100) {
      return {
        valid: false,
        reason: 'impossible_speed',
        reactionTimes,
        flag: true
      }
    }

    // Check for too slow reaction
    if (reactionMs > spec.maxReactionMs) {
      return { valid: false, reason: 'too_slow', reactionTimes }
    }
  }

  // Check for suspicious consistency (bot detection)
  if (reactionTimes.length >= 3) {
    const avg = reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length
    const variance = reactionTimes.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / reactionTimes.length
    const stdDev = Math.sqrt(variance)

    // If std dev is less than 10ms over multiple rounds, likely a bot
    if (stdDev < 10) {
      return {
        valid: false,
        reason: 'suspicious_consistency',
        reactionTimes,
        flag: true,
      }
    }
  }

  const averageReactionMs = Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length)
  const score = calculateReactionTimeScore(averageReactionMs, spec)

  return {
    valid: true,
    reactionTimes,
    averageReactionMs,
    score,
  }
}

function calculateReactionTimeScore(avgReactionMs: number, spec: ReactionTimeTurnSpec): number {
  // Lower reaction time = higher score
  // Perfect (100ms) = 10000, max allowed = 0
  const maxScore = 10000
  const perfectTime = 100
  const maxTime = spec.maxReactionMs

  if (avgReactionMs <= perfectTime) return maxScore
  if (avgReactionMs >= maxTime) return 0

  const range = maxTime - perfectTime
  const position = avgReactionMs - perfectTime
  const score = maxScore * (1 - position / range)

  return Math.round(score)
}
