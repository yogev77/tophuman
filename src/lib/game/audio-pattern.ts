import crypto from 'crypto'

export interface AudioPatternConfig {
  num_tones: number
  num_buttons: number
  time_limit_seconds: number
  tone_duration_ms: number
}

export interface AudioPatternTurnSpec {
  seed: string
  sequence: number[] // Button indices in order
  numButtons: number
  toneDurationMs: number
  timeLimitMs: number
  // Frequencies for each button
  frequencies: number[]
}

export interface AudioEvent {
  eventType: string
  buttonIndex?: number
  serverTimestamp: Date
  clientTimestampMs?: number
}

export interface AudioPatternResult {
  valid: boolean
  reason?: string
  correct: number
  total: number
  score?: number
  flag?: boolean
}

export const DEFAULT_AUDIO_PATTERN_CONFIG: AudioPatternConfig = {
  num_tones: 15, // Max sequence length (for progressive levels)
  num_buttons: 4,
  time_limit_seconds: 30,
  tone_duration_ms: 300,
}

// Musical frequencies (C4, E4, G4, C5 - a nice chord)
const BUTTON_FREQUENCIES = [261.63, 329.63, 392.00, 523.25]

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

export function generateAudioPatternTurnSpec(
  userId: string,
  config: AudioPatternConfig
): AudioPatternTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  // Generate random sequence
  const sequence: number[] = []
  for (let i = 0; i < config.num_tones; i++) {
    sequence.push(Math.floor(random() * config.num_buttons))
  }

  return {
    seed,
    sequence,
    numButtons: config.num_buttons,
    toneDurationMs: config.tone_duration_ms,
    timeLimitMs: config.time_limit_seconds * 1000,
    frequencies: BUTTON_FREQUENCIES.slice(0, config.num_buttons),
  }
}

export function getAudioPatternClientSpec(spec: AudioPatternTurnSpec): {
  sequence: number[]
  numButtons: number
  toneDurationMs: number
  timeLimitMs: number
  frequencies: number[]
} {
  return {
    sequence: spec.sequence,
    numButtons: spec.numButtons,
    toneDurationMs: spec.toneDurationMs,
    timeLimitMs: spec.timeLimitMs,
    frequencies: spec.frequencies,
  }
}

export function validateAudioPatternTurn(
  spec: AudioPatternTurnSpec,
  events: AudioEvent[]
): AudioPatternResult {
  const taps = events.filter(e => e.eventType === 'tap')
  const levelCompleteEvents = events.filter(e => e.eventType === 'level_complete')

  if (taps.length === 0) {
    return { valid: false, reason: 'no_input', correct: 0, total: spec.sequence.length }
  }

  // Check timing for bot detection
  const times = taps.map(t => new Date(t.serverTimestamp).getTime()).filter(t => t > 0)
  if (times.length >= 3) {
    const intervals: number[] = []
    for (let i = 1; i < times.length; i++) {
      intervals.push(times[i] - times[i - 1])
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance = intervals.reduce((sum, t) => sum + Math.pow(t - avgInterval, 2), 0) / intervals.length
    const stdDev = Math.sqrt(variance)

    // Suspiciously consistent timing
    if (stdDev < 30 && intervals.length >= 4) {
      return {
        valid: false,
        reason: 'suspicious_timing',
        correct: 0,
        total: spec.sequence.length,
        flag: true,
      }
    }

    // Impossibly fast tapping
    if (avgInterval < 50) {
      return {
        valid: false,
        reason: 'impossible_speed',
        correct: 0,
        total: spec.sequence.length,
        flag: true,
      }
    }
  }

  // Calculate levels completed (starting level is 3)
  const levelsCompleted = levelCompleteEvents.length
  const highestLevel = 3 + levelsCompleted

  // Count correct sequential taps (across all level segments)
  // Each level replays from the start of the sequence, so position resets on level_complete
  let correctTaps = 0
  let positionInLevel = 0
  for (const event of events) {
    if (event.eventType === 'tap') {
      if (event.buttonIndex === spec.sequence[positionInLevel]) {
        correctTaps++
      }
      positionInLevel++
    } else if (event.eventType === 'level_complete') {
      positionInLevel = 0
    }
  }

  // Calculate total time taken
  const firstTap = events.find(e => e.eventType === 'tap')
  const startTime = firstTap ? new Date(firstTap.serverTimestamp).getTime() : 0
  const lastEvent = events[events.length - 1]
  const endTime = lastEvent ? new Date(lastEvent.serverTimestamp).getTime() : startTime
  const totalTimeMs = endTime - startTime

  // Must have at least 1 correct tap
  if (correctTaps === 0) {
    return { valid: false, reason: 'no_correct_input', correct: 0, total: highestLevel }
  }

  // Score: completed levels * 2000 + partial taps in unfinished level * 400
  // Taps in completed levels = sum(k+2, k=1..L) = L*(L+5)/2
  const tapsInCompletedLevels = levelsCompleted * (levelsCompleted + 5) / 2
  const partialTaps = Math.max(0, correctTaps - tapsInCompletedLevels)
  const baseScore = levelsCompleted * 2000 + partialTaps * 400

  const maxTimeMs = spec.timeLimitMs
  const speed = Math.sqrt(maxTimeMs / Math.max(totalTimeMs, 2000))
  const score = Math.round(baseScore * speed)

  return {
    valid: true,
    correct: levelsCompleted,
    total: highestLevel,
    score,
  }
}
