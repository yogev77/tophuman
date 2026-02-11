import crypto from 'crypto'
import { PUZZLE_IMAGES } from './image-rotate'

export interface ImagePuzzleConfig {
  grid_size: number
  num_preplaced: number
  time_limit_seconds: number
}

export interface ImagePuzzleTurnSpec {
  seed: string
  imageUrl: string
  gridSize: number
  preplacedIndices: number[]     // 3 cells that are already correct
  bankPieces: number[]           // 6 piece indices (shuffled order for the bank)
  correctPositions: number[]     // answer key: bankPieces[i] goes to correctPositions[i]
  timeLimitMs: number
}

export interface ImagePuzzleEvent {
  eventType: string
  pieceIndex?: number
  targetCell?: number
  correct?: boolean
  serverTimestamp: Date
  clientTimestampMs?: number
}

export interface ImagePuzzleResult {
  valid: boolean
  reason?: string
  mistakes?: number
  completionTimeMs?: number
  score?: number
  flag?: boolean
}

export const DEFAULT_IMAGE_PUZZLE_CONFIG: ImagePuzzleConfig = {
  grid_size: 3,
  num_preplaced: 3,
  time_limit_seconds: 60,
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

export function generateImagePuzzleTurnSpec(
  userId: string,
  config: ImagePuzzleConfig
): ImagePuzzleTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  // Select random image
  const imageIndex = Math.floor(random() * PUZZLE_IMAGES.length)
  const imageUrl = PUZZLE_IMAGES[imageIndex]

  const totalCells = config.grid_size * config.grid_size // 9
  const allIndices = Array.from({ length: totalCells }, (_, i) => i)

  // Shuffle to pick random preplaced cells
  for (let i = allIndices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]]
  }

  const preplacedIndices = allIndices.slice(0, config.num_preplaced).sort((a, b) => a - b)
  const remainingIndices = allIndices.slice(config.num_preplaced)

  // Bank pieces are the remaining cells (shuffled order for display)
  const bankPieces = [...remainingIndices]
  for (let i = bankPieces.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[bankPieces[i], bankPieces[j]] = [bankPieces[j], bankPieces[i]]
  }

  // correctPositions: for each bankPiece, what cell it should go to (which is its own index)
  const correctPositions = bankPieces.map(piece => piece)

  return {
    seed,
    imageUrl,
    gridSize: config.grid_size,
    preplacedIndices,
    bankPieces,
    correctPositions,
    timeLimitMs: config.time_limit_seconds * 1000,
  }
}

export function getImagePuzzleClientSpec(spec: ImagePuzzleTurnSpec): Omit<ImagePuzzleTurnSpec, 'seed' | 'correctPositions'> {
  return {
    imageUrl: spec.imageUrl,
    gridSize: spec.gridSize,
    preplacedIndices: spec.preplacedIndices,
    bankPieces: spec.bankPieces,
    timeLimitMs: spec.timeLimitMs,
  }
}

export function validateImagePuzzleTurn(
  spec: ImagePuzzleTurnSpec,
  events: ImagePuzzleEvent[]
): ImagePuzzleResult {
  const placeEvents = events.filter(e => e.eventType === 'place_piece')
  const startEvent = events.find(e => e.eventType === 'start')

  if (!startEvent) {
    return { valid: false, reason: 'no_start_event' }
  }

  // Replay all placements, count mistakes and correct placements
  let mistakes = 0
  const correctPlacements = new Set<number>()  // track which bank pieces are placed correctly

  for (const event of placeEvents) {
    if (event.pieceIndex === undefined || event.targetCell === undefined) continue

    // Find which bank piece this is and what its correct position is
    const bankIdx = spec.bankPieces.indexOf(event.pieceIndex)
    if (bankIdx === -1) continue

    const correctCell = spec.correctPositions[bankIdx]
    if (event.targetCell === correctCell) {
      correctPlacements.add(event.pieceIndex)
    } else {
      mistakes++
    }
  }

  const numBankPieces = spec.bankPieces.length
  if (correctPlacements.size < numBankPieces) {
    return { valid: false, reason: 'incomplete', mistakes }
  }

  // Calculate completion time using server timestamps
  const lastEvent = placeEvents[placeEvents.length - 1]
  const startTime = new Date(startEvent.serverTimestamp).getTime()
  const endTime = lastEvent ? new Date(lastEvent.serverTimestamp).getTime() : startTime
  const completionTimeMs = endTime - startTime

  if (completionTimeMs > spec.timeLimitMs + 5000) {
    return { valid: false, reason: 'timeout', mistakes }
  }

  // Bot detection
  if (placeEvents.length >= 3) {
    const timings = placeEvents.map(e => new Date(e.serverTimestamp).getTime())
    const intervals: number[] = []
    for (let i = 1; i < timings.length; i++) {
      intervals.push(timings[i] - timings[i - 1])
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const stdDev = Math.sqrt(
      intervals.reduce((sum, t) => sum + Math.pow(t - avgInterval, 2), 0) / intervals.length
    )

    // 0 mistakes in < 3s or avg interval < 200ms with low variance
    if (mistakes === 0 && completionTimeMs < 3000) {
      return { valid: false, reason: 'impossible_speed', flag: true, mistakes }
    }
    if (avgInterval < 200 && stdDev < 30) {
      return { valid: false, reason: 'suspicious_timing', flag: true, mistakes }
    }
  }

  // Scoring: max(0, 7000 - mistakes * 500) * sqrt(maxTime / time)
  const maxTimeMs = spec.timeLimitMs
  const speed = Math.sqrt(maxTimeMs / Math.max(completionTimeMs, 3000))
  const quality = Math.max(0, 7000 - mistakes * 500)
  const score = Math.round(quality * speed)

  return {
    valid: true,
    mistakes,
    completionTimeMs: Math.round(completionTimeMs),
    score,
  }
}
