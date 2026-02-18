import crypto from 'crypto'

export interface MazePathConfig {
  levels: { grid_size: number; num_checkpoints: number }[]
  time_limit_seconds: number
}

export interface MazeLevel {
  walls: number[][] // 4-bit bitmask per cell: top=1, right=2, bottom=4, left=8
  checkpoints: [number, number][] // ordered waypoints: A, B, (C), (D)
  solutionPaths: [number, number][][] // BFS path per segment (server-only)
}

export interface MazePathTurnSpec {
  seed: string
  mazes: MazeLevel[]
  timeLimitMs: number
}

export interface MazePathEvent {
  eventType: string
  level?: number
  path?: [number, number][]
  paths?: [number, number][][]
  serverTimestamp: Date
  clientTimestampMs?: number
}

export interface MazePathResult {
  valid: boolean
  reason?: string
  completionTimeMs?: number
  score?: number
  efficiency?: number
  flag?: boolean
}

export const DEFAULT_MAZE_PATH_CONFIG: MazePathConfig = {
  levels: [
    { grid_size: 8, num_checkpoints: 2 }, // A→B
    { grid_size: 8, num_checkpoints: 3 }, // A→B→C
    { grid_size: 8, num_checkpoints: 4 }, // A→B→C→D
  ],
  time_limit_seconds: 90,
}

function seededRandom(seed: string): () => number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }

  return function () {
    hash = Math.sin(hash) * 10000
    return hash - Math.floor(hash)
  }
}

// Top=1, Right=2, Bottom=4, Left=8
const TOP = 1
const RIGHT = 2
const BOTTOM = 4
const LEFT = 8

const DIR_DR = [-1, 0, 1, 0] // top, right, bottom, left
const DIR_DC = [0, 1, 0, -1]
const DIR_WALL = [TOP, RIGHT, BOTTOM, LEFT]
const DIR_OPPOSITE = [BOTTOM, LEFT, TOP, RIGHT]

function generateMaze(gridSize: number, random: () => number): number[][] {
  const walls: number[][] = Array.from({ length: gridSize }, () =>
    Array(gridSize).fill(TOP | RIGHT | BOTTOM | LEFT)
  )

  const visited: boolean[][] = Array.from({ length: gridSize }, () =>
    Array(gridSize).fill(false)
  )

  const stack: [number, number][] = []
  const startR = Math.floor(random() * gridSize)
  const startC = Math.floor(random() * gridSize)
  visited[startR][startC] = true
  stack.push([startR, startC])

  while (stack.length > 0) {
    const [r, c] = stack[stack.length - 1]

    const neighbors: number[] = []
    for (let d = 0; d < 4; d++) {
      const nr = r + DIR_DR[d]
      const nc = c + DIR_DC[d]
      if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize && !visited[nr][nc]) {
        neighbors.push(d)
      }
    }

    if (neighbors.length === 0) {
      stack.pop()
      continue
    }

    const d = neighbors[Math.floor(random() * neighbors.length)]
    const nr = r + DIR_DR[d]
    const nc = c + DIR_DC[d]

    walls[r][c] &= ~DIR_WALL[d]
    walls[nr][nc] &= ~DIR_OPPOSITE[d]

    visited[nr][nc] = true
    stack.push([nr, nc])
  }

  return walls
}

function bfsShortestPath(
  walls: number[][],
  start: [number, number],
  end: [number, number],
  gridSize: number
): [number, number][] {
  const visited: boolean[][] = Array.from({ length: gridSize }, () =>
    Array(gridSize).fill(false)
  )
  const parent: ([number, number] | null)[][] = Array.from({ length: gridSize }, () =>
    Array(gridSize).fill(null)
  )

  const queue: [number, number][] = [start]
  visited[start[0]][start[1]] = true

  while (queue.length > 0) {
    const [r, c] = queue.shift()!

    if (r === end[0] && c === end[1]) {
      const path: [number, number][] = []
      let cur: [number, number] | null = end
      while (cur) {
        path.unshift(cur)
        cur = parent[cur[0]][cur[1]]
      }
      return path
    }

    for (let d = 0; d < 4; d++) {
      if (walls[r][c] & DIR_WALL[d]) continue

      const nr = r + DIR_DR[d]
      const nc = c + DIR_DC[d]
      if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue
      if (visited[nr][nc]) continue

      visited[nr][nc] = true
      parent[nr][nc] = [r, c]
      queue.push([nr, nc])
    }
  }

  return []
}

