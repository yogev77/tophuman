import crypto from 'crypto'

export interface GameConfig {
  sequence_length: number
  keypad_size: number
  time_limit_seconds: number
  mistake_penalty_ms: number
  max_mistakes: number
}

export interface TurnSpec {
  seed: string
  sequence: string[]
  keypad: string[]
  keypadLayout: number[][]
  timeLimitMs: number
  penaltyMs: number
  maxMistakes: number
  levels: number[] // taps required per level, e.g. [3, 5]
}

export interface TapEvent {
  turnToken: string
  eventType: 'tap'
  tapIndex: number
  clientTimestampMs: number
}

export interface ValidationResult {
  valid: boolean
  reason?: string
  completionTimeMs?: number
  mistakes?: number
  score?: number
  flag?: boolean
}

// Emoji pool for the game
const EMOJI_POOL = [
  '🎮', '🎯', '🚀', '⭐', '🔥', '💎', '🎪', '🎨',
  '🌟', '💫', '🎵', '🎶', '🎲', '🎳', '🏆', '🥇',
  '🎭', '🎧', '🎡', '🎢', '🎠', '🎰', '🃏', '🎴',
  '🔮', '🎱', '🎸', '🎹', '🥁', '🎺', '🎻', '🪘'
]

// Seeded random number generator
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

function shuffleArray<T>(array: T[], random: () => number): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function sampleArray<T>(array: T[], count: number, random: () => number): T[] {
  const shuffled = shuffleArray(array, random)
  return shuffled.slice(0, count)
}

export function generateTurnSpec(userId: string, config: GameConfig): TurnSpec {
  // Generate unique seed
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')

  const random = seededRandom(seed)

  // Select sequence emojis
  const sequence = sampleArray(EMOJI_POOL, config.sequence_length, random)

  // Generate keypad (includes sequence + decoys)
  const decoyCount = config.keypad_size - config.sequence_length
  const remaining = EMOJI_POOL.filter(e => !sequence.includes(e))
  const decoys = sampleArray(remaining, decoyCount, random)

  // Shuffle keypad
  const keypad = shuffleArray([...sequence, ...decoys], random)

  // Generate grid layout (for visual positioning)
  const cols = Math.ceil(Math.sqrt(config.keypad_size))
  const keypadLayout: number[][] = []
  for (let i = 0; i < keypad.length; i++) {
    const row = Math.floor(i / cols)
    const col = i % cols
    keypadLayout.push([row, col])
  }

  return {
    seed,
    sequence,
    keypad,
    keypadLayout,
    timeLimitMs: config.time_limit_seconds * 1000,
    penaltyMs: config.mistake_penalty_ms,
    maxMistakes: config.max_mistakes,
    levels: [3, config.sequence_length], // Level 1: 3 symbols, Level 2: all
  }
}

export function getClientSpec(spec: TurnSpec): Partial<TurnSpec> {
  // Return only what client needs - sequence is revealed after memorization phase
  return {
    sequence: spec.sequence, // Shown briefly then hidden
    keypad: spec.keypad,
    keypadLayout: spec.keypadLayout,
    timeLimitMs: spec.timeLimitMs,
    penaltyMs: spec.penaltyMs,
    maxMistakes: spec.maxMistakes,
    levels: spec.levels,
  }
}

interface StoredEvent {
  eventType: string
  tapIndex?: number
  serverTimestamp: Date
  clientTimestampMs?: number
}

