'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Crown } from 'lucide-react'
import { formatCredits, formatCountdown } from '@/lib/utils'
import { Link } from 'next-view-transitions'
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
  refreshKey?: number
  poolSize?: number | null
  msUntilSettlement?: number
}

export function Leaderboard({ gameType, gameTypeName, refreshKey, poolSize, msUntilSettlement }: LeaderboardProps) {
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

  // Immediate refresh when refreshKey changes (e.g. after game complete)
  useEffect(() => {
    if (refreshKey === undefined || refreshKey === 0) return
    fetchPeriod(period).then(data => {
      if (data) {
        setEntries(data.entries)
        setPool(data.pool)
      }
    })
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="bg-slate-800 rounded-xl overflow-hidden">
        <div className="animate-pulse p-4">
          <div className="h-6 bg-slate-700 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-10 bg-slate-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800 rounded-xl overflow-hidden">
      {/* Period Tabs */}
      <div className="px-4 pt-4 pb-0 flex justify-center">
        <div className="flex gap-1 bg-slate-900/50 rounded-xl p-1 w-fit">
          <button
            onClick={() => handlePeriodChange('today')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              period === 'today'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => handlePeriodChange('alltime')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              period === 'alltime'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      {/* Pool info bar — below tabs, Today only */}
      {poolSize != null && poolSize > 0 && period === 'today' && (
        <div className="flex items-start justify-between px-4 pt-3 pb-3">
          <div className="min-w-0">
            <p className="text-lg font-bold text-yellow-400 font-title">
              <CC />{poolSize.toLocaleString()} Game Pool
            </p>
            <div className="text-[10px] text-slate-400 mt-0.5">
              50% Winner &ndash; 30% Back &ndash; 20% Treasury
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-base font-bold text-yellow-400 font-title">
              {formatCountdown(msUntilSettlement || 0)}
            </p>
            <div className="text-[10px] text-slate-400 mt-0.5">till settlement</div>
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
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left text-xs text-slate-400 font-medium pl-4 pr-1 py-2 w-8">#</th>
              <th className="text-left text-xs text-slate-400 font-medium px-2 py-2">Player</th>
              <th className="text-right text-xs text-slate-400 font-medium px-2 py-2">Score</th>
              <th className="text-right text-xs text-slate-400 font-medium pl-2 pr-4 py-2">Turns</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={entry.userId} className={i < entries.length - 1 ? 'border-b border-slate-700/50' : ''}>
                <td className="pl-4 pr-1 py-2.5">
                  <span className={`text-sm font-bold ${
                    entry.rank === 1 ? 'text-yellow-400'
                    : entry.rank === 2 ? 'text-slate-400'
                    : entry.rank === 3 ? 'text-orange-400'
                    : 'text-slate-500'
                  }`}>
                    {entry.rank}
                  </span>
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {entry.username ? (
                      <Link href={`/player/${entry.username}`} className="tap-highlight text-white text-sm font-medium hover:text-yellow-400 transition truncate">
                        {entry.displayName}
                      </Link>
                    ) : (
                      <span className="text-white text-sm font-medium truncate">{entry.displayName}</span>
                    )}
                    {entry.rank === 1 && <Crown className="w-3.5 h-3.5 text-yellow-400 shrink-0" />}
                    {entry.rank === 2 && <Crown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                    {entry.rank === 3 && <Crown className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right">
                  <span className="text-green-400 font-bold text-sm">{entry.bestScore.toLocaleString()}</span>
                </td>
                <td className="pl-2 pr-4 py-2.5 text-right">
                  <span className="text-slate-400 text-xs">{entry.turnsPlayed}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
