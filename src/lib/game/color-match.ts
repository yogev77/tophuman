import crypto from 'crypto'

export interface ColorMatchConfig {
  num_rounds: number
  time_limit_seconds: number
  tolerance: number // How close RGB values need to be (0-255)
}

export interface ColorMatchTurnSpec {
  seed: string
  targetColors: { r: number; g: number; b: number }[]
  timeLimitMs: number
  tolerance: number
}

export interface ColorEvent {
  eventType: string
  round?: number
  r?: number
  g?: number
  b?: number
  serverTimestamp: Date
  clientTimestampMs?: number
}

export interface ColorMatchResult {
  valid: boolean
  reason?: string
  roundScores: number[]
  averageAccuracy?: number
  score?: number
  flag?: boolean
}

export const DEFAULT_COLOR_MATCH_CONFIG: ColorMatchConfig = {
  num_rounds: 3,
  time_limit_seconds: 60,
  tolerance: 30,
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

export function generateColorMatchTurnSpec(
  userId: string,
  config: ColorMatchConfig
): ColorMatchTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  const targetColors: { r: number; g: number; b: number }[] = []

  for (let i = 0; i < config.num_rounds; i++) {
    // Generate interesting colors (not too dark or light)
    targetColors.push({
      r: Math.floor(random() * 200) + 30,
      g: Math.floor(random() * 200) + 30,
      b: Math.floor(random() * 200) + 30,
    })
  }

  return {
    seed,
    targetColors,
    timeLimitMs: config.time_limit_seconds * 1000,
    tolerance: config.tolerance,
  }
}

export function getColorMatchClientSpec(spec: ColorMatchTurnSpec): Partial<ColorMatchTurnSpec> {
  return {
    targetColors: spec.targetColors,
    timeLimitMs: spec.timeLimitMs,
  }
}

export function validateColorMatchTurn(
  spec: ColorMatchTurnSpec,
  events: ColorEvent[]
): ColorMatchResult {
  const submissions = events.filter(e => e.eventType === 'submit_color')
  const roundScores: number[] = []

  if (submissions.length === 0) {
    return { valid: false, reason: 'no_submissions', roundScores: [] }
  }

  // Check timing for bot detection
  const times = submissions.map(s => s.clientTimestampMs || 0).filter(t => t > 0)
  if (times.length >= 3) {
    const intervals: number[] = []
    for (let i = 1; i < times.length; i++) {
      intervals.push(times[i] - times[i - 1])
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance = intervals.reduce((sum, t) => sum + Math.pow(t - avgInterval, 2), 0) / intervals.length
    const stdDev = Math.sqrt(variance)

    // Suspiciously consistent timing
    if (stdDev < 100 && intervals.length >= 3) {
      return {
        valid: false,
        reason: 'suspicious_timing',
        roundScores: [],
        flag: true,
      }
    }
  }

  // Score each round
  for (const submission of submissions) {
    const round = submission.round ?? -1
    if (round >= 0 && round < spec.targetColors.length) {
      const target = spec.targetColors[round]
      const accuracy = calculateColorAccuracy(target, {
        r: submission.r ?? 0,
        g: submission.g ?? 0,
        b: submission.b ?? 0,
      })
      roundScores.push(accuracy)
    }
  }

  // Must complete all rounds
  if (roundScores.length < spec.targetColors.length) {
    return { valid: false, reason: 'incomplete', roundScores }
  }

  const averageAccuracy = roundScores.reduce((a, b) => a + b, 0) / roundScores.length

  // Must have at least 50% average accuracy
  if (averageAccuracy < 0.5) {
    return { valid: false, reason: 'low_accuracy', roundScores, averageAccuracy }
  }

  // Calculate time taken
  const allTimes = events.map(e => e.clientTimestampMs || 0).filter(t => t > 0)
  const totalTimeMs = allTimes.length >= 2
    ? allTimes[allTimes.length - 1] - allTimes[0]
    : spec.timeLimitMs

  const accuracyScore = Math.pow(averageAccuracy, 1.05) * 7000
  const speed = Math.sqrt(spec.timeLimitMs / Math.max(totalTimeMs, 3000))
  const score = Math.round(accuracyScore * speed)

  return {
    valid: true,
    roundScores,
    averageAccuracy,
    score,
  }
}

function calculateColorAccuracy(
  target: { r: number; g: number; b: number },
  submitted: { r: number; g: number; b: number }
): number {
  // Calculate distance in RGB space
  const maxDistance = Math.sqrt(255 * 255 * 3) // Max possible distance
  const distance = Math.sqrt(
    Math.pow(target.r - submitted.r, 2) +
    Math.pow(target.g - submitted.g, 2) +
    Math.pow(target.b - submitted.b, 2)
  )

  // Convert to accuracy (0-1)
  return Math.max(0, 1 - distance / maxDistance)
}
