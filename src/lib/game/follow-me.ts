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
  paths: Point[][]
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

function generatePath(
  random: () => number,
  canvasSize: number,
  numControlPoints: number,
  numPoints: number,
  loop: boolean
): Point[] {
  const padding = 30
  const size = canvasSize - padding * 2

  const controlPoints: Point[] = []

  if (loop) {
    // Generate points in a rough circle/loop shape
    const cx = canvasSize / 2
    const cy = canvasSize / 2
    const baseRadius = size * 0.3

    for (let i = 0; i < numControlPoints; i++) {
      const angle = (i / numControlPoints) * Math.PI * 2
      const radiusVariance = baseRadius * (0.6 + random() * 0.8)
      controlPoints.push({
        x: Math.max(padding, Math.min(canvasSize - padding, cx + Math.cos(angle) * radiusVariance)),
        y: Math.max(padding, Math.min(canvasSize - padding, cy + Math.sin(angle) * radiusVariance)),
      })
    }
    // Close the loop by repeating the first point
    controlPoints.push({ ...controlPoints[0] })
  } else {
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
  }

  // Generate smooth path using Catmull-Rom spline interpolation
  const path: Point[] = []
  const pointsPerSegment = Math.ceil(numPoints / (controlPoints.length - 1))

  for (let i = 0; i < controlPoints.length - 1; i++) {
    const p0 = controlPoints[(i - 1 + controlPoints.length) % controlPoints.length]
    const p1 = controlPoints[i]
    const p2 = controlPoints[i + 1]
    const p3 = controlPoints[Math.min(controlPoints.length - 1, i + 2)]

    for (let t = 0; t < pointsPerSegment; t++) {
      const tNorm = t / pointsPerSegment
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
        x: Math.max(padding, Math.min(canvasSize - padding, x)),
        y: Math.max(padding, Math.min(canvasSize - padding, y)),
      })
    }
  }

  // Add the last point
  path.push(controlPoints[controlPoints.length - 1])

  return path
}

export function generateFollowMeTurnSpec(
  userId: string,
  config: FollowMeConfig
): FollowMeTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  // Level 1: Simple path - few control points, gentle curves
  const path1 = generatePath(random, config.canvas_size, 3, 35, false)

  // Level 2: More curves and longer path
  const path2 = generatePath(random, config.canvas_size, 5, 50, false)

  // Level 3: A looping path
  const path3 = generatePath(random, config.canvas_size, 6, 55, true)

  return {
    seed,
    canvasSize: config.canvas_size,
    paths: [path1, path2, path3],
    timeLimitMs: config.time_limit_seconds * 1000,
  }
}

export function getFollowMeClientSpec(spec: FollowMeTurnSpec): {
  canvasSize: number
  paths: Point[][]
  timeLimitMs: number
} {
  return {
    canvasSize: spec.canvasSize,
    paths: spec.paths,
    timeLimitMs: spec.timeLimitMs,
  }
}

function validateRoundPath(
  targetPath: Point[],
  userPoints: Point[]
): { accuracy: number; coverage: number } {
  // Calculate accuracy: average distance from user points to nearest target point
  let totalDistance = 0
  for (const userPoint of userPoints) {
    let minDist = Infinity
    for (const targetPoint of targetPath) {
      const dist = Math.sqrt(
        Math.pow(userPoint.x - targetPoint.x, 2) +
        Math.pow(userPoint.y - targetPoint.y, 2)
      )
      if (dist < minDist) minDist = dist
    }
    totalDistance += minDist
  }
  const avgDistance = totalDistance / userPoints.length

  // Calculate coverage: what % of target path was traced
  const coverageThreshold = 20
  let coveredPoints = 0
  for (const targetPoint of targetPath) {
    for (const userPoint of userPoints) {
      const dist = Math.sqrt(
        Math.pow(userPoint.x - targetPoint.x, 2) +
        Math.pow(userPoint.y - targetPoint.y, 2)
      )
      if (dist <= coverageThreshold) {
        coveredPoints++
        break
      }
    }
  }
  const coverage = coveredPoints / targetPath.length

  const maxGoodDistance = 15
  const accuracy = Math.max(0, 1 - avgDistance / (maxGoodDistance * 2))

  return { accuracy, coverage }
}

