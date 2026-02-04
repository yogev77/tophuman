import crypto from 'crypto'

export interface DragSortConfig {
  num_items: number
  time_limit_seconds: number
  sort_type: 'numbers' | 'alphabet' | 'dates' | 'mixed'
}

export interface RoundSpec {
  items: string[]
  correctOrder: number[]
  sortType: string
}

export interface DragSortTurnSpec {
  seed: string
  items: string[]
  correctOrder: number[] // Indices in sorted order
  sortType: string
  timeLimitMs: number
  rounds?: RoundSpec[] // For mixed mode
}

export interface DragEvent {
  eventType: string
  fromIndex?: number
  toIndex?: number
  finalOrder?: number[]
  serverTimestamp: Date
  clientTimestampMs?: number
}

export interface DragSortResult {
  valid: boolean
  reason?: string
  correctPositions: number
  total: number
  score?: number
  flag?: boolean
}

export const DEFAULT_DRAG_SORT_CONFIG: DragSortConfig = {
  num_items: 5,
  time_limit_seconds: 60,
  sort_type: 'mixed', // Numbers then letters
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

function shuffleArray<T>(array: T[], random: () => number): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function generateRound(
  random: () => number,
  numItems: number,
  sortType: 'numbers' | 'alphabet'
): RoundSpec {
  let sortedItems: string[]

  if (sortType === 'numbers') {
    const numbers = new Set<number>()
    while (numbers.size < numItems) {
      numbers.add(Math.floor(random() * 100) + 1)
    }
    sortedItems = Array.from(numbers).sort((a, b) => a - b).map(n => n.toString())
  } else {
    // Capital letters
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
    const selected = shuffleArray(letters, random).slice(0, numItems)
    sortedItems = selected.sort()
  }

  const indices = sortedItems.map((_, i) => i)
  const shuffledIndices = shuffleArray(indices, random)

  while (shuffledIndices.every((v, i) => v === i)) {
    const temp = shuffledIndices[0]
    shuffledIndices[0] = shuffledIndices[1]
    shuffledIndices[1] = temp
  }

  const shuffledItems = shuffledIndices.map(i => sortedItems[i])

  return {
    items: shuffledItems,
    correctOrder: indices,
    sortType,
  }
}

export function generateDragSortTurnSpec(
  userId: string,
  config: DragSortConfig
): DragSortTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  if (config.sort_type === 'mixed') {
    // Generate two rounds: numbers then letters
    const round1 = generateRound(random, config.num_items, 'numbers')
    const round2 = generateRound(random, config.num_items, 'alphabet')

    return {
      seed,
      items: round1.items,
      correctOrder: round1.correctOrder,
      sortType: 'mixed',
      timeLimitMs: config.time_limit_seconds * 1000,
      rounds: [round1, round2],
    }
  }

  let sortedItems: string[]

  if (config.sort_type === 'numbers') {
    const numbers = new Set<number>()
    while (numbers.size < config.num_items) {
      numbers.add(Math.floor(random() * 100) + 1)
    }
    sortedItems = Array.from(numbers).sort((a, b) => a - b).map(n => n.toString())
  } else if (config.sort_type === 'alphabet') {
    const words = ['Apple', 'Banana', 'Cherry', 'Dragon', 'Eagle', 'Falcon', 'Grape', 'Honey', 'Igloo', 'Jungle', 'Kiwi', 'Lemon', 'Mango', 'Nectar', 'Orange', 'Peach']
    const selected = shuffleArray(words, random).slice(0, config.num_items)
    sortedItems = selected.sort()
  } else {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const startIndex = Math.floor(random() * (12 - config.num_items))
    sortedItems = months.slice(startIndex, startIndex + config.num_items)
  }

  const indices = sortedItems.map((_, i) => i)
  const shuffledIndices = shuffleArray(indices, random)

  while (shuffledIndices.every((v, i) => v === i)) {
    const temp = shuffledIndices[0]
    shuffledIndices[0] = shuffledIndices[1]
    shuffledIndices[1] = temp
  }

  const shuffledItems = shuffledIndices.map(i => sortedItems[i])

  return {
    seed,
    items: shuffledItems,
    correctOrder: indices,
    sortType: config.sort_type,
    timeLimitMs: config.time_limit_seconds * 1000,
  }
}

export function getDragSortClientSpec(spec: DragSortTurnSpec): {
  items: string[]
  sortType: string
  timeLimitMs: number
  rounds?: RoundSpec[]
} {
  return {
    items: spec.items,
    sortType: spec.sortType,
    timeLimitMs: spec.timeLimitMs,
    rounds: spec.rounds,
  }
}

export function validateDragSortTurn(
  spec: DragSortTurnSpec,
  events: DragEvent[]
): DragSortResult {
  const submitEvent = events.find(e => e.eventType === 'submit')

  if (!submitEvent || !submitEvent.finalOrder) {
    return { valid: false, reason: 'no_submission', correctPositions: 0, total: spec.items.length }
  }

  const swapEvents = events.filter(e => e.eventType === 'swap')

  // Check timing for bot detection
  if (swapEvents.length >= 3) {
    const times = swapEvents.map(s => s.clientTimestampMs || 0).filter(t => t > 0)
    if (times.length >= 3) {
      const intervals: number[] = []
      for (let i = 1; i < times.length; i++) {
        intervals.push(times[i] - times[i - 1])
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length

      // Impossibly fast swapping
      if (avgInterval < 100) {
        return {
          valid: false,
          reason: 'impossible_speed',
          correctPositions: 0,
          total: spec.items.length,
          flag: true,
        }
      }
    }
  }

  // Check how many items are in correct position
  // The submitted order should match the sorted items
  const sortedItems = [...spec.items].sort((a, b) => {
    if (spec.sortType === 'numbers') {
      return parseInt(a) - parseInt(b)
    }
    return a.localeCompare(b)
  })

  // Apply the submitted order to original items
  const submittedOrder = submitEvent.finalOrder.map(i => spec.items[i])

  let correctPositions = 0
  for (let i = 0; i < submittedOrder.length; i++) {
    if (submittedOrder[i] === sortedItems[i]) {
      correctPositions++
    }
  }

  // Must get at least 80% correct
  if (correctPositions < spec.items.length * 0.8) {
    return {
      valid: false,
      reason: 'incorrect_order',
      correctPositions,
      total: spec.items.length,
    }
  }

  const accuracy = correctPositions / spec.items.length

  // Calculate time taken for speed component
  const times = events.map(e => e.clientTimestampMs || 0).filter(t => t > 0)
  const timeTakenMs = times.length >= 2 ? times[times.length - 1] - times[0] : spec.timeLimitMs

  // Base score from accuracy: up to 7500 points
  const accuracyScore = accuracy * 7500

  // Speed bonus: up to 2000 points (faster = more, but with minimum time floor)
  const minTimeFloor = 3000 // 3 seconds minimum
  const effectiveTime = Math.max(timeTakenMs, minTimeFloor)
  const maxTime = spec.timeLimitMs
  const speedBonus = Math.max(0, ((maxTime - effectiveTime) / maxTime) * 2000)

  // Cap at 9800 to ensure max score is never achievable
  const score = Math.min(9800, Math.round(accuracyScore + speedBonus))

  return {
    valid: true,
    correctPositions,
    total: spec.items.length,
    score,
  }
}
