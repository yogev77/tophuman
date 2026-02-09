'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useCreditsNotification } from '@/components/CreditsNotificationProvider'
import { useTheme } from '@/hooks/useTheme'
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
  LayoutGrid,
  Hash,
  ParkingSquare,
  Clock,
  Lock,
  Crown,
  Users,
  LucideIcon,
  Share2,
  Copy,
  Check,
  Gamepad2,
  Trophy,
  TrendingUp,
  Sun,
  Moon,
} from 'lucide-react'
import { C, CC } from '@/lib/currency'

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
  memory_cards: LayoutGrid,
  number_chain: Hash,
  gridlock: ParkingSquare,
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
  memory_cards: { bg: 'bg-fuchsia-500/20', icon: 'text-fuchsia-400' },
  number_chain: { bg: 'bg-red-500/20', icon: 'text-red-400' },
  gridlock: { bg: 'bg-blue-500/20', icon: 'text-blue-400' },
}


interface TopPlayerEntry {
  gameId: string
  gameName: string
  playerName: string
  playerUsername: string | null
  score: number
  poolSize?: number
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
    topPlayerName: string | null
    topPlayerUsername: string | null
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

function abbreviateNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return n.toLocaleString()
}

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return 'Settling...'

  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
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

function TopPlayersTicker({ games }: { games: GameInfo[] }) {
  const [shouldAnimate, setShouldAnimate] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const topPlayers = games.filter(g => g.todayStats.topPlayerName && g.todayStats.topScore > 0)

  useEffect(() => {
    if (containerRef.current && contentRef.current) {
      const containerWidth = containerRef.current.offsetWidth
      const contentWidth = contentRef.current.scrollWidth
      setShouldAnimate(contentWidth > containerWidth)
    }
  }, [topPlayers])

  if (topPlayers.length === 0) return null

  const tickerItems = topPlayers.map(game => {
    const Icon = GAME_ICONS[game.id] || Target
    const iconColors = GAME_ICON_COLORS[game.id] || GAME_ICON_COLORS.emoji_keypad

    return (
      <div key={game.id} className="flex items-center gap-2 px-4 whitespace-nowrap">
        <Link href={`/game?type=${game.id}`} className={`p-1.5 rounded ${iconColors.bg} hover:opacity-80 transition`}>
          <Icon className={`w-4 h-4 ${iconColors.icon}`} />
        </Link>
        <Crown className="w-3 h-3 text-yellow-400" />
        {game.todayStats.topPlayerUsername ? (
          <Link href={`/player/${game.todayStats.topPlayerUsername}`} className="tap-highlight text-white font-medium hover:text-yellow-400 transition">
            {game.todayStats.topPlayerName}
          </Link>
        ) : (
          <span className="text-white font-medium">{game.todayStats.topPlayerName}</span>
        )}
        <span className="text-green-400 font-bold">{game.todayStats.topScore.toLocaleString()}</span>
        <span className="text-yellow-400"><CC />{game.poolSize}</span>
      </div>
    )
  })

  return (
    <div ref={containerRef} className="mb-8 overflow-hidden">
      <div
        ref={contentRef}
        className={`flex items-center py-3 ${shouldAnimate ? 'animate-ticker hover:pause-animation' : 'justify-center'}`}
        style={shouldAnimate ? { width: 'max-content' } : undefined}
      >
        {tickerItems}
        {shouldAnimate && tickerItems}
      </div>
    </div>
  )
}

