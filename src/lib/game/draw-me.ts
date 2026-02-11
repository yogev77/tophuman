import crypto from 'crypto'
import { seededRandom, generatePath, validateRoundPath, Point } from './follow-me'

export interface DrawMeConfig {
  canvas_size: number
  num_rounds: number
  time_limit_seconds: number
}

export interface DrawMeTurnSpec {
  seed: string
  canvasSize: number
  paths: Point[][]
  timeLimitMs: number
}

export interface DrawMeEvent {
  eventType: string
  points?: Point[]
  round?: number
  serverTimestamp: Date
  clientTimestampMs?: number
}

export interface DrawMeResult {
  valid: boolean
  reason?: string
  accuracy?: number
  coverage?: number
  score?: number
  flag?: boolean
}

export const DEFAULT_DRAW_ME_CONFIG: DrawMeConfig = {
  canvas_size: 300,
  num_rounds: 3,
  time_limit_seconds: 30,
}

export function generateDrawMeTurnSpec(
  userId: string,
  config: DrawMeConfig
): DrawMeTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  // 3 paths with increasing complexity
  const path1 = generatePath(random, config.canvas_size, 3, 30, false)
  const path2 = generatePath(random, config.canvas_size, 5, 45, false)
  const path3 = generatePath(random, config.canvas_size, 6, 55, true)

  return {
    seed,
    canvasSize: config.canvas_size,
    paths: [path1, path2, path3],
    timeLimitMs: config.time_limit_seconds * 1000,
  }
}

export function getDrawMeClientSpec(spec: DrawMeTurnSpec): Omit<DrawMeTurnSpec, 'seed'> {
  return {
    canvasSize: spec.canvasSize,
    paths: spec.paths,
    timeLimitMs: spec.timeLimitMs,
  }
}

export function validateDrawMeTurn(
  spec: DrawMeTurnSpec,
  events: DrawMeEvent[]
): DrawMeResult {
  // Collect per-round paths from round_complete events + draw_complete for last round
  const roundEvents = events
    .filter(e => e.eventType === 'round_complete')
    .sort((a, b) => new Date(a.serverTimestamp).getTime() - new Date(b.serverTimestamp).getTime())

  const drawCompleteEvent = events.find(e => e.eventType === 'draw_complete')

  const userRoundPaths: Point[][] = roundEvents.map(e => e.points || [])

  if (drawCompleteEvent?.points && drawCompleteEvent.points.length > 0) {
    userRoundPaths.push(drawCompleteEvent.points)
  }

  if (userRoundPaths.length === 0 || userRoundPaths.every(p => p.length < 10)) {
    return { valid: false, reason: 'no_drawing', accuracy: 0, coverage: 0 }
  }

  // Calculate time taken
  const startEvent = events.find(e => e.eventType === 'draw_start')
  const lastEvent = drawCompleteEvent || roundEvents[roundEvents.length - 1]
  const startTime = startEvent ? new Date(startEvent.serverTimestamp).getTime() : 0
  const endTime = lastEvent ? new Date(lastEvent.serverTimestamp).getTime() : 0
  const timeTakenMs = endTime - startTime

  // Bot detection: draw time < 500ms with 20+ points
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

  // Scoring: (pow(accuracy, 1.15) * 4000 + coverage * 3000) * sqrt(maxTime / time) * roundBonus
  const accuracyScore = Math.pow(avgAccuracy, 1.15) * 4000
  const coverageScore = avgCoverage * 3000
  const speed = Math.sqrt(spec.timeLimitMs / Math.max(timeTakenMs, 2000))
  const roundBonus = validRounds / spec.paths.length
  const score = Math.round((accuracyScore + coverageScore) * speed * roundBonus)

  return {
    valid: true,
    accuracy: avgAccuracy,
    coverage: avgCoverage,
    score,
  }
}
