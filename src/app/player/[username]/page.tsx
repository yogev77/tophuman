'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Target,
  Pencil,
  Gamepad2,
  ArrowLeft,
  Crown,
  Trophy,
  Settings,
  Sun,
  Moon,
  Check,
  X,
  Loader2,
  History,
  Gift,
  Crosshair as CrosshairIcon,
  RotateCw as RotateCwIcon,
  Users,
  Shield,
  Clock,
  Volume2,
  VolumeX,
  Zap,
  Cog,
  Brain,
  Shapes,
} from 'lucide-react'
import { CC } from '@/lib/currency'
import { useCreditsNotification } from '@/components/CreditsNotificationProvider'
import { useTheme } from '@/hooks/useTheme'
import { useSound } from '@/hooks/useSound'
import { createClient } from '@/lib/supabase/client'
import { GAMES, SKILLS, SKILL_LIST, getGameName, SkillId } from '@/lib/skills'
import { GAME_ICONS } from '@/lib/game-icons'

const SKILL_ICONS: Record<SkillId, typeof Zap> = {
  reflex: Zap,
  logic: Cog,
  focus: CrosshairIcon,
  memory: Brain,
  pattern: Shapes,
}

const SKILL_HEX: Record<SkillId, string> = {
  reflex: '#eab308',
  logic: '#2563eb',
  focus: '#ef4444',
  memory: '#a855f7',
  pattern: '#22c55e',
}

const MAX_SKILL_LEVEL = 50

interface GameStats {
  gameId: string
  gameName: string
  allTime: { score: number; rank: number } | null
  today: { score: number; rank: number; poolSize: number } | null
}

interface PlayerData {
  displayName: string
  username: string
  joinedAt: string | null
  games: GameStats[]
}

type PageTab = 'profile' | 'skills' | 'settings' | 'history'

function formatCompactScore(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
  return n.toLocaleString()
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return <Crown className="w-4 h-4 text-yellow-400" />
  }
  if (rank === 2) {
    return <Crown className="w-4 h-4 text-slate-400" />
  }
  if (rank === 3) {
    return <Crown className="w-4 h-4 text-orange-400" />
  }
  return <span className="text-xs text-slate-400 font-medium">#{rank}</span>
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button
      onClick={toggleTheme}
      className="p-2.5 rounded-lg hover:bg-slate-700 transition"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? (
        <Sun className="w-5 h-5 text-yellow-400" />
      ) : (
        <Moon className="w-5 h-5 text-slate-400" />
      )}
    </button>
  )
}

function SoundsToggle() {
  const { enabled, toggleSounds } = useSound()
  return (
    <button
      onClick={toggleSounds}
      className="p-2.5 rounded-lg hover:bg-slate-700 transition"
      title={enabled ? 'Mute sounds' : 'Enable sounds'}
    >
      {enabled ? (
        <Volume2 className="w-5 h-5 text-yellow-400" />
      ) : (
        <VolumeX className="w-5 h-5 text-slate-400" />
      )}
    </button>
  )
}

