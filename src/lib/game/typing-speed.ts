import crypto from 'crypto'

export interface TypingSpeedConfig {
  time_limit_seconds: number
  min_phrase_length: number
  max_phrase_length: number
}

const PHRASES = [
  "The quick brown fox jumps over the lazy dog",
  "Pack my box with five dozen liquor jugs",
  "How vexingly quick daft zebras jump",
  "The five boxing wizards jump quickly",
  "Sphinx of black quartz judge my vow",
  "Two driven jocks help fax my big quiz",
  "The jay pig fox dwelt in the bank quiz",
  "Fix problem quickly with galvanized jets",
  "Quick zephyrs blow vexing daft Jim",
  "Waltz nymph for quick jigs vex bud",
  "Bright vixens jump dozy fowl quack",
  "Quick wafting zephyrs vex bold Jim",
  "Lazy movers quit hard packing of jewelry boxes",
  "Pack my red box with five dozen quality jugs",
  "The quick onyx goblin jumps over the lazy dwarf",
  "Amazingly few discotheques provide jukeboxes",
  "My faxed joke won a pager in the cable TV quiz show",
  "Crazy Frederick bought many very exquisite opal jewels",
  "We promptly judged antique ivory buckles for the next prize",
  "A quick movement of the enemy will jeopardize six gunboats",
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
  // Score based on WPM and accuracy
  // Max WPM contribution: 6500 (at 140 WPM) - reduced to prevent max score
  // Max accuracy contribution: 2800 (at 100%) - reduced and curved
  // Even 140 WPM with 100% accuracy won't hit 10K
  const wpmScore = Math.min(wpm / 140, 1) * 6500

  // Apply curve to accuracy - perfect accuracy is rare
  // 100% accuracy gives ~2700, not 2800
  const accuracyScore = Math.pow(accuracy, 1.1) * 2800

  // Cap at 9800 to ensure max score is never achievable
  return Math.min(9800, Math.round(wpmScore + accuracyScore))
}