export function validateTurn(
  spec: TurnSpec,
  events: StoredEvent[]
): ValidationResult {
  const levels = spec.levels || [spec.sequence.length]
  const totalExpectedTaps = levels.reduce((a, b) => a + b, 0)

  const tapEvents = events.filter(e => e.eventType === 'tap')
  const startEvent = events.find(e => e.eventType === 'start')

  if (!startEvent) {
    return { valid: false, reason: 'no_start_event' }
  }

  if (tapEvents.length !== totalExpectedTaps) {
    return { valid: false, reason: 'incomplete' }
  }

  // Validate taps per level
  let mistakes = 0
  let penaltyTime = 0
  let tapOffset = 0

  for (const levelSize of levels) {
    for (let i = 0; i < levelSize; i++) {
      const tap = tapEvents[tapOffset + i]
      if (tap.tapIndex === undefined) {
        return { valid: false, reason: 'invalid_tap' }
      }

      const tappedEmoji = spec.keypad[tap.tapIndex]
      const expectedEmoji = spec.sequence[i] // each level replays from start of sequence

      if (tappedEmoji !== expectedEmoji) {
        mistakes++
        penaltyTime += spec.penaltyMs
      }
    }
    tapOffset += levelSize
  }

  if (mistakes > spec.maxMistakes) {
    return { valid: false, reason: 'too_many_mistakes', mistakes }
  }

  // Calculate completion time using SERVER timestamps
  const lastTap = tapEvents[tapEvents.length - 1]
  const completionTimeMs =
    lastTap.serverTimestamp.getTime() - startEvent.serverTimestamp.getTime()
  const totalTimeMs = completionTimeMs + penaltyTime

  // Use 60s as gameplay reference (server limit is higher for flash overhead)
  if (totalTimeMs > 60000) {
    return { valid: false, reason: 'timeout' }
  }

  // Check timing plausibility
  const timingResult = validateTimingPlausibility(events)
  if (!timingResult.valid) {
    return {
      valid: false,
      reason: 'suspicious_timing',
      flag: true,
    }
  }

  const score = calculateScore(totalTimeMs, mistakes, spec)

  return {
    valid: true,
    completionTimeMs: Math.round(totalTimeMs),
    mistakes,
    score,
  }
}

function validateTimingPlausibility(events: StoredEvent[]): { valid: boolean; signals?: object } {
  const tapEvents = events.filter(e => e.eventType === 'tap')

  if (tapEvents.length < 2) {
    return { valid: true }
  }

  // Calculate inter-tap timings
  const interTapTimings: number[] = []
  for (let i = 1; i < tapEvents.length; i++) {
    const diff = tapEvents[i].serverTimestamp.getTime() - tapEvents[i - 1].serverTimestamp.getTime()
    interTapTimings.push(diff)
  }

  const avgInterTap = interTapTimings.reduce((a, b) => a + b, 0) / interTapTimings.length
  const minInterTap = Math.min(...interTapTimings)

  // Suspicious if average inter-tap time is less than 50ms (inhuman speed)
  if (avgInterTap < 50) {
    return {
      valid: false,
      signals: { avgInterTap, reason: 'too_fast' },
    }
  }

  // Suspicious if any tap is less than 30ms apart
  if (minInterTap < 30) {
    return {
      valid: false,
      signals: { minInterTap, reason: 'impossible_speed' },
    }
  }

  // Calculate standard deviation
  const variance = interTapTimings.reduce((sum, t) => sum + Math.pow(t - avgInterTap, 2), 0) / interTapTimings.length
  const stdDev = Math.sqrt(variance)

  // Suspicious if too consistent (std dev less than 5ms suggests automation)
  if (stdDev < 5 && interTapTimings.length > 3) {
    return {
      valid: false,
      signals: { stdDev, reason: 'too_consistent' },
    }
  }

  return { valid: true }
}

function calculateScore(timeMs: number, mistakes: number, spec: TurnSpec): number {
  const maxTimeMs = 60000 // gameplay reference (not server timeLimitMs which is inflated)
  const levels = spec.levels || [spec.sequence.length]
  const totalTaps = levels.reduce((a, b) => a + b, 0)
  const quality = Math.max(0, totalTaps * 875 - mistakes * 2000) // 8 taps * 875 = 7000 base
  const speed = Math.sqrt(maxTimeMs / Math.max(timeMs, 2000))
  return Math.round(quality * speed)
}

export const DEFAULT_CONFIG: GameConfig = {
  sequence_length: 5,
  keypad_size: 12,
  time_limit_seconds: 90, // generous for flash phases; client manages gameplay timer
  mistake_penalty_ms: 2000,
  max_mistakes: 2, // across both levels
}