export function validateFollowMeTurn(
  spec: FollowMeTurnSpec,
  events: FollowMeEvent[]
): FollowMeResult {
  // Collect per-round paths from round_complete events + draw_complete for last round
  const roundEvents = events
    .filter(e => e.eventType === 'round_complete')
    .sort((a, b) => new Date(a.serverTimestamp).getTime() - new Date(b.serverTimestamp).getTime())

  const drawEvent = events.find(e => e.eventType === 'draw_complete')

  // Build user paths per round
  const userRoundPaths: Point[][] = roundEvents.map(e => e.points || [])

  // draw_complete might have the last round's path
  if (drawEvent?.points && drawEvent.points.length > 0) {
    userRoundPaths.push(drawEvent.points)
  }

  // Fallback: if old client sends combined path in draw_complete with no round events
  if (userRoundPaths.length === 0 && drawEvent?.points && drawEvent.points.length >= 10) {
    // Validate against all paths combined (legacy)
    const allTargetPoints = spec.paths.flat()
    const result = validateRoundPath(allTargetPoints, drawEvent.points)

    if (result.coverage < 0.5) {
      return { valid: false, reason: 'low_coverage', accuracy: 0, coverage: result.coverage }
    }

    const startEvent = events.find(e => e.eventType === 'draw_start')
    const timeTakenMs = new Date(drawEvent.serverTimestamp).getTime() - (startEvent ? new Date(startEvent.serverTimestamp).getTime() : 0)
    const speed = Math.sqrt(spec.timeLimitMs / Math.max(timeTakenMs, 2000))
    const score = Math.round((Math.pow(result.accuracy, 1.15) * 4000 + result.coverage * 3000) * speed)

    return { valid: true, accuracy: result.accuracy, coverage: result.coverage, score }
  }

  if (userRoundPaths.length === 0 || userRoundPaths.every(p => p.length < 10)) {
    return { valid: false, reason: 'no_drawing', accuracy: 0, coverage: 0 }
  }

  // Calculate time taken
  const startEvent = events.find(e => e.eventType === 'draw_start')
  const lastEvent = drawEvent || roundEvents[roundEvents.length - 1]
  const startTime = startEvent ? new Date(startEvent.serverTimestamp).getTime() : 0
  const endTime = lastEvent ? new Date(lastEvent.serverTimestamp).getTime() : 0
  const timeTakenMs = endTime - startTime

  if (timeTakenMs < 500 && userRoundPaths.flat().length > 20) {
    return { valid: false, reason: 'impossible_speed', accuracy: 0, coverage: 0, flag: true }
  }

  // Validate each round against its corresponding path
  let totalAccuracy = 0
  let totalCoverage = 0
  let validRounds = 0

  for (let i = 0; i < Math.min(userRoundPaths.length, spec.paths.length); i++) {
    if (userRoundPaths[i].length < 10) continue

    const result = validateRoundPath(spec.paths[i], userRoundPaths[i])
    totalAccuracy += result.accuracy
    totalCoverage += result.coverage
    validRounds++
  }

  if (validRounds === 0) {
    return { valid: false, reason: 'no_drawing', accuracy: 0, coverage: 0 }
  }

  const avgAccuracy = totalAccuracy / validRounds
  const avgCoverage = totalCoverage / validRounds

  if (avgCoverage < 0.5) {
    return { valid: false, reason: 'low_coverage', accuracy: 0, coverage: avgCoverage }
  }

  const accuracyScore = Math.pow(avgAccuracy, 1.15) * 4000
  const coverageScore = avgCoverage * 3000
  const speed = Math.sqrt(spec.timeLimitMs / Math.max(timeTakenMs, 2000))
  // Bonus for completing more rounds
  const roundBonus = validRounds / spec.paths.length
  const score = Math.round((accuracyScore + coverageScore) * speed * roundBonus)

  return {
    valid: true,
    accuracy: avgAccuracy,
    coverage: avgCoverage,
    score,
  }
}
