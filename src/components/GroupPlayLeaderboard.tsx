'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Crown } from 'lucide-react'
import Link from 'next/link'

interface LeaderboardEntry {
  rank: number
  userId: string
  displayName: string
  username: string | null
  bestScore: number
  bestTimeMs: number | null
  attempts: number
}

interface GroupPlayLeaderboardProps {
  joinToken: string
  refreshKey?: number
  isLive?: boolean
}

export function GroupPlayLeaderboard({ joinToken, refreshKey, isLive = true }: GroupPlayLeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [playerCount, setPlayerCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/group-play/${joinToken}/leaderboard`)
      if (res.ok) {
        const data = await res.json()
        setEntries(data.leaderboard)
        setPlayerCount(data.playerCount)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [joinToken])

  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard, refreshKey])

  // Auto-refresh every 5 seconds while live
  useEffect(() => {
    if (!isLive) return
    intervalRef.current = setInterval(fetchLeaderboard, 5000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchLeaderboard, isLive])

  const crownColor = (rank: number) => {
    if (rank === 1) return 'text-yellow-400'
    if (rank === 2) return 'text-slate-300'
    if (rank === 3) return 'text-amber-600'
    return ''
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white font-title">Group Standings</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">{playerCount} player{playerCount !== 1 ? 's' : ''}</span>
      </div>

      {loading && entries.length === 0 ? (
        <div className="py-8 text-center text-slate-500 dark:text-slate-400 text-sm">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
          No scores yet. Be the first to play!
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map((entry) => (
            <div
              key={entry.userId}
              className={`flex items-center gap-3 py-2 px-2 rounded-lg ${
                entry.rank === 1 ? 'bg-yellow-500/10' : ''
              }`}
            >
              <div className="w-6 text-center shrink-0">
                {entry.rank <= 3 ? (
                  <Crown className={`w-4 h-4 inline ${crownColor(entry.rank)}`} />
                ) : (
                  <span className="text-xs text-slate-500 dark:text-slate-400">{entry.rank}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {entry.username ? (
                  <Link
                    href={`/player/${entry.username}`}
                    className="text-sm font-medium text-slate-900 dark:text-white hover:text-yellow-500 dark:hover:text-yellow-400 truncate block"
                  >
                    {entry.displayName}
                  </Link>
                ) : (
                  <span className="text-sm font-medium text-slate-900 dark:text-white truncate block">
                    {entry.displayName}
                  </span>
                )}
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {entry.attempts} attempt{entry.attempts !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className={`text-sm font-bold ${entry.rank === 1 ? 'text-yellow-500' : 'text-slate-900 dark:text-white'}`}>
                  {entry.bestScore.toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
