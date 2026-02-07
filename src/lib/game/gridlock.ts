import crypto from 'crypto'

export interface GridlockConfig {
  grid_size: number
  time_limit_seconds: number
  rounds: { blockers: number; targetMoves: number }[]
}

export interface Piece {
  id: string
  row: number
  col: number
  length: number
  orientation: 'h' | 'v'
  color: string
  isTarget: boolean
}

export interface GridlockRound {
  pieces: Piece[]
  optimalMoves: number
}

export interface GridlockTurnSpec {
  seed: string
  rounds: GridlockRound[]
  gridSize: number
  timeLimitMs: number
  exitRow: number
}

export interface GridlockEvent {
  eventType: string
  round?: number
  pieceId?: string
  direction?: string
  moves?: number
  serverTimestamp: Date
  clientTimestampMs?: number
}

export interface GridlockResult {
  valid: boolean
  reason?: string
  score?: number
  roundScores?: number[]
  flag?: boolean
}

export const DEFAULT_GRIDLOCK_CONFIG: GridlockConfig = {
  grid_size: 6,
  time_limit_seconds: 120,
  rounds: [
    { blockers: 4, targetMoves: 4 },
    { blockers: 7, targetMoves: 7 },
    { blockers: 10, targetMoves: 12 },
  ],
}

const PIECE_COLORS = [
  '#f97316', '#3b82f6', '#a855f7', '#ec4899',
  '#14b8a6', '#f59e0b', '#6366f1', '#06b6d4',
  '#e11d48', '#8b5cf6', '#d946ef', '#0ea5e9',
]

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

function createGrid(gridSize: number): boolean[][] {
  return Array.from({ length: gridSize }, () => Array(gridSize).fill(false))
}

function placePiece(grid: boolean[][], piece: Piece): boolean {
  // Check bounds and overlaps
  for (let i = 0; i < piece.length; i++) {
    const r = piece.orientation === 'h' ? piece.row : piece.row + i
    const c = piece.orientation === 'h' ? piece.col + i : piece.col
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return false
    if (grid[r][c]) return false
  }
  // Place
  for (let i = 0; i < piece.length; i++) {
    const r = piece.orientation === 'h' ? piece.row : piece.row + i
    const c = piece.orientation === 'h' ? piece.col + i : piece.col
    grid[r][c] = true
  }
  return true
}

function removePiece(grid: boolean[][], piece: Piece): void {
  for (let i = 0; i < piece.length; i++) {
    const r = piece.orientation === 'h' ? piece.row : piece.row + i
    const c = piece.orientation === 'h' ? piece.col + i : piece.col
    grid[r][c] = false
  }
}

function canMove(grid: boolean[][], piece: Piece, dr: number, dc: number): boolean {
  // Temporarily remove piece from grid to test movement
  removePiece(grid, piece)
  const testPiece = { ...piece, row: piece.row + dr, col: piece.col + dc }
  // Check bounds
  for (let i = 0; i < testPiece.length; i++) {
    const r = testPiece.orientation === 'h' ? testPiece.row : testPiece.row + i
    const c = testPiece.orientation === 'h' ? testPiece.col + i : testPiece.col
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) {
      placePiece(grid, piece)
      return false
    }
    if (grid[r][c]) {
      placePiece(grid, piece)
      return false
    }
  }
  placePiece(grid, piece)
  return true
}

function movePiece(grid: boolean[][], piece: Piece, dr: number, dc: number): Piece {
  removePiece(grid, piece)
  const moved = { ...piece, row: piece.row + dr, col: piece.col + dc }
  placePiece(grid, moved)
  return moved
}