function ProfileTab({ data }: { data: PlayerData }) {
  const [statsTab, setStatsTab] = useState<'today' | 'allTime'>('today')

  const todayGames = data.games.filter(g => g.today)
  const allTimeGames = data.games.filter(g => g.allTime)

  const renderTable = (games: GameStats[], mode: 'today' | 'allTime') => {
    if (games.length === 0) {
      return (
        <div className="text-center text-slate-500 py-8">
          {mode === 'today' ? 'No games played today.' : 'No games played yet.'}
        </div>
      )
    }

    return (
      <div className="bg-slate-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left text-sm text-slate-400 font-medium px-4 py-3">Game</th>
              <th className="text-right text-sm text-slate-400 font-medium px-2 py-3">Score</th>
              <th className="text-right text-sm text-slate-400 font-medium px-2 py-3">Rank</th>
              {mode === 'today' && (
                <th className="text-right text-sm text-yellow-500 font-medium px-4 py-3 whitespace-nowrap"><CC />Pool</th>
              )}
            </tr>
          </thead>
          <tbody>
            {games.map((game, i) => {
              const Icon = GAME_ICONS[game.gameId] || Target
              const colors = GAMES[game.gameId]?.iconColors || GAMES.emoji_keypad.iconColors
              const stats = mode === 'today' ? game.today : game.allTime
              if (!stats) return null

              return (
                <tr key={game.gameId} className={i < games.length - 1 ? 'border-b border-slate-700/50' : ''}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-lg ${colors.bg}`}>
                        <Icon className={`w-4 h-4 ${colors.icon}`} />
                      </div>
                      <span className="text-white text-sm font-medium">{game.gameName}</span>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <span className="text-green-400 font-bold text-sm">{formatCompactScore(stats.score)}</span>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <RankBadge rank={stats.rank} />
                  </td>
                  {mode === 'today' && 'poolSize' in stats && (
                    <td className="px-4 py-3 text-right">
                      <span className="text-yellow-400 font-bold text-sm">{(stats as { poolSize: number }).poolSize}</span>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <>
      {/* Desktop: side by side */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-6">
        <div>
          <h3 className="text-sm font-medium text-slate-400 mb-3 text-center uppercase tracking-wider">Today</h3>
          {renderTable(todayGames, 'today')}
        </div>
        <div>
          <h3 className="text-sm font-medium text-slate-400 mb-3 text-center uppercase tracking-wider">All Time</h3>
          {renderTable(allTimeGames, 'allTime')}
        </div>
      </div>

      {/* Mobile: tabs */}
      <div className="lg:hidden">
        <div className="flex justify-center gap-2 mb-4">
          <button
            onClick={() => setStatsTab('today')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              statsTab === 'today'
                ? 'bg-yellow-500 text-slate-900'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setStatsTab('allTime')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              statsTab === 'allTime'
                ? 'bg-yellow-500 text-slate-900'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            All Time
          </button>
        </div>
        {statsTab === 'today'
          ? renderTable(todayGames, 'today')
          : renderTable(allTimeGames, 'allTime')
        }
      </div>
    </>
  )
}

function SettingsTab() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [originalName, setOriginalName] = useState('')
  const [username, setUsername] = useState('')
  const [originalUsername, setOriginalUsername] = useState('')
  const [editingUsername, setEditingUsername] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [usernameMessage, setUsernameMessage] = useState<string | null>(null)
  const [savingUsername, setSavingUsername] = useState(false)
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchProfile = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      setEmail(user.email || '')

      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id, display_name, username')
        .eq('id', user.id)
        .single()

      if (profile) {
        setDisplayName(profile.display_name || '')
        setOriginalName(profile.display_name || '')
        setUsername(profile.username || '')
        setOriginalUsername(profile.username || '')
        setUserId(profile.user_id)
      }
    } catch (err) {
      console.error('Profile fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [router])

  const checkUsername = useCallback(async (value: string) => {
    if (!value || value.length < 3) {
      setUsernameStatus('idle')
      setUsernameMessage(null)
      return
    }

    if (value.toLowerCase() === originalUsername.toLowerCase()) {
      setUsernameStatus('idle')
      setUsernameMessage(null)
      return
    }

    setUsernameStatus('checking')
    try {
      const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(value)}`)
      const data = await res.json()

      if (data.available) {
        setUsernameStatus('available')
        setUsernameMessage(null)
      } else {
        setUsernameStatus(data.message?.includes('taken') ? 'taken' : 'invalid')
        setUsernameMessage(data.message)
      }
    } catch {
      setUsernameStatus('idle')
      setUsernameMessage('Error checking username')
    }
  }, [originalUsername])

  useEffect(() => {
    if (!editingUsername) return
    const timer = setTimeout(() => {
      if (username) {
        checkUsername(username)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [username, checkUsername, editingUsername])

  const handleSaveUsername = async () => {
    if (username === originalUsername) {
      setEditingUsername(false)
      return
    }

    if (usernameStatus !== 'available') {
      setMessage({ type: 'error', text: 'Please choose an available username' })
      return
    }

    setSavingUsername(true)
    setMessage(null)

    try {
      const res = await fetch('/api/profile/username', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update username')
      }

      setOriginalUsername(username)
      setEditingUsername(false)
      setUsernameStatus('idle')
      setMessage({ type: 'success', text: 'Username updated!' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update username' })
    } finally {
      setSavingUsername(false)
    }
  }

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const handleSave = async () => {
    if (!displayName.trim()) {
      setMessage({ type: 'error', text: 'Display name cannot be empty' })
      return
    }

    if (displayName.length > 20) {
      setMessage({ type: 'error', text: 'Display name must be 20 characters or less' })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim(), updated_at: new Date().toISOString() })
        .eq('id', user.id)

      if (error) throw error

      setOriginalName(displayName.trim())
      setMessage({ type: 'success', text: 'Profile updated!' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-48 bg-slate-800 rounded"></div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800 rounded-xl p-6 space-y-6 max-w-md">
      <div>
        <label className="block text-sm text-slate-400 mb-1">User ID</label>
        <div className="text-slate-300 font-mono text-sm">{userId}</div>
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-1">Email</label>
        <div className="text-slate-300">{email}</div>
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-1">Username</label>
        {editingUsername ? (
          <div className="space-y-2">
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                maxLength={20}
                className={`w-full bg-slate-700 border rounded-lg px-4 py-3 text-white focus:outline-none transition pr-10 ${
                  usernameStatus === 'available' ? 'border-green-500' :
                  usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'border-red-500' :
                  'border-slate-600 focus:border-yellow-500'
                }`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {usernameStatus === 'checking' && (
                  <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                )}
                {usernameStatus === 'available' && (
                  <Check className="w-5 h-5 text-green-500" />
                )}
                {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                  <X className="w-5 h-5 text-red-500" />
                )}
              </div>
            </div>
            {usernameMessage && (
              <p className="text-xs text-red-400">{usernameMessage}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleSaveUsername}
                disabled={savingUsername || (usernameStatus !== 'available' && username !== originalUsername)}
                className="flex-1 bg-yellow-500 hover:bg-yellow-400 disabled:bg-yellow-500/30 text-slate-900 disabled:text-slate-900/50 font-semibold py-2 rounded-lg transition text-sm"
              >
                {savingUsername ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setUsername(originalUsername)
                  setEditingUsername(false)
                  setUsernameStatus('idle')
                  setUsernameMessage(null)
                }}
                className="flex-1 border border-slate-600 hover:border-slate-500 text-slate-400 hover:text-white font-semibold py-2 rounded-lg transition text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="text-slate-300">@{username}</div>
            <button
              onClick={() => setEditingUsername(true)}
              className="p-2 text-slate-400 hover:text-white transition"
              title="Edit username"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="displayName" className="block text-sm text-slate-300 mb-2">
          Display Name
        </label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={20}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition"
          placeholder="Enter display name"
        />
        <p className="text-xs text-slate-500 mt-1">{displayName.length}/20 characters</p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.type === 'success'
            ? 'bg-green-500/20 border border-green-500/30 text-green-400'
            : 'bg-red-500/20 border border-red-500/30 text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || displayName === originalName}
        className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:bg-yellow-500/30 text-slate-900 disabled:text-slate-900/50 font-bold py-3 rounded-lg transition"
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>

      <div className="flex items-center justify-between">
        <label className="text-sm text-slate-400">Theme</label>
        <ThemeToggle />
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm text-slate-400">Sounds</label>
        <SoundsToggle />
      </div>

      <a
        href="/auth/forgot-password"
        className="block text-center text-sm text-slate-500 hover:text-slate-300 transition"
      >
        Change password
      </a>

      <button
        onClick={handleSignOut}
        className="w-full border-2 border-slate-600 hover:border-slate-500 text-slate-400 hover:text-white font-bold py-3 rounded-lg transition"
      >
        Sign Out
      </button>
    </div>
  )
}

// Credit History Tab
const HISTORY_EVENT_CONFIG: Record<string, { label: string; icon: typeof Gift; colorClass: string }> = {
  daily_grant:      { label: 'Daily Credits',    icon: Gift,         colorClass: 'text-green-400' },
  turn_spend:       { label: 'Game Played',      icon: CrosshairIcon, colorClass: 'text-red-400' },
  prize_win:        { label: 'Prize Won',        icon: Trophy,       colorClass: 'text-green-400' },
  rebate:           { label: 'Credit Back',      icon: RotateCwIcon, colorClass: 'text-green-400' },
  referral_bonus:   { label: 'Referral Bonus',   icon: Users,        colorClass: 'text-green-400' },
  admin_grant:      { label: 'Admin Grant',      icon: Shield,       colorClass: 'text-green-400' },
  admin_adjustment: { label: 'Adjustment',       icon: Shield,       colorClass: 'text-green-400' },
  expiration:       { label: 'Expired',          icon: Clock,        colorClass: 'text-red-400' },
}


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

interface HistoryGroupedEntry {
  event_type: string
  gameTypeId?: string
  isGroupPlay?: boolean
  totalAmount: number
  count: number
}

function getHistoryEventConfig(eventType: string, amount: number) {
  const config = HISTORY_EVENT_CONFIG[eventType]
  if (config) {
    if (eventType === 'admin_adjustment') {
      return { ...config, colorClass: amount >= 0 ? 'text-green-400' : 'text-red-400' }
    }
    return config
  }
  return { label: eventType, icon: Clock, colorClass: amount >= 0 ? 'text-green-400' : 'text-red-400' }
}

function groupHistoryEntries(entries: LedgerEntry[]): { utc_day: string; entries: HistoryGroupedEntry[] }[] {
  const dayMap = new Map<string, Map<string, HistoryGroupedEntry>>()
  for (const entry of entries) {
    if (!dayMap.has(entry.utc_day)) dayMap.set(entry.utc_day, new Map())
    const typeMap = dayMap.get(entry.utc_day)!
    const meta = (entry.metadata as Record<string, unknown>) || {}
    const gameTypeId = meta.game_type_id as string | undefined
    const isGroupPlay = !!meta.group_session_id
    const groupKey = `${entry.event_type}:${gameTypeId || ''}:${isGroupPlay ? 'group' : ''}`
    const existing = typeMap.get(groupKey)
    if (existing) {
      existing.totalAmount += entry.amount
      existing.count += 1
    } else {
      typeMap.set(groupKey, { event_type: entry.event_type, gameTypeId, isGroupPlay, totalAmount: entry.amount, count: 1 })
    }
  }
  const days: { utc_day: string; entries: HistoryGroupedEntry[] }[] = []
  for (const [utc_day, typeMap] of dayMap) {
    days.push({ utc_day, entries: Array.from(typeMap.values()) })
  }
  return days
}

function formatHistoryDate(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const HISTORY_PAGE_SIZE = 50

function HistoryTab() {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(async (offset: number, append: boolean) => {
    try {
      const res = await fetch(`/api/credits/history?limit=${HISTORY_PAGE_SIZE}&offset=${offset}`)
      if (!res.ok) {
        if (res.status === 401) { setError('Please sign in to view credit history.'); return }
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

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-xl p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    )
  }

  if (error) {
    return <div className="bg-slate-800 rounded-xl p-6 text-center text-slate-400">{error}</div>
  }

  if (entries.length === 0) {
    return <div className="bg-slate-800 rounded-xl p-8 text-center text-slate-400">No transactions yet.</div>
  }

  return (
    <>
      <div className="space-y-4">
        {groupHistoryEntries(entries).map((day) => (
          <div key={day.utc_day}>
            <div className="text-xs text-slate-400 font-medium mb-2 px-1">
              {formatHistoryDate(day.utc_day)}
            </div>
            <div className="bg-slate-800 rounded-xl overflow-hidden">
              {day.entries.map((grouped, idx) => {
                const config = getHistoryEventConfig(grouped.event_type, grouped.totalAmount)
                const Icon = grouped.isGroupPlay ? Users : config.icon
                const iconColor = grouped.isGroupPlay ? 'text-purple-400' : config.colorClass
                const isPositive = grouped.totalAmount >= 0
                const gameName = grouped.gameTypeId ? getGameName(grouped.gameTypeId) : null
                const label = grouped.isGroupPlay
                  ? (grouped.event_type === 'prize_win' ? 'Group Play Prize' : 'Group Play · Credit Back')
                  : config.label

                return (
                  <div key={`${grouped.event_type}-${grouped.gameTypeId || idx}-${grouped.isGroupPlay ? 'g' : ''}`} className={`px-4 py-3 flex items-center gap-3${idx > 0 ? ' border-t border-light-divider' : ''}`}>
                    <div className={`p-2 rounded-lg bg-slate-700/50 ${iconColor}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium">
                        {label}{gameName ? ` · ${gameName}` : ''}{grouped.count > 1 ? ` x${grouped.count}` : ''}
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
  )
}

interface SkillEntry {
  skillId: SkillId
  name: string
  level: number
  totalPlays: number
  gamesPlayed: number
  totalGames: number
  rank: number
  totalPlayers: number
  percentile: number
}

const RADAR_CX = 185
const RADAR_CY = 150
const RADAR_R = 82

function SkillRadarChart({ skills }: { skills: SkillEntry[] }) {
  const skillMap = new Map(skills.map(s => [s.skillId, s]))
  const angles = SKILL_LIST.map((_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / 5)
  const hasData = skills.some(s => s.totalPlays > 0)

  const pt = (angle: number, r: number) => ({
    x: RADAR_CX + r * Math.cos(angle),
    y: RADAR_CY + r * Math.sin(angle),
  })

  const poly = (r: number) =>
    angles.map(a => { const p = pt(a, r); return `${p.x},${p.y}` }).join(' ')

  const dataPoints = SKILL_LIST.map((def, i) => {
    const s = skillMap.get(def.id)
    // Use percentile (0–1) for radar distance; minimum 8% so dots are always visible
    const ratio = s && s.totalPlays > 0 ? Math.max(s.percentile, 0.08) : 0
    return pt(angles[i], ratio * RADAR_R)
  })

  const labelConfigs = SKILL_LIST.map((_, i) => {
    const edge = pt(angles[i], RADAR_R + 20)
    if (i === 0) return { fo: { x: edge.x - 55, y: edge.y - 46, w: 110, h: 46 }, align: 'center' }
    if (i === 1) return { fo: { x: edge.x + 4, y: edge.y - 23, w: 110, h: 46 }, align: 'left' }
    if (i === 2) return { fo: { x: edge.x + 4, y: edge.y - 4, w: 110, h: 46 }, align: 'left' }
    if (i === 3) return { fo: { x: edge.x - 114, y: edge.y - 4, w: 110, h: 46 }, align: 'right' }
    return { fo: { x: edge.x - 114, y: edge.y - 23, w: 110, h: 46 }, align: 'right' }
  })

  return (
    <div className="flex justify-center">
      <svg viewBox="0 0 370 290" className="w-full max-w-sm">
        {/* Grid pentagons */}
        {[0.33, 0.66, 1].map(s => (
          <polygon key={s} points={poly(RADAR_R * s)} fill="none" className="stroke-slate-300 dark:stroke-slate-600/30" strokeWidth="0.8" />
        ))}
        {/* Spokes */}
        {angles.map((a, i) => {
          const p = pt(a, RADAR_R)
          return <line key={i} x1={RADAR_CX} y1={RADAR_CY} x2={p.x} y2={p.y} className="stroke-slate-300 dark:stroke-slate-600/30" strokeWidth="0.8" />
        })}
        {/* Data polygon */}
        {hasData && (
          <>
            <polygon
              points={dataPoints.map(p => `${p.x},${p.y}`).join(' ')}
              fill="rgba(234,179,8,0.15)"
              stroke="rgba(234,179,8,0.6)"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {dataPoints.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={SKILL_HEX[SKILL_LIST[i].id]} />
            ))}
          </>
        )}
        {/* Vertex labels */}
        {SKILL_LIST.map((def, i) => {
          const skill = skillMap.get(def.id)
          const Icon = SKILL_ICONS[def.id]
          const cfg = labelConfigs[i]
          return (
            <foreignObject key={def.id} x={cfg.fo.x} y={cfg.fo.y} width={cfg.fo.w} height={cfg.fo.h}>
              <div className={`flex items-center gap-1.5 ${cfg.align === 'right' ? 'justify-end' : cfg.align === 'center' ? 'justify-center' : ''}`}>
                <div className={`w-7 h-7 rounded-full ${def.colors.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-3.5 h-3.5 ${def.colors.textLight} dark:${def.colors.text}`} />
                </div>
                <div className="leading-tight">
                  <div className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{def.name}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    Lv.{skill?.level ?? 1}
                  </div>
                </div>
              </div>
            </foreignObject>
          )
        })}
        {/* Empty state */}
        {!hasData && (
          <text x={RADAR_CX} y={RADAR_CY + 4} textAnchor="middle" className="fill-slate-400 dark:fill-slate-500 text-[11px]">
            Play games to see your skills
          </text>
        )}
      </svg>
    </div>
  )
}

function SkillsTab({ username }: { username: string }) {
  const [skills, setSkills] = useState<SkillEntry[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const res = await fetch(`/api/player/${encodeURIComponent(username)}/skills`)
        if (res.ok) {
          const data = await res.json()
          setSkills(data.skills)
        }
      } catch (err) {
        console.error('Failed to fetch skills:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchSkills()
  }, [username])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-center">
          <div className="animate-pulse w-full max-w-xs aspect-square bg-white dark:bg-slate-800 rounded-xl" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="animate-pulse bg-white dark:bg-slate-800 rounded-xl p-5 h-24" />
          ))}
        </div>
      </div>
    )
  }

  if (!skills) return null

  const totalAllPlays = skills.reduce((s, sk) => s + sk.totalPlays, 0)

  return (
    <div className="space-y-6">
      <SkillRadarChart skills={skills} />
      <div className="space-y-3">
        {skills.map(skill => {
          const def = SKILLS[skill.skillId]
          const Icon = SKILL_ICONS[skill.skillId]
          const isMax = skill.level >= MAX_SKILL_LEVEL
          const strengthPct = Math.round(skill.percentile * 100)
          // Visual floor: min 20% fill so new players see presence
          const barFill = skill.totalPlays > 0 ? Math.max(strengthPct, 20) : 0
          const isStrong = strengthPct >= 80
          const xpInLevel = skill.totalPlays % 10
          const playsToNext = isMax ? 0 : 10 - xpInLevel

          return (
            <div key={skill.skillId} className="bg-white dark:bg-slate-800 rounded-xl p-4">
              {/* Header: icon + name + rank + level badge */}
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-full ${def.colors.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-[18px] h-[18px] ${def.colors.textLight} dark:${def.colors.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white">{skill.name}</span>
                      {skill.totalPlays > 0 && (
                        <span className="flex items-center gap-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                          {skill.rank <= 3 && (
                            <Crown className={`w-3.5 h-3.5 ${skill.rank === 1 ? 'text-yellow-400' : skill.rank === 2 ? 'text-slate-400' : 'text-orange-400'}`} />
                          )}
                          #{skill.rank} All Time
                        </span>
                      )}
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full text-white ${def.colors.dot}`}>
                      Lv.{skill.level}
                    </span>
                  </div>
                </div>
              </div>

              {/* Strength bar + number */}
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="flex-1 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className={`h-2.5 rounded-full ${def.colors.dot} transition-all`}
                    style={{
                      width: `${barFill}%`,
                      ...(isStrong ? { boxShadow: `0 0 8px ${SKILL_HEX[skill.skillId]}66` } : {}),
                    }}
                  />
                </div>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums w-6 text-right shrink-0">
                  {skill.totalPlays > 0 ? strengthPct : '—'}
                </span>
              </div>

              {/* Subtle metadata */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                <span>
                  {skill.totalPlays} plays · {isMax ? 'Max level' : `${playsToNext} to Lv.${skill.level + 1}`}
                </span>
                <span>{totalAllPlays > 0 ? `${Math.round(skill.totalPlays / totalAllPlays * 100)}% of plays` : ''}{skill.totalPlays > 0 ? ` · Rank #${skill.rank} of ${skill.totalPlayers}` : ''}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* How to read this */}
      <div className="text-sm text-slate-400 dark:text-slate-500 leading-relaxed space-y-1.5 px-1">
        <p className="font-medium text-slate-500 dark:text-slate-400">How to read your skills</p>
        <p>The <strong>radar chart</strong> gives a quick overview of your strengths across all five skill categories.</p>
        <p>Each <strong>strength score</strong> (0–100) is based on your best game scores compared to other players on the platform — not how many games you played. A score of 75 means you outperform 75% of players in that skill.</p>
        <p><strong>Level</strong> tracks your experience and goes up every 10 plays. Strength measures how good you are; level measures how much you&apos;ve played.</p>
      </div>
    </div>
  )
}

function PlayerProfileContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const username = params.username as string
  const [data, setData] = useState<PlayerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<PageTab>(
    tabParam === 'skills' ? 'skills' : tabParam === 'history' ? 'history' : tabParam === 'settings' ? 'settings' : 'profile'
  )
  const { username: myUsername } = useCreditsNotification()

  const isOwnProfile = myUsername === username

  useEffect(() => {
    const cacheKey = `profile_${username}`
    const fetchProfile = async () => {
      // Show cached data instantly, then refresh in background
      try {
        const cached = sessionStorage.getItem(cacheKey)
        if (cached) {
          const { data: cachedData, ts } = JSON.parse(cached)
          setData(cachedData)
          setLoading(false)
          // If cache is less than 60s old, skip refetch
          if (Date.now() - ts < 60000) return
        }
      } catch { /* ignore parse errors */ }

      try {
        const res = await fetch(`/api/player/${encodeURIComponent(username)}`)
        if (res.status === 404) {
          setNotFound(true)
          return
        }
        if (res.ok) {
          const playerData = await res.json()
          setData(playerData)
          try { sessionStorage.setItem(cacheKey, JSON.stringify({ data: playerData, ts: Date.now() })) } catch { /* quota */ }
        }
      } catch (err) {
        console.error('Failed to fetch player profile:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [username])

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-700 rounded w-1/3 mb-8"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-14 bg-slate-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        <div className="text-6xl mb-4">?</div>
        <h1 className="text-2xl font-bold text-white mb-2 font-title">Player Not Found</h1>
        <p className="text-slate-400 mb-6">No player with username &quot;{username}&quot; exists.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-2 px-6 rounded-lg transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-slate-400 hover:text-white transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold text-white font-title">{data.displayName}</h1>
          <p className="text-sm text-slate-400">
            @{data.username}
            {data.joinedAt && (
              <> · Joined {new Date(data.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
            )}
          </p>
        </div>
        {isOwnProfile && (
          <button
            onClick={() => setActiveTab('settings')}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-white dark:bg-slate-800 rounded-xl p-1 mb-8 lg:w-fit lg:mx-auto">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 lg:flex-initial flex items-center justify-center lg:justify-start gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
              activeTab === 'profile'
                ? 'bg-yellow-500 text-slate-900'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4" />
            Charts
          </button>
          <button
            onClick={() => setActiveTab('skills')}
            className={`flex-1 lg:flex-initial flex items-center justify-center lg:justify-start gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
              activeTab === 'skills'
                ? 'bg-yellow-500 text-slate-900'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Gamepad2 className="w-4 h-4" />
            Skills
          </button>
          {isOwnProfile && (
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 lg:flex-initial flex items-center justify-center lg:justify-start gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeTab === 'history'
                  ? 'bg-yellow-500 text-slate-900'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <History className="w-4 h-4" />
              Credits
            </button>
          )}
      </div>

      {/* Tab Contents — kept mounted to preserve state across tab switches */}
      <div className={activeTab === 'profile' ? '' : 'hidden'}>
        <ProfileTab data={data} />
      </div>

      <div className={activeTab === 'skills' ? '' : 'hidden'}>
        <SkillsTab username={username} />
      </div>

      {isOwnProfile && (
        <div className={activeTab === 'history' ? '' : 'hidden'}>
          <HistoryTab />
        </div>
      )}

      {isOwnProfile && (
        <div className={activeTab === 'settings' ? '' : 'hidden'}>
          <SettingsTab />
        </div>
      )}
    </div>
  )
}

export default function PlayerProfilePage() {
  return (
    <Suspense fallback={
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-700 rounded w-1/3 mb-8"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-14 bg-slate-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    }>
      <PlayerProfileContent />
    </Suspense>
  )
}
