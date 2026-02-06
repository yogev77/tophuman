import crypto from 'crypto'

export interface ReactionTimeConfig {
  num_rounds: number
  min_delay_ms: number
  max_delay_ms: number
  max_reaction_ms: number
  time_limit_seconds: number
  trap_ratio: number // Percentage of "Don't Tap" rounds (0-1)
}

export interface RoundSpec {
  delay: number
  shouldTap: boolean
  color: string
}

export interface ReactionTimeTurnSpec {
  seed: string
  rounds: RoundSpec[]
  maxReactionMs: number
  timeLimitMs: number
  numRounds: number
}

export interface ReactionEvent {
  eventType: string
  round?: number
  serverTimestamp: Date
  clientTimestampMs?: number
  tapped?: boolean
  shouldTap?: boolean
}

export interface ReactionTimeResult {
  valid: boolean
  reason?: string
  reactionTimes: number[]
  averageReactionMs?: number
  score?: number
  correctTaps?: number
  correctSkips?: number
  wrongTaps?: number
  missedTaps?: number
  flag?: boolean
}

export const DEFAULT_REACTION_TIME_CONFIG: ReactionTimeConfig = {
  num_rounds: 8,
  min_delay_ms: 800,
  max_delay_ms: 2500,
  max_reaction_ms: 1000,
  time_limit_seconds: 60,
  trap_ratio: 0.3, // 30% are "Don't Tap" rounds
}

const COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
]

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

  // Generate rounds with random delays, tap/don't-tap, and colors
  const rounds: RoundSpec[] = []
  const trapCount = Math.floor(config.num_rounds * config.trap_ratio)
  const trapIndices = new Set<number>()

  // Randomly select which rounds are traps (don't tap)
  while (trapIndices.size < trapCount) {
    trapIndices.add(Math.floor(random() * config.num_rounds))
  }

  let lastColor = ''
  for (let i = 0; i < config.num_rounds; i++) {
    const delay = config.min_delay_ms + random() * (config.max_delay_ms - config.min_delay_ms)

    // Pick a random color different from the last one
    let color = COLORS[Math.floor(random() * COLORS.length)]
    while (color === lastColor) {
      color = COLORS[Math.floor(random() * COLORS.length)]
    }
    lastColor = color

    rounds.push({
      delay: Math.round(delay),
      shouldTap: !trapIndices.has(i),
      color,
    })
  }

  return {
    seed,
    rounds,
    maxReactionMs: config.max_reaction_ms,
    timeLimitMs: config.time_limit_seconds * 1000,
    numRounds: config.num_rounds,
  }
}

export function getReactionTimeClientSpec(spec: ReactionTimeTurnSpec): Partial<ReactionTimeTurnSpec> {
  // Send rounds to client but they still need server timing for validation
  return {
    rounds: spec.rounds,
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
  let correctTaps = 0
  let correctSkips = 0
  let wrongTaps = 0
  let missedTaps = 0

  // Group events by round
  const roundEvents = new Map<number, { signalTime?: Date; tapTime?: Date; tapped?: boolean; shouldTap?: boolean }>()

  for (const event of events) {
    const roundNum = event.round ?? -1
    if (roundNum < 0 || roundNum >= spec.numRounds) continue

    if (!roundEvents.has(roundNum)) {
      roundEvents.set(roundNum, { shouldTap: spec.rounds[roundNum].shouldTap })
    }
    const round = roundEvents.get(roundNum)!

    if (event.eventType === 'signal_shown') {
      round.signalTime = event.serverTimestamp
    } else if (event.eventType === 'round_complete') {
      round.tapTime = event.serverTimestamp
      round.tapped = event.tapped
    }
  }

  // Validate each round
  for (let i = 0; i < spec.numRounds; i++) {
    const round = roundEvents.get(i)
    const shouldTap = spec.rounds[i].shouldTap

    if (!round || !round.signalTime) {
      return { valid: false, reason: 'incomplete_rounds', reactionTimes, correctTaps, correctSkips, wrongTaps, missedTaps }
    }

    if (round.tapped && round.tapTime) {
      const reactionMs = round.tapTime.getTime() - round.signalTime.getTime()

      if (shouldTap) {
        // Correct tap
        reactionTimes.push(reactionMs)
        correctTaps++

        // Check for impossibly fast reaction (bot detection)
        if (reactionMs < 100) {
          return {
            valid: false,
            reason: 'impossible_speed',
            reactionTimes,
            correctTaps,
            correctSkips,
            wrongTaps,
            missedTaps,
            flag: true
          }
        }
      } else {
        // Wrong tap (tapped on "Don't Tap")
        wrongTaps++
      }
    } else {
      // Didn't tap
      if (shouldTap) {
        // Missed tap
        missedTaps++
      } else {
        // Correct skip
        correctSkips++
      }
    }
  }

  // Check for suspicious consistency (bot detection)
  if (reactionTimes.length >= 3) {
    const avg = reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length
    const variance = reactionTimes.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / reactionTimes.length
    const stdDev = Math.sqrt(variance)

    if (stdDev < 10) {
      return {
        valid: false,
        reason: 'suspicious_consistency',
        reactionTimes,
        correctTaps,
        correctSkips,
        wrongTaps,
        missedTaps,
        flag: true,
      }
    }
  }

  const averageReactionMs = reactionTimes.length > 0
    ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length)
    : 0

  const score = calculateReactionTimeScore(averageReactionMs, correctTaps, correctSkips, wrongTaps, missedTaps, spec, reactionTimes)

  return {
    valid: true,
    reactionTimes,
    averageReactionMs,
    score,
    correctTaps,
    correctSkips,
    wrongTaps,
    missedTaps,
  }
}

function calculateReactionTimeScore(
  _avgReactionMs: number,
  correctTaps: number,
  correctSkips: number,
  wrongTaps: number,
  missedTaps: number,
  spec: ReactionTimeTurnSpec,
  reactionTimes: number[]
): number {
  // Per valid tap round: faster reaction = more points
  const roundScores: number[] = []
  for (const reactionMs of reactionTimes) {
    const roundScore = Math.round(4000 / Math.max(reactionMs / 100, 1))
    roundScores.push(roundScore)
  }

  const totalRounds = spec.numRounds
  const accuracyRatio = (correctTaps + correctSkips) / totalRounds
  const baseScore = roundScores.reduce((a, b) => a + b, 0) * accuracyRatio
  return Math.max(0, Math.round(baseScore) - wrongTaps * 1000 - missedTaps * 600)
}