// BFS solver: returns minimum moves to get target to exit, or -1 if unsolvable
function solvePuzzle(gridSize: number, pieces: Piece[], exitRow: number): number {
  // State = position of each piece encoded as string
  function stateKey(ps: Piece[]): string {
    return ps.map(p => `${p.id}:${p.row},${p.col}`).join('|')
  }

  const visited = new Set<string>()
  let queue: { pieces: Piece[]; moves: number }[] = [{ pieces: pieces.map(p => ({ ...p })), moves: 0 }]
  visited.add(stateKey(pieces))

  // Cap BFS depth to avoid runaway on complex puzzles
  const maxMoves = 30

  while (queue.length > 0) {
    const next: typeof queue = []
    for (const { pieces: curPieces, moves } of queue) {
      if (moves >= maxMoves) continue

      const grid = createGrid(gridSize)
      for (const p of curPieces) {
        for (let i = 0; i < p.length; i++) {
          const r = p.orientation === 'h' ? p.row : p.row + i
          const c = p.orientation === 'h' ? p.col + i : p.col
          grid[r][c] = true
        }
      }

      for (let pi = 0; pi < curPieces.length; pi++) {
        const piece = curPieces[pi]
        const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]]

        for (const [dr, dc] of dirs) {
          // Try sliding 1..N cells in this direction
          let step = 1
          while (true) {
            const nr = piece.row + dr * step
            const nc = piece.col + dc * step
            // Check bounds for every cell of the piece at new position
            let valid = true
            for (let i = 0; i < piece.length; i++) {
              const r = piece.orientation === 'h' ? nr : nr + i
              const c = piece.orientation === 'h' ? nc + i : nc
              if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) { valid = false; break }
              // Check collision (ignore own cells)
              if (grid[r][c]) {
                // Is this our own cell?
                let own = false
                for (let j = 0; j < piece.length; j++) {
                  const or2 = piece.orientation === 'h' ? piece.row : piece.row + j
                  const oc = piece.orientation === 'h' ? piece.col + j : piece.col
                  if (r === or2 && c === oc) { own = true; break }
                }
                if (!own) { valid = false; break }
              }
            }
            if (!valid) break

            const newPieces = curPieces.map((p, idx) =>
              idx === pi ? { ...p, row: nr, col: nc } : { ...p }
            )

            // Check if target reached exit
            const target = newPieces.find(p => p.isTarget)!
            if (target.col + target.length > gridSize - 1) {
              return moves + 1
            }

            const key = stateKey(newPieces)
            if (!visited.has(key)) {
              visited.add(key)
              next.push({ pieces: newPieces, moves: moves + 1 })
            }
            step++
          }
        }
      }
    }
    queue = next
  }
  return -1
}

function tryPlacePiece(grid: boolean[][], piece: Piece, gridSize: number): boolean {
  for (let i = 0; i < piece.length; i++) {
    const r = piece.orientation === 'h' ? piece.row : piece.row + i
    const c = piece.orientation === 'h' ? piece.col + i : piece.col
    if (r < 0 || r >= gridSize || c < 0 || c >= gridSize || grid[r][c]) return false
  }
  placePiece(grid, piece)
  return true
}

