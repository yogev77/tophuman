import crypto from 'crypto'

export interface ReactionBarsConfig {
  num_bars: number
  time_limit_seconds: number
}

export interface BarSpec {
  targetWidth: number  // 25-80 (percentage)
  color: string        // CSS color name
  speed: number        // cycles per second (1.5-3.0)
  startPhase: number   // 0-1
}

export interface ReactionBarsTurnSpec {
  seed: string
  bars: BarSpec[]
  timeLimitMs: number
}

export interface ReactionBarsEvent {
  eventType: string
  barIndex?: number
  stoppedWidth?: number
  serverTimestamp: Date
  clientTimestampMs?: number
}

export interface ReactionBarsResult {
  valid: boolean
  reason?: string
  avgAccuracy?: number
  score?: number
  flag?: boolean
}

export const DEFAULT_REACTION_BARS_CONFIG: ReactionBarsConfig = {
  num_bars: 3,
  time_limit_seconds: 30,
}

const BAR_COLORS = ['#ef4444', '#3b82f6', '#f59e0b'] // red, blue, amber

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

// Oscillation formula: width(t) = 50 + 50 * sin(2*PI*speed*t + startPhase*2*PI)
// Result is 0-100 (percentage)
export function getBarWidth(bar: BarSpec, timeMs: number): number {
  const t = timeMs / 1000
  return 50 + 50 * Math.sin(2 * Math.PI * bar.speed * t + bar.startPhase * 2 * Math.PI)
}

export function generateReactionBarsTurnSpec(
  userId: string,
  config: ReactionBarsConfig
): ReactionBarsTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  // Speed multipliers: bar 1 slowest, bar 3 fastest
  // Base speed ~0.167 cycles/sec (6-second period)
  const SPEED_MULTIPLIERS = [1, 1.5, 2]

  const bars: BarSpec[] = []
  for (let i = 0; i < config.num_bars; i++) {
    bars.push({
      targetWidth: Math.round(25 + random() * 55), // 25-80
      color: BAR_COLORS[i % BAR_COLORS.length],
      speed: 0.167 * SPEED_MULTIPLIERS[i],  // ~0.167, 0.25, 0.333 cycles/sec (6s, 4s, 3s periods)
      startPhase: random(),                  // 0-1
    })
  }

  return {
    seed,
    bars,
    timeLimitMs: config.time_limit_seconds * 1000,
  }
}

export function getReactionBarsClientSpec(spec: ReactionBarsTurnSpec): Omit<ReactionBarsTurnSpec, 'seed'> {
  return {
    bars: spec.bars,
    timeLimitMs: spec.timeLimitMs,
  }
}

export function validateReactionBarsTurn(
  spec: ReactionBarsTurnSpec,
  events: ReactionBarsEvent[]
): ReactionBarsResult {
  const barStopEvents = events.filter(e => e.eventType === 'bar_stop')
  const startEvent = events.find(e => e.eventType === 'start')

  if (!startEvent) {
    return { valid: false, reason: 'no_start_event' }
  }

  if (barStopEvents.length < spec.bars.length) {
    return { valid: false, reason: 'incomplete' }
  }

  const startTime = new Date(startEvent.serverTimestamp).getTime()
  const accuracies: number[] = []
  const stopTimestamps: number[] = []

  for (const stopEvent of barStopEvents) {
    if (stopEvent.barIndex === undefined || stopEvent.stoppedWidth === undefined) continue
    if (stopEvent.barIndex < 0 || stopEvent.barIndex >= spec.bars.length) continue

    const stopTime = new Date(stopEvent.serverTimestamp).getTime()
    stopTimestamps.push(stopTime)

    // Calculate accuracy: how close the stopped width is to the target
    // 30% tolerance: within 30 percentage points = accepted, accuracy scales 0-1
    const targetWidth = spec.bars[stopEvent.barIndex].targetWidth
    const diff = Math.abs(stopEvent.stoppedWidth - targetWidth)
    const accuracy = Math.max(0, 1 - diff / 30)
    accuracies.push(accuracy)
  }

  if (accuracies.length === 0) {
    return { valid: false, reason: 'incomplete' }
  }

  // Check completion time
  const lastStopTime = Math.max(...stopTimestamps)
  const completionTimeMs = lastStopTime - startTime

  if (completionTimeMs > spec.timeLimitMs + 5000) {
    return { valid: false, reason: 'timeout' }
  }

  const avgAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length

  // Bot detection
  const accStdDev = Math.sqrt(
    accuracies.reduce((sum, a) => sum + Math.pow(a - avgAccuracy, 2), 0) / accuracies.length
  )

  if (avgAccuracy > 0.99 && accStdDev < 0.005) {
    const intervals: number[] = []
    for (let i = 1; i < stopTimestamps.length; i++) {
      intervals.push(stopTimestamps[i] - stopTimestamps[i - 1])
    }
    const allFast = intervals.every(i => i < 200)
    if (allFast) {
      return { valid: false, reason: 'suspicious_timing', flag: true }
    }
  }

  // Scoring: accuracy and time both factor in
  // Completion bonus: stopped all bars = 1.0, partial = fraction
  const completionRatio = accuracies.length / spec.bars.length
  const maxTimeMs = spec.timeLimitMs
  const speed = Math.sqrt(maxTimeMs / Math.max(completionTimeMs, 2000))
  const score = Math.round(Math.pow(avgAccuracy, 1.2) * 7000 * speed * completionRatio)

  return {
    valid: true,
    avgAccuracy,
    score,
  }
}
