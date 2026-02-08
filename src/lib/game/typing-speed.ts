import crypto from 'crypto'

export interface TypingSpeedConfig {
  time_limit_seconds: number
  min_phrase_length: number
  max_phrase_length: number
}

const PHRASES = [
  "The morning sun cast golden light across the quiet lake",
  "She picked up the heavy book and placed it on the shelf",
  "A strong wind pushed the dark clouds over the mountain",
  "He walked down the empty street looking for a open shop",
  "The old clock on the wall stopped ticking at midnight",
  "Rain began to fall just as they reached the front door",
  "The children played in the garden until the sun went down",
  "He found a small silver key hidden under the doormat",
  "The train pulled into the station right on time today",
  "She wrote a short letter and sealed it in an envelope",
  "The dog ran across the field chasing after a red ball",
  "A bright star appeared in the clear night sky above us",
  "They sat around the table sharing stories from the trip",
  "The baker pulled fresh bread from the hot stone oven",
  "He opened the window and felt the cool breeze come in",
  "The river flowed gently through the center of the town",
  "She turned the corner and saw the market up ahead",
  "The plane landed safely despite the heavy fog outside",
  "He picked up his coffee and took a slow careful sip",
  "The team worked late to finish the project before dawn",
]

export interface TypingSpeedTurnSpec {
  seed: string
  phrase: string
  timeLimitMs: number
}

export interface TypingEvent {
  eventType: string
  key?: string
  currentText?: string
  serverTimestamp: Date
  clientTimestampMs?: number
}

export interface TypingSpeedResult {
  valid: boolean
  reason?: string
  accuracy?: number
  wpm?: number
  completionTimeMs?: number
  score?: number
  flag?: boolean
}

export const DEFAULT_TYPING_SPEED_CONFIG: TypingSpeedConfig = {
  time_limit_seconds: 60,
  min_phrase_length: 30,
  max_phrase_length: 60,
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

export function generateTypingSpeedTurnSpec(
  userId: string,
  config: TypingSpeedConfig
): TypingSpeedTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  // Select a random phrase
  const phraseIndex = Math.floor(random() * PHRASES.length)
  const phrase = PHRASES[phraseIndex]

  return {
    seed,
    phrase,
    timeLimitMs: config.time_limit_seconds * 1000,
  }
}

export function getTypingSpeedClientSpec(spec: TypingSpeedTurnSpec): Partial<TypingSpeedTurnSpec> {
  return {
    phrase: spec.phrase,
    timeLimitMs: spec.timeLimitMs,
  }
}

export function validateTypingSpeedTurn(
  spec: TypingSpeedTurnSpec,
  events: TypingEvent[]
): TypingSpeedResult {
  const startEvent = events.find(e => e.eventType === 'keystroke')
  const submitEvent = events.find(e => e.eventType === 'submit')

  if (!submitEvent || !submitEvent.currentText) {
    return { valid: false, reason: 'no_submission' }
  }

  const submittedText = submitEvent.currentText

  // Calculate accuracy using Levenshtein-like comparison
  const accuracy = calculateAccuracy(spec.phrase, submittedText)

  // Must have at least 80% accuracy to be valid
  if (accuracy < 0.8) {
    return { valid: false, reason: 'low_accuracy', accuracy }
  }

  // Analyze keystroke timing for bot detection
  const keystrokeEvents = events.filter(e => e.eventType === 'keystroke')

  if (keystrokeEvents.length >= 5) {
    const timings: number[] = []
    for (let i = 1; i < keystrokeEvents.length; i++) {
      const diff = keystrokeEvents[i].serverTimestamp.getTime() -
                   keystrokeEvents[i - 1].serverTimestamp.getTime()
      timings.push(diff)
    }

    const avgTiming = timings.reduce((a, b) => a + b, 0) / timings.length
    const variance = timings.reduce((sum, t) => sum + Math.pow(t - avgTiming, 2), 0) / timings.length
    const stdDev = Math.sqrt(variance)

    // Suspiciously consistent typing (bot-like)
    if (stdDev < 5 && timings.length > 10) {
      return {
        valid: false,
        reason: 'suspicious_consistency',
        accuracy,
        flag: true,
      }
    }

    // Impossibly fast typing (< 20ms per keystroke = 3000+ chars/min)
    if (avgTiming < 20) {
      return {
        valid: false,
        reason: 'impossible_speed',
        accuracy,
        flag: true,
      }
    }
  }

  // Calculate completion time
  let completionTimeMs = spec.timeLimitMs
  if (startEvent && submitEvent) {
    completionTimeMs = submitEvent.serverTimestamp.getTime() - startEvent.serverTimestamp.getTime()
  }

  // Calculate WPM (words per minute)
  const wordCount = spec.phrase.split(' ').length
  const minutes = completionTimeMs / 60000
  const wpm = Math.round(wordCount / minutes)

  // Flag impossibly high WPM (world record is ~200 WPM)
  if (wpm > 250) {
    return {
      valid: false,
      reason: 'impossible_wpm',
      accuracy,
      wpm,
      flag: true,
    }
  }

  const score = calculateTypingScore(accuracy, wpm, completionTimeMs, spec)

  return {
    valid: true,
    accuracy,
    wpm,
    completionTimeMs,
    score,
  }
}

function calculateAccuracy(target: string, actual: string): number {
  if (actual.length === 0) return 0

  let correct = 0
  const maxLen = Math.max(target.length, actual.length)

  for (let i = 0; i < Math.min(target.length, actual.length); i++) {
    if (target[i] === actual[i]) {
      correct++
    }
  }

  return correct / maxLen
}

function calculateTypingScore(
  accuracy: number,
  wpm: number,
  _completionTimeMs: number,
  _spec: TypingSpeedTurnSpec
): number {
  const wpmScore = wpm * 70
  const accuracyScore = Math.pow(accuracy, 1.1) * 4000
  return Math.round(wpmScore + accuracyScore)
}
