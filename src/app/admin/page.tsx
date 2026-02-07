'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Target,
  RotateCw,
  Zap,
  Hammer,
  Keyboard,
  Calculator,
  Palette,
  ScanEye,
  Music,
  GripVertical,
  Pencil,
  Crosshair,
  Power,
  Calendar,
  Check,
  X,
  Vault,
  LucideIcon,
  LayoutDashboard,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

interface DailyStats {
  utcDay: string
  totalCredits: number
  uniquePlayers: number
  totalTurns: number
  status: string
}

interface Settlement {
  id: string
  utc_day: string
  status: string
  pool_total: number
  winner_user_id: string | null
  winner_amount: number | null
  created_at: string
}

interface DailyPool {
  utc_day: string
  total_credits: number
  unique_players: number
  total_turns: number
  status: string
}

interface GameSetting {
  isActive: boolean
  opensAt: string | null
}

interface GameOption {
  id: string
  icon: LucideIcon
  name: string
  desc: string
}

interface SettlementClaim {
  id: string
  user_id: string
  user_name: string
  claim_type: string
  amount: number
  claimed: boolean
  metadata: Record<string, unknown> | null
}

interface SettlementDetail {
  id: string
  utc_day: string
  status: string
  pool_total: number
  participant_count: number
  winner_user_id: string | null
  winner_name: string | null
  winner_amount: number | null
  rebate_total: number | null
  sink_amount: number | null
  completed_at: string | null
  created_at: string
  claims: SettlementClaim[]
}

