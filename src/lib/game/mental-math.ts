import crypto from 'crypto'

export interface MentalMathConfig {
  num_problems: number
  time_limit_seconds: number
  min_number: number
  max_number: number
  operations: ('+' | '-' | '*')[]
}

interface MathProblem {
  a: number
  b: number
  operation: '+' | '-' | '*'
  answer: number
}

export interface MentalMathTurnSpec {
  seed: string
  problems: MathProblem[]
  timeLimitMs: number
}

export interface MathEvent {
  eventType: string
  problemIndex?: number
  userAnswer?: number
  serverTimestamp: Date
  clientTimestampMs?: number
}

export interface MentalMathResult {
  valid: boolean
  reason?: string
  correct: number
  total: number
  averageTimeMs?: number
  score?: number
  flag?: boolean
}

export const DEFAULT_MENTAL_MATH_CONFIG: MentalMathConfig = {
  num_problems: 10,
  time_limit_seconds: 60,
  min_number: 2,
  max_number: 50,
  operations: ['+', '-', '*'],
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

export function generateMentalMathTurnSpec(
  userId: string,
  config: MentalMathConfig
): MentalMathTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  const problems: MathProblem[] = []

  for (let i = 0; i < config.num_problems; i++) {
    const operation = config.operations[Math.floor(random() * config.operations.length)]
    let a = Math.floor(random() * (config.max_number - config.min_number + 1)) + config.min_number
    let b = Math.floor(random() * (config.max_number - config.min_number + 1)) + config.min_number

    // For subtraction, ensure a >= b to avoid negative results
    if (operation === '-' && a < b) {
      [a, b] = [b, a]
    }

    // For multiplication, use smaller numbers
    if (operation === '*') {
      a = Math.floor(random() * 12) + 2
      b = Math.floor(random() * 12) + 2
    }

    let answer: number
    switch (operation) {
      case '+': answer = a + b; break
      case '-': answer = a - b; break
      case '*': answer = a * b; break
    }

    problems.push({ a, b, operation, answer })
  }

  return {
    seed,
    problems,
    timeLimitMs: config.time_limit_seconds * 1000,
  }
}

export function getMentalMathClientSpec(spec: MentalMathTurnSpec): {
  problems: { a: number; b: number; operation: string }[]
  timeLimitMs: number
} {
  // Don't send answers to client!
  return {
    problems: spec.problems.map(p => ({ a: p.a, b: p.b, operation: p.operation })),
    timeLimitMs: spec.timeLimitMs,
  }
}

export function validateMentalMathTurn(
  spec: MentalMathTurnSpec,
  events: MathEvent[]
): MentalMathResult {
  const answerEvents = events.filter(e => e.eventType === 'answer')

  if (answerEvents.length === 0) {
    return { valid: false, reason: 'no_answers', correct: 0, total: spec.problems.length }
  }

  // Check answers
  let correct = 0
  const answerTimes: number[] = []

  for (const event of answerEvents) {
    const problemIndex = event.problemIndex ?? -1
    if (problemIndex >= 0 && problemIndex < spec.problems.length) {
      const problem = spec.problems[problemIndex]
      if (event.userAnswer === problem.answer) {
        correct++
      }
      if (event.clientTimestampMs) {
        answerTimes.push(event.clientTimestampMs)
      }
    }
  }

  // Analyze timing for bot detection
  if (answerTimes.length >= 3) {
    const intervals: number[] = []
    for (let i = 1; i < answerTimes.length; i++) {
      intervals.push(answerTimes[i] - answerTimes[i - 1])
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance = intervals.reduce((sum, t) => sum + Math.pow(t - avgInterval, 2), 0) / intervals.length
    const stdDev = Math.sqrt(variance)

    // Suspiciously consistent timing
    if (stdDev < 50 && intervals.length > 5) {
      return {
        valid: false,
        reason: 'suspicious_consistency',
        correct,
        total: spec.problems.length,
        flag: true,
      }
    }

    // Impossibly fast answers (< 500ms average)
    if (avgInterval < 500 && correct > 5) {
      return {
        valid: false,
        reason: 'impossible_speed',
        correct,
        total: spec.problems.length,
        flag: true,
      }
    }
  }

  // Must get at least 50% correct
  if (correct < spec.problems.length / 2) {
    return {
      valid: false,
      reason: 'too_few_correct',
      correct,
      total: spec.problems.length,
    }
  }

  const averageTimeMs = answerTimes.length > 1
    ? Math.round((answerTimes[answerTimes.length - 1] - answerTimes[0]) / (answerTimes.length - 1))
    : undefined

  const score = calculateMentalMathScore(correct, spec.problems.length, averageTimeMs)

  return {
    valid: true,
    correct,
    total: spec.problems.length,
    averageTimeMs,
    score,
  }
}

function calculateMentalMathScore(correct: number, total: number, avgTimeMs?: number): number {
  // Score based on accuracy (max 7000) and speed (max 3000)
  const accuracyScore = (correct / total) * 7000

  let speedScore = 0
  if (avgTimeMs) {
    // Faster = better. Perfect is 1000ms, max penalty at 5000ms
    const speedFactor = Math.max(0, 1 - (avgTimeMs - 1000) / 4000)
    speedScore = speedFactor * 3000
  }

  return Math.round(accuracyScore + speedScore)
}
