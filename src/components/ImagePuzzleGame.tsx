'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Puzzle } from 'lucide-react'
import { formatTime } from '@/lib/utils'
import Image from 'next/image'
import { ShareScore } from './ShareScore'
import { Spinner } from '@/components/Spinner'
import { CC } from '@/lib/currency'
import { GameThumbnail } from '@/components/GameThumbnail'
import { useSound } from '@/hooks/useSound'

type GamePhase = 'idle' | 'loading' | 'play' | 'checking' | 'completed' | 'failed'

interface TurnSpec {
  imageUrl: string
  gridSize: number
  preplacedIndices: number[]
  bankPieces: number[]
  timeLimitMs: number
}

interface GameResult {
  valid: boolean
  score?: number
  mistakes?: number
  completionTimeMs?: number
  rank?: number
  reason?: string
}

interface ImagePuzzleGameProps {
  onGameComplete?: (result: GameResult) => void
}

export function ImagePuzzleGame({ onGameComplete }: ImagePuzzleGameProps) {
  const { play } = useSound()
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [turnToken, setTurnToken] = useState<string | null>(null)
  const [spec, setSpec] = useState<TurnSpec | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<GameResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Grid state: which cells are filled (preplaced + correctly placed)
  const [filledCells, setFilledCells] = useState<Set<number>>(new Set())
  // Bank state: which pieces are still available
  const [availablePieces, setAvailablePieces] = useState<number[]>([])
  // Currently selected piece from bank
  const [selectedPiece, setSelectedPiece] = useState<number | null>(null)
  // Feedback flash
  const [flashCell, setFlashCell] = useState<{ cell: number; correct: boolean } | null>(null)
  const [mistakes, setMistakes] = useState(0)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingEventRef = useRef<Promise<unknown> | null>(null)

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    setResult(null)
    setSelectedPiece(null)
    setFlashCell(null)
    setMistakes(0)

    try {
      const createRes = await fetch('/api/game/turn/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'image_puzzle' }),
      })
      if (!createRes.ok) {
        const data = await createRes.json()
        throw new Error(data.error || 'Failed to create turn')
      }
      const turnData = await createRes.json()

      setTurnToken(turnData.turnToken)
      setSpec(turnData.spec)
      setTimeLeft(turnData.spec.timeLimitMs)
      setFilledCells(new Set(turnData.spec.preplacedIndices))
      setAvailablePieces([...turnData.spec.bankPieces])

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
          handleTimeout(turnData.turnToken)
        }
      }, 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('idle')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSelectPiece = (piece: number) => {
    if (phase !== 'play') return
    play('tap')
    setSelectedPiece(piece === selectedPiece ? null : piece)
  }

  const handleCellClick = useCallback((cellIndex: number) => {
    if (phase !== 'play' || !spec || !turnToken || selectedPiece === null) return
    if (filledCells.has(cellIndex)) return // Already filled

    // Check if this placement is correct
    const isCorrect = cellIndex === selectedPiece

    // Send event — keep reference so completeGame can await it
    const eventPromise = fetch('/api/game/turn/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        turnToken,
        eventType: 'place_piece',
        pieceIndex: selectedPiece,
        targetCell: cellIndex,
        correct: isCorrect,
        clientTimestampMs: Date.now(),
      }),
    }).catch(() => {})
    pendingEventRef.current = eventPromise

    if (isCorrect) {
      play('hit')
      // Place the piece
      setFilledCells(prev => new Set([...prev, cellIndex]))
      setAvailablePieces(prev => prev.filter(p => p !== selectedPiece))
      setFlashCell({ cell: cellIndex, correct: true })

      // Check if all pieces placed
      const newFilledCount = filledCells.size + 1
      const totalCells = spec.gridSize * spec.gridSize
      if (newFilledCount >= totalCells) {
        play('success')
        if (timerRef.current) clearInterval(timerRef.current)
        setTimeout(() => {
          setPhase('checking')
          setTimeout(() => completeGame(turnToken), 200)
        }, 1000)
      }
    } else {
      play('miss')
      setMistakes(prev => prev + 1)
      setFlashCell({ cell: cellIndex, correct: false })
    }

    setSelectedPiece(null)
    setTimeout(() => setFlashCell(null), 400)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, spec, turnToken, selectedPiece, filledCells, play])

  const completeGame = async (token: string) => {
    setPhase('checking')
    if (timerRef.current) clearInterval(timerRef.current)

    // Wait for the last event fetch to finish before completing
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

      if (onGameComplete) {
        onGameComplete(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('failed')
    }
  }

  const handleTimeout = async (token: string) => {
    try {
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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const gridSize = spec?.gridSize || 3
  const tileSize = 100

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        {phase === 'play' && (
          <>
            <div className={`text-2xl font-mono ${timeLeft < 10000 ? 'text-red-400' : 'text-green-400'}`}>
              {formatTime(timeLeft)}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {mistakes > 0 && <span className="text-red-400">{mistakes} mistake{mistakes !== 1 ? 's' : ''}</span>}
            </div>
          </>
        )}
      </div>

      {phase === 'idle' && (
        <div className="text-center pb-6">
          <div className="mb-4 max-w-sm mx-auto"><GameThumbnail gameId="image_puzzle" isPlayable={true} /></div>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            Place the missing puzzle pieces! Tap a piece from the bank, then tap the empty cell where it belongs.
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
          <div className="mx-auto mb-4"><Spinner /></div>
          <p className="text-slate-600 dark:text-slate-300">Preparing puzzle...</p>
        </div>
      )}

      {phase === 'play' && spec && (
        <div className="flex flex-col items-center">
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">Select a piece below, then tap where it goes!</p>

          {/* Grid */}
          <div
            className="grid gap-1 bg-slate-200 dark:bg-slate-900 p-1 rounded-lg max-w-full overflow-hidden"
            style={{
              gridTemplateColumns: `repeat(${gridSize}, ${tileSize}px)`,
              width: `${gridSize * tileSize + (gridSize + 1) * 4}px`,
              maxWidth: '100%',
            }}
          >
            {Array.from({ length: gridSize * gridSize }).map((_, index) => {
              const row = Math.floor(index / gridSize)
              const col = index % gridSize
              const isFilled = filledCells.has(index)
              const isFlashing = flashCell?.cell === index

              return (
                <button
                  key={index}
                  onClick={() => !isFilled && handleCellClick(index)}
                  disabled={isFilled || selectedPiece === null}
                  className={`relative overflow-hidden transition-all ${
                    isFilled
                      ? ''
                      : selectedPiece !== null
                      ? 'cursor-pointer hover:brightness-125 border-2 border-dashed border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-700'
                      : 'border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700'
                  } ${
                    isFlashing
                      ? flashCell?.correct
                        ? 'ring-2 ring-green-400'
                        : 'ring-2 ring-red-400 animate-pulse'
                      : ''
                  }`}
                  style={{
                    width: tileSize,
                    height: tileSize,
                    backgroundColor: isFilled ? 'transparent' : undefined,
                  }}
                >
                  {isFilled ? (
                    <div
                      className="absolute"
                      style={{
                        width: tileSize * gridSize,
                        height: tileSize * gridSize,
                        left: -col * tileSize,
                        top: -row * tileSize,
                      }}
                    >
                      <Image
                        src={spec.imageUrl}
                        alt="Puzzle"
                        width={tileSize * gridSize}
                        height={tileSize * gridSize}
                        className="pointer-events-none"
                        priority
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center w-full h-full">
                      <span className="text-slate-400 dark:text-slate-500 text-2xl">?</span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Bank */}
          <div className="mt-4 w-full">
            <p className="text-slate-400 dark:text-slate-500 text-xs mb-2 text-center">Tap a piece to select it:</p>
            <div className="flex gap-2 overflow-x-auto pb-2 justify-center flex-wrap">
              {availablePieces.map((pieceIndex) => {
                const row = Math.floor(pieceIndex / gridSize)
                const col = pieceIndex % gridSize
                const isSelected = selectedPiece === pieceIndex
                const bankTileSize = 70

                return (
                  <button
                    key={pieceIndex}
                    onClick={() => handleSelectPiece(pieceIndex)}
                    className={`relative overflow-hidden rounded-lg shrink-0 transition-all ${
                      isSelected
                        ? 'ring-3 ring-yellow-400 scale-105'
                        : 'hover:brightness-110'
                    }`}
                    style={{
                      width: bankTileSize,
                      height: bankTileSize,
                    }}
                  >
                    <div
                      className="absolute"
                      style={{
                        width: bankTileSize * gridSize,
                        height: bankTileSize * gridSize,
                        left: -col * bankTileSize,
                        top: -row * bankTileSize,
                      }}
                    >
                      <Image
                        src={spec.imageUrl}
                        alt={`Piece ${pieceIndex}`}
                        width={bankTileSize * gridSize}
                        height={bankTileSize * gridSize}
                        className="pointer-events-none"
                        priority
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {phase === 'checking' && (
        <div className="text-center py-12">
          <div className="mx-auto mb-4"><Spinner /></div>
          <p className="text-slate-600 dark:text-slate-300">Verifying solution...</p>
        </div>
      )}

      {phase === 'completed' && result && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/20 flex items-center justify-center">
            <Puzzle className="w-10 h-10 text-red-500" />
          </div>
          <h3 className="text-2xl font-bold text-green-500 dark:text-green-400 mb-4">Puzzle Complete!</h3>
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
                <div className="text-base font-bold text-slate-900 dark:text-white">{result.mistakes || 0}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Mistakes</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            <button onClick={startGame} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition">Play Again</button>
            <Link href="/" className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 rounded-lg transition text-center">New Game</Link>
          </div>
          <ShareScore gameName="Image Puzzle" score={result.score || 0} rank={result.rank} />
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/20 flex items-center justify-center">
            <Puzzle className="w-10 h-10 text-red-500" />
          </div>
          <h3 className="text-2xl font-bold text-red-500 dark:text-red-400 mb-4">
            {result?.reason === 'timeout' ? "Time's Up!" : 'Failed!'}
          </h3>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            {result?.reason === 'timeout'
              ? 'You ran out of time.'
              : result?.reason === 'incomplete'
              ? 'Place all pieces to complete the puzzle!'
              : 'Better luck next time!'}
          </p>
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            <button onClick={startGame} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition">Try Again</button>
            <Link href="/" className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 rounded-lg transition text-center">New Game</Link>
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