interface SettlementResult {
  success: boolean
  message: string
  settlement?: {
    id: string
    utcDay: string
    winner: string
    winnerAmount: number
    rebateTotal: number
    sinkAmount: number
    participantCount: number
  }
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

const GAME_OPTIONS: GameOption[] = [
  { id: 'emoji_keypad', icon: Target, name: 'Emoji Keypad', desc: 'Memorize & tap sequence' },
  { id: 'image_rotate', icon: RotateCw, name: 'Image Rotate', desc: 'Rotate tiles to restore' },
  { id: 'reaction_time', icon: Zap, name: 'Reaction Time', desc: 'Test your reflexes' },
  { id: 'whack_a_mole', icon: Hammer, name: 'Whack-a-Mole', desc: 'Hit the moles!' },
  { id: 'typing_speed', icon: Keyboard, name: 'Typing Speed', desc: 'Type the phrase fast' },
  { id: 'mental_math', icon: Calculator, name: 'Mental Math', desc: 'Solve math problems' },
  { id: 'color_match', icon: Palette, name: 'Color Match', desc: 'Match RGB colors' },
  { id: 'visual_diff', icon: ScanEye, name: 'Spot Difference', desc: 'Find the differences' },
  { id: 'audio_pattern', icon: Music, name: 'Audio Pattern', desc: 'Repeat the sound pattern' },
  { id: 'drag_sort', icon: GripVertical, name: 'Drag & Sort', desc: 'Sort items in order' },
  { id: 'follow_me', icon: Pencil, name: 'Follow Me', desc: 'Trace the path accurately' },
  { id: 'duck_shoot', icon: Crosshair, name: 'Target Shoot', desc: 'Hit the moving targets' },
]

type Tab = 'dashboard' | 'treasury'

const EVENT_TYPE_STYLES: Record<string, { label: string; color: string }> = {
  daily_grant: { label: 'Daily Grant', color: 'bg-green-500/20 text-green-400' },
  turn_spend: { label: 'Game Played', color: 'bg-red-500/20 text-red-400' },
  prize_win: { label: 'Prize Win', color: 'bg-yellow-500/20 text-yellow-400' },
  rebate: { label: 'Rebate', color: 'bg-blue-500/20 text-blue-400' },
  admin_adjustment: { label: 'Admin', color: 'bg-purple-500/20 text-purple-400' },
  referral_bonus: { label: 'Referral', color: 'bg-cyan-500/20 text-cyan-400' },
  sink: { label: 'Sink', color: 'bg-orange-500/20 text-orange-400' },
  expiration: { label: 'Expired', color: 'bg-slate-500/20 text-slate-400' },
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [settling, setSettling] = useState(false)
  const [settleDay, setSettleDay] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [grantUserId, setGrantUserId] = useState('')
  const [grantAmount, setGrantAmount] = useState('')
  const [grantReason, setGrantReason] = useState('')
  const [granting, setGranting] = useState(false)
  const [grantResult, setGrantResult] = useState<{ success: boolean; message: string } | null>(null)
  const [gameSettings, setGameSettings] = useState<Record<string, GameSetting>>({})
  const [updatingGame, setUpdatingGame] = useState<string | null>(null)
  const [treasuryUserId, setTreasuryUserId] = useState('')
  const [treasuryInput, setTreasuryInput] = useState('')
  const [savingTreasury, setSavingTreasury] = useState(false)
  const [treasuryResult, setTreasuryResult] = useState<{ success: boolean; message: string } | null>(null)

  // Settlement result state (inline display instead of alert)
  const [settleResult, setSettleResult] = useState<SettlementResult | null>(null)

  // Settlement history state (Treasury tab)
  const [settlementHistory, setSettlementHistory] = useState<SettlementDetail[]>([])
  const [settlementHistoryTotal, setSettlementHistoryTotal] = useState(0)
  const [settlementHistoryLoading, setSettlementHistoryLoading] = useState(false)
  const [expandedSettlement, setExpandedSettlement] = useState<string | null>(null)

  // Treasury ledger state
  const [treasuryBalance, setTreasuryBalance] = useState<number | null>(null)
  const [treasuryDisplayName, setTreasuryDisplayName] = useState<string | null>(null)
  const [treasuryEntries, setTreasuryEntries] = useState<LedgerEntry[]>([])
  const [treasuryTotal, setTreasuryTotal] = useState(0)
  const [treasuryLoading, setTreasuryLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]

      // Fetch today's stats from games API (cycle-aware)
      const gamesRes = await fetch('/api/games')
      if (gamesRes.ok) {
        const gamesData = await gamesRes.json()
        setStats({
          utcDay: gamesData.utcDay,
          totalCredits: gamesData.pool.totalCredits,
          uniquePlayers: gamesData.pool.uniquePlayers,
          totalTurns: gamesData.pool.totalTurns,
          status: gamesData.pool.status,
        })
      } else {
        // Fallback to direct DB query
        const { data: pool } = await supabase
          .from('daily_pools')
          .select('*')
          .eq('utc_day', today)
          .single() as { data: DailyPool | null }

        if (pool) {
          setStats({
            utcDay: pool.utc_day,
            totalCredits: pool.total_credits,
            uniquePlayers: pool.unique_players,
            totalTurns: pool.total_turns,
            status: pool.status,
          })
        }
      }

      // Fetch recent settlements
      const { data: settlementsData } = await supabase
        .from('settlements')
        .select('*')
        .order('utc_day', { ascending: false })
        .limit(10) as { data: Settlement[] | null }

      setSettlements(settlementsData || [])
    } catch (err) {
      console.error('Fetch error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchGameSettings = async () => {
    try {
      const res = await fetch('/api/admin/game-settings')
      if (res.ok) {
        const data = await res.json()
        setGameSettings(data.games || {})
      }
    } catch (err) {
      console.error('Failed to fetch game settings:', err)
    }
  }

  const fetchTreasuryUser = async () => {
    try {
      const res = await fetch('/api/admin/site-settings?key=treasury_user_id')
      if (res.ok) {
        const data = await res.json()
        if (data.setting?.value) {
          setTreasuryUserId(data.setting.value)
          setTreasuryInput(data.setting.value)
        }
      }
    } catch (err) {
      console.error('Failed to fetch treasury user:', err)
    }
  }

  const fetchTreasuryHistory = useCallback(async (userId: string, offset = 0, append = false) => {
    if (!userId) return
    setTreasuryLoading(true)
    try {
      const res = await fetch(`/api/admin/treasury-history?user_id=${encodeURIComponent(userId)}&limit=10&offset=${offset}`)
      if (res.ok) {
        const data = await res.json()
        setTreasuryBalance(data.balance)
        setTreasuryTotal(data.total)
        if (data.displayName) setTreasuryDisplayName(data.displayName)
        if (append) {
          setTreasuryEntries(prev => [...prev, ...data.entries])
        } else {
          setTreasuryEntries(data.entries)
        }
      }
    } catch (err) {
      console.error('Failed to fetch treasury history:', err)
    } finally {
      setTreasuryLoading(false)
    }
  }, [])

  const fetchSettlementHistory = useCallback(async (offset = 0, append = false) => {
    setSettlementHistoryLoading(true)
    try {
      const res = await fetch(`/api/admin/settlement-history?limit=20&offset=${offset}`)
      if (res.ok) {
        const data = await res.json()
        setSettlementHistoryTotal(data.total)
        if (append) {
          setSettlementHistory(prev => [...prev, ...data.settlements])
        } else {
          setSettlementHistory(data.settlements)
        }
      }
    } catch (err) {
      console.error('Failed to fetch settlement history:', err)
    } finally {
      setSettlementHistoryLoading(false)
    }
  }, [])

  const saveTreasuryUser = async () => {
    if (!treasuryInput.trim()) return

    setSavingTreasury(true)
    setTreasuryResult(null)

    try {
      const res = await fetch('/api/admin/site-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'treasury_user_id', value: treasuryInput.trim() }),
      })

      const data = await res.json()
      if (data.error) {
        setTreasuryResult({ success: false, message: data.error })
      } else {
        const newId = treasuryInput.trim()
        setTreasuryUserId(newId)
        setTreasuryResult({ success: true, message: 'Treasury user saved' })
        // Refresh history for new user
        setTreasuryEntries([])
        setTreasuryBalance(null)
        fetchTreasuryHistory(newId)
      }
    } catch (err) {
      setTreasuryResult({ success: false, message: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setSavingTreasury(false)
    }
  }

  useEffect(() => {
    fetchData()
    fetchGameSettings()
    fetchTreasuryUser()
  }, [fetchData])

  // Fetch treasury history and settlement history when switching to treasury tab
  useEffect(() => {
    if (activeTab === 'treasury') {
      if (treasuryUserId && treasuryEntries.length === 0 && treasuryBalance === null) {
        fetchTreasuryHistory(treasuryUserId)
      }
      if (settlementHistory.length === 0 && !settlementHistoryLoading) {
        fetchSettlementHistory()
      }
    }
  }, [activeTab, treasuryUserId, treasuryEntries.length, treasuryBalance, fetchTreasuryHistory, settlementHistory.length, settlementHistoryLoading, fetchSettlementHistory])

  const updateGameSetting = async (gameId: string, isActive: boolean, opensAt: string | null) => {
    setUpdatingGame(gameId)
    try {
      const res = await fetch('/api/admin/game-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, isActive, opensAt }),
      })

      const data = await res.json()
      if (data.error) {
        alert('Failed to update game: ' + data.error)
      } else {
        setGameSettings(prev => ({
          ...prev,
          [gameId]: { isActive, opensAt },
        }))
      }
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setUpdatingGame(null)
    }
  }

  const toggleGame = (gameId: string) => {
    const current = gameSettings[gameId] || { isActive: false, opensAt: null }
    updateGameSetting(gameId, !current.isActive, current.opensAt)
  }

  const setGameOpensAt = (gameId: string, opensAt: string | null) => {
    const current = gameSettings[gameId] || { isActive: false, opensAt: null }
    updateGameSetting(gameId, current.isActive, opensAt)
  }

  const triggerSettlement = async (day?: string) => {
    const targetDay = day || settleDay
    if (!targetDay) return

    setSettling(true)
    setSettleResult(null)
    try {
      const res = await fetch('/api/cron/settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utcDay: targetDay }),
      })

      const data = await res.json()
      if (data.error) {
        setSettleResult({ success: false, message: 'Settlement failed: ' + data.error })
      } else {
        setSettleResult(data)
        fetchData()
        // Refresh settlement history if on treasury tab
        if (activeTab === 'treasury') {
          fetchSettlementHistory()
        }
      }
    } catch (err) {
      setSettleResult({ success: false, message: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setSettling(false)
    }
  }

  const grantCredits = async () => {
    if (!grantUserId || !grantAmount) return

    const amount = parseInt(grantAmount, 10)
    if (isNaN(amount) || amount <= 0) {
      setGrantResult({ success: false, message: 'Invalid amount' })
      return
    }

    setGranting(true)
    setGrantResult(null)

    try {
      const res = await fetch('/api/admin/grant-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: grantUserId,
          amount,
          reason: grantReason || undefined,
        }),
      })

      const data = await res.json()
      if (data.error) {
        setGrantResult({ success: false, message: data.error })
      } else {
        setGrantResult({
          success: true,
          message: `Granted ${data.amountGranted} credits to ${data.displayName || data.userId}. New balance: ${data.newBalance}`,
        })
        setGrantUserId('')
        setGrantAmount('')
        setGrantReason('')
      }
    } catch (err) {
      setGrantResult({ success: false, message: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setGranting(false)
    }
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-8 text-center">
          <h2 className="text-xl font-bold text-red-400 mb-4">Error Loading Admin Panel</h2>
          <p className="text-slate-300">{error}</p>
          <button
            onClick={fetchData}
            className="mt-4 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-800 rounded w-1/4 mb-8"></div>
          <div className="h-64 bg-slate-800 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-white mb-6">Game Ops Admin</h1>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-8 bg-slate-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
            activeTab === 'dashboard'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab('treasury')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
            activeTab === 'treasury'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Vault className="w-4 h-4" />
          Treasury
        </button>
      </div>

      {activeTab === 'dashboard' && (
        <>
          {/* Today's Stats */}
          <div className="bg-slate-800 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">Today&apos;s Stats</h2>
            {stats ? (
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-slate-700 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-yellow-400">{stats.totalCredits}</div>
                  <div className="text-sm text-slate-400">Pool Size</div>
                </div>
                <div className="bg-slate-700 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-blue-400">{stats.uniquePlayers}</div>
                  <div className="text-sm text-slate-400">Players</div>
                </div>
                <div className="bg-slate-700 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-green-400">{stats.totalTurns}</div>
                  <div className="text-sm text-slate-400">Turns</div>
                </div>
                <div className="bg-slate-700 rounded-lg p-4 text-center">
                  <div className={`text-xl font-bold ${stats.status === 'active' ? 'text-green-400' : 'text-orange-400'}`}>
                    {stats.status.toUpperCase()}
                  </div>
                  <div className="text-sm text-slate-400">Status</div>
                </div>
              </div>
            ) : (
              <p className="text-slate-400">No games played today yet.</p>
            )}
          </div>

          {/* Game Management */}
          <div className="bg-slate-800 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">Game Management</h2>
            <p className="text-slate-400 text-sm mb-6">Toggle games on/off and schedule when they become available.</p>

            <div className="space-y-3">
              {GAME_OPTIONS.map((game) => {
                const Icon = game.icon
                const setting = gameSettings[game.id] || { isActive: false, opensAt: null }
                const isUpdating = updatingGame === game.id

                return (
                  <div
                    key={game.id}
                    className={`p-4 rounded-lg border transition ${
                      setting.isActive
                        ? 'border-green-500/30 bg-green-500/5'
                        : 'border-slate-700 bg-slate-700/30'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Icon and Info */}
                      <div className="p-2 bg-slate-600/50 rounded-lg">
                        <Icon className={`w-5 h-5 ${setting.isActive ? 'text-green-400' : 'text-slate-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white">{game.name}</div>
                        <div className="text-xs text-slate-400">{game.desc}</div>
                      </div>

                      {/* Opens At Picker */}
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <input
                          type="datetime-local"
                          value={setting.opensAt ? new Date(setting.opensAt).toISOString().slice(0, 16) : ''}
                          onChange={(e) => setGameOpensAt(game.id, e.target.value ? new Date(e.target.value).toISOString() : null)}
                          disabled={isUpdating}
                          className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white w-44"
                        />
                        {setting.opensAt && (
                          <button
                            onClick={() => setGameOpensAt(game.id, null)}
                            disabled={isUpdating}
                            className="text-slate-400 hover:text-white p-1"
                            title="Clear scheduled time"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Toggle Button */}
                      <button
                        onClick={() => toggleGame(game.id)}
                        disabled={isUpdating}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition ${
                          setting.isActive
                            ? 'bg-green-600 hover:bg-green-500 text-white'
                            : 'bg-slate-600 hover:bg-slate-500 text-slate-300'
                        } ${isUpdating ? 'opacity-50' : ''}`}
                      >
                        {isUpdating ? (
                          <span className="animate-pulse">...</span>
                        ) : setting.isActive ? (
                          <>
                            <Check className="w-4 h-4" />
                            Active
                          </>
                        ) : (
                          <>
                            <Power className="w-4 h-4" />
                            Inactive
                          </>
                        )}
                      </button>
                    </div>

                    {/* Status info */}
                    {setting.isActive && setting.opensAt && new Date(setting.opensAt) > new Date() && (
                      <div className="mt-2 text-xs text-blue-400 pl-14">
                        Scheduled to open: {new Date(setting.opensAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Grant Credits */}
          <div className="bg-slate-800 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">Grant Credits to User</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-sm text-slate-300 mb-2">User ID</label>
                <input
                  type="text"
                  value={grantUserId}
                  onChange={(e) => setGrantUserId(e.target.value)}
                  placeholder="usr_abc123..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-2">Amount</label>
                <input
                  type="number"
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(e.target.value)}
                  placeholder="10"
                  min="1"
                  max="1000"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-2">Reason (optional)</label>
                <input
                  type="text"
                  value={grantReason}
                  onChange={(e) => setGrantReason(e.target.value)}
                  placeholder="Bonus for..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                />
              </div>
              <button
                onClick={grantCredits}
                disabled={granting || !grantUserId || !grantAmount}
                className="bg-green-600 hover:bg-green-500 disabled:bg-slate-600 text-white font-bold py-2 px-6 rounded-lg transition"
              >
                {granting ? 'Granting...' : 'Grant Credits'}
              </button>
            </div>
            {grantResult && (
              <div className={`mt-4 p-3 rounded-lg text-sm ${
                grantResult.success
                  ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                  : 'bg-red-500/20 border border-red-500/30 text-red-400'
              }`}>
                {grantResult.message}
              </div>
            )}
          </div>

          {/* Manual Settlement */}
          <div className="bg-slate-800 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">Manual Settlement</h2>

            {/* Quick action: Settle Yesterday */}
            <div className="mb-4">
              <button
                onClick={() => {
                  const y = new Date()
                  y.setUTCDate(y.getUTCDate() - 1)
                  triggerSettlement(y.toISOString().split('T')[0])
                }}
                disabled={settling}
                className="bg-yellow-500 hover:bg-yellow-400 disabled:bg-slate-600 text-slate-900 font-bold py-2 px-6 rounded-lg transition"
              >
                {settling ? 'Settling...' : 'Settle Yesterday'}
              </button>
              <span className="text-slate-400 text-sm ml-3">Most common action</span>
            </div>

            <div className="flex gap-4 items-end">
              <div>
                <label className="block text-sm text-slate-300 mb-2">Or pick a specific day</label>
                <input
                  type="date"
                  value={settleDay}
                  onChange={(e) => setSettleDay(e.target.value)}
                  className="bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                />
              </div>
              <button
                onClick={() => triggerSettlement()}
                disabled={settling || !settleDay}
                className="bg-orange-600 hover:bg-orange-500 disabled:bg-slate-600 text-white font-bold py-2 px-6 rounded-lg transition"
              >
                {settling ? 'Settling...' : 'Trigger Settlement'}
              </button>
            </div>
            <p className="text-slate-400 text-sm mt-2">
              Settlement runs automatically at midnight UTC via Vercel Cron.
            </p>

            {/* Inline Settlement Result */}
            {settleResult && (
              <div className={`mt-4 p-4 rounded-lg text-sm ${
                settleResult.success
                  ? 'bg-green-500/20 border border-green-500/30'
                  : 'bg-red-500/20 border border-red-500/30'
              }`}>
                <div className={settleResult.success ? 'text-green-400' : 'text-red-400'}>
                  {settleResult.message}
                </div>
                {settleResult.settlement && (
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <div className="text-slate-400 text-xs">Winner Prize</div>
                      <div className="text-yellow-400 font-bold">{settleResult.settlement.winnerAmount}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs">Rebates</div>
                      <div className="text-blue-400 font-bold">{settleResult.settlement.rebateTotal}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs">Sink</div>
                      <div className="text-orange-400 font-bold">{settleResult.settlement.sinkAmount}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs">Participants</div>
                      <div className="text-white font-bold">{settleResult.settlement.participantCount}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Recent Settlements */}
          <div className="bg-slate-800 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4">Recent Settlements</h2>
            {settlements.length === 0 ? (
              <p className="text-slate-400">No settlements yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-slate-400 text-sm">
                      <th className="pb-3">Date</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3">Pool</th>
                      <th className="pb-3">Winner</th>
                      <th className="pb-3">Prize</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.map((s) => (
                      <tr key={s.id} className="border-t border-slate-700">
                        <td className="py-3 text-white">{s.utc_day}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded text-xs ${
                            s.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                            s.status === 'processing' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="py-3 text-yellow-400">{s.pool_total}</td>
                        <td className="py-3 text-slate-300 font-mono text-sm">
                          {s.winner_user_id ? s.winner_user_id.slice(0, 12) + '...' : '-'}
                        </td>
                        <td className="py-3 text-green-400">{s.winner_amount ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'treasury' && (
        <>
          {/* Treasury User Setting */}
          <div className="bg-slate-800 rounded-xl p-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Vault className="w-6 h-6 text-yellow-400" />
              <h2 className="text-xl font-bold text-white">Treasury User</h2>
            </div>
            <p className="text-slate-400 text-sm mb-4">
              The 20% sink from each settlement will be credited to this user as a pending claim.
            </p>
            {treasuryUserId && (
              <div className="bg-slate-700/50 rounded-lg px-4 py-2 mb-4 text-sm">
                <span className="text-slate-400">Current: </span>
                <span className="text-white font-mono">{treasuryUserId}</span>
              </div>
            )}
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm text-slate-300 mb-2">User ID</label>
                <input
                  type="text"
                  value={treasuryInput}
                  onChange={(e) => setTreasuryInput(e.target.value)}
                  placeholder="User ID for treasury deposits..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
                />
              </div>
              <button
                onClick={saveTreasuryUser}
                disabled={savingTreasury || !treasuryInput.trim()}
                className="bg-yellow-500 hover:bg-yellow-400 disabled:bg-slate-600 text-slate-900 font-bold py-2 px-6 rounded-lg transition"
              >
                {savingTreasury ? 'Saving...' : 'Save'}
              </button>
            </div>
            {treasuryResult && (
              <div className={`mt-4 p-3 rounded-lg text-sm ${
                treasuryResult.success
                  ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                  : 'bg-red-500/20 border border-red-500/30 text-red-400'
              }`}>
                {treasuryResult.message}
              </div>
            )}
          </div>

          {/* Treasury Balance & Ledger */}
          {treasuryUserId ? (
            <div className="bg-slate-800 rounded-xl p-6">
              {/* Balance */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white">Treasury Credit Balance</h2>
                  {treasuryDisplayName && (
                    <p className="text-sm text-slate-400 mt-1">Held by user <span className="text-white font-medium">{treasuryDisplayName}</span></p>
                  )}
                </div>
                {treasuryBalance !== null && (
                  <div className="text-3xl font-bold text-yellow-400">{treasuryBalance.toLocaleString()}</div>
                )}
              </div>

              {/* Ledger Table */}
              {treasuryLoading && treasuryEntries.length === 0 ? (
                <div className="animate-pulse space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-10 bg-slate-700 rounded"></div>
                  ))}
                </div>
              ) : treasuryEntries.length === 0 ? (
                <p className="text-slate-400">No credit history for this user.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-slate-400 text-sm">
                          <th className="pb-3">Date</th>
                          <th className="pb-3">Type</th>
                          <th className="pb-3 text-right">Amount</th>
                          <th className="pb-3">Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {treasuryEntries.map((entry) => {
                          const style = EVENT_TYPE_STYLES[entry.event_type] || { label: entry.event_type, color: 'bg-slate-500/20 text-slate-400' }
                          return (
                            <tr key={entry.id} className="border-t border-slate-700">
                              <td className="py-3 text-white text-sm">
                                {new Date(entry.created_at).toLocaleDateString()}{' '}
                                <span className="text-slate-500">{new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </td>
                              <td className="py-3">
                                <span className={`px-2 py-1 rounded text-xs ${style.color}`}>
                                  {style.label}
                                </span>
                              </td>
                              <td className={`py-3 text-right font-mono text-sm ${entry.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {entry.amount >= 0 ? '+' : ''}{entry.amount}
                              </td>
                              <td className="py-3 text-slate-400 text-sm font-mono">
                                {entry.reference_id ? `${entry.reference_type || ''}:${entry.reference_id.slice(0, 8)}...` : '-'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* See More */}
                  {treasuryEntries.length < treasuryTotal && (
                    <div className="mt-4 text-center">
                      <button
                        onClick={() => fetchTreasuryHistory(treasuryUserId, treasuryEntries.length, true)}
                        disabled={treasuryLoading}
                        className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm transition"
                      >
                        {treasuryLoading ? 'Loading...' : `See more (${treasuryTotal - treasuryEntries.length} remaining)`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="bg-slate-800 rounded-xl p-6 text-center">
              <p className="text-slate-400">Set a treasury user above to view their credit history.</p>
            </div>
          )}

          {/* Settlement Allocation History */}
          <div className="bg-slate-800 rounded-xl p-6 mt-8">
            <h2 className="text-xl font-bold text-white mb-4">Settlement Allocation History</h2>
            {settlementHistoryLoading && settlementHistory.length === 0 ? (
              <div className="animate-pulse space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-slate-700 rounded"></div>
                ))}
              </div>
            ) : settlementHistory.length === 0 ? (
              <p className="text-slate-400">No settlements yet.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-slate-400 text-sm">
                        <th className="pb-3 w-8"></th>
                        <th className="pb-3 pr-4">Date</th>
                        <th className="pb-3 px-3 text-right">Pool</th>
                        <th className="pb-3 px-3">Winner</th>
                        <th className="pb-3 px-3 text-right">Prize</th>
                        <th className="pb-3 px-3 text-right">Rebates</th>
                        <th className="pb-3 px-3 text-right">Sink</th>
                        <th className="pb-3 pl-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlementHistory.map((s) => {
                        const isExpanded = expandedSettlement === s.id
                        return (
                          <React.Fragment key={s.id}>
                            <tr
                              className="border-t border-slate-700 cursor-pointer hover:bg-slate-700/30 transition"
                              onClick={() => setExpandedSettlement(isExpanded ? null : s.id)}
                            >
                              <td className="py-3 text-slate-400">
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </td>
                              <td className="py-3 pr-4 text-white">{s.utc_day}</td>
                              <td className="py-3 px-3 text-yellow-400 text-right font-mono">{s.pool_total}</td>
                              <td className="py-3 px-3 text-slate-300 text-sm">
                                {s.winner_name || (s.winner_user_id ? s.winner_user_id.slice(0, 12) + '...' : '-')}
                              </td>
                              <td className="py-3 px-3 text-green-400 text-right font-mono">{s.winner_amount ?? '-'}</td>
                              <td className="py-3 px-3 text-blue-400 text-right font-mono">{s.rebate_total ?? '-'}</td>
                              <td className="py-3 px-3 text-orange-400 text-right font-mono">{s.sink_amount ?? '-'}</td>
                              <td className="py-3 pl-3">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  s.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                                  s.status === 'processing' ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-slate-500/20 text-slate-400'
                                }`}>
                                  {s.status}
                                </span>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={8} className="py-0">
                                  <div className="bg-slate-700/30 rounded-lg p-4 mb-2">
                                    <div className="text-sm text-slate-400 mb-2">
                                      {s.participant_count} participants &middot; Settled {s.completed_at ? new Date(s.completed_at).toLocaleString() : 'pending'}
                                    </div>
                                    {s.claims.length === 0 ? (
                                      <p className="text-slate-500 text-sm">No claims found for this settlement.</p>
                                    ) : (
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="text-slate-400">
                                            <th className="text-left pb-2">User</th>
                                            <th className="text-left pb-2">Type</th>
                                            <th className="text-right pb-2">Amount</th>
                                            <th className="text-right pb-2">Claimed</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {s.claims.map((c) => (
                                            <tr key={c.id} className="border-t border-slate-600/50">
                                              <td className="py-1.5 text-white">{c.user_name}</td>
                                              <td className="py-1.5">
                                                <span className={`px-2 py-0.5 rounded text-xs ${
                                                  c.claim_type === 'prize_win' ? 'bg-yellow-500/20 text-yellow-400' :
                                                  c.claim_type === 'rebate' ? 'bg-blue-500/20 text-blue-400' :
                                                  c.claim_type === 'sink' ? 'bg-orange-500/20 text-orange-400' :
                                                  'bg-slate-500/20 text-slate-400'
                                                }`}>
                                                  {c.claim_type === 'prize_win' ? 'Prize' :
                                                   c.claim_type === 'rebate' ? 'Rebate' :
                                                   c.claim_type === 'sink' ? 'Sink' : c.claim_type}
                                                </span>
                                              </td>
                                              <td className="py-1.5 text-right font-mono text-green-400">{c.amount}</td>
                                              <td className="py-1.5 text-right">
                                                {c.claimed
                                                  ? <Check className="w-4 h-4 text-green-400 inline" />
                                                  : <X className="w-4 h-4 text-slate-500 inline" />
                                                }
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Load More */}
                {settlementHistory.length < settlementHistoryTotal && (
                  <div className="mt-4 text-center">
                    <button
                      onClick={() => fetchSettlementHistory(settlementHistory.length, true)}
                      disabled={settlementHistoryLoading}
                      className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm transition"
                    >
                      {settlementHistoryLoading ? 'Loading...' : `Load more (${settlementHistory.length} of ${settlementHistoryTotal})`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
