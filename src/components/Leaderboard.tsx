'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Crown } from 'lucide-react'
import { formatCredits, formatTime } from '@/lib/utils'
import Link from 'next/link'
import { CC } from '@/lib/currency'

interface LeaderboardEntry {
  rank: number
  userId: string
  displayName: string
  username: string | null
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

interface CachedData {
  entries: LeaderboardEntry[]
  pool: PoolInfo | null
}

interface LeaderboardProps {
  gameType: string
  gameTypeName: string
}

export function Leaderboard({ gameType, gameTypeName }: LeaderboardProps) {
  const [period, setPeriod] = useState<'today' | 'alltime'>('today')
  const [initialLoading, setInitialLoading] = useState(true)
  const cache = useRef<Record<string, CachedData>>({})

  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [pool, setPool] = useState<PoolInfo | null>(null)

  const fetchPeriod = useCallback(async (p: 'today' | 'alltime') => {
    try {
      const res = await fetch(`/api/leaderboard?gameType=${gameType}&period=${p}`)
      if (res.ok) {
        const data = await res.json()
        cache.current[p] = { entries: data.entries, pool: data.pool }
        return { entries: data.entries, pool: data.pool }
      }
    } catch (err) {
      console.error('Leaderboard error:', err)
    }
    return null
  }, [gameType])

  // Initial load: fetch both periods
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const [todayData, alltimeData] = await Promise.all([
        fetchPeriod('today'),
        fetchPeriod('alltime'),
      ])
      if (cancelled) return
      const current = period === 'today' ? todayData : alltimeData
      if (current) {
        setEntries(current.entries)
        setPool(current.pool)
      }
      setInitialLoading(false)
    }
    init()
    return () => { cancelled = true }
  }, [fetchPeriod]) // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic refresh of current tab
  useEffect(() => {
    const refresh = async () => {
      const data = await fetchPeriod(period)
      if (data) {
        setEntries(data.entries)
        setPool(data.pool)
      }
    }
    const interval = setInterval(refresh, 10000)
    return () => clearInterval(interval)
  }, [fetchPeriod, period])

  // Switch tab: use cache instantly, then refresh in background
  const handlePeriodChange = (p: 'today' | 'alltime') => {
    setPeriod(p)
    const cached = cache.current[p]
    if (cached) {
      setEntries(cached.entries)
      setPool(cached.pool)
    }
    // Background refresh
    fetchPeriod(p).then(data => {
      if (data) {
        setEntries(data.entries)
        setPool(data.pool)
      }
    })
  }

  if (initialLoading) {
    return (
      <div className="bg-slate-800 rounded-xl p-4 sm:p-6">
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
    <div className="bg-slate-800 rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white font-title">{gameTypeName}</h2>
      </div>

      {/* Period Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-900/50 rounded-xl p-1 w-fit">
        <button
          onClick={() => handlePeriodChange('today')}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
            period === 'today'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Today
        </button>
        <button
          onClick={() => handlePeriodChange('alltime')}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
            period === 'alltime'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          All Time
        </button>
      </div>

      {period === 'today' && pool && (
        <div className="grid grid-cols-3 text-center bg-slate-900/50 rounded-lg mb-4">
          <div className="py-2.5 px-1">
            <div className="text-lg font-bold text-yellow-400">
              {formatCredits(pool.totalCredits)}
            </div>
            <div className="text-[10px] text-slate-500"><CC />Credit Pool</div>
          </div>
          <div className="py-2.5 px-1">
            <div className="text-lg font-bold text-blue-400">
              {pool.uniquePlayers}
            </div>
            <div className="text-[10px] text-slate-500">Players</div>
          </div>
          <div className="py-2.5 px-1">
            <div className="text-lg font-bold text-green-400">
              {pool.totalTurns}
            </div>
            <div className="text-[10px] text-slate-500">Turns</div>
          </div>
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
                  <div className="font-medium text-white text-sm flex items-center gap-1.5">
                    {entry.username ? (
                      <Link href={`/player/${entry.username}`} className="tap-highlight hover:text-yellow-400 transition">
                        {entry.displayName}
                      </Link>
                    ) : (
                      entry.displayName
                    )}
                    {entry.rank === 1 && <Crown className="w-3.5 h-3.5 text-yellow-400" />}
                    {entry.rank === 2 && <Crown className="w-3.5 h-3.5 text-slate-400" />}
                    {entry.rank === 3 && <Crown className="w-3.5 h-3.5 text-orange-400" />}
                  </div>
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
