'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
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
  Clock,
  Lock,
  LucideIcon,
} from 'lucide-react'

const GAME_ICONS: Record<string, LucideIcon> = {
  emoji_keypad: Target,
  image_rotate: RotateCw,
  reaction_time: Zap,
  whack_a_mole: Hammer,
  typing_speed: Keyboard,
  mental_math: Calculator,
  color_match: Palette,
  visual_diff: ScanEye,
  audio_pattern: Music,
  drag_sort: GripVertical,
  follow_me: Pencil,
  duck_shoot: Crosshair,
}

const GAME_COLORS: Record<string, { bg: string; bgHover: string; icon: string; border: string; accent: string }> = {
  emoji_keypad: {
    bg: 'bg-rose-500/10',
    bgHover: 'hover:bg-rose-500/20',
    icon: 'text-rose-400',
    border: 'border-rose-500/30 hover:border-rose-400/50',
    accent: 'text-rose-400',
  },
  image_rotate: {
    bg: 'bg-sky-500/10',
    bgHover: 'hover:bg-sky-500/20',
    icon: 'text-sky-400',
    border: 'border-sky-500/30 hover:border-sky-400/50',
    accent: 'text-sky-400',
  },
  reaction_time: {
    bg: 'bg-amber-500/10',
    bgHover: 'hover:bg-amber-500/20',
    icon: 'text-amber-400',
    border: 'border-amber-500/30 hover:border-amber-400/50',
    accent: 'text-amber-400',
  },
  whack_a_mole: {
    bg: 'bg-green-500/10',
    bgHover: 'hover:bg-green-500/20',
    icon: 'text-green-400',
    border: 'border-green-500/30 hover:border-green-400/50',
    accent: 'text-green-400',
  },
  typing_speed: {
    bg: 'bg-violet-500/10',
    bgHover: 'hover:bg-violet-500/20',
    icon: 'text-violet-400',
    border: 'border-violet-500/30 hover:border-violet-400/50',
    accent: 'text-violet-400',
  },
  mental_math: {
    bg: 'bg-orange-500/10',
    bgHover: 'hover:bg-orange-500/20',
    icon: 'text-orange-400',
    border: 'border-orange-500/30 hover:border-orange-400/50',
    accent: 'text-orange-400',
  },
  color_match: {
    bg: 'bg-pink-500/10',
    bgHover: 'hover:bg-pink-500/20',
    icon: 'text-pink-400',
    border: 'border-pink-500/30 hover:border-pink-400/50',
    accent: 'text-pink-400',
  },
  visual_diff: {
    bg: 'bg-teal-500/10',
    bgHover: 'hover:bg-teal-500/20',
    icon: 'text-teal-400',
    border: 'border-teal-500/30 hover:border-teal-400/50',
    accent: 'text-teal-400',
  },
  audio_pattern: {
    bg: 'bg-indigo-500/10',
    bgHover: 'hover:bg-indigo-500/20',
    icon: 'text-indigo-400',
    border: 'border-indigo-500/30 hover:border-indigo-400/50',
    accent: 'text-indigo-400',
  },
  drag_sort: {
    bg: 'bg-lime-500/10',
    bgHover: 'hover:bg-lime-500/20',
    icon: 'text-lime-400',
    border: 'border-lime-500/30 hover:border-lime-400/50',
    accent: 'text-lime-400',
  },
  follow_me: {
    bg: 'bg-cyan-500/10',
    bgHover: 'hover:bg-cyan-500/20',
    icon: 'text-cyan-400',
    border: 'border-cyan-500/30 hover:border-cyan-400/50',
    accent: 'text-cyan-400',
  },
  duck_shoot: {
    bg: 'bg-emerald-500/10',
    bgHover: 'hover:bg-emerald-500/20',
    icon: 'text-emerald-400',
    border: 'border-emerald-500/30 hover:border-emerald-400/50',
    accent: 'text-emerald-400',
  },
}

interface GameInfo {
  id: string
  name: string
  description: string
  isActive: boolean
  isPlayable: boolean
  opensAt: string | null
  poolSize: number
  todayStats: {
    playerCount: number
    topScore: number
    turnCount: number
  }
}

interface GamesData {
  games: GameInfo[]
  pool: {
    totalCredits: number
    uniquePlayers: number
    totalTurns: number
  }
  msUntilSettlement: number
  utcDay: string
}

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return 'Settlement in progress'

  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))

  if (hours > 0) {
    return `${hours}h ${minutes}m left`
  }
  return `${minutes}m left`
}

