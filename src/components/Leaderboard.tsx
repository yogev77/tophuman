'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCountdown, formatCredits, formatTime } from '@/lib/utils'

interface LeaderboardEntry {
  rank: number
  userId: string
  displayName: string
  bestScore: number
  bestTimeMs: number | null
  turnsPlayed: number
}

interface PoolInfo {
  totalCredits: number
  uniquePlayers: number
  totalTurns: number
  status: string
}

interface LeaderboardProps {
  gameType: string
  gameTypeName: string
}

export function Leaderboard({ gameType, gameTypeName }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [pool, setPool] = useState<PoolInfo | null>(null)
  const [msUntilSettlement, setMsUntilSettlement] = useState(0)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'today' | 'alltime'>('today')

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/leaderboard?gameType=${gameType}&period=${period}`)
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries)
        setPool(data.pool)
        setMsUntilSettlement(data.msUntilSettlement)
      }
    } catch (err) {
      console.error('Leaderboard error:', err)
    } finally {
      setLoading(false)
    }
  }, [gameType, period])

  useEffect(() => {
    setLoading(true)
    fetchLeaderboard()
    const interval = setInterval(fetchLeaderboard, 10000) // Refresh every 10s

    return () => clearInterval(interval)
  }, [fetchLeaderboard])

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setMsUntilSettlement(ms => Math.max(0, ms - 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-xl p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 bg-slate-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white font-title">{gameTypeName}</h2>
        {period === 'today' && (
          <div className="text-right">
            <div className="text-xs text-slate-400">Settlement in</div>
            <div className="text-sm font-mono text-yellow-400">
              {formatCountdown(msUntilSettlement)}
            </div>
          </div>
        )}
      </div>

      {/* Period Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setPeriod('today')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            period === 'today'
              ? 'bg-yellow-500 text-slate-900'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Today
        </button>
        <button
          onClick={() => setPeriod('alltime')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            period === 'alltime'
              ? 'bg-yellow-500 text-slate-900'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          All Time
        </button>
      </div>

      {period === 'today' && pool && (
        <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-slate-700/50 rounded-lg">
          <div className="text-center">
            <div className="text-xl font-bold text-yellow-400">
              {formatCredits(pool.totalCredits)}
            </div>
            <div className="text-xs text-slate-400">Pool</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-blue-400">
              {pool.uniquePlayers}
            </div>
            <div className="text-xs text-slate-400">Players</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-green-400">
              {pool.totalTurns}
            </div>
            <div className="text-xs text-slate-400">Turns</div>
          </div>
        </div>
      )}

      {period === 'today' && (
        <div className="text-xs text-slate-400 mb-3 p-2 bg-slate-700/30 rounded">
          <strong>Prizes:</strong> 50% to winner, 30% rebates, 20% sink
        </div>
      )}

      {entries.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          {period === 'today'
            ? 'No games played today yet. Be the first!'
            : 'No games played yet.'}
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.userId}
              className={`flex items-center justify-between p-3 rounded-lg ${
                entry.rank === 1
                  ? 'bg-yellow-500/20 border border-yellow-500/30'
                  : entry.rank === 2
                  ? 'bg-slate-400/20 border border-slate-400/30'
                  : entry.rank === 3
                  ? 'bg-orange-500/20 border border-orange-500/30'
                  : 'bg-slate-700/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold ${
                    entry.rank === 1
                      ? 'bg-yellow-500 text-black'
                      : entry.rank === 2
                      ? 'bg-slate-400 text-black'
                      : entry.rank === 3
                      ? 'bg-orange-500 text-black'
                      : 'bg-slate-600 text-white'
                  }`}
                >
                  {entry.rank}
                </span>
                <div>
                  <div className="font-medium text-white text-sm">{entry.displayName}</div>
                  <div className="text-xs text-slate-400">
                    {entry.turnsPlayed} turn{entry.turnsPlayed !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-white text-sm">{entry.bestScore.toLocaleString()}</div>
                <div className="text-xs text-slate-400">
                  {entry.bestTimeMs ? formatTime(entry.bestTimeMs) : '-'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
