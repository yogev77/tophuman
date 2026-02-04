import crypto from 'crypto'

export interface VisualDiffConfig {
  grid_size: number
  num_differences: number
  time_limit_seconds: number
  num_shapes: number
}

interface Shape {
  x: number
  y: number
  type: 'circle' | 'square' | 'triangle'
  color: string
  size: number
}

export interface VisualDiffTurnSpec {
  seed: string
  gridSize: number
  baseShapes: Shape[]
  differences: { index: number; property: 'color' | 'size' | 'type'; newValue: string | number }[]
  timeLimitMs: number
}

export interface VisualDiffEvent {
  eventType: string
  x?: number
  y?: number
  serverTimestamp: Date
  clientTimestampMs?: number
}

export interface VisualDiffResult {
  valid: boolean
  reason?: string
  found: number
  total: number
  score?: number
  flag?: boolean
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']
const SHAPE_TYPES: ('circle' | 'square' | 'triangle')[] = ['circle', 'square', 'triangle']

export const DEFAULT_VISUAL_DIFF_CONFIG: VisualDiffConfig = {
  grid_size: 300,
  num_differences: 5,
  time_limit_seconds: 60,
  num_shapes: 15,
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

export function generateVisualDiffTurnSpec(
  userId: string,
  config: VisualDiffConfig
): VisualDiffTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  // Generate base shapes
  const baseShapes: Shape[] = []
  for (let i = 0; i < config.num_shapes; i++) {
    baseShapes.push({
      x: Math.floor(random() * (config.grid_size - 40)) + 20,
      y: Math.floor(random() * (config.grid_size - 40)) + 20,
      type: SHAPE_TYPES[Math.floor(random() * SHAPE_TYPES.length)],
      color: COLORS[Math.floor(random() * COLORS.length)],
      size: Math.floor(random() * 20) + 15,
    })
  }

  // Generate differences
  const differences: { index: number; property: 'color' | 'size' | 'type'; newValue: string | number }[] = []
  const usedIndices = new Set<number>()

  while (differences.length < config.num_differences && usedIndices.size < config.num_shapes) {
    const index = Math.floor(random() * config.num_shapes)
    if (usedIndices.has(index)) continue
    usedIndices.add(index)

    const propertyChoice = Math.floor(random() * 3)
    if (propertyChoice === 0) {
      // Change color
      let newColor = COLORS[Math.floor(random() * COLORS.length)]
      while (newColor === baseShapes[index].color) {
        newColor = COLORS[Math.floor(random() * COLORS.length)]
      }
      differences.push({ index, property: 'color', newValue: newColor })
    } else if (propertyChoice === 1) {
      // Change size
      const currentSize = baseShapes[index].size
      const newSize = currentSize + (random() > 0.5 ? 10 : -8)
      differences.push({ index, property: 'size', newValue: Math.max(10, newSize) })
    } else {
      // Change type
      let newType = SHAPE_TYPES[Math.floor(random() * SHAPE_TYPES.length)]
      while (newType === baseShapes[index].type) {
        newType = SHAPE_TYPES[Math.floor(random() * SHAPE_TYPES.length)]
      }
      differences.push({ index, property: 'type', newValue: newType })
    }
  }

  return {
    seed,
    gridSize: config.grid_size,
    baseShapes,
    differences,
    timeLimitMs: config.time_limit_seconds * 1000,
  }
}

export function getVisualDiffClientSpec(spec: VisualDiffTurnSpec): {
  gridSize: number
  baseShapes: Shape[]
  modifiedShapes: Shape[]
  numDifferences: number
  timeLimitMs: number
} {
  // Create modified shapes
  const modifiedShapes = spec.baseShapes.map(s => ({ ...s }))
  for (const diff of spec.differences) {
    if (diff.property === 'color') {
      modifiedShapes[diff.index].color = diff.newValue as string
    } else if (diff.property === 'size') {
      modifiedShapes[diff.index].size = diff.newValue as number
    } else if (diff.property === 'type') {
      modifiedShapes[diff.index].type = diff.newValue as 'circle' | 'square' | 'triangle'
    }
  }

  return {
    gridSize: spec.gridSize,
    baseShapes: spec.baseShapes,
    modifiedShapes,
    numDifferences: spec.differences.length,
    timeLimitMs: spec.timeLimitMs,
  }
}

export function validateVisualDiffTurn(
  spec: VisualDiffTurnSpec,
  events: VisualDiffEvent[]
): VisualDiffResult {
  const clicks = events.filter(e => e.eventType === 'click')

  // Check timing for bot detection
  const times = clicks.map(c => c.clientTimestampMs || 0).filter(t => t > 0)
  if (times.length >= 3) {
    const intervals: number[] = []
    for (let i = 1; i < times.length; i++) {
      intervals.push(times[i] - times[i - 1])
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length

    // Impossibly fast clicking
    if (avgInterval < 200) {
      return {
        valid: false,
        reason: 'impossible_speed',
        found: 0,
        total: spec.differences.length,
        flag: true,
      }
    }
  }

  // Check which differences were found and track click accuracy
  const foundDiffs = new Map<number, number>() // diffIndex -> best distance
  const clickRadius = 30 // How close a click needs to be

  for (const click of clicks) {
    const clickX = click.x ?? 0
    const clickY = click.y ?? 0

    for (let i = 0; i < spec.differences.length; i++) {
      const diff = spec.differences[i]
      const shape = spec.baseShapes[diff.index]

      const distance = Math.sqrt(
        Math.pow(clickX - shape.x, 2) + Math.pow(clickY - shape.y, 2)
      )

      if (distance <= clickRadius + shape.size) {
        // Track the best (closest) click for each difference
        const currentBest = foundDiffs.get(i)
        if (currentBest === undefined || distance < currentBest) {
          foundDiffs.set(i, distance)
        }
      }
    }
  }

  const found = foundDiffs.size
  const total = spec.differences.length

  // Must find at least 60% of differences
  if (found < total * 0.6) {
    return { valid: false, reason: 'not_enough_found', found, total }
  }

  // Calculate time taken (from first to last event)
  const allTimes = events.map(e => e.clientTimestampMs || 0).filter(t => t > 0)
  const timeTakenMs = allTimes.length >= 2
    ? allTimes[allTimes.length - 1] - allTimes[0]
    : spec.timeLimitMs

  // Calculate average click accuracy (0 = perfect, higher = worse)
  const distances = Array.from(foundDiffs.values())
  const avgDistance = distances.length > 0
    ? distances.reduce((a, b) => a + b, 0) / distances.length
    : clickRadius

  // Score components:
  // 1. Found ratio: up to 4800 points (slightly reduced to prevent max score)
  const foundScore = (found / total) * 4800

  // 2. Speed bonus: up to 2800 points (faster = more points)
  // Minimum time of 3 seconds for any bonus, scales down from there
  // Even instant completion won't give full bonus due to minimum time floor
  const minTimeForBonus = 3000 // 3 seconds minimum
  const effectiveTime = Math.max(timeTakenMs, minTimeForBonus)
  const speedBonus = Math.max(0, 2800 - Math.floor(effectiveTime / 18))

  // 3. Accuracy bonus: up to 1800 points (closer clicks = more points)
  // Perfect accuracy is nearly impossible - require very close clicks
  const maxAccuracyDistance = clickRadius + 15 // Tighter accuracy requirement
  const accuracyRatio = Math.max(0, 1 - avgDistance / maxAccuracyDistance)
  // Apply a curve so perfect accuracy is harder to achieve
  const accuracyBonus = Math.round(Math.pow(accuracyRatio, 1.2) * 1800)

  // Cap at 9800 to ensure max score is never achievable
  const score = Math.min(9800, Math.round(foundScore + speedBonus + accuracyBonus))

  return {
    valid: true,
    found,
    total,
    score,
  }
}
