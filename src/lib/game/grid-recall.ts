export interface GridRecallConfig {
  gridSize: number
  rounds: { tileCount: number; previewMs: number; inputTimeLimitMs: number | null }[]
  timeLimitSec: number
}

export const DEFAULT_GRID_RECALL_CONFIG: GridRecallConfig = {
  gridSize: 5,
  rounds: [
    { tileCount: 4, previewMs: 2000, inputTimeLimitMs: null },
    { tileCount: 5, previewMs: 1800, inputTimeLimitMs: null },
    { tileCount: 6, previewMs: 1500, inputTimeLimitMs: null },
    { tileCount: 7, previewMs: 1200, inputTimeLimitMs: 4000 },
    { tileCount: 9, previewMs: 1000, inputTimeLimitMs: 3500 },
    { tileCount: 11, previewMs: 800, inputTimeLimitMs: 3000 },
  ],
  timeLimitSec: 60, // generous server limit; scoring uses 30s reference
}

export interface GridRecallRound {
  pattern: number[]
  previewMs: number
  inputTimeLimitMs: number | null
}

export interface GridRecallTurnSpec {
  userId: string
  gridSize: number
  rounds: GridRecallRound[]
  timeLimitSec: number
  createdAt: number
}

export function generateGridRecallTurnSpec(userId: string, config: GridRecallConfig): GridRecallTurnSpec {
  const totalCells = config.gridSize * config.gridSize
  const rounds: GridRecallRound[] = config.rounds.map(r => {
    const pattern: number[] = []
    while (pattern.length < r.tileCount) {
      const idx = Math.floor(Math.random() * totalCells)
      if (!pattern.includes(idx)) pattern.push(idx)
    }
    pattern.sort((a, b) => a - b)
    return {
      pattern,
      previewMs: r.previewMs,
      inputTimeLimitMs: r.inputTimeLimitMs,
    }
  })

  return {
    userId,
    gridSize: config.gridSize,
    rounds,
    timeLimitSec: config.timeLimitSec,
    createdAt: Date.now(),
  }
}

export function getGridRecallClientSpec(spec: GridRecallTurnSpec) {
  return {
    gridSize: spec.gridSize,
    rounds: spec.rounds.map(r => ({
      pattern: r.pattern,
      previewMs: r.previewMs,
      inputTimeLimitMs: r.inputTimeLimitMs,
      tileCount: r.pattern.length,
    })),
    timeLimitSec: spec.timeLimitSec,
  }
}

interface TurnEvent {
  eventType: string
  serverTimestamp: Date
  [key: string]: unknown
}

interface RoundResult {
  accuracy: number
  correctTaps: number
  wrongTaps: number
  missedTiles: number
  inputTimeMs: number
}

export interface GridRecallValidationResult {
  valid: boolean
  score: number
  flag: boolean
  completionTimeMs: number
  details: {
    roundResults: RoundResult[]
    avgAccuracy: number
    totalInputTimeMs: number
    completedRounds: number
  }
}

export function validateGridRecallTurn(
  spec: GridRecallTurnSpec,
  events: TurnEvent[]
): GridRecallValidationResult {
  const roundSubmits = events.filter(e => e.eventType === 'round_submit')

  if (roundSubmits.length === 0) {
    return {
      valid: true,
      score: 0,
      flag: false,
      completionTimeMs: 0,
      details: { roundResults: [], avgAccuracy: 0, totalInputTimeMs: 0, completedRounds: 0 },
    }
  }

  const roundResults: RoundResult[] = []
  let totalAccuracy = 0
  let totalInputTimeMs = 0

  // Bot detection: collect tap timestamps
  const tapEvents = events.filter(e => e.eventType === 'tile_tap')
  const tapTimestamps = tapEvents.map(e => e.serverTimestamp.getTime())

  for (let i = 0; i < roundSubmits.length && i < spec.rounds.length; i++) {
    const submit = roundSubmits[i]
    const round = spec.rounds[i]
    const selectedTiles = (submit.selectedTiles as number[]) || []
    const inputTimeMs = (submit.inputTimeMs as number) || 0

    const patternSet = new Set(round.pattern)

    let correctTaps = 0
    let wrongTaps = 0

    for (const tile of selectedTiles) {
      if (tile >= 0 && tile < spec.gridSize * spec.gridSize) {
        if (patternSet.has(tile)) {
          correctTaps++
        } else {
          wrongTaps++
        }
      }
    }

    const missedTiles = round.pattern.length - correctTaps
    const rawAccuracy = round.pattern.length > 0 ? correctTaps / round.pattern.length : 0
    const penalty = wrongTaps * 0.1
    const accuracy = Math.max(0, Math.min(1, rawAccuracy - penalty))

    totalAccuracy += accuracy
    totalInputTimeMs += inputTimeMs

    roundResults.push({ accuracy, correctTaps, wrongTaps, missedTiles, inputTimeMs })
  }

  const completedRounds = roundResults.length
  const avgAccuracy = completedRounds > 0 ? totalAccuracy / completedRounds : 0

  // Bot detection
  let flag = false
  if (tapTimestamps.length >= 4) {
    const intervals: number[] = []
    for (let i = 1; i < tapTimestamps.length; i++) {
      intervals.push(tapTimestamps[i] - tapTimestamps[i - 1])
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance = intervals.reduce((a, b) => a + (b - avgInterval) ** 2, 0) / intervals.length
    const stdDev = Math.sqrt(variance)
    if (avgInterval < 50 || stdDev < 10) {
      flag = true
    }
  }

  // Scoring: sqrt-based speed multiplier
  const maxTimeMs = 30000
  const effectiveTime = Math.max(totalInputTimeMs, 2000)

  let score: number
  if (avgAccuracy < 0.4) {
    score = Math.round(avgAccuracy * 7000)
  } else {
    const quality = avgAccuracy * 7000
    const speedMultiplier = Math.sqrt(maxTimeMs / effectiveTime)
    score = Math.round(quality * speedMultiplier)
  }

  // Scale by completion ratio
  score = Math.round(score * (completedRounds / spec.rounds.length))

  return {
    valid: true,
    score: Math.max(0, score),
    flag,
    completionTimeMs: totalInputTimeMs,
    details: { roundResults, avgAccuracy, totalInputTimeMs, completedRounds },
  }
}