function GameTile({ game, msUntilSettlement }: { game: GameInfo; msUntilSettlement: number }) {
  const Icon = GAME_ICONS[game.id] || Target
  const iconColors = GAME_ICON_COLORS[game.id] || GAME_ICON_COLORS.emoji_keypad
  const isPlayable = game.isPlayable

  const content = (
    <div className="relative">
      {isPlayable && (
        <span className="absolute top-0 right-0 text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full items-center gap-1 hidden sm:flex">
          <Clock className="w-3 h-3" />
          {formatTimeLeft(msUntilSettlement)}
        </span>
      )}
      <div className="flex items-start gap-3 mb-6">
        <div className={`p-4 rounded-lg shrink-0 ${isPlayable ? iconColors.bg : 'bg-slate-600/30'}`}>
          <Icon className={`w-7 h-7 ${isPlayable ? iconColors.icon : 'text-slate-500'}`} />
        </div>
        <div className="min-w-0 pr-16">
          <h3 className={`text-base font-bold font-title leading-tight ${isPlayable ? 'text-white' : 'text-slate-400'}`}>
            {game.name}
          </h3>
          <p className="text-xs text-slate-400 leading-normal mt-0.5 line-clamp-2">{game.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 text-center bg-slate-900/50 rounded-t-lg">
        <div className="py-2 px-1">
          <div className={`text-sm font-bold ${isPlayable ? 'text-yellow-400' : 'text-slate-500'}`}>
            {game.poolSize > 0 ? `${game.poolSize.toLocaleString()}` : '-'}
          </div>
          <div className="text-[10px] text-slate-500"><CC />Credit Pool</div>
        </div>
        <div className="py-2 px-1">
          <div className={`text-sm font-bold ${isPlayable ? 'text-white' : 'text-slate-500'}`}>
            {game.todayStats.playerCount}
          </div>
          <div className="text-[10px] text-slate-500">Players</div>
        </div>
        <div className="py-2 px-1">
          <div className={`text-sm font-bold ${isPlayable ? 'text-green-400' : 'text-slate-500'}`}>
            {game.todayStats.topScore > 0 ? game.todayStats.topScore.toLocaleString() : '-'}
          </div>
          <div className="text-[10px] text-slate-500">Top Score</div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-1.5 py-2 bg-slate-900/50 rounded-b-lg border-t border-slate-700/50">
        {game.todayStats.topPlayerName && game.todayStats.topScore > 0 ? (
          <>
            <Crown className="w-3.5 h-3.5 text-yellow-400" />
            {game.todayStats.topPlayerUsername ? (
              <Link
                href={`/player/${game.todayStats.topPlayerUsername}`}
                className="tap-highlight text-xs text-white font-medium truncate max-w-[120px] hover:text-yellow-400 transition"
                onClick={(e) => e.stopPropagation()}
              >
                {game.todayStats.topPlayerName}
              </Link>
            ) : (
              <span className="text-xs text-white font-medium truncate max-w-[120px]">{game.todayStats.topPlayerName}</span>
            )}
            <span className="text-xs text-green-400 font-bold">{game.todayStats.topScore.toLocaleString()}</span>
          </>
        ) : (
          <>
            <span className="text-xs text-slate-400">Take the Crown</span>
            <Crown className="w-3.5 h-3.5 text-slate-500" />
          </>
        )}
      </div>
    </div>
  )

  if (isPlayable) {
    return (
      <Link
        href={`/game?type=${game.id}`}
        className="block bg-slate-800 rounded-xl p-4 transition-transform duration-150 hover:scale-[1.03] active:scale-[0.97] cursor-pointer"
      >
        {content}
      </Link>
    )
  }

  return (
    <div className="bg-slate-800/50 rounded-xl p-4 opacity-70">
      {content}
    </div>
  )
}

export default function HomePage() {
  const { user, loading: authLoading } = useAuth()
  const { balance, displayName, username: profileUsername, loading: creditsLoading, isCounterAnimating, hasUnseenNotification } = useCreditsNotification()
  const { theme, toggleTheme } = useTheme()
  const userName = displayName || (user?.email ? user.email.split('@')[0] : '?')
  const [data, setData] = useState<GamesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeLeft, setTimeLeft] = useState(0)
  const [showSharePopup, setShowSharePopup] = useState(false)
  const [isSticky, setIsSticky] = useState(false)
  const stickySentinelRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [topPlayersAllTime, setTopPlayersAllTime] = useState<TopPlayerEntry[]>([])
  const [topPlayersToday, setTopPlayersToday] = useState<TopPlayerEntry[]>([])
  const [topPlayersTab, setTopPlayersTab] = useState<'allTime' | 'today'>('today')
  const [siteTab, setSiteTab] = useState<'games' | 'topCharts'>('games')
  const sharePopupRef = useRef<HTMLDivElement>(null)

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/auth/signup` : ''

  // Click outside to close popup
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sharePopupRef.current && !sharePopupRef.current.contains(event.target as Node)) {
        setShowSharePopup(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Podium Arena!',
          text: `Play skill games and win ${C}Credits! Join using my link:`,
          url: shareUrl,
        })
      } catch {
        handleCopy()
      }
    } else {
      handleCopy()
    }
  }

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

    // Fetch top players (all-time + today)
    fetch('/api/top-players')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.allTime) setTopPlayersAllTime(data.allTime)
        if (data?.today) setTopPlayersToday(data.today)
      })
      .catch(() => {})

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

  // Detect when sticky bar becomes stuck (sentinel scrolls out of view)
  useEffect(() => {
    const sentinel = stickySentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => setIsSticky(!entry.isIntersecting),
      { threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  const playableGames = useMemo(() => {
    const arr = data?.games.filter(g => g.isPlayable) || []
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }, [data])
  const scheduledGames = useMemo(() => {
    const arr = data?.games.filter(g => !g.isPlayable && g.isActive && g.opensAt) || []
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }, [data])
  const inactiveGames = useMemo(() => {
    const arr = data?.games.filter(g => !g.isActive) || []
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }, [data])

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Hero Section */}
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 font-title">
          New Champions. Every Day.
        </h1>
        <p className="text-xl text-slate-300">
          Top the charts. Take your share.
        </p>
      </div>

      {/* Pool Info Bar */}
      {data && (
        <div className="bg-white dark:bg-slate-800 rounded-xl px-4 sm:px-5 py-3 sm:py-4 mb-4">
          <div className="flex items-center justify-around sm:justify-between">
            <div className="flex-1 text-center hidden sm:block">
              <div className="text-2xl font-bold text-yellow-400"><CC />{data.pool.totalCredits} Credit Pool</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Across All Games Today</div>
            </div>
            <div className="h-8 w-px bg-slate-300 dark:bg-slate-600 hidden sm:block"></div>
            <div className="flex-1 text-center">
              <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{data.pool.uniquePlayers}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Playing</div>
            </div>
            <div className="h-8 w-px bg-slate-300 dark:bg-slate-600 hidden sm:block"></div>
            <div className="flex-1 text-center">
              <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">{formatTimeLeft(timeLeft)}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Until Settlement</div>
            </div>
          </div>
          <div className="sm:hidden mt-2 pt-2 border-t border-slate-300 dark:border-slate-700 text-center">
            <div className="text-xl font-bold text-yellow-400"><CC />{data.pool.totalCredits} Credit Pool</div>
            <div className="text-xs text-slate-400">Across All Games Today</div>
          </div>
        </div>
      )}

      {/* Top Players Ticker */}
      {data && <TopPlayersTicker games={data.games} />}

      {/* Sentinel for sticky detection */}
      <div ref={stickySentinelRef} className="h-0" />

      {/* Sticky Site Tab Controller */}
      <div className="sticky top-0 z-30 -mx-4 px-4 py-2 bg-slate-900/95 backdrop-blur-sm">
        <div className="relative flex items-center justify-center">
          {/* Logo - absolutely positioned left, visible when stuck */}
          <Link href="/" className={`absolute left-0 hidden items-center gap-2 text-lg font-bold text-white font-title transition-opacity duration-200 ${isSticky ? 'xl:flex opacity-100' : 'xl:hidden opacity-0'}`}>
            <Trophy className="w-5 h-5 text-yellow-400" />
            Podium Arena
          </Link>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-800 rounded-xl p-1 w-full md:w-1/2">
            <button
              onClick={() => setSiteTab('games')}
              className={`flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
                siteTab === 'games'
                  ? 'bg-yellow-500 text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Gamepad2 className="w-4 h-4" />
              Games
            </button>
            <button
              onClick={() => setSiteTab('topCharts')}
              className={`flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
                siteTab === 'topCharts'
                  ? 'bg-yellow-500 text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Trophy className="w-4 h-4" />
              Top Charts
            </button>
          </div>

          {/* Header elements - absolutely positioned right, visible when stuck */}
          <div className={`absolute right-0 hidden items-center gap-3 transition-opacity duration-200 ${isSticky ? 'xl:flex opacity-100' : 'xl:hidden opacity-0'}`}>
            {!authLoading && user ? (
              <>
                {!creditsLoading && (
                  <span className={`relative text-yellow-400 font-semibold text-sm ${isCounterAnimating ? 'credit-counter-animate' : ''}`}>
                    <CC />{balance} Credits
                    {hasUnseenNotification && (
                      <span className="absolute -top-1 -right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    )}
                  </span>
                )}
                <Link
                  href={profileUsername ? `/player/${profileUsername}` : '/profile'}
                  className="tap-highlight text-slate-400 hover:text-white text-sm transition"
                >
                  {userName}
                </Link>
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
                  aria-label="Toggle theme"
                >
                  {theme === 'dark' ? (
                    <Sun className="w-5 h-5 text-yellow-400" />
                  ) : (
                    <Moon className="w-5 h-5 text-slate-600" />
                  )}
                </button>
              </>
            ) : !authLoading ? (
              <>
                <Link
                  href="/auth/signup"
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition text-slate-400 hover:text-white text-sm font-medium"
                >
                  Connect
                </Link>
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
                  aria-label="Toggle theme"
                >
                  {theme === 'dark' ? (
                    <Sun className="w-5 h-5 text-yellow-400" />
                  ) : (
                    <Moon className="w-5 h-5 text-slate-600" />
                  )}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Games Tab */}
      {siteTab === 'games' && (
        <div className="mt-6">
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                  <h2 className="text-2xl font-bold text-white mb-6 font-title">Play Now</h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
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
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
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
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
        </div>
      )}

      {/* Top Charts Tab */}
      {siteTab === 'topCharts' && (() => {
        const renderTable = (entries: TopPlayerEntry[], emptyLabel: string, showPool?: boolean) => {
          if (entries.length === 0) {
            return (
              <div className="text-center text-slate-500 py-8">
                No scores yet{emptyLabel}.
              </div>
            )
          }
          return (
            <div className="bg-slate-800 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-sm text-slate-400 font-medium px-3 sm:px-4 py-3">Game</th>
                    <th className="text-left text-sm text-slate-400 font-medium px-3 sm:px-4 py-3">Player</th>
                    <th className="text-right text-sm text-slate-400 font-medium px-2 py-3">Score</th>
                    {showPool && <th className="text-right text-sm text-yellow-500 font-medium px-3 sm:px-4 py-3 whitespace-nowrap"><CC />Pool</th>}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, i) => {
                    const Icon = GAME_ICONS[entry.gameId] || Target
                    const colors = GAME_ICON_COLORS[entry.gameId] || GAME_ICON_COLORS.emoji_keypad
                    return (
                      <tr key={entry.gameId} className={i < entries.length - 1 ? 'border-b border-slate-700/50' : ''}>
                        <td className="px-3 sm:px-4 py-3">
                          <Link href={`/game?type=${entry.gameId}`} className="tap-highlight flex items-center gap-2 sm:gap-3 hover:opacity-80 transition">
                            <div className={`p-1.5 rounded-lg shrink-0 ${colors.bg}`}>
                              <Icon className={`w-4 h-4 ${colors.icon}`} />
                            </div>
                            <span className="text-white text-sm font-medium leading-tight hover:text-yellow-400 transition">{entry.gameName}</span>
                          </Link>
                        </td>
                        <td className="px-3 sm:px-4 py-3">
                          {entry.playerUsername ? (
                            <Link href={`/player/${entry.playerUsername}`} className="tap-highlight text-slate-500 text-sm hover:text-yellow-400 transition">
                              {entry.playerName}
                            </Link>
                          ) : (
                            <span className="text-slate-500 text-sm">{entry.playerName}</span>
                          )}
                        </td>
                        <td className="px-2 py-3 text-right">
                          <span className="text-green-400 font-bold text-sm">{abbreviateNumber(entry.score)}</span>
                        </td>
                        {showPool && (
                          <td className="px-3 sm:px-4 py-3 text-right">
                            <span className="text-yellow-400 font-bold text-sm">{abbreviateNumber(entry.poolSize || 0)}</span>
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
          <div className="mt-6">
            {/* Desktop: side by side */}
            <div className="hidden lg:grid lg:grid-cols-2 lg:gap-6">
              <div>
                <h3 className="text-sm font-medium text-slate-400 mb-3 text-center uppercase tracking-wider">Today</h3>
                {renderTable(topPlayersToday, ' today', true)}
              </div>
              <div>
                <h3 className="text-sm font-medium text-slate-400 mb-3 text-center uppercase tracking-wider">All Time</h3>
                {renderTable(topPlayersAllTime, '')}
              </div>
            </div>

            {/* Mobile: tabs */}
            <div className="lg:hidden">
              <div className="flex justify-center gap-2 mb-4">
                <button
                  onClick={() => setTopPlayersTab('today')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    topPlayersTab === 'today'
                      ? 'bg-yellow-500 text-slate-900'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => setTopPlayersTab('allTime')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    topPlayersTab === 'allTime'
                      ? 'bg-yellow-500 text-slate-900'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  All Time
                </button>
              </div>
              {renderTable(
                topPlayersTab === 'allTime' ? topPlayersAllTime : topPlayersToday,
                topPlayersTab === 'today' ? ' today' : '',
                topPlayersTab === 'today'
              )}
            </div>
          </div>
        )
      })()}

      {/* See You on the Podium */}
      <div className="mt-16">
        <h2 className="text-2xl font-bold text-white text-center mb-8 font-title">See You on the Podium</h2>
        <div className="bg-slate-800 rounded-xl p-6 md:p-8">
          <div className="grid md:grid-cols-3 md:divide-x md:divide-slate-700">
            <div className="text-center px-6 py-4">
              <Gamepad2 className="w-8 h-8 text-yellow-400 mx-auto mb-4" />
              <h3 className="font-semibold text-white mb-2">Play</h3>
              <p className="text-slate-400 text-sm">One credit gets you into any game.</p>
            </div>
            <div className="text-center px-6 py-4">
              <TrendingUp className="w-8 h-8 text-yellow-400 mx-auto mb-4" />
              <h3 className="font-semibold text-white mb-2">Build the Pool</h3>
              <p className="text-slate-400 text-sm">Every play increases that game&apos;s daily pool.</p>
            </div>
            <div className="text-center px-6 py-4">
              <Trophy className="w-8 h-8 text-yellow-400 mx-auto mb-4" />
              <h3 className="font-semibold text-white mb-2">Take Your Spot</h3>
              <p className="text-slate-400 text-sm">Climb the leaderboard and take the largest share of that game.</p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA for non-logged in users */}
      {!user && (
        <div className="mt-12 text-center">
          <Link
            href="/auth/signup"
            className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg transition"
          >
            Get Started
          </Link>
        </div>
      )}

      {/* Play With Friends Footer */}
      <div className="mt-16 mb-8 text-center relative">
        <button
          onClick={() => setShowSharePopup(!showSharePopup)}
          className="inline-flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg transition"
        >
          <Users className="w-5 h-5" />
          Play With Friends
        </button>
        <p className="mt-4 text-slate-400">
          Invite friends and get <span className="text-yellow-400 font-bold">100 <CC />Credits</span> when they join!
        </p>

        {showSharePopup && (
          <div
            ref={sharePopupRef}
            className="absolute left-1/2 -translate-x-1/2 bottom-full mb-4 w-80 bg-slate-800 rounded-xl shadow-xl border border-slate-700 z-50 overflow-hidden"
          >
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Share2 className="w-4 h-4 text-yellow-400" />
                <span className="text-white font-semibold">Invite Friends</span>
              </div>
              <p className="text-sm text-slate-400 mb-3 text-left">
                Get <span className="text-yellow-400 font-bold">100 <CC />Credits</span> when friends join!
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex-1 flex items-center justify-center gap-2 border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 px-3 py-2 rounded-lg transition text-sm"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <button
                  onClick={handleShare}
                  className="flex-1 flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-slate-900 px-3 py-2 rounded-lg transition text-sm"
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
