'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Route } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { ShareScore } from './ShareScore'
import { Spinner } from '@/components/Spinner'
import { CC } from '@/lib/currency'
import { GameThumbnail } from '@/components/GameThumbnail'
import { GameLoading } from '@/components/GameLoading'
import { useSound } from '@/hooks/useSound'

type GamePhase = 'idle' | 'loading' | 'play' | 'checking' | 'completed' | 'failed'

interface MazeData {
  walls: number[][]
  checkpoints: [number, number][]
}

interface TurnSpec {
  mazes: MazeData[]
  timeLimitMs: number
}

interface GameResult {
  valid: boolean
  score?: number
  efficiency?: number
  completionTimeMs?: number
  rank?: number
  reason?: string
}

interface MazePathGameProps {
  onGameComplete?: (result: GameResult) => void
  groupSessionId?: string
}

const CELL_SIZE = 40
const WALL_WIDTH = 3
const TOP = 1
const RIGHT = 2
const BOTTOM = 4
const LEFT = 8
const DIR_DR = [-1, 0, 1, 0]
const DIR_DC = [0, 1, 0, -1]
const DIR_WALL = [TOP, RIGHT, BOTTOM, LEFT]
const TOTAL_LEVELS = 3
const CHECKPOINT_LABELS = ['A', 'B', 'C', 'D']

