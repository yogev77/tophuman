'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCountdown } from '@/lib/utils'
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
  Mail,
  Send,
  Users,
} from 'lucide-react'
import { EMAIL_TEMPLATES } from '@/lib/email-templates'

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
  game_type_id: string | null
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
  gameSettlements?: {
    gameTypeId: string
    settlementId: string
    winner: string
    winnerAmount: number
    rebateTotal: number
    sinkAmount: number
    participantCount: number
    poolTotal: number
  }[]
  summary?: {
    gamesSettled: number
    totalPool: number
    totalPrize: number
    totalRebate: number
    totalSink: number
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

interface TreasurySnapshot {
  id: number
  utc_day: string
  balance: number
  treasury_user_id: string
  treasury_username: string | null
  notes: string | null
  created_at: string
}

const GAME_ICON_COLORS: Record<string, { bg: string; icon: string }> = {
  emoji_keypad: { bg: 'bg-rose-500/20', icon: 'text-rose-400' },
  image_rotate: { bg: 'bg-sky-500/20', icon: 'text-sky-400' },
  reaction_time: { bg: 'bg-amber-500/20', icon: 'text-amber-400' },
  whack_a_mole: { bg: 'bg-green-500/20', icon: 'text-green-400' },
  typing_speed: { bg: 'bg-violet-500/20', icon: 'text-violet-400' },
  mental_math: { bg: 'bg-orange-500/20', icon: 'text-orange-400' },
  color_match: { bg: 'bg-pink-500/20', icon: 'text-pink-400' },
  visual_diff: { bg: 'bg-teal-500/20', icon: 'text-teal-400' },
  audio_pattern: { bg: 'bg-indigo-500/20', icon: 'text-indigo-400' },
  drag_sort: { bg: 'bg-lime-500/20', icon: 'text-lime-400' },
  follow_me: { bg: 'bg-cyan-500/20', icon: 'text-cyan-400' },
  duck_shoot: { bg: 'bg-emerald-500/20', icon: 'text-emerald-400' },
}

const GAME_OPTIONS: GameOption[] = [
  { id: 'emoji_keypad', icon: Target, name: 'Sequence', desc: 'Memorize & tap sequence' },
  { id: 'image_rotate', icon: RotateCw, name: 'Puzzle Spin', desc: 'Rotate tiles to restore' },
  { id: 'reaction_time', icon: Zap, name: 'Reaction Tap', desc: 'Test your reflexes' },
  { id: 'whack_a_mole', icon: Hammer, name: 'Whack-a-Mole', desc: 'Hit the moles!' },
  { id: 'typing_speed', icon: Keyboard, name: 'Typing Speed', desc: 'Type the phrase fast' },
  { id: 'mental_math', icon: Calculator, name: 'Mental Math', desc: 'Solve math problems' },
  { id: 'color_match', icon: Palette, name: 'Color Match', desc: 'Match RGB colors' },
  { id: 'visual_diff', icon: ScanEye, name: 'Spot the Diff', desc: 'Find the differences' },
  { id: 'audio_pattern', icon: Music, name: 'Simon Says', desc: 'Repeat the sound pattern' },
  { id: 'drag_sort', icon: GripVertical, name: 'Drag & Sort', desc: 'Sort items in order' },
  { id: 'follow_me', icon: Pencil, name: 'Follow Me', desc: 'Trace the path accurately' },
  { id: 'duck_shoot', icon: Crosshair, name: 'Target Shoot', desc: 'Hit the moving targets' },
]

const GAME_NAME_MAP: Record<string, string> = Object.fromEntries(
  GAME_OPTIONS.map(g => [g.id, g.name])
)
// Legacy DB mapping
GAME_NAME_MAP['emoji_keypad_sequence'] = 'Emoji Keypad'

function gameDisplayName(id: string | null): string {
  if (!id) return 'All Games'
  return GAME_NAME_MAP[id] || id
}

type Tab = 'dashboard' | 'treasury' | 'notifications' | 'referrals'

interface ReferralEntry {
  referrer_user_id: string
  referrer_name: string
  referred_user_id: string
  referred_name: string
  referred_at: string
  credits_granted: boolean
}

const EVENT_TYPE_STYLES: Record<string, { label: string; color: string }> = {
  daily_grant: { label: 'Daily Grant', color: 'bg-green-500/20 text-green-400' },
  turn_spend: { label: 'Game Played', color: 'bg-red-500/20 text-red-400' },
  prize_win: { label: 'Prize Win', color: 'bg-yellow-500/20 text-yellow-400' },
  rebate: { label: 'Credit Back', color: 'bg-blue-500/20 text-blue-400' },
  admin_adjustment: { label: 'Admin', color: 'bg-purple-500/20 text-purple-400' },
  referral_bonus: { label: 'Referral', color: 'bg-cyan-500/20 text-cyan-400' },
  sink: { label: 'Treasury', color: 'bg-orange-500/20 text-orange-400' },
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

  // Settlement countdown
  const [msUntilSettlement, setMsUntilSettlement] = useState(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Settlement result state (inline display instead of alert)
  const [settleResult, setSettleResult] = useState<SettlementResult | null>(null)

  // Settlement history state (Treasury tab)
  const [settlementHistory, setSettlementHistory] = useState<SettlementDetail[]>([])
  const [settlementHistoryTotal, setSettlementHistoryTotal] = useState(0)
  const [settlementHistoryLoading, setSettlementHistoryLoading] = useState(false)
  const [expandedSettlement, setExpandedSettlement] = useState<string | null>(null)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  // Treasury ledger state
  const [treasuryBalance, setTreasuryBalance] = useState<number | null>(null)
  const [treasuryDisplayName, setTreasuryDisplayName] = useState<string | null>(null)
  const [treasuryEntries, setTreasuryEntries] = useState<LedgerEntry[]>([])
  const [treasuryTotal, setTreasuryTotal] = useState(0)
  const [treasuryLoading, setTreasuryLoading] = useState(false)
  const [showAllTreasury, setShowAllTreasury] = useState(false)
  const [expandedTreasuryGroups, setExpandedTreasuryGroups] = useState<Set<string>>(new Set())

  // Treasury snapshots state
  const [snapshots, setSnapshots] = useState<TreasurySnapshot[]>([])
  const [snapshotsTotal, setSnapshotsTotal] = useState(0)
  const [snapshotsLoading, setSnapshotsLoading] = useState(false)
  const [recordingSnapshot, setRecordingSnapshot] = useState(false)

  // Referrals tab state
  const [referrals, setReferrals] = useState<ReferralEntry[]>([])
  const [referralsLoading, setReferralsLoading] = useState(false)
  const [referralStats, setReferralStats] = useState({ total: 0, credited: 0, uncredited: 0 })

  // Notifications tab state
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const sendTestEmail = async () => {
    if (!selectedTemplate || !testEmail) return
    setSendingTest(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/send-test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplate, targetEmail: testEmail }),
      })
      const data = await res.json()
      if (data.success) {
        setTestResult({ ok: true, message: `Test email sent to ${testEmail}` })
      } else {
        setTestResult({ ok: false, message: data.error || 'Failed to send' })
      }
    } catch {
      setTestResult({ ok: false, message: 'Network error' })
    } finally {
      setSendingTest(false)
    }
  }

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
        if (gamesData.msUntilSettlement) setMsUntilSettlement(gamesData.msUntilSettlement)
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
      const res = await fetch(`/api/admin/treasury-history?user_id=${encodeURIComponent(userId)}&limit=100&offset=${offset}`)
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

  const fetchSnapshots = useCallback(async (offset = 0, append = false) => {
    setSnapshotsLoading(true)
    try {
      const res = await fetch(`/api/admin/treasury-snapshots?limit=20&offset=${offset}`)
      if (res.ok) {
        const data = await res.json()
        setSnapshotsTotal(data.total)
        if (append) {
          setSnapshots(prev => [...prev, ...data.snapshots])
        } else {
          setSnapshots(data.snapshots)
        }
      }
    } catch (err) {
      console.error('Failed to fetch treasury snapshots:', err)
    } finally {
      setSnapshotsLoading(false)
    }
  }, [])

  const recordSnapshot = async () => {
    setRecordingSnapshot(true)
    try {
      const res = await fetch('/api/admin/treasury-snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        fetchSnapshots()
      }
    } catch (err) {
      console.error('Failed to record snapshot:', err)
    } finally {
      setRecordingSnapshot(false)
    }
  }

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

  // Countdown timer
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setMsUntilSettlement(ms => Math.max(0, ms - 1000))
    }, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [])

  // Fetch treasury history, snapshots, and settlement history when switching to treasury tab
  useEffect(() => {
    if (activeTab === 'treasury') {
      if (treasuryUserId && treasuryEntries.length === 0 && treasuryBalance === null) {
        fetchTreasuryHistory(treasuryUserId)
      }
      if (snapshots.length === 0 && !snapshotsLoading) {
        fetchSnapshots()
      }
      if (settlementHistory.length === 0 && !settlementHistoryLoading) {
        fetchSettlementHistory()
      }
    }
  }, [activeTab, treasuryUserId, treasuryEntries.length, treasuryBalance, fetchTreasuryHistory, snapshots.length, snapshotsLoading, fetchSnapshots, settlementHistory.length, settlementHistoryLoading, fetchSettlementHistory])

  // Fetch referral data when switching to referrals tab
  useEffect(() => {
    if (activeTab !== 'referrals' || referrals.length > 0 || referralsLoading) return
    const fetchReferrals = async () => {
      setReferralsLoading(true)
      try {
        const supabase = createClient()

        // Get all referred profiles (where referred_by is not null)
        const { data: referred } = await supabase
          .from('profiles')
          .select('user_id, display_name, username, referred_by, created_at')
          .not('referred_by', 'is', null)
          .order('created_at', { ascending: false })

        if (!referred || referred.length === 0) {
          setReferrals([])
          setReferralStats({ total: 0, credited: 0, uncredited: 0 })
          setReferralsLoading(false)
          return
        }

        // Get all referral_bonus ledger entries
        const { data: bonuses } = await supabase
          .from('credit_ledger')
          .select('user_id, reference_id, created_at')
          .eq('event_type', 'referral_bonus')

        const bonusSet = new Set(bonuses?.map(b => b.reference_id) ?? [])

        // Get referrer profiles for display names
        const referrerIds = [...new Set(referred.map(r => r.referred_by))]
        const { data: referrerProfiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, username')
          .in('user_id', referrerIds)

        const referrerMap = new Map(referrerProfiles?.map(p => [p.user_id, p]) ?? [])

        const entries: ReferralEntry[] = referred.map(r => {
          const referrer = referrerMap.get(r.referred_by)
          return {
            referrer_user_id: r.referred_by,
            referrer_name: referrer?.username || referrer?.display_name || r.referred_by,
            referred_user_id: r.user_id,
            referred_name: r.username || r.display_name || r.user_id,
            referred_at: r.created_at,
            credits_granted: bonusSet.has(r.user_id),
          }
        })

        const credited = entries.filter(e => e.credits_granted).length
        setReferrals(entries)
        setReferralStats({ total: entries.length, credited, uncredited: entries.length - credited })
      } catch (err) {
        console.error('Failed to fetch referrals:', err)
      } finally {
        setReferralsLoading(false)
      }
    }
    fetchReferrals()
  }, [activeTab, referrals.length, referralsLoading])

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
        <button
          onClick={() => setActiveTab('referrals')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
            activeTab === 'referrals'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          Referrals
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
            activeTab === 'notifications'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Mail className="w-4 h-4" />
          Notifications
        </button>
      </div>

      {activeTab === 'dashboard' && (
        <>
          {/* Today's Stats */}
          <div className="bg-slate-800 rounded-xl p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">Today&apos;s Stats</h2>
            {stats ? (
              <div className="grid grid-cols-5 gap-4">
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
                <div className="bg-slate-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold font-mono text-yellow-400">
                    {formatCountdown(msUntilSettlement)}
                  </div>
                  <div className="text-sm text-slate-400">Till Settlement</div>
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
                      <div className={`p-2 rounded-lg ${GAME_ICON_COLORS[game.id]?.bg || 'bg-slate-600/50'}`}>
                        <Icon className={`w-5 h-5 ${GAME_ICON_COLORS[game.id]?.icon || 'text-slate-400'}`} />
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
                (() => {
                  const sevenDaysAgo = new Date()
                  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
                  const visibleEntries = showAllTreasury
                    ? treasuryEntries
                    : treasuryEntries.filter(e => new Date(e.created_at) >= sevenDaysAgo)
                  const hiddenCount = treasuryEntries.length - treasuryEntries.filter(e => new Date(e.created_at) >= sevenDaysAgo).length

                  // Group entries by day then by event_type
                  const dayGroups = new Map<string, { date: string; typeGroups: Map<string, LedgerEntry[]> }>()
                  for (const entry of visibleEntries) {
                    const dayKey = entry.utc_day || new Date(entry.created_at).toISOString().slice(0, 10)
                    if (!dayGroups.has(dayKey)) {
                      dayGroups.set(dayKey, { date: dayKey, typeGroups: new Map() })
                    }
                    const day = dayGroups.get(dayKey)!
                    const list = day.typeGroups.get(entry.event_type) || []
                    list.push(entry)
                    day.typeGroups.set(entry.event_type, list)
                  }

                  return (
                    <>
                      <div className="space-y-3">
                        {[...dayGroups.entries()].map(([dayKey, day]) => (
                          <div key={dayKey}>
                            <div className="text-xs text-slate-500 font-medium mb-1 px-1">{dayKey}</div>
                            <div className="overflow-x-auto">
                              <table className="w-full">
                                <tbody>
                                  {[...day.typeGroups.entries()].map(([eventType, entries]) => {
                                    const style = EVENT_TYPE_STYLES[eventType] || { label: eventType, color: 'bg-slate-500/20 text-slate-400' }
                                    const totalAmount = entries.reduce((s, e) => s + e.amount, 0)
                                    const groupKey = `${dayKey}:${eventType}`
                                    const isGroupExpanded = expandedTreasuryGroups.has(groupKey)
                                    const canExpand = entries.length > 1

                                    return (
                                      <React.Fragment key={groupKey}>
                                        <tr
                                          className={`border-t border-slate-700 ${canExpand ? 'cursor-pointer hover:bg-slate-700/30' : ''} transition`}
                                          onClick={() => {
                                            if (!canExpand) return
                                            setExpandedTreasuryGroups(prev => {
                                              const next = new Set(prev)
                                              if (next.has(groupKey)) next.delete(groupKey)
                                              else next.add(groupKey)
                                              return next
                                            })
                                          }}
                                        >
                                          <td className="py-2.5 w-6 text-slate-400">
                                            {canExpand && (isGroupExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />)}
                                          </td>
                                          <td className="py-2.5">
                                            <span className={`px-2 py-1 rounded text-xs ${style.color}`}>
                                              {style.label}
                                            </span>
                                            {entries.length > 1 && (
                                              <span className="text-slate-500 text-xs ml-2">x{entries.length}</span>
                                            )}
                                          </td>
                                          <td className={`py-2.5 text-right pr-4 font-mono text-sm ${totalAmount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {totalAmount >= 0 ? '+' : ''}{totalAmount}
                                          </td>
                                        </tr>
                                        {isGroupExpanded && entries.map((entry) => {
                                          const gameName = entry.metadata?.game_type_id ? gameDisplayName(entry.metadata.game_type_id as string) : null
                                          return (
                                            <tr key={entry.id} className="border-t border-slate-700/50 bg-slate-700/20">
                                              <td className="py-1.5"></td>
                                              <td className="py-1.5 pl-6 text-slate-400 text-xs">
                                                {gameName || (entry.reference_id ? `${entry.reference_type || ''}:${entry.reference_id.slice(0, 8)}...` : '-')}
                                              </td>
                                              <td className={`py-1.5 text-right pr-4 font-mono text-xs ${entry.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                {entry.amount >= 0 ? '+' : ''}{entry.amount}
                                              </td>
                                            </tr>
                                          )
                                        })}
                                      </React.Fragment>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>

                      {!showAllTreasury && hiddenCount > 0 && (
                        <div className="mt-4 text-center">
                          <button
                            onClick={() => setShowAllTreasury(true)}
                            className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-lg text-sm transition"
                          >
                            Show older ({hiddenCount} more)
                          </button>
                        </div>
                      )}

                      {showAllTreasury && treasuryEntries.length < treasuryTotal && (
                        <div className="mt-4 text-center">
                          <button
                            onClick={() => fetchTreasuryHistory(treasuryUserId, treasuryEntries.length, true)}
                            disabled={treasuryLoading}
                            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm transition"
                          >
                            {treasuryLoading ? 'Loading...' : `Load more (${treasuryTotal - treasuryEntries.length} remaining)`}
                          </button>
                        </div>
                      )}
                    </>
                  )
                })()
              )}
            </div>
          ) : (
            <div className="bg-slate-800 rounded-xl p-6 text-center">
              <p className="text-slate-400">Set a treasury user above to view their credit history.</p>
            </div>
          )}

          {/* Balance Snapshots */}
          <div className="bg-slate-800 rounded-xl p-6 mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Balance Snapshots</h2>
              <button
                onClick={recordSnapshot}
                disabled={recordingSnapshot}
                className="bg-yellow-500 hover:bg-yellow-400 disabled:bg-slate-600 text-slate-900 font-bold py-2 px-4 rounded-lg text-sm transition"
              >
                {recordingSnapshot ? 'Recording...' : 'Record Snapshot Now'}
              </button>
            </div>
            {snapshotsLoading && snapshots.length === 0 ? (
              <div className="animate-pulse space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-10 bg-slate-700 rounded"></div>
                ))}
              </div>
            ) : snapshots.length === 0 ? (
              <p className="text-slate-400">No snapshots recorded yet.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-slate-400 text-sm">
                        <th className="pb-3">Date</th>
                        <th className="pb-3 text-right pr-4">Balance</th>
                        <th className="pb-3 pl-4">Treasury User</th>
                        <th className="pb-3 pl-4">Notes</th>
                        <th className="pb-3 pl-4">Recorded At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshots.map((s) => (
                        <tr key={s.id} className="border-t border-slate-700">
                          <td className="py-3 text-white">{s.utc_day}</td>
                          <td className="py-3 text-right pr-4 font-mono text-yellow-400">{s.balance.toLocaleString()}</td>
                          <td className="py-3 pl-4 text-slate-300 text-sm">{s.treasury_username || s.treasury_user_id.slice(0, 12) + '...'}</td>
                          <td className="py-3 pl-4 text-slate-400 text-sm">{s.notes || '-'}</td>
                          <td className="py-3 pl-4 text-slate-400 text-sm">
                            {new Date(s.created_at).toLocaleDateString()}{' '}
                            <span className="text-slate-500">{new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {snapshots.length < snapshotsTotal && (
                  <div className="mt-4 text-center">
                    <button
                      onClick={() => fetchSnapshots(snapshots.length, true)}
                      disabled={snapshotsLoading}
                      className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm transition"
                    >
                      {snapshotsLoading ? 'Loading...' : `Load more (${snapshots.length} of ${snapshotsTotal})`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

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
                  {(() => {
                    // Group settlements by utc_day
                    const grouped = new Map<string, SettlementDetail[]>()
                    for (const s of settlementHistory) {
                      const list = grouped.get(s.utc_day) || []
                      list.push(s)
                      grouped.set(s.utc_day, list)
                    }

                    return [...grouped.entries()].map(([day, daySettlements]) => {
                      const dayTotal = daySettlements.reduce((sum, s) => sum + s.pool_total, 0)
                      const dayPrize = daySettlements.reduce((sum, s) => sum + (s.winner_amount ?? 0), 0)
                      const dayRebate = daySettlements.reduce((sum, s) => sum + (s.rebate_total ?? 0), 0)
                      const daySink = daySettlements.reduce((sum, s) => sum + (s.sink_amount ?? 0), 0)
                      const isDayExpanded = expandedDays.has(day)

                      return (
                        <div key={day} className="mb-4">
                          {/* Day header — clickable to expand games */}
                          <div
                            className="flex items-center justify-between bg-slate-700/40 rounded-lg px-4 py-3 cursor-pointer hover:bg-slate-700/60 transition"
                            onClick={() => setExpandedDays(prev => {
                              const next = new Set(prev)
                              if (next.has(day)) next.delete(day)
                              else next.add(day)
                              return next
                            })}
                          >
                            <div className="flex items-center gap-2">
                              {isDayExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                              <span className="text-white font-bold">{day}</span>
                            </div>
                            <div className="flex gap-4 text-xs">
                              <span className="text-yellow-400 font-mono">Pool: {dayTotal}</span>
                              <span className="text-green-400 font-mono">Prize: {dayPrize}</span>
                              <span className="text-blue-400 font-mono">Rebate: {dayRebate}</span>
                              <span className="text-orange-400 font-mono">Treasury: {daySink}</span>
                              <span className="text-slate-400">{daySettlements.length} game(s)</span>
                            </div>
                          </div>

                          {isDayExpanded && (
                            <table className="w-full">
                              <thead>
                                <tr className="text-left text-slate-400 text-xs">
                                  <th className="py-2 w-8"></th>
                                  <th className="py-2 pr-4">Game</th>
                                  <th className="py-2 px-3 text-right">Pool</th>
                                  <th className="py-2 px-3">Winner</th>
                                  <th className="py-2 px-3 text-right">Prize</th>
                                  <th className="py-2 px-3 text-right">Credit Back</th>
                                  <th className="py-2 px-3 text-right">Treasury</th>
                                  <th className="py-2 pl-3">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {daySettlements.map((s) => {
                                  const isExpanded = expandedSettlement === s.id
                                  const gameColor = GAME_ICON_COLORS[s.game_type_id || '']
                                  return (
                                    <React.Fragment key={s.id}>
                                      <tr
                                        className="border-t border-slate-700 cursor-pointer hover:bg-slate-700/30 transition"
                                        onClick={() => setExpandedSettlement(isExpanded ? null : s.id)}
                                      >
                                        <td className="py-2.5 text-slate-400">
                                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                        </td>
                                        <td className="py-2.5 pr-4">
                                          <span className={`px-2 py-0.5 rounded text-xs ${gameColor?.bg || 'bg-slate-600/50'} ${gameColor?.icon || 'text-slate-300'}`}>
                                            {gameDisplayName(s.game_type_id)}
                                          </span>
                                        </td>
                                        <td className="py-2.5 px-3 text-yellow-400 text-right font-mono text-sm">{s.pool_total}</td>
                                        <td className="py-2.5 px-3 text-slate-300 text-sm">
                                          {s.winner_name || (s.winner_user_id ? s.winner_user_id.slice(0, 12) + '...' : '-')}
                                        </td>
                                        <td className="py-2.5 px-3 text-green-400 text-right font-mono text-sm">{s.winner_amount ?? '-'}</td>
                                        <td className="py-2.5 px-3 text-blue-400 text-right font-mono text-sm">{s.rebate_total ?? '-'}</td>
                                        <td className="py-2.5 px-3 text-orange-400 text-right font-mono text-sm">{s.sink_amount ?? '-'}</td>
                                        <td className="py-2.5 pl-3">
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
                                                             c.claim_type === 'rebate' ? 'Credit Back' :
                                                             c.claim_type === 'sink' ? 'Treasury' : c.claim_type}
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
                          )}
                        </div>
                      )
                    })
                  })()}
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
                {settleResult.summary && (
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div>
                      <div className="text-slate-400 text-xs">Games Settled</div>
                      <div className="text-white font-bold">{settleResult.summary.gamesSettled}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs">Total Pool</div>
                      <div className="text-yellow-400 font-bold">{settleResult.summary.totalPool}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs">Total Prize</div>
                      <div className="text-green-400 font-bold">{settleResult.summary.totalPrize}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs">Total Credit Back</div>
                      <div className="text-blue-400 font-bold">{settleResult.summary.totalRebate}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs">Total Treasury</div>
                      <div className="text-orange-400 font-bold">{settleResult.summary.totalSink}</div>
                    </div>
                  </div>
                )}
                {settleResult.gameSettlements && settleResult.gameSettlements.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {settleResult.gameSettlements.map((g) => (
                      <div key={g.gameTypeId} className="flex items-center gap-3 text-xs">
                        <span className={`px-2 py-0.5 rounded ${GAME_ICON_COLORS[g.gameTypeId]?.bg || 'bg-slate-600/50'} ${GAME_ICON_COLORS[g.gameTypeId]?.icon || 'text-slate-300'}`}>
                          {gameDisplayName(g.gameTypeId)}
                        </span>
                        <span className="text-yellow-400 font-mono">Pool: {g.poolTotal}</span>
                        <span className="text-green-400 font-mono">Prize: {g.winnerAmount}</span>
                        <span className="text-slate-400">{g.participantCount} players</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </>
      )}

      {activeTab === 'referrals' && (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <div className="text-2xl font-bold text-white">{referralStats.total}</div>
              <div className="text-xs text-slate-400">Total Referrals</div>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <div className="text-2xl font-bold text-green-400">{referralStats.credited}</div>
              <div className="text-xs text-slate-400">Credits Granted</div>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <div className="text-2xl font-bold text-red-400">{referralStats.uncredited}</div>
              <div className="text-xs text-slate-400">Missing Credits</div>
            </div>
          </div>

          {/* Referral list */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Referral Activity</h3>
              <button
                onClick={() => { setReferrals([]); setReferralsLoading(false) }}
                className="text-xs text-slate-400 hover:text-white transition"
              >
                Refresh
              </button>
            </div>
            {referralsLoading ? (
              <div className="flex items-center justify-center h-32 text-slate-500">Loading...</div>
            ) : referrals.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-500">No referrals yet</div>
            ) : (
              <div className="divide-y divide-slate-700 max-h-[600px] overflow-y-auto">
                {referrals.map((r, i) => (
                  <div key={i} className="px-4 py-3 flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${r.credits_granted ? 'bg-green-400' : 'bg-red-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white">
                        <span className="font-medium text-cyan-400">{r.referrer_name}</span>
                        <span className="text-slate-500 mx-1.5">&rarr;</span>
                        <span className="font-medium">{r.referred_name}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(r.referred_at).toLocaleDateString()} {new Date(r.referred_at).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {r.credits_granted ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                          <Check className="w-3 h-3" /> 100 credited
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                          <X className="w-3 h-3" /> Not credited
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'notifications' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Template List */}
            <div>
              <h2 className="text-xl font-bold text-white mb-4">Email Templates</h2>
              <p className="text-slate-400 text-sm mb-4">
                Templates are configured in Supabase Dashboard &rarr; Authentication &rarr; Email Templates.
                Send a test to see the actual email users receive.
              </p>
              <div className="space-y-3">
                {EMAIL_TEMPLATES.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => { setSelectedTemplate(t.id); setTestResult(null) }}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                      selectedTemplate === t.id
                        ? 'border-yellow-500/50 bg-yellow-500/5'
                        : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-1">
                      <Mail className={`w-5 h-5 ${selectedTemplate === t.id ? 'text-yellow-400' : 'text-slate-400'}`} />
                      <span className="font-bold text-white">{t.name}</span>
                    </div>
                    <p className="text-xs text-slate-500 ml-8 mt-1">{t.description}</p>
                    <div className="ml-8 mt-2">
                      <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono">
                        {t.supabaseEvent}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Send Test */}
            <div>
              {selectedTemplate ? (
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                  <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    <Send className="w-5 h-5 text-yellow-400" />
                    Send Test: {EMAIL_TEMPLATES.find(t => t.id === selectedTemplate)?.name}
                  </h3>
                  <p className="text-sm text-slate-400 mb-5">
                    {EMAIL_TEMPLATES.find(t => t.id === selectedTemplate)?.description}
                  </p>
                  <p className="text-xs text-slate-500 mb-4">
                    Triggers a real Supabase <span className="font-mono text-slate-400">{EMAIL_TEMPLATES.find(t => t.id === selectedTemplate)?.supabaseEvent}</span> event.
                    For magic link and recovery, use an existing user&apos;s email.
                  </p>
                  <div>
                    <label className="block text-sm text-slate-300 mb-2">Send to</label>
                    <div className="flex gap-3">
                      <input
                        type="email"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white text-sm"
                      />
                      <button
                        onClick={sendTestEmail}
                        disabled={sendingTest || !testEmail}
                        className="bg-yellow-500 hover:bg-yellow-400 disabled:bg-slate-600 text-slate-900 font-bold py-2 px-5 rounded-lg text-sm transition whitespace-nowrap"
                      >
                        {sendingTest ? 'Sending...' : 'Send Test'}
                      </button>
                    </div>
                  </div>
                  {testResult && (
                    <div className={`mt-4 p-3 rounded-lg text-sm ${
                      testResult.ok
                        ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                        : 'bg-red-500/20 border border-red-500/30 text-red-400'
                    }`}>
                      <div>{testResult.message}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 bg-slate-800 rounded-xl border border-slate-700">
                  <p className="text-slate-500">Select a template to send a test</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