// Place N checkpoints spread across different quadrants
function placeCheckpoints(gridSize: number, count: number, random: () => number): [number, number][] {
  const half = Math.floor(gridSize / 2)
  // TL, TR, BL, BR quadrants
  const quadrants = [
    [0, half - 1, 0, half - 1],           // TL
    [0, half - 1, half, gridSize - 1],     // TR
    [half, gridSize - 1, 0, half - 1],     // BL
    [half, gridSize - 1, half, gridSize - 1], // BR
  ]

  // Zigzag order for interesting paths
  let order: number[]
  if (count === 2) order = [0, 3]           // TL → BR
  else if (count === 3) order = [0, 1, 3]   // TL → TR → BR
  else order = [0, 1, 2, 3]                 // TL → TR → BL → BR

  return order.slice(0, count).map(qi => {
    const [rMin, rMax, cMin, cMax] = quadrants[qi]
    const r = rMin + Math.floor(random() * (rMax - rMin + 1))
    const c = cMin + Math.floor(random() * (cMax - cMin + 1))
    return [r, c] as [number, number]
  })
}

function generateMazeLevel(gridSize: number, numCheckpoints: number, random: () => number): MazeLevel {
  const walls = generateMaze(gridSize, random)
  const checkpoints = placeCheckpoints(gridSize, numCheckpoints, random)

  // BFS shortest path for each consecutive checkpoint pair
  const solutionPaths: [number, number][][] = []
  for (let i = 0; i < checkpoints.length - 1; i++) {
    solutionPaths.push(bfsShortestPath(walls, checkpoints[i], checkpoints[i + 1], gridSize))
  }

  return { walls, checkpoints, solutionPaths }
}

export function generateMazePathTurnSpec(
  userId: string,
  config: MazePathConfig
): MazePathTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  const mazes = config.levels.map(level =>
    generateMazeLevel(level.grid_size, level.num_checkpoints, random)
  )

  return {
    seed,
    mazes,
    timeLimitMs: config.time_limit_seconds * 1000,
  }
}

export function getMazePathClientSpec(spec: MazePathTurnSpec): { mazes: { walls: number[][]; checkpoints: [number, number][] }[]; timeLimitMs: number } {
  return {
    mazes: spec.mazes.map(m => ({
      walls: m.walls,
      checkpoints: m.checkpoints,
    })),
    timeLimitMs: spec.timeLimitMs,
  }
}

function validatePathSegment(
  userPath: [number, number][],
  walls: number[][],
  start: [number, number],
  end: [number, number]
): { valid: boolean; reason?: string } {
  const gridSize = walls.length

  if (userPath[0][0] !== start[0] || userPath[0][1] !== start[1]) {
    return { valid: false, reason: 'invalid_start' }
  }

  const last = userPath[userPath.length - 1]
  if (last[0] !== end[0] || last[1] !== end[1]) {
    return { valid: false, reason: 'invalid_end' }
  }

  const visited = new Set<string>()

  for (let i = 0; i < userPath.length; i++) {
    const [r, c] = userPath[i]

    if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) {
      return { valid: false, reason: 'out_of_bounds' }
    }

    const key = `${r},${c}`
    if (visited.has(key)) {
      return { valid: false, reason: 'revisited_cell' }
    }
    visited.add(key)

    if (i > 0) {
      const [pr, pc] = userPath[i - 1]
      const dr = r - pr
      const dc = c - pc

      if (Math.abs(dr) + Math.abs(dc) !== 1) {
        return { valid: false, reason: 'non_adjacent_move' }
      }

      let dirIndex = -1
      for (let d = 0; d < 4; d++) {
        if (DIR_DR[d] === dr && DIR_DC[d] === dc) {
          dirIndex = d
          break
        }
      }
      if (dirIndex === -1 || (walls[pr][pc] & DIR_WALL[dirIndex])) {
        return { valid: false, reason: 'wall_crossing' }
      }
    }
  }

  return { valid: true }
}

