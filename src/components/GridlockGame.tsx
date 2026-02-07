'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { ParkingSquare } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import { useTheme } from '@/hooks/useTheme'
import { ShareScore } from './ShareScore'
import { CC } from '@/lib/currency'

type GamePhase = 'idle' | 'loading' | 'play' | 'round_complete' | 'checking' | 'completed' | 'failed'

interface Piece {
  id: string
  row: number
  col: number
  length: number
  orientation: 'h' | 'v'
  color: string
  isTarget: boolean
}

interface RoundSpec {
  pieces: Piece[]
  optimalMoves: number
}

interface TurnSpec {
  rounds: RoundSpec[]
  gridSize: number
  timeLimitMs: number
  exitRow: number
}

interface GameResult {
  valid: boolean
  score?: number
  rank?: number
  roundScores?: number[]
  reason?: string
}

interface GridlockGameProps {
  onGameComplete?: (result: GameResult) => void
}

export function GridlockGame({ onGameComplete }: GridlockGameProps) {
  const { theme } = useTheme()
  const light = theme === 'light'
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [pieces, setPieces] = useState<Piece[]>([])
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null)
  const [currentRound, setCurrentRound] = useState(0)
  const [moveCount, setMoveCount] = useState(0)
  const [roundMoves, setRoundMoves] = useState<number[]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const completeCalledRef = useRef(false)
  const dragRef = useRef<{ pieceId: string; startX: number; startY: number; cellsMoved: number; lastCellX: number; lastCellY: number; axis: 'x' | 'y' | null } | null>(null)
  const gameContainerRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const piecesRef = useRef<Piece[]>(pieces)
  piecesRef.current = pieces

  const completeGame = useCallback(async (token?: string) => {
    const finalToken = token || turnToken
    if (!finalToken || completeCalledRef.current) return
    completeCalledRef.current = true

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    setPhase('checking')

    try {
      const completeRes = await fetch('/api/game/turn/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: finalToken }),
      })

      const data = await completeRes.json()
      setResult(data)
      setPhase(data.valid ? 'completed' : 'failed')

      if (onGameComplete) {
        onGameComplete(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('failed')
    }
  }, [turnToken, onGameComplete])

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setResult(null)
    setCurrentRound(0)
    setMoveCount(0)
    setRoundMoves([])
    setSelectedPiece(null)
    completeCalledRef.current = false

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'gridlock' }),
      })
      if (!createRes.ok) {
        const data = await createRes.json()
        throw new Error(data.error || 'Failed to create turn')
      }
      const turnData = await createRes.json()

      setTurnToken(turnData.turnToken)
      setSpec(turnData.spec)
      setPieces(turnData.spec.rounds[0].pieces.map((p: Piece) => ({ ...p })))
      setTimeLeft(turnData.spec.timeLimitMs)

      const startRes = await fetch('/api/game/turn/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnToken: turnData.turnToken }),
      })

      if (!startRes.ok) {
        throw new Error('Failed to start turn')
      }

      setPhase('play')

      const startTime = Date.now()
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime
        const remaining = turnData.spec.timeLimitMs - elapsed
        setTimeLeft(Math.max(0, remaining))

        if (remaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current)
          completeGame(turnData.turnToken)
        }
      }, 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('idle')
    }
  }, [completeGame])

  // Check if a piece can move in a direction
  const canMovePiece = useCallback((piece: Piece, dr: number, dc: number): boolean => {
    if (!spec) return false
    const gs = spec.gridSize

    // Build grid
    const grid: boolean[][] = Array.from({ length: gs }, () => Array(gs).fill(false))
    for (const p of pieces) {
      if (p.id === piece.id) continue
      for (let i = 0; i < p.length; i++) {
        const r = p.orientation === 'h' ? p.row : p.row + i
        const c = p.orientation === 'h' ? p.col + i : p.col
        if (r >= 0 && r < gs && c >= 0 && c < gs) grid[r][c] = true
      }
    }

    // Check new position
    for (let i = 0; i < piece.length; i++) {
      const r = (piece.orientation === 'h' ? piece.row : piece.row + i) + dr
      const c = (piece.orientation === 'h' ? piece.col + i : piece.col) + dc
      if (r < 0 || r >= gs || c < 0 || c >= gs) return false
      if (grid[r][c]) return false
    }
    return true
  }, [spec, pieces])

  const movePiece = useCallback(async (pieceId: string, dr: number, dc: number) => {
    if (!turnToken || !spec || phase !== 'play') return

    const piece = pieces.find(p => p.id === pieceId)
    if (!piece) return

    if (!canMovePiece(piece, dr, dc)) return

    const newPieces = pieces.map(p =>
      p.id === pieceId ? { ...p, row: p.row + dr, col: p.col + dc } : p
    )
    setPieces(newPieces)
    const newMoveCount = moveCount + 1
    setMoveCount(newMoveCount)

    const direction = dr < 0 ? 'up' : dr > 0 ? 'down' : dc < 0 ? 'left' : 'right'

    // Send move event
    fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken,
        eventType: 'move',
        round: currentRound,
        pieceId,
        direction,
        clientTimestampMs: Date.now(),
      }),
    })

    // Check if target reached exit
    const target = newPieces.find(p => p.isTarget)
    if (target && target.row === spec.exitRow && target.col >= spec.gridSize - 2) {
      // Round complete!
      const newRoundMoves = [...roundMoves, newMoveCount]
      setRoundMoves(newRoundMoves)

      fetch('/api/game/turn/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnToken,
          eventType: 'round_complete',
          round: currentRound,
          moves: newMoveCount,
          clientTimestampMs: Date.now(),
        }),
      })

      if (currentRound + 1 < spec.rounds.length) {
        // Show round complete briefly then load next round
        setPhase('round_complete')
        setTimeout(() => {
          const nextRound = currentRound + 1
          setCurrentRound(nextRound)
          setPieces(spec.rounds[nextRound].pieces.map((p: Piece) => ({ ...p })))
          setMoveCount(0)
          setSelectedPiece(null)
          setPhase('play')
        }, 1200)
      } else {
        // All rounds complete
        completeGame()
      }
    }
  }, [turnToken, spec, phase, pieces, moveCount, currentRound, roundMoves, canMovePiece, completeGame])

  const handlePieceClick = useCallback((pieceId: string) => {
    if (phase !== 'play') return
    setSelectedPiece(prev => prev === pieceId ? null : pieceId)
  }, [phase])

  const handleGridClick = useCallback(() => {
    if (phase !== 'play') return
    setSelectedPiece(null)
  }, [phase])

  // Get arrow overlay positions for the selected piece
  const getArrowOverlays = useCallback(() => {
    if (!selectedPiece || !spec || phase !== 'play') return []
    const piece = pieces.find(p => p.id === selectedPiece)
    if (!piece) return []

    const overlays: { row: number; col: number; arrow: string; dr: number; dc: number }[] = []

    // Left
    if (canMovePiece(piece, 0, -1)) {
      overlays.push({ row: piece.row, col: piece.col - 1, arrow: '←', dr: 0, dc: -1 })
    }
    // Right
    if (canMovePiece(piece, 0, 1)) {
      const rightCol = piece.orientation === 'h' ? piece.col + piece.length : piece.col + 1
      overlays.push({ row: piece.row, col: rightCol, arrow: '→', dr: 0, dc: 1 })
    }
    // Up
    if (canMovePiece(piece, -1, 0)) {
      overlays.push({ row: piece.row - 1, col: piece.col, arrow: '↑', dr: -1, dc: 0 })
    }
    // Down
    if (canMovePiece(piece, 1, 0)) {
      const bottomRow = piece.orientation === 'v' ? piece.row + piece.length : piece.row + 1
      overlays.push({ row: bottomRow, col: piece.col, arrow: '↓', dr: 1, dc: 0 })
    }

    return overlays
  }, [selectedPiece, spec, phase, pieces, canMovePiece])

  // Compute cellSize dynamically (same formula used in render)
  const getCellSize = useCallback(() => {
    const gs = spec?.gridSize ?? 6
    return Math.floor(Math.min(320, (typeof window !== 'undefined' ? window.innerWidth - 64 : 320)) / gs)
  }, [spec])

  const handleTouchStart = useCallback((e: React.TouchEvent, pieceId: string) => {
    if (phase !== 'play') return
    const touch = e.touches[0]
    dragRef.current = { pieceId, startX: touch.clientX, startY: touch.clientY, cellsMoved: 0, lastCellX: 0, lastCellY: 0, axis: null }
    setSelectedPiece(pieceId)
  }, [phase])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current || phase !== 'play') return
    e.preventDefault()
    e.stopPropagation()

    const touch = e.touches[0]
    const { pieceId, startX, startY, lastCellX, lastCellY } = dragRef.current
    const currentPieces = piecesRef.current
    const piece = currentPieces.find(p => p.id === pieceId)
    if (!piece) return

    const cs = getCellSize()
    const dx = touch.clientX - startX
    const dy = touch.clientY - startY

    // Lock to dominant axis once threshold is crossed
    if (!dragRef.current.axis) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        dragRef.current.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
      } else {
        return
      }
    }

    if (dragRef.current.axis === 'x') {
      const targetCell = Math.round(dx / cs)
      if (targetCell !== lastCellX) {
        const dir = targetCell > lastCellX ? 1 : -1
        let current = lastCellX
        while (current !== targetCell) {
          movePiece(pieceId, 0, dir)
          current += dir
        }
        dragRef.current = { ...dragRef.current, cellsMoved: dragRef.current.cellsMoved + Math.abs(current - lastCellX), lastCellX: current }
      }
    } else {
      const targetCell = Math.round(dy / cs)
      if (targetCell !== lastCellY) {
        const dir = targetCell > lastCellY ? 1 : -1
        let current = lastCellY
        while (current !== targetCell) {
          movePiece(pieceId, dir, 0)
          current += dir
        }
        dragRef.current = { ...dragRef.current, cellsMoved: dragRef.current.cellsMoved + Math.abs(current - lastCellY), lastCellY: current }
      }
    }
  }, [phase, getCellSize, movePiece])

  const handleTouchEnd = useCallback(() => {
    if (!dragRef.current) return
    // If no cells were moved, keep selection (tap behavior). Otherwise clear it.
    if (dragRef.current.cellsMoved === 0) {
      // Tap — toggle selection (already set in touchStart)
    } else {
      setSelectedPiece(null)
    }
    dragRef.current = null
  }, [])

  // Mouse drag handlers (desktop)
  const handleMouseDown = useCallback((e: React.MouseEvent, pieceId: string) => {
    if (phase !== 'play') return
    e.preventDefault()
    dragRef.current = { pieceId, startX: e.clientX, startY: e.clientY, cellsMoved: 0, lastCellX: 0, lastCellY: 0, axis: null }
    setSelectedPiece(pieceId)
  }, [phase])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current || phase !== 'play') return

    const { pieceId, startX, startY, lastCellX, lastCellY } = dragRef.current
    const currentPieces = piecesRef.current
    const piece = currentPieces.find(p => p.id === pieceId)
    if (!piece) return

    const cs = getCellSize()
    const dx = e.clientX - startX
    const dy = e.clientY - startY

    // Lock to dominant axis once threshold is crossed
    if (!dragRef.current.axis) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        dragRef.current.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
      } else {
        return
      }
    }

    if (dragRef.current.axis === 'x') {
      const targetCell = Math.round(dx / cs)
      if (targetCell !== lastCellX) {
        const dir = targetCell > lastCellX ? 1 : -1
        let current = lastCellX
        while (current !== targetCell) {
          movePiece(pieceId, 0, dir)
          current += dir
        }
        dragRef.current = { ...dragRef.current, cellsMoved: dragRef.current.cellsMoved + Math.abs(current - lastCellX), lastCellX: current }
      }
    } else {
      const targetCell = Math.round(dy / cs)
      if (targetCell !== lastCellY) {
        const dir = targetCell > lastCellY ? 1 : -1
        let current = lastCellY
        while (current !== targetCell) {
          movePiece(pieceId, dir, 0)
          current += dir
        }
        dragRef.current = { ...dragRef.current, cellsMoved: dragRef.current.cellsMoved + Math.abs(current - lastCellY), lastCellY: current }
      }
    }
  }, [phase, getCellSize, movePiece])

  const handleMouseUp = useCallback(() => {
    if (!dragRef.current) return
    if (dragRef.current.cellsMoved === 0) {
      // Click — toggle selection (already set in mouseDown)
    } else {
      setSelectedPiece(null)
    }
    dragRef.current = null
  }, [])

  // Attach mousemove/mouseup to window so drag continues outside the piece
  useEffect(() => {
    if (phase !== 'play') return

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [phase, handleMouseMove, handleMouseUp])

  // Prevent page scroll on the grid area during gameplay
  useEffect(() => {
    const el = gridRef.current
    if (!el || (phase !== 'play' && phase !== 'round_complete')) return

    const preventScroll = (e: TouchEvent) => { e.preventDefault() }
    el.addEventListener('touchmove', preventScroll, { passive: false })
    return () => { el.removeEventListener('touchmove', preventScroll) }
  }, [phase])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const gridSize = spec?.gridSize ?? 6
  const cellSize = Math.floor(Math.min(320, (typeof window !== 'undefined' ? window.innerWidth - 64 : 320)) / gridSize)

  return (
    <div ref={gameContainerRef} className={`rounded-xl p-4 sm:p-6 ${light ? 'bg-white shadow-md' : 'bg-slate-800'}`}>
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className={`text-xl font-bold ${light ? 'text-slate-900' : 'text-white'}`}>Gridlock</h2>
            {(phase === 'play' || phase === 'round_complete') && spec && (
              <div className="flex gap-1.5">
                {spec.rounds.map((_, i) => (
                  <div
                    key={i}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i < currentRound
                        ? 'bg-green-500 text-white'
                        : i === currentRound
                        ? 'bg-yellow-500 text-slate-900'
                        : light
                        ? 'bg-slate-200 text-slate-500'
                        : 'bg-slate-600 text-slate-400'
                    }`}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            )}
          </div>
          {(phase === 'play' || phase === 'round_complete') && (
            <span className={`text-2xl font-mono ${timeLeft < 15000 ? 'text-red-500' : 'text-green-500'}`}>
              {formatTime(timeLeft)}
            </span>
          )}
        </div>
        {(phase === 'play' || phase === 'round_complete') && (
          <div className={`text-sm mt-1 ${light ? 'text-slate-500' : 'text-slate-400'}`}>{moveCount} moves</div>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center py-12">
          <p className={`mb-6 ${light ? 'text-slate-600' : 'text-slate-300'}`}>
            Slide blocks to free the red piece! 3 rounds of increasing difficulty.
          </p>
          <button
            onClick={startGame}
            className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg text-lg transition"
          >
            Start Game (1 <CC />Credit)
          </button>
        </div>
      )}

      {phase === 'loading' && (
        <div className="text-center py-12">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className={light ? 'text-slate-600' : 'text-slate-300'}>Building puzzles...</p>
        </div>
      )}

      {(phase === 'play' || phase === 'round_complete') && spec && (
        <div>
          {phase === 'round_complete' && (
            <div className="text-center py-4 mb-4">
              <p className="text-green-500 font-bold text-lg animate-pulse">
                Round {currentRound + 1} Complete!
              </p>
            </div>
          )}

          {/* Grid */}
          <div className="flex justify-center">
            <div
              ref={gridRef}
              className={`relative rounded-lg border-2 ${light ? 'bg-slate-100 border-slate-300' : 'bg-slate-900 border-slate-600'}`}
              style={{ width: cellSize * gridSize + 4, height: cellSize * gridSize + 4, touchAction: 'none' }}
            >
              {/* Grid cells — tap empty cell to deselect */}
              {Array.from({ length: gridSize }).map((_, r) =>
                Array.from({ length: gridSize }).map((_, c) => (
                  <div
                    key={`${r}-${c}`}
                    onClick={handleGridClick}
                    className={`absolute border ${light ? 'border-slate-200/60' : 'border-slate-800/50'}`}
                    style={{
                      top: r * cellSize + 2,
                      left: c * cellSize + 2,
                      width: cellSize,
                      height: cellSize,
                    }}
                  />
                ))
              )}

              {/* Exit gate — thick green opening on right border */}
              <div
                className="absolute pointer-events-none z-30"
                style={{
                  top: spec.exitRow * cellSize - 2,
                  right: -10,
                  width: 14,
                  height: cellSize + 8,
                }}
              >
                <div className="w-full h-full rounded-r-md bg-green-500 flex items-center justify-center shadow-[0_0_12px_rgba(34,197,94,0.6)]">
                  <span className="text-white text-lg font-bold">&#x203A;</span>
                </div>
              </div>

              {/* Arrow overlays on adjacent cells */}
              {getArrowOverlays().map(overlay => (
                <div
                  key={`arrow-${overlay.row}-${overlay.col}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (selectedPiece) movePiece(selectedPiece, overlay.dr, overlay.dc)
                  }}
                  className="absolute flex items-center justify-center cursor-pointer z-20 animate-pulse"
                  style={{
                    top: overlay.row * cellSize + 2,
                    left: overlay.col * cellSize + 2,
                    width: cellSize,
                    height: cellSize,
                  }}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${light ? 'bg-slate-900/15' : 'bg-white/20'}`}>
                    <span className={`text-lg font-bold ${light ? 'text-slate-800' : 'text-white'}`}>{overlay.arrow}</span>
                  </div>
                </div>
              ))}

              {/* Pieces */}
              {pieces.map(piece => {
                const w = piece.orientation === 'h' ? piece.length * cellSize : cellSize
                const h = piece.orientation === 'h' ? cellSize : piece.length * cellSize
                const isSelected = selectedPiece === piece.id

                return (
                  <div
                    key={piece.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      handlePieceClick(piece.id)
                    }}
                    onMouseDown={(e) => handleMouseDown(e, piece.id)}
                    onTouchStart={(e) => handleTouchStart(e, piece.id)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    className={`absolute rounded-md cursor-pointer transition-all duration-150 flex items-center justify-center ${
                      isSelected
                        ? light
                          ? 'ring-2 ring-slate-900 shadow-[0_0_12px_rgba(0,0,0,0.25)] z-10'
                          : 'ring-2 ring-white shadow-[0_0_12px_rgba(255,255,255,0.4)] z-10'
                        : ''
                    }`}
                    style={{
                      top: piece.row * cellSize + 4,
                      left: piece.col * cellSize + 4,
                      width: w - 4,
                      height: h - 4,
                      backgroundColor: piece.color,
                      opacity: phase === 'round_complete' ? 0.5 : 1,
                    }}
                  >
                    {piece.isTarget && (
                      <span className="text-white text-sm font-bold text-center">Free Me</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="animate-spin w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className={light ? 'text-slate-600' : 'text-slate-300'}>Calculating score...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-500/20 flex items-center justify-center">
            <ParkingSquare className="w-10 h-10 text-blue-400" />
          </div>
          <h3 className="text-2xl font-bold text-green-500 mb-4">Puzzle Solved!</h3>
          <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto mb-6">
            <div className={`rounded-lg p-4 ${light ? 'bg-slate-100' : 'bg-slate-700'}`}>
              <div className={`text-3xl font-bold ${light ? 'text-slate-900' : 'text-white'}`}>{result.score?.toLocaleString()}</div>
              <div className={`text-sm ${light ? 'text-slate-500' : 'text-slate-400'}`}>Score</div>
            </div>
            <div className={`rounded-lg p-4 ${light ? 'bg-slate-100' : 'bg-slate-700'}`}>
              <div className={`text-3xl font-bold ${light ? 'text-slate-900' : 'text-white'}`}>#{result.rank}</div>
              <div className={`text-sm ${light ? 'text-slate-500' : 'text-slate-400'}`}>Rank</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
            <button
              onClick={startGame}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg transition"
            >
              Play Again
            </button>
            <Link href="/" className={`font-bold py-3 px-8 rounded-lg transition ${light ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-600 hover:bg-slate-500 text-white'}`}>
              New Game
            </Link>
          </div>
          <ShareScore gameName="Gridlock" score={result.score || 0} rank={result.rank} />
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-500/20 flex items-center justify-center">
            <ParkingSquare className="w-10 h-10 text-blue-400" />
          </div>
          <h3 className="text-2xl font-bold text-red-500 mb-4">
            {result?.reason === 'no_rounds_completed' ? "Time's Up!" : 'Game Over'}
          </h3>
          <p className={`mb-6 ${light ? 'text-slate-600' : 'text-slate-300'}`}>
            {result?.reason === 'no_rounds_completed'
              ? 'Could not complete any rounds in time.'
              : 'Better luck next time!'}
          </p>
          <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
            <button
              onClick={startGame}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg transition"
            >
              Try Again
            </button>
            <Link href="/" className={`font-bold py-3 px-8 rounded-lg transition ${light ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-600 hover:bg-slate-500 text-white'}`}>
              New Game
            </Link>
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
