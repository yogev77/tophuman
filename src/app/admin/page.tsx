'use client'

import { useState, useEffect, useCallback } from 'react'
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
  LucideIcon,
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

export default function AdminPage() {
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

  useEffect(() => {
    fetchData()
    fetchGameSettings()
  }, [fetchData])

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

  const triggerSettlement = async () => {
    if (!settleDay) return

    setSettling(true)
    try {
      const res = await fetch('/api/cron/settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utcDay: settleDay }),
      })

      const data = await res.json()
      if (data.error) {
        alert('Settlement failed: ' + data.error)
      } else {
        alert('Settlement completed!')
        fetchData()
      }
    } catch (err) {
      alert('Settlement error: ' + (err instanceof Error ? err.message : 'Unknown'))
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
      <h1 className="text-3xl font-bold text-white mb-8">Game Ops Admin</h1>

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
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm text-slate-300 mb-2">UTC Day (YYYY-MM-DD)</label>
            <input
              type="date"
              value={settleDay}
              onChange={(e) => setSettleDay(e.target.value)}
              className="bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white"
            />
          </div>
          <button
            onClick={triggerSettlement}
            disabled={settling || !settleDay}
            className="bg-orange-600 hover:bg-orange-500 disabled:bg-slate-600 text-white font-bold py-2 px-6 rounded-lg transition"
          >
            {settling ? 'Settling...' : 'Trigger Settlement'}
          </button>
        </div>
        <p className="text-slate-400 text-sm mt-2">
          Note: Settlement runs automatically at midnight UTC via Vercel Cron.
        </p>
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
    </div>
  )
}
