'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useCreditsNotification } from '@/components/CreditsNotificationProvider'
import {
  ArrowLeft,
  Gift,
  Crosshair,
  Trophy,
  RotateCw,
  Users,
  Shield,
  Clock,
  Loader2,
} from 'lucide-react'
import { CC } from '@/lib/currency'

interface LedgerEntry {
  id: number
  event_type: string
  amount: number
  utc_day: string
  reference_id: string | null
  reference_type: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const EVENT_TYPE_CONFIG: Record<string, { label: string; icon: typeof Gift; colorClass: string }> = {
  daily_grant:      { label: 'Daily Credits',    icon: Gift,      colorClass: 'text-green-400' },
  turn_spend:       { label: 'Game Played',      icon: Crosshair, colorClass: 'text-red-400' },
  prize_win:        { label: 'Prize Won',        icon: Trophy,    colorClass: 'text-green-400' },
  rebate:           { label: 'Credit Back',       icon: RotateCw,  colorClass: 'text-green-400' },
  referral_bonus:   { label: 'Referral Bonus',   icon: Users,     colorClass: 'text-green-400' },
  admin_grant:      { label: 'Admin Grant',      icon: Shield,    colorClass: 'text-green-400' },
  admin_adjustment: { label: 'Adjustment',       icon: Shield,    colorClass: 'text-green-400' },
  expiration:       { label: 'Expired',          icon: Clock,     colorClass: 'text-red-400' },
}

function getEventConfig(eventType: string, amount: number) {
  const config = EVENT_TYPE_CONFIG[eventType]
  if (config) {
    // For admin_adjustment, color depends on amount sign
    if (eventType === 'admin_adjustment') {
      return { ...config, colorClass: amount >= 0 ? 'text-green-400' : 'text-red-400' }
    }
    return config
  }
  return {
    label: eventType,
    icon: Clock,
    colorClass: amount >= 0 ? 'text-green-400' : 'text-red-400',
  }
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const GAME_NAMES: Record<string, string> = {
  emoji_keypad_sequence: 'Emoji Sequence',
  image_rotate: 'Image Puzzle',
  reaction_time: 'Reaction Time',
  whack_a_mole: 'Whack-a-Mole',
  typing_speed: 'Typing Speed',
  mental_math: 'Mental Math',
  color_match: 'Color Match',
  visual_diff: 'Spot Difference',
  audio_pattern: 'Audio Pattern',
  drag_sort: 'Drag & Sort',
  follow_me: 'Follow Me',
  duck_shoot: 'Target Shoot',
  memory_cards: 'Memory Cards',
  number_chain: 'Number Chain',
  gridlock: 'Gridlock',
}

interface GroupedEntry {
  event_type: string
  gameTypeId?: string
  totalAmount: number
  count: number
}

interface DayGroup {
  utc_day: string
  entries: GroupedEntry[]
}

function groupEntriesByDay(entries: LedgerEntry[]): DayGroup[] {
  const dayMap = new Map<string, Map<string, GroupedEntry>>()

  for (const entry of entries) {
    if (!dayMap.has(entry.utc_day)) {
      dayMap.set(entry.utc_day, new Map())
    }
    const typeMap = dayMap.get(entry.utc_day)!
    const gameTypeId = (entry.metadata as Record<string, unknown>)?.game_type_id as string | undefined
    // Group by event_type + gameTypeId so each game appears separately
    const groupKey = gameTypeId ? `${entry.event_type}:${gameTypeId}` : entry.event_type
    const existing = typeMap.get(groupKey)
    if (existing) {
      existing.totalAmount += entry.amount
      existing.count += 1
    } else {
      typeMap.set(groupKey, {
        event_type: entry.event_type,
        gameTypeId,
        totalAmount: entry.amount,
        count: 1,
      })
    }
  }

  const days: DayGroup[] = []
  for (const [utc_day, typeMap] of dayMap) {
    days.push({ utc_day, entries: Array.from(typeMap.values()) })
  }
  return days
}

const PAGE_SIZE = 50

export default function CreditsPage() {
  const { balance, loading: creditsLoading } = useCreditsNotification()
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(async (offset: number, append: boolean) => {
    try {
      const res = await fetch(`/api/credits/history?limit=${PAGE_SIZE}&offset=${offset}`)
      if (!res.ok) {
        if (res.status === 401) {
          setError('Please sign in to view credit history.')
          return
        }
        throw new Error('Failed to fetch history')
      }
      const data = await res.json()
      setEntries(prev => append ? [...prev, ...data.entries] : data.entries)
      setTotal(data.total)
    } catch {
      setError('Failed to load credit history.')
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchHistory(0, false).finally(() => setLoading(false))
  }, [fetchHistory])

  const handleLoadMore = async () => {
    setLoadingMore(true)
    await fetchHistory(entries.length, true)
    setLoadingMore(false)
  }

  const hasMore = entries.length < total

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      <h1 className="text-2xl font-bold text-white mb-2">Credit History</h1>

      {!creditsLoading && (
        <div className="mb-6">
          <span className="text-3xl font-bold text-yellow-400">{balance}</span>
          <span className="text-slate-400 ml-2"><CC />Credits</span>
        </div>
      )}

      {loading ? (
        <div className="bg-slate-800 rounded-xl p-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-slate-800 rounded-xl p-6 text-center text-slate-400">
          {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-8 text-center text-slate-400">
          No transactions yet.
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {groupEntriesByDay(entries).map((day) => (
              <div key={day.utc_day}>
                <div className="text-xs text-slate-400 font-medium mb-2 px-1">
                  {formatDate(day.utc_day)}
                </div>
                <div className="bg-slate-800 rounded-xl overflow-hidden divide-y divide-slate-700">
                  {day.entries.map((grouped, idx) => {
                    const config = getEventConfig(grouped.event_type, grouped.totalAmount)
                    const Icon = config.icon
                    const isPositive = grouped.totalAmount >= 0
                    const gameName = grouped.gameTypeId ? GAME_NAMES[grouped.gameTypeId] : null

                    return (
                      <div key={`${grouped.event_type}-${grouped.gameTypeId || idx}`} className="px-4 py-3 flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-slate-700/50 ${config.colorClass}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-medium">
                            {config.label}{gameName ? ` · ${gameName}` : ''}{grouped.count > 1 ? ` x${grouped.count}` : ''}
                          </div>
                        </div>
                        <div className={`text-sm font-semibold tabular-nums ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                          {isPositive ? '+' : ''}{grouped.totalAmount}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full mt-4 border-2 border-slate-600 hover:border-slate-500 text-slate-400 hover:text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
            >
              {loadingMore ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </span>
              ) : (
                'Load more'
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}