function generatePuzzle(
  gridSize: number,
  _numBlockers: number,
  exitRow: number,
  random: () => number,
  roundIndex: number = 0
): GridlockRound {
  // Minimum moves required per round:
  // Round 0 (easy): 3-4 moves — target blocked, blocker must be freed first
  // Round 1 (medium): 5-7 moves — deeper chain, more blockers
  // Round 2 (hard): 8+ moves — multiple interleaved chains
  const minMoves = roundIndex === 0 ? 3 : roundIndex === 1 ? 5 : 8
  const maxMoves = roundIndex === 0 ? 6 : roundIndex === 1 ? 10 : 20
  const numBlockers = roundIndex === 0 ? 4 : roundIndex === 1 ? 7 : 10

  // Retry up to N times to get a puzzle within desired difficulty
  for (let attempt = 0; attempt < 40; attempt++) {
    const grid = createGrid(gridSize)
    const pieces: Piece[] = []

    // Place target piece — further left for harder rounds
    const targetCol = roundIndex === 0
      ? 1 + Math.floor(random() * 2)  // col 1-2
      : Math.floor(random() * 2)       // col 0-1
    const target: Piece = {
      id: 'target',
      row: exitRow,
      col: targetCol,
      length: 2,
      orientation: 'h',
      color: '#22c55e',
      isTarget: true,
    }
    placePiece(grid, target)
    pieces.push(target)

    let colorIdx = 0

    // Phase 1: Place vertical blockers crossing the exit row (in target's path)
    // These MUST be cleared — they directly block the target
    const pathStart = targetCol + 2
    const pathCols = []
    for (let c = pathStart; c < gridSize; c++) pathCols.push(c)
    // Shuffle path columns
    for (let i = pathCols.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pathCols[i], pathCols[j]] = [pathCols[j], pathCols[i]]
    }

    const numPathBlockers = roundIndex === 0 ? 1 : roundIndex === 1 ? 2 : 3
    let pathBlockersPlaced = 0

    for (const col of pathCols) {
      if (pathBlockersPlaced >= numPathBlockers) break
      // Pick a start row so the blocker crosses exitRow
      const len = random() > 0.5 ? 3 : 2
      const possibleStarts: number[] = []
      for (let r = Math.max(0, exitRow - len + 1); r <= Math.min(gridSize - len, exitRow); r++) {
        possibleStarts.push(r)
      }
      // Shuffle
      for (let i = possibleStarts.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [possibleStarts[i], possibleStarts[j]] = [possibleStarts[j], possibleStarts[i]]
      }

      for (const startRow of possibleStarts) {
        const blocker: Piece = {
          id: `b${pieces.length}`,
          row: startRow,
          col,
          length: len,
          orientation: 'v',
          color: PIECE_COLORS[colorIdx % PIECE_COLORS.length],
          isTarget: false,
        }
        if (tryPlacePiece(grid, blocker, gridSize)) {
          pieces.push(blocker)
          colorIdx++
          pathBlockersPlaced++
          break
        }
      }
    }

    // Phase 2: For harder rounds, hem in the path blockers with horizontal pieces
    // so they can't just slide out immediately
    if (roundIndex >= 1) {
      for (let pi = 1; pi < pieces.length; pi++) {
        const vb = pieces[pi]
        if (vb.orientation !== 'v') continue
        // Try to block its movement by placing horizontal pieces adjacent
        for (const tryDir of [-1, 1]) { // above top or below bottom
          const adjRow = tryDir === -1 ? vb.row - 1 : vb.row + vb.length
          if (adjRow < 0 || adjRow >= gridSize) continue
          if (grid[adjRow][vb.col]) continue // already blocked naturally

          const hLen = random() > 0.5 ? 3 : 2
          // Place horizontal piece crossing vb.col at adjRow
          const possibleCols: number[] = []
          for (let c = Math.max(0, vb.col - hLen + 1); c <= Math.min(gridSize - hLen, vb.col); c++) {
            possibleCols.push(c)
          }
          for (let i = possibleCols.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [possibleCols[i], possibleCols[j]] = [possibleCols[j], possibleCols[i]]
          }

          for (const sc of possibleCols) {
            const hb: Piece = {
              id: `b${pieces.length}`,
              row: adjRow,
              col: sc,
              length: hLen,
              orientation: 'h',
              color: PIECE_COLORS[colorIdx % PIECE_COLORS.length],
              isTarget: false,
            }
            if (tryPlacePiece(grid, hb, gridSize)) {
              pieces.push(hb)
              colorIdx++
              break
            }
          }
        }
      }
    }

    // Phase 3: Fill remaining blocker slots with random pieces for visual complexity
    let fillAttempts = 0
    while (pieces.length - 1 < numBlockers && fillAttempts < 150) {
      fillAttempts++
      const orientation: 'h' | 'v' = random() > 0.5 ? 'h' : 'v'
      const length = random() > 0.6 ? 3 : 2
      const row = Math.floor(random() * gridSize)
      const col = Math.floor(random() * gridSize)

      const filler: Piece = {
        id: `b${pieces.length}`,
        row,
        col,
        length,
        orientation,
        color: PIECE_COLORS[colorIdx % PIECE_COLORS.length],
        isTarget: false,
      }
      if (tryPlacePiece(grid, filler, gridSize)) {
        pieces.push(filler)
        colorIdx++
      }
    }

    // Verify difficulty with BFS solver
    const optimal = solvePuzzle(gridSize, pieces, exitRow)

    if (optimal >= minMoves && optimal <= maxMoves) {
      return {
        pieces: pieces.map(p => ({ ...p })),
        optimalMoves: optimal,
      }
    }
    // If too easy or too hard or unsolvable, retry with different random placement
  }

  // Fallback: generate a simple but guaranteed-valid puzzle
  // This should rarely trigger
  const grid = createGrid(gridSize)
  const pieces: Piece[] = []

  const target: Piece = {
    id: 'target', row: exitRow, col: 0, length: 2, orientation: 'h',
    color: '#22c55e', isTarget: true,
  }
  placePiece(grid, target)
  pieces.push(target)

  // Place one vertical blocker in path with a horizontal piece hemming it in
  const vb: Piece = {
    id: 'b1', row: exitRow - 1, col: 3, length: 2, orientation: 'v',
    color: PIECE_COLORS[0], isTarget: false,
  }
  placePiece(grid, vb)
  pieces.push(vb)

  // Block the vertical blocker from moving up
  const hb: Piece = {
    id: 'b2', row: exitRow - 2, col: 2, length: 3, orientation: 'h',
    color: PIECE_COLORS[1], isTarget: false,
  }
  if (tryPlacePiece(grid, hb, gridSize)) {
    pieces.push(hb)
  }

  const optimal = solvePuzzle(gridSize, pieces, exitRow)
  return {
    pieces: pieces.map(p => ({ ...p })),
    optimalMoves: Math.max(optimal, 3),
  }
}