export function validateMazePathTurn(
  spec: MazePathTurnSpec,
  events: MazePathEvent[]
): MazePathResult {
  const startEvent = events.find(e => e.eventType === 'start')
  if (!startEvent) {
    return { valid: false, reason: 'no_start_event' }
  }

  // Collect level_complete events (levels 1-2) + path_complete (level 3)
  // Each has `paths` — array of segment paths for that level
  const levelEvents = events
    .filter(e => e.eventType === 'level_complete')
    .sort((a, b) => new Date(a.serverTimestamp).getTime() - new Date(b.serverTimestamp).getTime())

  const pathCompleteEvent = events.find(e => e.eventType === 'path_complete')

  const allLevelSegments: [number, number][][][] = levelEvents.map(e => e.paths || [])
  if (pathCompleteEvent?.paths && pathCompleteEvent.paths.length > 0) {
    allLevelSegments.push(pathCompleteEvent.paths)
  }

  if (allLevelSegments.length === 0) {
    return { valid: false, reason: 'no_path_submitted' }
  }

  // Calculate completion time
  const lastEvent = pathCompleteEvent || levelEvents[levelEvents.length - 1]
  const startTime = new Date(startEvent.serverTimestamp).getTime()
  const endTime = new Date(lastEvent.serverTimestamp).getTime()
  const completionTimeMs = endTime - startTime

  if (completionTimeMs > spec.timeLimitMs + 5000) {
    return { valid: false, reason: 'timeout' }
  }

  // Anti-cheat: flag impossibly fast solves (3 mazes in < 4s)
  if (completionTimeMs < 4000) {
    return { valid: false, reason: 'impossible_speed', flag: true }
  }

  // Validate each level's segments and compute scores
  let totalLevelScore = 0
  let totalEfficiency = 0
  let validLevels = 0

  for (let li = 0; li < Math.min(allLevelSegments.length, spec.mazes.length); li++) {
    const maze = spec.mazes[li]
    const segments = allLevelSegments[li]

    if (!segments || segments.length === 0) continue

    let levelEfficiency = 0
    let validSegments = 0

    for (let si = 0; si < Math.min(segments.length, maze.solutionPaths.length); si++) {
      const userPath = segments[si]
      if (!userPath || userPath.length < 2) continue

      const result = validatePathSegment(
        userPath,
        maze.walls,
        maze.checkpoints[si],
        maze.checkpoints[si + 1]
      )
      if (!result.valid) {
        return { valid: false, reason: `level_${li + 1}_seg_${si + 1}_${result.reason}` }
      }

      const optimalLen = maze.solutionPaths[si].length
      const userLen = userPath.length
      const segEfficiency = Math.min(1, optimalLen / userLen)
      levelEfficiency += segEfficiency
      validSegments++
    }

    if (validSegments > 0) {
      const avgLevelEfficiency = levelEfficiency / validSegments
      totalLevelScore += avgLevelEfficiency * 2500
      totalEfficiency += avgLevelEfficiency
      validLevels++
    }
  }

  if (validLevels === 0) {
    return { valid: false, reason: 'no_valid_levels' }
  }

  const avgEfficiency = totalEfficiency / validLevels
  const speed = Math.sqrt(spec.timeLimitMs / Math.max(completionTimeMs, 3000))
  const score = Math.round(totalLevelScore * speed)

  return {
    valid: true,
    completionTimeMs: Math.round(completionTimeMs),
    score,
    efficiency: Math.round(avgEfficiency * 100) / 100,
  }
}
