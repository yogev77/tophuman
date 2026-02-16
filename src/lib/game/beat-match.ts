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
  time_limit_seconds: 90, // generous server limit; client ~45s gameplay
}

// Clean distinct tones: C4, E4, G4, B4
const TONE_FREQUENCIES = [261.63, 329.63, 392.00, 493.88]

// Groove templates: 5 levels, each with 3 pre-designed interval patterns (seed picks one)
const GROOVE_TEMPLATES: { beats: number; tones: number; intervals: number[][] }[] = [
  // Level 1 — Pulse: 4 beats, 2 tones, steady quarter notes (~500ms gaps)
  {
    beats: 4, tones: 2,
    intervals: [
      [500, 500, 500],
      [520, 480, 520],
      [480, 500, 520],
    ],
  },
  // Level 2 — Bounce: 5 beats, 3 tones, mix of quarters + eighths (250-500ms)
  {
    beats: 5, tones: 3,
    intervals: [
      [500, 250, 500, 250],
      [250, 500, 250, 500],
      [500, 500, 250, 250],
    ],
  },
  // Level 3 — Funk: 6 beats, 3 tones, syncopated quick doubles (200-400ms)
  {
    beats: 6, tones: 3,
    intervals: [
      [300, 200, 400, 200, 300],
      [200, 300, 200, 400, 300],
      [400, 200, 200, 300, 350],
    ],
  },
  // Level 4 — Latin: 7 beats, 4 tones, clave-inspired uneven groups (200-350ms)
  {
    beats: 7, tones: 4,
    intervals: [
      [300, 200, 350, 250, 200, 300],
      [200, 350, 200, 300, 250, 300],
      [350, 200, 300, 200, 300, 250],
    ],
  },
  // Level 5 — Breakbeat: 8 beats, 4 tones, fast complex (200-300ms)
  {
    beats: 8, tones: 4,
    intervals: [
      [250, 200, 300, 200, 250, 200, 250],
      [200, 250, 200, 300, 200, 250, 200],
      [300, 200, 200, 250, 250, 200, 200],
    ],
  },
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

export function generateBeatMatchTurnSpec(
  userId: string,
  config: BeatMatchConfig
): BeatMatchTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  // Generate 5 rounds from groove templates
  const rounds: BeatMatchRound[] = GROOVE_TEMPLATES.map(level => {
    // Pick one of 3 groove templates for intervals
    const templateIdx = Math.floor(random() * 3)
    const intervals = [...level.intervals[templateIdx]]
    // Randomize which tones (pads) are hit
    const beats = Array.from({ length: level.beats }, () => Math.floor(random() * level.tones))
    return { beats, intervals }
  })

  return {
    seed,
    rounds,
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

  const totalExpected = spec.rounds.reduce((sum, r) => sum + r.beats.length, 0)

  if (taps.length === 0) {
    return { valid: false, reason: 'no_input', correct: 0, total: totalExpected }
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
      return { valid: false, reason: 'suspicious_timing', correct: 0, total: totalExpected, flag: true }
    }
    if (avgInterval < 50) {
      return { valid: false, reason: 'impossible_speed', correct: 0, total: totalExpected, flag: true }
    }
  }

  // Group taps by round
  const roundTaps: BeatMatchEvent[][] = spec.rounds.map(() => [])
  for (const tap of taps) {
    const ri = tap.roundIndex ?? 0
    if (ri >= 0 && ri < spec.rounds.length) roundTaps[ri].push(tap)
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
  const maxTimeMs = 45000
  const speed = Math.sqrt(maxTimeMs / totalTimeMs)
  const score = Math.round(basePoints * quality * speed)

  return {
    valid: true,
    correct: totalCorrectBeats,
    total: totalBeats,
    score: Math.max(score, 1),
  }
}
