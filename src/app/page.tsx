'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Link } from 'next-view-transitions'
import {
  Target,
  Crown,
  List,
  Grid3X3,
  Users,
  Share2,
  Copy,
  Check,
  Gamepad2,
  Trophy,
  TrendingUp,
  Radar,
  Zap,
  Cog,
  Crosshair as CrosshairIcon,
  Brain,
  Shapes,
} from 'lucide-react'
import { C, CC } from '@/lib/currency'
import { GameThumbnail } from '@/components/GameThumbnail'
import { GAMES, SKILL_LIST, SKILLS, LOGO_POLYGONS, getSkillForGame, SkillId } from '@/lib/skills'
import { GAME_ICONS } from '@/lib/game-icons'
import { useCreditsNotification } from '@/components/CreditsNotificationProvider'
import { useTheme } from '@/hooks/useTheme'
import { Sun, Moon } from 'lucide-react'

const SKILL_ICONS: Record<SkillId, typeof Zap> = {
  reflex: Zap,
  logic: Cog,
  focus: CrosshairIcon,
  memory: Brain,
  pattern: Shapes,
}


interface TopPlayerEntry {
  gameId: string
  gameName: string
  playerName: string
  playerUsername: string | null
  score: number
  poolSize?: number
}

interface TopSkillEntry {
  skillId: SkillId
  skillName: string
  playerName: string | null
  playerUsername: string | null
  skillScore: number
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

function GameTile({ game }: { game: GameInfo }) {
  const Icon = GAME_ICONS[game.id] || Target
  const iconColors = GAMES[game.id]?.iconColors || GAMES.emoji_keypad.iconColors
  const isPlayable = game.isPlayable

  const skill = getSkillForGame(game.id)

  const content = (
    <div className="relative">
      {/* Skill label — top right */}
      {skill && (
        <div className="absolute top-0 right-0 z-10">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${skill.colors.bg} ${skill.colors.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${skill.colors.dot}`} />
            {skill.name}
          </span>
        </div>
      )}
      <div className="flex items-start gap-3 mb-3">
        <div className="shrink-0">
          <Icon className={`w-7 h-7 ${isPlayable ? iconColors.icon : 'text-slate-500'}`} />
        </div>
        <div className="min-w-0 pr-24">
          <h3 className={`text-base font-bold font-title leading-tight ${isPlayable ? 'text-white' : 'text-slate-400'}`}>
            {game.name}
          </h3>
          <p className="text-xs text-slate-400 leading-normal mt-0.5 line-clamp-2">{game.description}</p>
        </div>
      </div>

      <div className="mb-3">
        <GameThumbnail gameId={game.id} isPlayable={isPlayable} />
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
        href={`/game/${game.id}`}
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
  const { user } = useAuth()
  const { balance, displayName, username: profileUsername } = useCreditsNotification()
  const { theme, toggleTheme } = useTheme()
  const [data, setData] = useState<GamesData | null>(null)
  const [isSticky, setIsSticky] = useState(false)
  const stickySentinelRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [timeLeft, setTimeLeft] = useState(0)
  const [showSharePopup, setShowSharePopup] = useState(false)
  const [copied, setCopied] = useState(false)
  const [topPlayersAllTime, setTopPlayersAllTime] = useState<TopPlayerEntry[]>(() => {
    if (typeof window === 'undefined') return []
    try { const c = sessionStorage.getItem('topPlayersAllTime'); return c ? JSON.parse(c) : [] } catch { return [] }
  })
  const [topPlayersToday, setTopPlayersToday] = useState<TopPlayerEntry[]>(() => {
    if (typeof window === 'undefined') return []
    try { const c = sessionStorage.getItem('topPlayersToday'); return c ? JSON.parse(c) : [] } catch { return [] }
  })
  const [topPlayersTab, setTopPlayersTab] = useState<'allTime' | 'today'>('today')
  const [topSkillsToday, setTopSkillsToday] = useState<TopSkillEntry[]>(() => {
    if (typeof window === 'undefined') return []
    try { const c = sessionStorage.getItem('topSkillsToday'); return c ? JSON.parse(c) : [] } catch { return [] }
  })
  const [topSkillsAllTime, setTopSkillsAllTime] = useState<TopSkillEntry[]>(() => {
    if (typeof window === 'undefined') return []
    try { const c = sessionStorage.getItem('topSkillsAllTime'); return c ? JSON.parse(c) : [] } catch { return [] }
  })

  const [siteTab, setSiteTab] = useState<'games' | 'topCharts'>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('homeSiteTab')
      if (saved === 'games' || saved === 'topCharts') return saved
    }
    return 'games'
  })
  const setAndSaveSiteTab = (tab: 'games' | 'topCharts') => {
    setSiteTab(tab)
    sessionStorage.setItem('homeSiteTab', tab)
  }
  const [viewMode, setViewMode] = useState<'list' | 'icons' | 'skills'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('gameViewMode')
      if (saved === 'list' || saved === 'icons' || saved === 'skills') return saved
      return 'list'
    }
    return 'list'
  })
  const setAndSaveViewMode = (mode: 'list' | 'icons' | 'skills') => {
    setViewMode(mode)
    localStorage.setItem('gameViewMode', mode)
    // Scroll to sentinel so sticky bar sits at top and games content starts right below
    if (stickySentinelRef.current) {
      stickySentinelRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }
  const [skillFilters, setSkillFilters] = useState<Set<SkillId>>(new Set())
  const toggleSkillFilter = (id: SkillId) => {
    setSkillFilters(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const stickyBarRef = useRef<HTMLDivElement>(null)
  const sharePopupRef = useRef<HTMLDivElement>(null)

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/auth/signup` : ''
  const shareText = 'Compete across 5 mind skills on Podium Arena. Clock resets daily.'

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

  const handleInvite = async () => {
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    if (isMobile && navigator.share) {
      try { await navigator.share({ title: 'Podium Arena', text: shareText, url: shareUrl }); return } catch {}
    }
    try {
      await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
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
        if (data?.allTime) { setTopPlayersAllTime(data.allTime); try { sessionStorage.setItem('topPlayersAllTime', JSON.stringify(data.allTime)) } catch {} }
        if (data?.today) { setTopPlayersToday(data.today); try { sessionStorage.setItem('topPlayersToday', JSON.stringify(data.today)) } catch {} }
      })
      .catch(() => {})

    fetch('/api/top-skills')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.today) { setTopSkillsToday(data.today); try { sessionStorage.setItem('topSkillsToday', JSON.stringify(data.today)) } catch {} }
        if (data?.allTime) { setTopSkillsAllTime(data.allTime); try { sessionStorage.setItem('topSkillsAllTime', JSON.stringify(data.allTime)) } catch {} }
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

  // Save scroll position so returning from game page restores it
  const scrollTick = useRef(false)
  const handleScroll = useCallback(() => {
    if (scrollTick.current) return
    scrollTick.current = true
    requestAnimationFrame(() => {
      sessionStorage.setItem('homeScrollY', String(window.scrollY))
      scrollTick.current = false
    })
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // Restore scroll position — set min-height on body so there's room, then scroll
  useEffect(() => {
    const saved = sessionStorage.getItem('homeScrollY')
    if (saved) {
      const y = parseInt(saved, 10)
      if (y > 0) {
        document.body.style.minHeight = `${y + window.innerHeight}px`
        window.scrollTo(0, y)
      }
    }
  }, [])

  // Clear body min-height once real content has loaded
  useEffect(() => {
    if (data) document.body.style.minHeight = ''
  }, [data])

  const rotatedSkillList = useMemo(() => {
    if (typeof window === 'undefined') return SKILL_LIST
    const now = Date.now()
    const lastVisit = parseInt(localStorage.getItem('skillRotationTs') || '0', 10)
    const offset = parseInt(localStorage.getItem('skillRotation') || '0', 10) % SKILL_LIST.length
    // Rotate only if 10+ minutes since last visit
    if (now - lastVisit > 10 * 60 * 1000) {
      const next = (offset + 1) % SKILL_LIST.length
      localStorage.setItem('skillRotation', String(next))
      localStorage.setItem('skillRotationTs', String(now))
      return [...SKILL_LIST.slice(next), ...SKILL_LIST.slice(0, next)]
    }
    localStorage.setItem('skillRotationTs', String(now))
    return [...SKILL_LIST.slice(offset), ...SKILL_LIST.slice(0, offset)]
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
      {/* Hero Illustration — mask bottom 30% */}
      <div className="flex justify-center mb-2">
        <div className="overflow-hidden w-full max-w-xl md:max-w-2xl">
          <img
            src="/hero-illustration.png"
            alt="Skill characters"
            className="w-full h-auto"
            style={{ marginBottom: '-20%' }}
            draggable={false}
          />
        </div>
      </div>

      <h1 className="text-4xl md:text-5xl font-bold text-yellow-500 font-title text-center mb-2">Daily Mind Battles</h1>

      {/* Today's Stats */}
      <div className="text-center mb-6 text-base md:text-lg text-slate-500 dark:text-slate-400 min-h-[52px] md:min-h-[32px] flex items-center justify-center">
        {data ? (
          <div className="animate-[fadeIn_300ms_ease-out]">
            <span className="text-yellow-500 font-semibold"><CC />{data.pool.totalCredits}</span> Total Pool
            <span className="mx-3">·</span>
            <span className="text-slate-900 dark:text-white font-semibold">{data.pool.uniquePlayers}</span> {data.pool.uniquePlayers === 1 ? 'Player' : 'Players'}
            <br className="md:hidden" /><span className="hidden md:inline mx-3">·</span>
            Settlement in <span className="text-green-600 dark:text-green-400 font-semibold">{formatTimeLeft(timeLeft)}</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>

      {/* Sentinel for sticky detection */}
      <div ref={stickySentinelRef} className="h-0" />

      {/* Sticky Site Tab Controller */}
      <div ref={stickyBarRef} className={`sticky top-0 z-30 -mx-4 px-4 py-2 bg-slate-900/95 backdrop-blur-sm ${isSticky ? 'sticky-bar-enter border-b border-slate-800' : ''}`}>
        <div className={`flex items-center gap-3 ${isSticky ? 'justify-between' : 'justify-center'}`}>
          {isSticky && (
            <Link href="/" className="hidden sm:flex items-center gap-2 text-lg font-bold text-white font-title shrink-0">
              <svg viewBox="104 96 304 290" className="w-7 h-7 shrink-0">
                {LOGO_POLYGONS.map(p => (
                  <polygon key={p.skill} fill={SKILLS[p.skill].hex} points={p.points} />
                ))}
              </svg>
              <span className="hidden sm:inline">Podium Arena</span>
            </Link>
          )}
          <div className={`flex gap-1 bg-slate-800 rounded-xl p-1 ${isSticky ? 'flex-1 sm:max-w-sm' : 'w-full md:w-1/2'}`}>
            <button
              onClick={() => setAndSaveSiteTab('games')}
              className={`flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
                siteTab === 'games'
                  ? 'bg-yellow-500 text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Gamepad2 className="w-4 h-4" />
              {isSticky ? <><span className="sm:hidden">Top Games</span><span className="hidden sm:inline">Games</span></> : 'Games'}
            </button>
            <button
              onClick={() => setAndSaveSiteTab('topCharts')}
              className={`flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${
                siteTab === 'topCharts'
                  ? 'bg-yellow-500 text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Trophy className="w-4 h-4" />
              {isSticky ? <><span className="sm:hidden">Top Charts</span><span className="hidden sm:inline">Charts</span></> : 'Charts'}
            </button>
          </div>
          {isSticky && (
            <div className="hidden sm:flex items-center gap-3 shrink-0">
              {user && (
                <>
                  <span className="hidden sm:inline text-yellow-400 font-semibold text-sm"><CC />{balance}</span>
                  <Link
                    href={profileUsername ? `/player/${profileUsername}` : '/profile'}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white font-semibold text-sm transition"
                  >
                    {(profileUsername || displayName || '?')[0].toUpperCase()}
                  </Link>
                </>
              )}
              <button
                onClick={toggleTheme}
                className="hidden sm:block p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-yellow-400" />
                ) : (
                  <Moon className="w-4 h-4 text-slate-600" />
                )}
              </button>
            </div>
          )}
        </div>
        {siteTab === 'games' && (
          <div className="flex items-center justify-between gap-3 mt-2">
            <div className="flex bg-slate-800 rounded-lg p-0.5 overflow-x-auto min-w-0">
              {SKILL_LIST.map(skill => {
                const isOn = skillFilters.has(skill.id)
                return (
                  <button
                    key={skill.id}
                    onClick={() => toggleSkillFilter(skill.id)}
                    className="shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold transition"
                    style={{ color: isOn ? skill.hex : undefined }}
                  >
                    {skill.name}
                  </button>
                )
              })}
            </div>
            <div className="flex bg-slate-800 rounded-lg p-0.5 shrink-0">
              <button onClick={() => setAndSaveViewMode('list')} className={`px-3 py-1.5 rounded-md transition ${viewMode === 'list' ? 'bg-yellow-500 text-slate-900' : 'text-slate-400 hover:text-white'}`} aria-label="List view"><List className="w-4 h-4" /></button>
              <button onClick={() => setAndSaveViewMode('icons')} className={`px-3 py-1.5 rounded-md transition ${viewMode === 'icons' ? 'bg-yellow-500 text-slate-900' : 'text-slate-400 hover:text-white'}`} aria-label="Icon view"><Grid3X3 className="w-4 h-4" /></button>
              <button onClick={() => setAndSaveViewMode('skills')} className={`px-3 py-1.5 rounded-md transition ${viewMode === 'skills' ? 'bg-yellow-500 text-slate-900' : 'text-slate-400 hover:text-white'}`} aria-label="Skills view"><Radar className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      {/* Games Tab */}
      {siteTab === 'games' && (
        <div className="mt-6">
          {loading ? (
            <>
              {viewMode === 'list' ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
                  {Object.values(GAMES).map(gameDef => (
                    <div key={gameDef.id} className="bg-white dark:bg-slate-800 rounded-xl p-4 animate-pulse">
                      <div className="h-[83px] bg-slate-200 dark:bg-slate-700 rounded-lg mb-3" />
                      <div className="flex items-center gap-2">
                        {(() => { const Icon = GAME_ICONS[gameDef.id] || Target; return <Icon className={`w-5 h-5 ${gameDef.iconColors.icon}`} /> })()}
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{gameDef.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : viewMode === 'icons' ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-10">
                  {Object.values(GAMES).map(gameDef => {
                    const Icon = GAME_ICONS[gameDef.id] || Target
                    return (
                      <div key={gameDef.id} className={`flex flex-col items-center text-center p-3 rounded-xl bg-white dark:bg-slate-800 border-b-4 ${SKILLS[gameDef.skill].colors.border}`}>
                        <div className={`p-3 rounded-2xl mb-2 ${gameDef.iconColors.bg}`}>
                          <Icon className={`w-7 h-7 ${gameDef.iconColors.icon}`} />
                        </div>
                        <span className="text-xs font-medium text-slate-900 dark:text-white leading-tight line-clamp-2">{gameDef.name}</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 animate-pulse">· · ·</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="space-y-6 mb-10">
                  {rotatedSkillList.map(skill => {
                    const skillGameDefs = Object.values(GAMES).filter(g => g.skill === skill.id)
                    if (skillGameDefs.length === 0) return null
                    const SkillIcon = SKILL_ICONS[skill.id]
                    return (
                      <div key={skill.id}>
                        <div className="flex items-center gap-2.5 mb-3">
                          <div className={`w-8 h-8 rounded-full ${skill.colors.bg} flex items-center justify-center`}>
                            <SkillIcon className={`w-4 h-4 ${skill.colors.textLight} dark:${skill.colors.text}`} />
                          </div>
                          <h3 className={`text-lg font-bold ${skill.colors.textLight} dark:${skill.colors.text}`}>{skill.name}</h3>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                          {skillGameDefs.map(gameDef => {
                            const Icon = GAME_ICONS[gameDef.id] || Target
                            return (
                              <div
                                key={gameDef.id}
                                className={`flex flex-col items-center text-center p-3 rounded-xl bg-white dark:bg-slate-800 border-b-4 ${skill.colors.border}`}
                              >
                                <div className={`p-3 rounded-2xl mb-2 ${gameDef.iconColors.bg}`}>
                                  <Icon className={`w-7 h-7 ${gameDef.iconColors.icon}`} />
                                </div>
                                <span className="text-xs font-medium text-slate-900 dark:text-white leading-tight line-clamp-2">{gameDef.name}</span>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 animate-pulse">· · ·</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : data ? (
            <>
              {/* Active Games */}
              {playableGames.length > 0 && (
                <>
                  {viewMode === 'list' ? (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
                      {(skillFilters.size > 0 ? playableGames.filter(g => skillFilters.has(GAMES[g.id]?.skill as SkillId)) : playableGames).map(game => (
                        <GameTile key={game.id} game={game} />
                      ))}
                    </div>
                  ) : viewMode === 'icons' ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-10">
                      {(skillFilters.size > 0 ? playableGames.filter(g => skillFilters.has(GAMES[g.id]?.skill as SkillId)) : playableGames).map(game => {
                        const Icon = GAME_ICONS[game.id] || Target
                        const colors = GAMES[game.id]?.iconColors || GAMES.emoji_keypad.iconColors
                        const skill = getSkillForGame(game.id)
                        return (
                          <Link
                            key={game.id}
                            href={`/game/${game.id}`}
                            className={`flex flex-col items-center text-center p-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-150 border-b-4 ${skill?.colors.border || 'border-slate-300'} hover:border-b-2 hover:translate-y-0.5 active:border-b-0 active:translate-y-1`}
                          >
                            <Icon className={`w-7 h-7 mb-2 ${colors.icon}`} />
                            <span className="text-xs font-medium text-slate-900 dark:text-white leading-tight line-clamp-2">{game.name}</span>
                            {skill && (
                              <span className={`text-[10px] font-medium mt-0.5 ${skill.colors.text}`}>{skill.name}</span>
                            )}
                            <div className="flex items-center gap-1 mt-0.5 max-w-full">
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                {game.todayStats.topPlayerName || 'No leader'}
                              </span>
                              {game.poolSize > 0 && (
                                <span className="text-[10px] font-semibold text-yellow-500 dark:text-yellow-400 shrink-0"><CC />{game.poolSize}</span>
                              )}
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="space-y-6 mb-10">
                      {(skillFilters.size > 0 ? SKILL_LIST.filter(s => skillFilters.has(s.id)) : rotatedSkillList).map(skill => {
                        const playableIds = new Set(playableGames.map(g => g.id))
                        const skillGames = Object.keys(GAMES)
                          .filter(id => GAMES[id].skill === skill.id && playableIds.has(id))
                          .map(id => playableGames.find(g => g.id === id)!)
                        if (skillGames.length === 0) return null
                        const SkillIcon = SKILL_ICONS[skill.id]
                        return (
                          <div key={skill.id}>
                            <div className="flex items-center gap-2.5 mb-3">
                              <div className={`w-8 h-8 rounded-full ${skill.colors.bg} flex items-center justify-center`}>
                                <SkillIcon className={`w-4 h-4 ${skill.colors.textLight} dark:${skill.colors.text}`} />
                              </div>
                              <h3 className={`text-lg font-bold ${skill.colors.textLight} dark:${skill.colors.text}`}>{skill.name}</h3>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                              {skillGames.map(game => {
                                const Icon = GAME_ICONS[game.id] || Target
                                const colors = GAMES[game.id]?.iconColors || GAMES.emoji_keypad.iconColors
                                return (
                                  <Link
                                    key={game.id}
                                    href={`/game/${game.id}`}
                                    className={`flex flex-col items-center text-center p-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-150 border-b-4 ${skill.colors.border} hover:border-b-2 hover:translate-y-0.5 active:border-b-0 active:translate-y-1`}
                                  >
                                    <Icon className={`w-7 h-7 mb-2 ${colors.icon}`} />
                                    <span className="text-xs font-medium text-slate-900 dark:text-white leading-tight line-clamp-2">{game.name}</span>
                                    <div className="flex items-center gap-1 mt-0.5 max-w-full">
                                      <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                        {game.todayStats.topPlayerName || 'No leader'}
                                      </span>
                                      {game.poolSize > 0 && (
                                        <span className="text-[10px] font-semibold text-yellow-500 dark:text-yellow-400 shrink-0"><CC />{game.poolSize}</span>
                                      )}
                                    </div>
                                  </Link>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
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
                    const colors = GAMES[entry.gameId]?.iconColors || GAMES.emoji_keypad.iconColors
                    return (
                      <tr key={entry.gameId} className={i < entries.length - 1 ? 'border-b border-slate-700/50' : ''}>
                        <td className="px-3 sm:px-4 py-3">
                          <Link href={`/game/${entry.gameId}`} className="tap-highlight flex items-center gap-2 sm:gap-3 hover:opacity-80 transition">
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

        const renderSkillRows = (entries: TopSkillEntry[], title: string, showPool?: boolean) => (
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">{title}</h4>
            <div className="bg-white dark:bg-slate-800 rounded-xl overflow-hidden">
              <table className="w-full">
                <tbody>
                  {SKILL_LIST.map((skill, i) => {
                    const entry = entries.find(e => e.skillId === skill.id)
                    const hasLeader = !!entry?.playerName
                    const SkillIcon = SKILL_ICONS[skill.id]

                    return (
                      <tr key={skill.id} className={i < SKILL_LIST.length - 1 ? 'border-b border-slate-100 dark:border-slate-700/50' : ''}>
                        <td className="px-3 sm:px-4 py-3 w-1/2">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className={`w-8 h-8 rounded-full ${skill.colors.bg} flex items-center justify-center shrink-0`}>
                              <SkillIcon className={`w-4 h-4 ${skill.colors.textLight} dark:${skill.colors.text}`} />
                            </div>
                            <span className={`text-sm font-semibold ${skill.colors.textLight} dark:${skill.colors.text}`}>{skill.name}</span>
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 py-3">
                          {hasLeader ? (
                            entry!.playerUsername ? (
                              <Link href={`/player/${entry!.playerUsername}`} className="tap-highlight text-slate-500 text-sm hover:text-yellow-400 transition">
                                {entry!.playerName}
                              </Link>
                            ) : (
                              <span className="text-slate-500 text-sm">{entry!.playerName}</span>
                            )
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500">No leader yet</span>
                          )}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {hasLeader && (
                            <span className={`text-sm font-bold tabular-nums ${skill.colors.textLight} dark:${skill.colors.text}`}>{abbreviateNumber(entry!.skillScore)}</span>
                          )}
                        </td>
                        {showPool && <td className="px-3 sm:px-4 py-3"></td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )

        return (
          <div className="mt-6">
            {/* Desktop: side by side columns, each with table + skills */}
            <div className="hidden lg:grid lg:grid-cols-2 lg:gap-6">
              <div>
                <h3 className="text-sm font-medium text-slate-400 mb-3 text-center uppercase tracking-wider">Today</h3>
                {renderTable(topPlayersToday, ' today', true)}
                <div className="mt-6">
                  {renderSkillRows(topSkillsToday, 'Top Skills Today', true)}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-slate-400 mb-3 text-center uppercase tracking-wider">All Time</h3>
                {renderTable(topPlayersAllTime, '')}
                <div className="mt-6">
                  {renderSkillRows(topSkillsAllTime, 'Top Skills All Time')}
                </div>
              </div>
            </div>

            {/* Mobile: tabs — table + skills follow the active tab */}
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
              <div className="mt-6">
                {renderSkillRows(
                  topPlayersTab === 'allTime' ? topSkillsAllTime : topSkillsToday,
                  topPlayersTab === 'today' ? 'Top Skills Today' : 'Top Skills All Time',
                  topPlayersTab === 'today'
                )}
              </div>
            </div>

          </div>
        )
      })()}

      {/* See You on the Podium */}
      <div className="mt-16">
        <h2 className="text-2xl font-bold text-white text-center mb-2 font-title">See You on the Podium</h2>
        <p className="text-center text-slate-300 mb-8">Every credit grows the pool. Climb the charts. Claim your share.</p>
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
              <button
                onClick={handleInvite}
                className="w-full flex items-center justify-center gap-2 border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 px-3 py-2 rounded-lg transition text-sm"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy Invite'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
