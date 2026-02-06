import crypto from 'crypto'

export interface FollowMeConfig {
  num_points: number
  canvas_size: number
  time_limit_seconds: number
  path_complexity: number // 1-5, higher = more curves
}

export interface Point {
  x: number
  y: number
}

export interface FollowMeTurnSpec {
  seed: string
  canvasSize: number
  path: Point[]
  timeLimitMs: number
}

export interface FollowMeEvent {
  eventType: string
  points?: Point[]
  serverTimestamp: Date
  clientTimestampMs?: number
}

export interface FollowMeResult {
  valid: boolean
  reason?: string
  accuracy?: number
  coverage?: number
  score?: number
  flag?: boolean
}

export const DEFAULT_FOLLOW_ME_CONFIG: FollowMeConfig = {
  num_points: 50,
  canvas_size: 300,
  time_limit_seconds: 30,
  path_complexity: 3,
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

export function generateFollowMeTurnSpec(
  userId: string,
  config: FollowMeConfig
): FollowMeTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  const padding = 30
  const size = config.canvas_size - padding * 2

  // Generate control points for bezier curves
  const numControlPoints = 3 + config.path_complexity
  const controlPoints: Point[] = []

  // Start point
  controlPoints.push({
    x: padding + random() * size * 0.3,
    y: padding + random() * size,
  })

  // Middle control points
  for (let i = 1; i < numControlPoints - 1; i++) {
    const xProgress = i / (numControlPoints - 1)
    controlPoints.push({
      x: padding + xProgress * size,
      y: padding + random() * size,
    })
  }

  // End point
  controlPoints.push({
    x: padding + size * 0.7 + random() * size * 0.3,
    y: padding + random() * size,
  })

  // Generate smooth path using cubic bezier interpolation
  const path: Point[] = []
  const pointsPerSegment = Math.ceil(config.num_points / (controlPoints.length - 1))

  for (let i = 0; i < controlPoints.length - 1; i++) {
    const p0 = controlPoints[Math.max(0, i - 1)]
    const p1 = controlPoints[i]
    const p2 = controlPoints[i + 1]
    const p3 = controlPoints[Math.min(controlPoints.length - 1, i + 2)]

    for (let t = 0; t < pointsPerSegment; t++) {
      const tNorm = t / pointsPerSegment

      // Catmull-Rom spline interpolation
      const t2 = tNorm * tNorm
      const t3 = t2 * tNorm

      const x = 0.5 * (
        (2 * p1.x) +
        (-p0.x + p2.x) * tNorm +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
      )

      const y = 0.5 * (
        (2 * p1.y) +
        (-p0.y + p2.y) * tNorm +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
      )

      path.push({
        x: Math.max(padding, Math.min(config.canvas_size - padding, x)),
        y: Math.max(padding, Math.min(config.canvas_size - padding, y)),
      })
    }
  }

  // Add the last point
  path.push(controlPoints[controlPoints.length - 1])

  return {
    seed,
    canvasSize: config.canvas_size,
    path,
    timeLimitMs: config.time_limit_seconds * 1000,
  }
}

export function getFollowMeClientSpec(spec: FollowMeTurnSpec): {
  canvasSize: number
  path: Point[]
  timeLimitMs: number
} {
  return {
    canvasSize: spec.canvasSize,
    path: spec.path,
    timeLimitMs: spec.timeLimitMs,
  }
}

export function validateFollowMeTurn(
  spec: FollowMeTurnSpec,
  events: FollowMeEvent[]
): FollowMeResult {
  const drawEvent = events.find(e => e.eventType === 'draw_complete')

  if (!drawEvent || !drawEvent.points || drawEvent.points.length < 10) {
    return { valid: false, reason: 'no_drawing', accuracy: 0, coverage: 0 }
  }

  const userPath = drawEvent.points

  // Calculate time taken
  const startEvent = events.find(e => e.eventType === 'draw_start')
  const startTime = startEvent?.clientTimestampMs || 0
  const endTime = drawEvent.clientTimestampMs || 0
  const timeTakenMs = endTime - startTime

  // Check for impossibly fast drawing
  if (timeTakenMs < 500 && userPath.length > 20) {
    return {
      valid: false,
      reason: 'impossible_speed',
      accuracy: 0,
      coverage: 0,
      flag: true,
    }
  }

  // Calculate accuracy: average distance from user points to nearest target point
  let totalDistance = 0
  for (const userPoint of userPath) {
    let minDist = Infinity
    for (const targetPoint of spec.path) {
      const dist = Math.sqrt(
        Math.pow(userPoint.x - targetPoint.x, 2) +
        Math.pow(userPoint.y - targetPoint.y, 2)
      )
      if (dist < minDist) minDist = dist
    }
    totalDistance += minDist
  }
  const avgDistance = totalDistance / userPath.length

  // Calculate coverage: what % of target path was traced
  const coverageThreshold = 20 // pixels
  let coveredPoints = 0
  for (const targetPoint of spec.path) {
    let isCovered = false
    for (const userPoint of userPath) {
      const dist = Math.sqrt(
        Math.pow(userPoint.x - targetPoint.x, 2) +
        Math.pow(userPoint.y - targetPoint.y, 2)
      )
      if (dist <= coverageThreshold) {
        isCovered = true
        break
      }
    }
    if (isCovered) coveredPoints++
  }
  const coverage = coveredPoints / spec.path.length

  // Must have at least 50% coverage
  if (coverage < 0.5) {
    return { valid: false, reason: 'low_coverage', accuracy: 0, coverage }
  }

  // Calculate accuracy score (lower distance = better)
  // Max expected distance for "good" tracing is about 15 pixels
  const maxGoodDistance = 15
  const accuracyRatio = Math.max(0, 1 - avgDistance / (maxGoodDistance * 2))

  const accuracyScore = Math.pow(accuracyRatio, 1.15) * 4000
  const coverageScore = coverage * 3000
  const speed = Math.sqrt(spec.timeLimitMs / Math.max(timeTakenMs, 2000))
  const score = Math.round((accuracyScore + coverageScore) * speed)

  return {
    valid: true,
    accuracy: accuracyRatio,
    coverage,
    score,
  }
}