export function generateGridlockTurnSpec(
  userId: string,
  config: GridlockConfig
): GridlockTurnSpec {
  const seedInput = `${userId}_${crypto.randomUUID()}_${Date.now()}`
  const seed = crypto.createHash('sha256').update(seedInput).digest('hex')
  const random = seededRandom(seed)

  const exitRow = 2
  const rounds: GridlockRound[] = config.rounds.map((roundConfig, idx) => {
    return generatePuzzle(config.grid_size, roundConfig.blockers, exitRow, random, idx)
  })

  return {
    seed,
    rounds,
    gridSize: config.grid_size,
    timeLimitMs: config.time_limit_seconds * 1000,
    exitRow,
  }
}

export function getGridlockClientSpec(spec: GridlockTurnSpec): {
  rounds: { pieces: Piece[]; optimalMoves: number }[]
  gridSize: number
  timeLimitMs: number
  exitRow: number
} {
  return {
    rounds: spec.rounds,
    gridSize: spec.gridSize,
    timeLimitMs: spec.timeLimitMs,
    exitRow: spec.exitRow,
  }
}

export function validateGridlockTurn(
  spec: GridlockTurnSpec,
  events: GridlockEvent[]
): GridlockResult {
  const roundCompletes = events.filter(e => e.eventType === 'round_complete')
  const moves = events.filter(e => e.eventType === 'move')

  if (roundCompletes.length === 0) {
    return { valid: false, reason: 'no_rounds_completed' }
  }

  // Anti-cheat: check move timing
  const moveTimes = moves.map(e => e.clientTimestampMs || 0).filter(t => t > 0)
  if (moveTimes.length >= 5) {
    const intervals: number[] = []
    for (let i = 1; i < moveTimes.length; i++) {
      intervals.push(moveTimes[i] - moveTimes[i - 1])
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    if (avgInterval < 100) {
      return { valid: false, reason: 'suspicious_timing', flag: true }
    }
  }

  // Score per round
  const roundScores: number[] = []
  for (let i = 0; i < roundCompletes.length && i < spec.rounds.length; i++) {
    const rc = roundCompletes[i]
    const actualMoves = rc.moves || 1
    const optimalMoves = spec.rounds[i].optimalMoves
    const efficiency = Math.min(1, optimalMoves / actualMoves)
    roundScores.push(Math.round(3000 * efficiency))
  }

  // Time from first event to last round_complete
  const allTimes = events.map(e => e.clientTimestampMs || 0).filter(t => t > 0)
  const totalTimeMs = allTimes.length >= 2
    ? allTimes[allTimes.length - 1] - allTimes[0]
    : spec.timeLimitMs

  const totalRoundScore = roundScores.reduce((a, b) => a + b, 0)
  const speedMultiplier = Math.sqrt(spec.timeLimitMs / Math.max(totalTimeMs, 3000))
  const score = Math.round(totalRoundScore * speedMultiplier)

  return {
    valid: true,
    score,
    roundScores,
  }
}