export function MazePathGame({ onGameComplete, groupSessionId }: MazePathGameProps) {
  const { play } = useSound()
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [currentLevel, setCurrentLevel] = useState(1)
  const [currentCheckpointIdx, setCurrentCheckpointIdx] = useState(1) // index of target checkpoint
  const [completedSegments, setCompletedSegments] = useState<[number, number][][]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [path, setPath] = useState<[number, number][]>([]) // current segment
  const [isDragging, setIsDragging] = useState(false)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingEventRef = useRef<Promise<unknown> | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  // Refs for timeout handler (avoids stale closure)
  const completedSegmentsRef = useRef<[number, number][][]>([])
  const pathRef = useRef<[number, number][]>([])
  const currentLevelRef = useRef(1)

  const currentMaze = spec?.mazes[currentLevel - 1] ?? null
  const gridSize = currentMaze?.walls.length || 8
  const svgSize = gridSize * CELL_SIZE + WALL_WIDTH

  // Keep refs in sync
  useEffect(() => { completedSegmentsRef.current = completedSegments }, [completedSegments])
  useEffect(() => { pathRef.current = path }, [path])
  useEffect(() => { currentLevelRef.current = currentLevel }, [currentLevel])

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setResult(null)
    setPath([])
    setCurrentLevel(1)
    setCurrentCheckpointIdx(1)
    setCompletedSegments([])

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'maze_path', ...(groupSessionId && { groupSessionId }) }),
      })
      if (!createRes.ok) {
        const data = await createRes.json()
        throw new Error(data.error || 'Failed to create turn')
      }
      const turnData = await createRes.json()

      setTurnToken(turnData.turnToken)
      setSpec(turnData.spec)
      setTimeLeft(turnData.spec.timeLimitMs)
      setPath([turnData.spec.mazes[0].checkpoints[0]])

      const startRes = await fetch('/api/game/turn/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: turnData.turnToken }),
      })

      if (!startRes.ok) throw new Error('Failed to start turn')

      setPhase('play')

      const startTime = Date.now()
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime
        const remaining = turnData.spec.timeLimitMs - elapsed
        setTimeLeft(Math.max(0, remaining))

        if (remaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current)
          handleTimeout(turnData.turnToken)
        }
      }, 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('idle')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canMoveTo = useCallback((fromR: number, fromC: number, toR: number, toC: number): boolean => {
    if (!currentMaze) return false
    const gs = currentMaze.walls.length
    if (toR < 0 || toR >= gs || toC < 0 || toC >= gs) return false
    const dr = toR - fromR
    const dc = toC - fromC
    if (Math.abs(dr) + Math.abs(dc) !== 1) return false

    for (let d = 0; d < 4; d++) {
      if (DIR_DR[d] === dr && DIR_DC[d] === dc) {
        return !(currentMaze.walls[fromR][fromC] & DIR_WALL[d])
      }
    }
    return false
  }, [currentMaze])

  const getCellFromEvent = useCallback((e: React.MouseEvent | React.TouchEvent): [number, number] | null => {
    if (!svgRef.current) return null
    const svg = svgRef.current
    const rect = svg.getBoundingClientRect()

    let clientX: number, clientY: number
    const isTouch = 'touches' in e
    if (isTouch) {
      if (e.touches.length === 0) return null
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    const x = (clientX - rect.left) / rect.width * svgSize
    // On touch, offset upward by ~1 cell so the drawn line stays visible above the finger
    const touchOffset = isTouch ? CELL_SIZE * 0.9 : 0
    const y = (clientY - rect.top) / rect.height * svgSize - touchOffset

    const col = Math.floor((x - WALL_WIDTH / 2) / CELL_SIZE)
    const row = Math.floor((y - WALL_WIDTH / 2) / CELL_SIZE)

    if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) return null
    return [row, col]
  }, [svgSize, gridSize])

  const handleCellInteraction = useCallback((row: number, col: number) => {
    if (phase !== 'play' || !currentMaze || !turnToken || !spec) return

    const head = path[path.length - 1]
    if (!head) return

    // If tapping the head cell, undo one step
    if (row === head[0] && col === head[1]) {
      if (path.length > 1) {
        play('tap')
        setPath(prev => prev.slice(0, -1))
      }
      return
    }

    // If tapping an existing path cell, truncate back to it
    const existingIdx = path.findIndex(p => p[0] === row && p[1] === col)
    if (existingIdx !== -1) {
      play('tap')
      setPath(prev => prev.slice(0, existingIdx + 1))
      return
    }

    // Try to extend path to this cell
    if (!canMoveTo(head[0], head[1], row, col)) return

    play('tap')
    const newPath = [...path, [row, col] as [number, number]]
    setPath(newPath)

    // Check if reached current target checkpoint
    const targetCheckpoint = currentMaze.checkpoints[currentCheckpointIdx]
    if (row === targetCheckpoint[0] && col === targetCheckpoint[1]) {
      play('success')

      const updatedSegments = [...completedSegments, newPath]

      if (currentCheckpointIdx < currentMaze.checkpoints.length - 1) {
        // More checkpoints in this level — advance to next segment
        setCompletedSegments(updatedSegments)
        setCurrentCheckpointIdx(currentCheckpointIdx + 1)
        setPath([targetCheckpoint])
      } else {
        // All checkpoints in this level reached
        if (currentLevel < TOTAL_LEVELS) {
          // Send level_complete with all segment paths
          const eventPromise = fetch('/api/game/turn/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              turnToken,
              eventType: 'level_complete',
              level: currentLevel,
              paths: updatedSegments,
              clientTimestampMs: Date.now(),
            }),
          }).catch(() => {})
          pendingEventRef.current = eventPromise

          // Advance to next level
          const nextLevel = currentLevel + 1
          setCurrentLevel(nextLevel)
          setCurrentCheckpointIdx(1)
          setCompletedSegments([])
          setPath([spec.mazes[nextLevel - 1].checkpoints[0]])
        } else {
          // Final level complete — send path_complete, finish game
          if (timerRef.current) clearInterval(timerRef.current)

          const eventPromise = fetch('/api/game/turn/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              turnToken,
              eventType: 'path_complete',
              level: currentLevel,
              paths: updatedSegments,
              clientTimestampMs: Date.now(),
            }),
          }).catch(() => {})
          pendingEventRef.current = eventPromise

          setTimeout(() => {
            setPhase('checking')
            setTimeout(() => completeGame(turnToken), 200)
          }, 600)
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentMaze, turnToken, path, canMoveTo, play, currentLevel, currentCheckpointIdx, completedSegments, spec])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const cell = getCellFromEvent(e)
    if (!cell) return
    setIsDragging(true)
    handleCellInteraction(cell[0], cell[1])
  }, [getCellFromEvent, handleCellInteraction])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    const cell = getCellFromEvent(e)
    if (!cell) return

    const head = path[path.length - 1]
    if (!head || !currentMaze) return
    if (cell[0] === head[0] && cell[1] === head[1]) return

    const existingIdx = path.findIndex(p => p[0] === cell[0] && p[1] === cell[1])
    if (existingIdx !== -1) {
      setPath(prev => prev.slice(0, existingIdx + 1))
      return
    }

    handleCellInteraction(cell[0], cell[1])
  }, [isDragging, getCellFromEvent, path, currentMaze, handleCellInteraction])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const cell = getCellFromEvent(e)
    if (!cell) return
    setIsDragging(true)
    handleCellInteraction(cell[0], cell[1])
  }, [getCellFromEvent, handleCellInteraction])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return
    const cell = getCellFromEvent(e)
    if (!cell) return

    const head = path[path.length - 1]
    if (!head || !currentMaze) return
    if (cell[0] === head[0] && cell[1] === head[1]) return

    const existingIdx = path.findIndex(p => p[0] === cell[0] && p[1] === cell[1])
    if (existingIdx !== -1) {
      setPath(prev => prev.slice(0, existingIdx + 1))
      return
    }

    handleCellInteraction(cell[0], cell[1])
  }, [isDragging, getCellFromEvent, path, currentMaze, handleCellInteraction])

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  const completeGame = async (token: string) => {
    setPhase('checking')
    if (timerRef.current) clearInterval(timerRef.current)

    if (pendingEventRef.current) {
      await pendingEventRef.current
      pendingEventRef.current = null
    }

    try {
      const completeRes = await fetch('/api/game/turn/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: token }),
      })

      const data = await completeRes.json()
      setResult(data)
      setPhase(data.valid ? 'completed' : 'failed')

      if (onGameComplete) onGameComplete(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('failed')
    }
  }

  const handleTimeout = async (token: string) => {
    try {
      // Send whatever segments we have
      const segs = [...completedSegmentsRef.current]
      if (pathRef.current.length >= 2) segs.push(pathRef.current)

      await fetch('/api/game/turn/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnToken: token,
          eventType: 'path_complete',
          level: currentLevelRef.current,
          paths: segs,
          clientTimestampMs: Date.now(),
        }),
      }).catch(() => {})

      const completeRes = await fetch('/api/game/turn/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: token }),
      })
      await completeRes.json()
      setResult({ valid: false, reason: 'timeout' })
      setPhase('failed')
    } catch {
      setPhase('failed')
    }
  }

  // Send path_update events periodically during play
  useEffect(() => {
    if (phase !== 'play' || !turnToken || path.length < 2) return

    const timeout = setTimeout(() => {
      fetch('/api/game/turn/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnToken,
          eventType: 'path_update',
          level: currentLevel,
          path,
          clientTimestampMs: Date.now(),
        }),
      }).catch(() => {})
    }, 500)

    return () => clearTimeout(timeout)
  }, [phase, turnToken, path, currentLevel])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Build polyline points from a path
  const toPolyline = (pts: [number, number][]) =>
    pts.map(([r, c]) => {
      const x = WALL_WIDTH / 2 + c * CELL_SIZE + CELL_SIZE / 2
      const y = WALL_WIDTH / 2 + r * CELL_SIZE + CELL_SIZE / 2
      return `${x},${y}`
    }).join(' ')

  const pathPoints = toPolyline(path)

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        {phase === 'play' && (
          <>
            <div className={`text-2xl font-mono ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
              {formatTime(timeLeft)}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {Array.from({ length: TOTAL_LEVELS }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full ${
                      i + 1 < currentLevel
                        ? 'bg-green-500'
                        : i + 1 === currentLevel
                        ? 'bg-yellow-500'
                        : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  />
                ))}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Level {currentLevel}/{TOTAL_LEVELS}
              </div>
            </div>
          </>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center pb-6">
          <div className="mb-4 max-w-sm mx-auto"><GameThumbnail gameId="maze_path" isPlayable={true} /></div>
          <div className="max-w-sm mx-auto">
            <p className="text-slate-600 dark:text-slate-300 mb-6">
              Solve 3 mazes with increasing checkpoints! Tap or drag through A, B, C... Shorter paths score higher.
            </p>
            <button
              onClick={startGame}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg text-lg transition"
            >
              Start (1 <CC />Credit)
            </button>
          </div>
        </div>
      )}

      {phase === 'loading' && <GameLoading gameId="maze_path" message="Generating mazes..." />}

      {phase === 'play' && currentMaze && (
        <div className="flex flex-col items-center">
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-3">
            Trace: {currentMaze.checkpoints.map((_, i) => CHECKPOINT_LABELS[i]).join(' → ')}
          </p>

          <div className="touch-none select-none" style={{ maxWidth: '100%', width: svgSize }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${svgSize} ${svgSize}`}
              className="w-full h-auto block rounded-lg bg-slate-100 dark:bg-slate-900"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {/* Cell backgrounds */}
              {Array.from({ length: gridSize }).map((_, r) =>
                Array.from({ length: gridSize }).map((_, c) => {
                  const x = WALL_WIDTH / 2 + c * CELL_SIZE
                  const y = WALL_WIDTH / 2 + r * CELL_SIZE
                  const cpIdx = currentMaze.checkpoints.findIndex(cp => cp[0] === r && cp[1] === c)
                  const isOnPath = path.some(p => p[0] === r && p[1] === c)
                  const isOnCompletedSeg = completedSegments.some(seg => seg.some(p => p[0] === r && p[1] === c))

                  return (
                    <rect
                      key={`cell-${r}-${c}`}
                      x={x} y={y}
                      width={CELL_SIZE} height={CELL_SIZE}
                      className={
                        cpIdx !== -1 && cpIdx < currentCheckpointIdx ? 'fill-green-200 dark:fill-green-900/40' :
                        cpIdx === currentCheckpointIdx ? 'fill-red-200 dark:fill-red-900/40' :
                        isOnPath ? 'fill-yellow-100 dark:fill-yellow-900/20' :
                        isOnCompletedSeg ? 'fill-green-100 dark:fill-green-900/15' :
                        'fill-transparent'
                      }
                    />
                  )
                })
              )}

              {/* Completed segment traces (dimmer) */}
              {completedSegments.map((seg, si) => (
                <polyline
                  key={`seg-${si}`}
                  points={toPolyline(seg)}
                  fill="none"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="stroke-green-500/50"
                />
              ))}

              {/* Current path trace */}
              {path.length >= 2 && (
                <polyline
                  points={pathPoints}
                  fill="none"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="stroke-yellow-500"
                />
              )}

              {/* Path dots (current segment) */}
              {path.map(([r, c], i) => {
                const cx = WALL_WIDTH / 2 + c * CELL_SIZE + CELL_SIZE / 2
                const cy = WALL_WIDTH / 2 + r * CELL_SIZE + CELL_SIZE / 2
                const isHead = i === path.length - 1
                return (
                  <circle
                    key={`dot-${i}`}
                    cx={cx} cy={cy}
                    r={isHead ? 6 : 3}
                    className={isHead ? 'fill-yellow-500' : 'fill-yellow-400'}
                  />
                )
              })}

              {/* Walls */}
              {Array.from({ length: gridSize }).map((_, r) =>
                Array.from({ length: gridSize }).map((_, c) => {
                  const x = WALL_WIDTH / 2 + c * CELL_SIZE
                  const y = WALL_WIDTH / 2 + r * CELL_SIZE
                  const w = currentMaze.walls[r][c]
                  const segments: React.ReactElement[] = []

                  if (w & TOP) {
                    segments.push(
                      <line key={`w-${r}-${c}-t`}
                        x1={x} y1={y} x2={x + CELL_SIZE} y2={y}
                        strokeWidth={WALL_WIDTH} strokeLinecap="round"
                        className="stroke-slate-700 dark:stroke-slate-300"
                      />
                    )
                  }
                  if (w & RIGHT) {
                    segments.push(
                      <line key={`w-${r}-${c}-r`}
                        x1={x + CELL_SIZE} y1={y} x2={x + CELL_SIZE} y2={y + CELL_SIZE}
                        strokeWidth={WALL_WIDTH} strokeLinecap="round"
                        className="stroke-slate-700 dark:stroke-slate-300"
                      />
                    )
                  }
                  if (w & BOTTOM) {
                    segments.push(
                      <line key={`w-${r}-${c}-b`}
                        x1={x} y1={y + CELL_SIZE} x2={x + CELL_SIZE} y2={y + CELL_SIZE}
                        strokeWidth={WALL_WIDTH} strokeLinecap="round"
                        className="stroke-slate-700 dark:stroke-slate-300"
                      />
                    )
                  }
                  if (w & LEFT) {
                    segments.push(
                      <line key={`w-${r}-${c}-l`}
                        x1={x} y1={y} x2={x} y2={y + CELL_SIZE}
                        strokeWidth={WALL_WIDTH} strokeLinecap="round"
                        className="stroke-slate-700 dark:stroke-slate-300"
                      />
                    )
                  }

                  return <g key={`walls-${r}-${c}`}>{segments}</g>
                })
              )}

              {/* Checkpoint markers */}
              {currentMaze.checkpoints.map((cp, i) => {
                const cx = WALL_WIDTH / 2 + cp[1] * CELL_SIZE + CELL_SIZE / 2
                const cy = WALL_WIDTH / 2 + cp[0] * CELL_SIZE + CELL_SIZE / 2
                const isVisited = i < currentCheckpointIdx
                const isTarget = i === currentCheckpointIdx
                return (
                  <g key={`cp-${i}`}>
                    <circle cx={cx} cy={cy} r="12"
                      className={
                        isVisited ? 'fill-green-500' :
                        isTarget ? 'fill-red-500' :
                        'fill-slate-400 dark:fill-slate-500'
                      }
                    />
                    <text x={cx} y={cy + 5} textAnchor="middle" fontSize="14" fontWeight="bold" className="fill-white">
                      {CHECKPOINT_LABELS[i]}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>

          <p className="text-slate-400 dark:text-slate-500 text-xs mt-3">Tap a cell on your path to undo back to it</p>
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="mx-auto mb-4"><Spinner /></div>
          <p className="text-slate-600 dark:text-slate-300">Verifying paths...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-green-500/20 flex items-center justify-center">
            <Route className="w-10 h-10 text-green-500" />
          </div>
          <h3 className="text-2xl font-bold text-green-500 dark:text-green-400 mb-4">All Mazes Solved!</h3>
          <div className="bg-slate-100 dark:bg-slate-900/50 rounded-lg max-w-xs mx-auto mb-6">
            <div className="grid grid-cols-2 text-center divide-x divide-slate-200 dark:divide-slate-600/50">
              <div className="py-4 px-2">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{result.score?.toLocaleString()}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Score</div>
              </div>
              <div className="py-4 px-2">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">#{result.rank}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Rank</div>
              </div>
            </div>
            <div className="grid grid-cols-2 text-center divide-x divide-slate-200 dark:divide-slate-600/50 border-t border-slate-200 dark:border-slate-600/50">
              <div className="py-3 px-2">
                <div className="text-base font-bold text-slate-900 dark:text-white">{formatTime(result.completionTimeMs || 0)}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Time</div>
              </div>
              <div className="py-3 px-2">
                <div className="text-base font-bold text-slate-900 dark:text-white">{Math.round((result.efficiency || 0) * 100)}%</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Efficiency</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            <button onClick={startGame} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition">Play Again</button>
            <ShareScore gameName="Maze Path" score={result.score || 0} rank={result.rank} inline />
          </div>
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/20 flex items-center justify-center">
            <Route className="w-10 h-10 text-red-500" />
          </div>
          <h3 className="text-2xl font-bold text-red-500 dark:text-red-400 mb-4">
            {result?.reason === 'timeout' ? "Time's Up!" : 'Failed!'}
          </h3>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            {result?.reason === 'timeout'
              ? 'You ran out of time.'
              : result?.reason === 'no_path_submitted'
              ? 'No path was submitted.'
              : 'Better luck next time!'}
          </p>
          <div className="max-w-xs mx-auto">
            <button onClick={startGame} className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition">Try Again</button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-center">
          {error}
        </div>
      )}
    </div>
  )
}
