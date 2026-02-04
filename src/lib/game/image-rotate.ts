import crypto from 'crypto'

export interface ImageRotateConfig {
  grid_size: number // 3 for 3x3
  time_limit_seconds: number
  rotation_penalty_ms: number // penalty per extra rotation
}

export interface ImageRotateTurnSpec {
  seed: string
  imageUrl: string
  gridSize: number
  initialRotations: number[] // array of 9 values, each 0, 90, 180, or 270
  timeLimitMs: number
  rotationPenaltyMs: number
}

export interface ImageRotateValidationResult {
  valid: boolean
  reason?: string
  completionTimeMs?: number
  extraRotations?: number
  score?: number
  flag?: boolean
}

// Available puzzle images
const PUZZLE_IMAGES = [
  '/images/puzzles/cat1.jpg',
  '/images/puzzles/cat2.jpg',
  '/images/puzzles/cat3.jpg',
  '/images/puzzles/cat4.jpg',
  '/images/puzzles/cat5.jpg',
  '/images/puzzles/cat6.jpg',
  '/images/puzzles/cat7.jpg',
  '/images/puzzles/cat8.jpg',
  '/images/puzzles/cat9.jpg',
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

export function generateImageRotateTurnSpec(userId: string, config: ImageRotateConfig): ImageRotateTurnSpec {
  // Generate unique seed
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')

  const random = seededRandom(seed)

  // Select random image
  const imageIndex = Math.floor(random() * PUZZLE_IMAGES.length)
  const imageUrl = PUZZLE_IMAGES[imageIndex]

  // Generate initial rotations for each tile (0, 90, 180, or 270)
  // Ensure at least some tiles need rotation
  const tileCount = config.grid_size * config.grid_size
  const rotations = [0, 90, 180, 270]
  let initialRotations: number[] = []

  // Generate random rotations, ensuring not all are 0
  let hasNonZero = false
  for (let i = 0; i < tileCount; i++) {
    const rotation = rotations[Math.floor(random() * rotations.length)]
    initialRotations.push(rotation)
    if (rotation !== 0) hasNonZero = true
  }

  // If all happened to be 0, force at least half to be rotated
  if (!hasNonZero) {
    for (let i = 0; i < Math.floor(tileCount / 2); i++) {
      const idx = Math.floor(random() * tileCount)
      initialRotations[idx] = rotations[1 + Math.floor(random() * 3)] // 90, 180, or 270
    }
  }

  return {
    seed,
    imageUrl,
    gridSize: config.grid_size,
    initialRotations,
    timeLimitMs: config.time_limit_seconds * 1000,
    rotationPenaltyMs: config.rotation_penalty_ms,
  }
}

export function getImageRotateClientSpec(spec: ImageRotateTurnSpec): Partial<ImageRotateTurnSpec> {
  return {
    imageUrl: spec.imageUrl,
    gridSize: spec.gridSize,
    initialRotations: spec.initialRotations,
    timeLimitMs: spec.timeLimitMs,
    rotationPenaltyMs: spec.rotationPenaltyMs,
  }
}

interface StoredEvent {
  eventType: string
  tileIndex?: number
  serverTimestamp: Date
  clientTimestampMs?: number
}

export function validateImageRotateTurn(
  spec: ImageRotateTurnSpec,
  events: StoredEvent[]
): ImageRotateValidationResult {
  const rotateEvents = events.filter(e => e.eventType === 'rotate')
  const startEvent = events.find(e => e.eventType === 'start')

  if (!startEvent) {
    return { valid: false, reason: 'no_start_event' }
  }

  // Simulate rotations to get final state
  const currentRotations = [...spec.initialRotations]

  for (const event of rotateEvents) {
    if (event.tileIndex !== undefined && event.tileIndex >= 0 && event.tileIndex < currentRotations.length) {
      currentRotations[event.tileIndex] = (currentRotations[event.tileIndex] + 90) % 360
    }
  }

  // Check if all tiles are at 0 rotation
  const allCorrect = currentRotations.every(r => r === 0)

  if (!allCorrect) {
    return { valid: false, reason: 'incomplete' }
  }

  // Calculate minimum rotations needed
  const minRotations = spec.initialRotations.reduce((sum, r) => {
    // Minimum clicks to get to 0: 0->0, 90->3, 180->2, 270->1
    const clicksNeeded = r === 0 ? 0 : (360 - r) / 90
    return sum + clicksNeeded
  }, 0)

  const extraRotations = Math.max(0, rotateEvents.length - minRotations)
  const penaltyTime = extraRotations * spec.rotationPenaltyMs

  // Calculate completion time using SERVER timestamps
  const lastEvent = rotateEvents[rotateEvents.length - 1] || startEvent
  const completionTimeMs = lastEvent.serverTimestamp.getTime() - startEvent.serverTimestamp.getTime()
  const totalTimeMs = completionTimeMs + penaltyTime

  if (totalTimeMs > spec.timeLimitMs) {
    return { valid: false, reason: 'timeout' }
  }

  // Check timing plausibility
  const timingResult = validateTimingPlausibility(rotateEvents)
  if (!timingResult.valid) {
    return {
      valid: false,
      reason: 'suspicious_timing',
      flag: true,
    }
  }

  const score = calculateScore(totalTimeMs, extraRotations, spec)

  return {
    valid: true,
    completionTimeMs: Math.round(totalTimeMs),
    extraRotations,
    score,
  }
}

function validateTimingPlausibility(events: StoredEvent[]): { valid: boolean; signals?: object } {
  if (events.length < 2) {
    return { valid: true }
  }

  // Calculate inter-event timings
  const interEventTimings: number[] = []
  for (let i = 1; i < events.length; i++) {
    const diff = events[i].serverTimestamp.getTime() - events[i - 1].serverTimestamp.getTime()
    interEventTimings.push(diff)
  }

  const avgInterEvent = interEventTimings.reduce((a, b) => a + b, 0) / interEventTimings.length
  const minInterEvent = Math.min(...interEventTimings)

  // Suspicious if average is less than 100ms (very fast clicking)
  if (avgInterEvent < 100) {
    return {
      valid: false,
      signals: { avgInterEvent, reason: 'too_fast' },
    }
  }

  // Suspicious if any click is less than 50ms apart
  if (minInterEvent < 50) {
    return {
      valid: false,
      signals: { minInterEvent, reason: 'impossible_speed' },
    }
  }

  return { valid: true }
}

function calculateScore(timeMs: number, extraRotations: number, spec: ImageRotateTurnSpec): number {
  // Higher score = better
  const maxTime = spec.timeLimitMs
  const timeScore = Math.max(0, ((maxTime - timeMs) / maxTime) * 10000)

  // Penalty for extra rotations
  const rotationPenalty = extraRotations * 200

  return Math.max(0, Math.round(timeScore - rotationPenalty))
}

export const DEFAULT_IMAGE_ROTATE_CONFIG: ImageRotateConfig = {
  grid_size: 3,
  time_limit_seconds: 60,
  rotation_penalty_ms: 1000,
}
