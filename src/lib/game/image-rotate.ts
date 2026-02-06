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

// Available puzzle images - using Unsplash for perfect squares (400x400)
// Categories: cats, puppies, intersections, abstract art, memes
const PUZZLE_IMAGES = [
  // Cats (9)
  'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1495360010541-f48722b34f7d?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1526336024174-e58f5cdd8e13?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1511044568932-338cba0ad803?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1543852786-1cf6624b9987?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1478098711619-5ab0b478d6e6?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1519052537078-e6302a4968d4?w=400&h=400&fit=crop',
  // Puppies (9)
  'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1517849845537-4d257902454a?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1537151625747-768eb6cf92b2?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1588943211346-0908a1fb0b01?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1477884213360-7e9d7dcc1e48?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1560807707-8cc77767d783?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1534361960057-19889db9621e?w=400&h=400&fit=crop',
  // Intersections / City Streets (9)
  'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1444723121867-7a241cacace9?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1460472178825-e5240623afd5?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1517732306149-e8f829eb588a?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1494522855154-9297ac14b55f?w=400&h=400&fit=crop',
  // Abstract Art (9)
  'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1507908708918-778587c9e563?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1549490349-8643362247b5?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1518640467707-6811f4a6ab73?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1567359781514-3b964e2b04d6?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1573096108468-702f6014ef28?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1482160549825-59d1b23cb208?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1504253163759-c23fccaebb55?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=400&h=400&fit=crop',
  // Fun / Meme-worthy (9)
  'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1596854407944-bf87f6fdd49e?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1425082661705-1834bfd09dca?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1561037404-61cd46aa615b?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=400&h=400&fit=crop',
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
  const maxTimeMs = spec.timeLimitMs
  const quality = Math.max(0, 7000 - extraRotations * 600)
  const speed = Math.sqrt(maxTimeMs / Math.max(timeMs, 4000))
  return Math.round(quality * speed)
}

export const DEFAULT_IMAGE_ROTATE_CONFIG: ImageRotateConfig = {
  grid_size: 3,
  time_limit_seconds: 60,
  rotation_penalty_ms: 1000,
}
