import crypto from 'crypto'

export interface BeatMatchConfig {
  time_limit_seconds: number
}

export interface BeatMatchRound {
  beats: number[]       // tone indices (0-based)
  intervals: number[]   // ms gaps between beats (length = beats.length - 1)
}

export interface BeatMatchTurnSpec {
  seed: string
  rounds: BeatMatchRound[]
  toneCount: number
  frequencies: number[]
  timeLimitMs: number
}

export interface BeatMatchEvent {
  eventType: string
  roundIndex?: number
  tapIndex?: number
  toneIndex?: number
  serverTimestamp: Date
  clientTimestampMs?: number
}

export interface BeatMatchResult {
  valid: boolean
  reason?: string
  correct: number
  total: number
  score?: number
  flag?: boolean
}

export const DEFAULT_BEAT_MATCH_CONFIG: BeatMatchConfig = {
  time_limit_seconds: 60, // generous server limit; client ~30s gameplay
}

// Clean distinct tones: C4, E4, G4, B4
const TONE_FREQUENCIES = [261.63, 329.63, 392.00, 493.88]

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

export function generateBeatMatchTurnSpec(
  userId: string,
  config: BeatMatchConfig
): BeatMatchTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  // Round 1 (Simple): 4 beats, slower tempo (500-700ms gaps), 3 tone types
  const simple: BeatMatchRound = {
    beats: Array.from({ length: 4 }, () => Math.floor(random() * 3)),
    intervals: Array.from({ length: 3 }, () => 500 + Math.floor(random() * 200)),
  }

  // Round 2 (Advanced): 6 beats, faster tempo (300-500ms gaps), 4 tone types
  const advanced: BeatMatchRound = {
    beats: Array.from({ length: 6 }, () => Math.floor(random() * 4)),
    intervals: Array.from({ length: 5 }, () => 300 + Math.floor(random() * 200)),
  }

  return {
    seed,
    rounds: [simple, advanced],
    toneCount: 4,
    frequencies: [...TONE_FREQUENCIES],
    timeLimitMs: config.time_limit_seconds * 1000,
  }
}

export function getBeatMatchClientSpec(spec: BeatMatchTurnSpec): {
  rounds: BeatMatchRound[]
  toneCount: number
  frequencies: number[]
  timeLimitMs: number
} {
  return {
    rounds: spec.rounds,
    toneCount: spec.toneCount,
    frequencies: spec.frequencies,
    timeLimitMs: spec.timeLimitMs,
  }
}

export function validateBeatMatchTurn(
  spec: BeatMatchTurnSpec,
  events: BeatMatchEvent[]
): BeatMatchResult {
  const taps = events.filter(e => e.eventType === 'tap')

  if (taps.length === 0) {
    return { valid: false, reason: 'no_input', correct: 0, total: 10 }
  }

  // Bot detection: check timing consistency
  const times = taps.map(t => new Date(t.serverTimestamp).getTime()).filter(t => t > 0)
  if (times.length >= 4) {
    const intervals: number[] = []
    for (let i = 1; i < times.length; i++) {
      intervals.push(times[i] - times[i - 1])
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance = intervals.reduce((sum, t) => sum + Math.pow(t - avgInterval, 2), 0) / intervals.length
    const stdDev = Math.sqrt(variance)

    if (stdDev < 15 && intervals.length >= 4) {
      return { valid: false, reason: 'suspicious_timing', correct: 0, total: 10, flag: true }
    }
    if (avgInterval < 50) {
      return { valid: false, reason: 'impossible_speed', correct: 0, total: 10, flag: true }
    }
  }

  // Group taps by round
  const roundTaps: BeatMatchEvent[][] = [[], []]
  for (const tap of taps) {
    const ri = tap.roundIndex ?? 0
    if (ri === 0 || ri === 1) roundTaps[ri].push(tap)
  }

  let totalCorrectBeats = 0
  let totalBeats = 0
  let totalTimingScore = 0
  let timingBeats = 0

  for (let ri = 0; ri < spec.rounds.length; ri++) {
    const round = spec.rounds[ri]
    const rTaps = roundTaps[ri]
    totalBeats += round.beats.length

    // Sequence accuracy: compare tone indices
    for (let i = 0; i < Math.min(rTaps.length, round.beats.length); i++) {
      if (rTaps[i].toneIndex === round.beats[i]) {
        totalCorrectBeats++
      }
    }

    // Timing accuracy: compare intervals between taps vs expected intervals
    if (rTaps.length >= 2) {
      const tapTimes = rTaps.map(t => new Date(t.serverTimestamp).getTime())
      for (let i = 0; i < Math.min(tapTimes.length - 1, round.intervals.length); i++) {
        const actualInterval = tapTimes[i + 1] - tapTimes[i]
        const expectedInterval = round.intervals[i]
        const deviation = Math.abs(actualInterval - expectedInterval)
        // Tolerance: 300ms window — accuracy scales from 1.0 (perfect) to 0.0 (300ms+ off)
        const accuracy = Math.max(0, 1 - deviation / 300)
        totalTimingScore += accuracy
        timingBeats++
      }
    }
  }

  if (totalCorrectBeats === 0) {
    return { valid: false, reason: 'no_correct_input', correct: 0, total: totalBeats }
  }

  const sequenceAccuracy = totalCorrectBeats / totalBeats
  const timingAccuracy = timingBeats > 0 ? totalTimingScore / timingBeats : 0

  // Quality: 60% sequence + 40% timing
  const quality = sequenceAccuracy * 0.6 + timingAccuracy * 0.4

  // Time calculation
  const firstEvent = events.find(e => e.eventType === 'tap' || e.eventType === 'round_start')
  const lastTap = taps[taps.length - 1]
  const startTime = firstEvent ? new Date(firstEvent.serverTimestamp).getTime() : 0
  const endTime = lastTap ? new Date(lastTap.serverTimestamp).getTime() : startTime
  const totalTimeMs = Math.max(endTime - startTime, 2000)

  // Scoring: unbounded sqrt-based (matches platform pattern)
  const basePoints = 7000
  const maxTimeMs = 30000
  const speed = Math.sqrt(maxTimeMs / totalTimeMs)
  const score = Math.round(basePoints * quality * speed)

  return {
    valid: true,
    correct: totalCorrectBeats,
    total: totalBeats,
    score: Math.max(score, 1),
  }
}