function formatOpensAt(opensAt: string): string {
  const date = new Date(opensAt)
  const now = new Date()

  // If opens today, show time
  if (date.toDateString() === now.toDateString()) {
    return `Opens at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }

  // If opens tomorrow
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (date.toDateString() === tomorrow.toDateString()) {
    return `Opens tomorrow ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }

  // Otherwise show date and time
  return `Opens ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function GameTile({ game, msUntilSettlement }: { game: GameInfo; msUntilSettlement: number }) {
  const Icon = GAME_ICONS[game.id] || Target
  const colors = GAME_COLORS[game.id] || GAME_COLORS.emoji_keypad
  const isPlayable = game.isPlayable

  // Determine status badge
  let statusBadge: React.ReactNode
  if (isPlayable) {
    statusBadge = (
      <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {formatTimeLeft(msUntilSettlement)}
      </span>
    )
  } else if (game.isActive && game.opensAt) {
    // Scheduled to open
    statusBadge = (
      <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {formatOpensAt(game.opensAt)}
      </span>
    )
  } else {
    // Not active
    statusBadge = (
      <span className="text-xs bg-slate-600/50 text-slate-400 px-2 py-1 rounded-full flex items-center gap-1">
        <Lock className="w-3 h-3" />
        Not Active
      </span>
    )
  }

  const content = (
    <>
      <div className="flex items-start justify-between mb-3">
        <div className={`p-3 rounded-lg ${isPlayable ? colors.bg : 'bg-slate-600/30'}`}>
          <Icon className={`w-8 h-8 ${isPlayable ? colors.icon : 'text-slate-500'}`} />
        </div>
        {statusBadge}
      </div>

      <h3 className={`text-lg font-bold mb-1 ${isPlayable ? 'text-white' : 'text-slate-400'}`}>
        {game.name}
      </h3>
      <p className="text-sm text-slate-400 mb-4">{game.description}</p>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-900/50 rounded-lg py-2 px-1">
          <div className={`text-lg font-bold ${isPlayable ? 'text-yellow-400' : 'text-slate-500'}`}>
            {game.poolSize > 0 ? game.poolSize.toLocaleString() : '-'}
          </div>
          <div className="text-xs text-slate-500">$Credits Pool</div>
        </div>
        <div className="bg-slate-900/50 rounded-lg py-2 px-1">
          <div className={`text-lg font-bold ${isPlayable ? 'text-white' : 'text-slate-500'}`}>
            {game.todayStats.playerCount}
          </div>
          <div className="text-xs text-slate-500">Players</div>
        </div>
        <div className="bg-slate-900/50 rounded-lg py-2 px-1">
          <div className={`text-lg font-bold ${isPlayable ? colors.accent : 'text-slate-500'}`}>
            {game.todayStats.topScore > 0 ? game.todayStats.topScore.toLocaleString() : '-'}
          </div>
          <div className="text-xs text-slate-500">Top Score</div>
        </div>
      </div>
    </>
  )

  if (isPlayable) {
    return (
      <Link
        href={`/game?type=${game.id}`}
        className={`block ${colors.bg} ${colors.bgHover} rounded-xl p-6 transition hover:scale-[1.02] cursor-pointer border ${colors.border}`}
      >
        {content}
      </Link>
    )
  }

  return (
    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-800 opacity-70">
      {content}
    </div>
  )
}

export default function HomePage() {
  const [data, setData] = useState<GamesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeLeft, setTimeLeft] = useState(0)

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const res = await fetch('/api/games')
        if (res.ok) {
          const gamesData = await res.json()
          setData(gamesData)
          setTimeLeft(gamesData.msUntilSettlement)
        }
      } catch (err) {
        console.error('Failed to fetch games:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchGames()

    // Refresh every minute to update "opens at" times
    const refreshInterval = setInterval(fetchGames, 60000)
    return () => clearInterval(refreshInterval)
  }, [])

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) return

    const interval = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [timeLeft])

  const playableGames = data?.games.filter(g => g.isPlayable) || []
  const scheduledGames = data?.games.filter(g => !g.isPlayable && g.isActive && g.opensAt) || []
  const inactiveGames = data?.games.filter(g => !g.isActive) || []

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Hero Section */}
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          Daily Skill Games
        </h1>
        <p className="text-xl text-slate-300 max-w-2xl mx-auto">
          Prove you&apos;re human by competing in daily skill-based games.
          Win $Credits, climb the leaderboard, and claim your share of the daily pool!
        </p>
      </div>

      {/* Pool Info Bar */}
      {data && (
        <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-xl p-4 mb-8">
          <div className="flex flex-wrap items-center justify-center gap-6 text-center">
            <div>
              <div className="text-2xl font-bold text-yellow-400">
                {data.pool.totalCredits} $Credits
              </div>
              <div className="text-sm text-slate-400">Total Across All Games</div>
            </div>
            <div className="h-8 w-px bg-slate-600 hidden sm:block"></div>
            <div>
              <div className="text-2xl font-bold text-white">
                {data.pool.uniquePlayers}
              </div>
              <div className="text-sm text-slate-400">Total Players</div>
            </div>
            <div className="h-8 w-px bg-slate-600 hidden sm:block"></div>
            <div>
              <div className="text-2xl font-bold text-blue-400">
                {formatTimeLeft(timeLeft)}
              </div>
              <div className="text-sm text-slate-400">Until Settlement</div>
            </div>
          </div>
        </div>
      )}

      {/* Games Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-slate-800 rounded-xl p-6 animate-pulse">
              <div className="h-12 w-12 bg-slate-700 rounded-lg mb-3"></div>
              <div className="h-5 bg-slate-700 rounded w-2/3 mb-2"></div>
              <div className="h-4 bg-slate-700 rounded w-full mb-4"></div>
              <div className="grid grid-cols-3 gap-2">
                <div className="h-12 bg-slate-700 rounded"></div>
                <div className="h-12 bg-slate-700 rounded"></div>
                <div className="h-12 bg-slate-700 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      ) : data ? (
        <>
          {/* Active Games */}
          {playableGames.length > 0 && (
            <>
              <h2 className="text-2xl font-bold text-white mb-6">Play Now</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
                {playableGames.map(game => (
                  <GameTile
                    key={game.id}
                    game={game}
                    msUntilSettlement={timeLeft}
                  />
                ))}
              </div>
            </>
          )}

          {/* Scheduled Games */}
          {scheduledGames.length > 0 && (
            <>
              <h2 className="text-xl font-bold text-slate-400 mb-4">Coming Soon</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
                {scheduledGames.map(game => (
                  <GameTile
                    key={game.id}
                    game={game}
                    msUntilSettlement={timeLeft}
                  />
                ))}
              </div>
            </>
          )}

          {/* Inactive Games */}
          {inactiveGames.length > 0 && (
            <>
              <h2 className="text-xl font-bold text-slate-500 mb-4">Not Available</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {inactiveGames.map(game => (
                  <GameTile
                    key={game.id}
                    game={game}
                    msUntilSettlement={timeLeft}
                  />
                ))}
              </div>
            </>
          )}

          {playableGames.length === 0 && scheduledGames.length === 0 && inactiveGames.length === 0 && (
            <div className="text-center text-slate-400 py-12">
              No games configured yet.
            </div>
          )}
        </>
      ) : (
        <div className="text-center text-slate-400 py-12">
          Failed to load games. Please refresh the page.
        </div>
      )}

      {/* How It Works */}
      <div className="mt-16">
        <h2 className="text-2xl font-bold text-white text-center mb-8">How It Works</h2>
        <div className="grid md:grid-cols-4 gap-6">
          <div className="bg-slate-800 rounded-xl p-6 text-center">
            <div className="text-4xl font-bold text-blue-400 mb-4">1</div>
            <h3 className="font-semibold text-white mb-2">Sign Up</h3>
            <p className="text-slate-400 text-sm">Create account and verify email</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-6 text-center">
            <div className="text-4xl font-bold text-blue-400 mb-4">2</div>
            <h3 className="font-semibold text-white mb-2">Claim $Credits</h3>
            <p className="text-slate-400 text-sm">Get 5 free $Credits every day</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-6 text-center">
            <div className="text-4xl font-bold text-blue-400 mb-4">3</div>
            <h3 className="font-semibold text-white mb-2">Play</h3>
            <p className="text-slate-400 text-sm">Spend 1 $Credit per game turn</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-6 text-center">
            <div className="text-4xl font-bold text-blue-400 mb-4">4</div>
            <h3 className="font-semibold text-white mb-2">Win</h3>
            <p className="text-slate-400 text-sm">Top scorer wins the daily pool!</p>
          </div>
        </div>
      </div>

      {/* CTA for non-logged in users */}
      <div className="mt-12 text-center">
        <div className="inline-flex gap-4">
          <Link
            href="/auth/signup"
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-lg transition"
          >
            Get Started
          </Link>
          <Link
            href="/auth/login"
            className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-8 rounded-lg transition"
          >
            Login
          </Link>
        </div>
      </div>
    </div>
  )
}
