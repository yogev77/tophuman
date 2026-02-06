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
  round?: number
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
  sortType: 'numbers' | 'alphabet' | 'numbers_large'
): RoundSpec {
  let sortedItems: string[]

  if (sortType === 'numbers') {
    // Numbers 0-100
    const numbers = new Set<number>()
    while (numbers.size < numItems) {
      numbers.add(Math.floor(random() * 100) + 1)
    }
    sortedItems = Array.from(numbers).sort((a, b) => a - b).map(n => n.toString())
  } else if (sortType === 'numbers_large') {
    // Numbers 100-1000
    const numbers = new Set<number>()
    while (numbers.size < numItems) {
      numbers.add(Math.floor(random() * 900) + 100)
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
    sortType: sortType === 'numbers_large' ? 'numbers' : sortType, // Client sees both as 'numbers'
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
    // Generate two rounds: small numbers (0-100) then large numbers (100-1000)
    const round1 = generateRound(random, config.num_items, 'numbers')
    const round2 = generateRound(random, config.num_items, 'numbers_large')

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

function sortItemsByType(items: string[], sortType: string): string[] {
  const MONTH_ORDER = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return [...items].sort((a, b) => {
    if (sortType === 'numbers') {
      return parseInt(a) - parseInt(b)
    }
    if (sortType === 'dates') {
      return MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b)
    }
    return a.localeCompare(b)
  })
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

  // Validate item order per round
  let correctPositions = 0
  let totalItems = 0

  if (spec.sortType === 'mixed' && spec.rounds && spec.rounds.length > 0) {
    // Mixed mode: validate each round separately
    const roundSubmits = events.filter(e => e.eventType === 'submit_round')

    for (let r = 0; r < spec.rounds.length; r++) {
      const round = spec.rounds[r]
      const roundEvent = roundSubmits.find(e => e.round === r + 1)

      // Use submit_round event for each round; fall back to final submit for last round
      const roundOrder = roundEvent?.finalOrder
        ?? (r === spec.rounds.length - 1 ? submitEvent.finalOrder : null)

      if (!roundOrder) continue

      const sortedRoundItems = sortItemsByType(round.items, round.sortType)
      const submitted = roundOrder.map(i => round.items[i])

      for (let i = 0; i < submitted.length; i++) {
        if (submitted[i] === sortedRoundItems[i]) {
          correctPositions++
        }
      }
      totalItems += round.items.length
    }
  } else {
    // Single-round mode
    const sortedItems = sortItemsByType(spec.items, spec.sortType)
    const submittedOrder = submitEvent.finalOrder.map(i => spec.items[i])

    for (let i = 0; i < submittedOrder.length; i++) {
      if (submittedOrder[i] === sortedItems[i]) {
        correctPositions++
      }
    }
    totalItems = spec.items.length
  }

  // Must get at least 80% correct
  if (correctPositions < totalItems * 0.8) {
    return {
      valid: false,
      reason: 'incorrect_order',
      correctPositions,
      total: totalItems,
    }
  }

  const accuracy = correctPositions / totalItems

  // Calculate time taken for speed component
  const times = events.map(e => e.clientTimestampMs || 0).filter(t => t > 0)
  const timeTakenMs = times.length >= 2 ? times[times.length - 1] - times[0] : spec.timeLimitMs

  const quality = (correctPositions / totalItems) * 7000
  const speed = Math.sqrt(spec.timeLimitMs / Math.max(timeTakenMs, 3000))
  const score = Math.round(quality * speed)

  return {
    valid: true,
    correctPositions,
    total: totalItems,
    score,
  }
}
