'use client'

import { use } from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Link } from 'next-view-transitions'
import Image from 'next/image'
import {
  Trophy,
  Gamepad2,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCreditsNotification } from '@/components/CreditsNotificationProvider'
import { GAMES, toUiGameId, getSkillForGame } from '@/lib/skills'
import { GAME_ICONS } from '@/lib/game-icons'
import { trackGameCompleted, trackGroupPlayJoined } from '@/lib/analytics'
import { GroupPlayLeaderboard } from '@/components/GroupPlayLeaderboard'
import { GroupSessionBar } from '@/components/GroupSessionBar'
import { EmojiKeypadGame } from '@/components/EmojiKeypadGame'
import { ImageRotateGame } from '@/components/ImageRotateGame'
import { ReactionTimeGame } from '@/components/ReactionTimeGame'
import { WhackAMoleGame } from '@/components/WhackAMoleGame'
import { TypingSpeedGame } from '@/components/TypingSpeedGame'
import { MentalMathGame } from '@/components/MentalMathGame'
import { ColorMatchGame } from '@/components/ColorMatchGame'
import { VisualDiffGame } from '@/components/VisualDiffGame'
import { AudioPatternGame } from '@/components/AudioPatternGame'
import { DragSortGame } from '@/components/DragSortGame'
import { FollowMeGame } from '@/components/FollowMeGame'
import { DuckShootGame } from '@/components/DuckShootGame'
import { MemoryCardsGame } from '@/components/MemoryCardsGame'
import { NumberChainGame } from '@/components/NumberChainGame'
import { GridlockGame } from '@/components/GridlockGame'
import { ReactionBarsGame } from '@/components/ReactionBarsGame'
import { ImagePuzzleGame } from '@/components/ImagePuzzleGame'
import { DrawMeGame } from '@/components/DrawMeGame'
import { BeatMatchGame } from '@/components/BeatMatchGame'
import { GridRecallGame } from '@/components/GridRecallGame'
import { MazePathGame } from '@/components/MazePathGame'

const GAME_COMPONENTS: Record<string, React.ComponentType<{ onGameComplete?: () => void; groupSessionId?: string }>> = {
  emoji_keypad: EmojiKeypadGame,
  image_rotate: ImageRotateGame,
  reaction_time: ReactionTimeGame,
  whack_a_mole: WhackAMoleGame,
  typing_speed: TypingSpeedGame,
  mental_math: MentalMathGame,
  color_match: ColorMatchGame,
  visual_diff: VisualDiffGame,
  audio_pattern: AudioPatternGame,
  drag_sort: DragSortGame,
  follow_me: FollowMeGame,
  duck_shoot: DuckShootGame,
  memory_cards: MemoryCardsGame,
  number_chain: NumberChainGame,
  gridlock: GridlockGame,
  reaction_bars: ReactionBarsGame,
  image_puzzle: ImagePuzzleGame,
  draw_me: DrawMeGame,
  beat_match: BeatMatchGame,
  grid_recall: GridRecallGame,
  maze_path: MazePathGame,
}

interface SessionData {
  id: string
  joinToken: string
  gameTypeId: string
  createdBy: string
  creatorName: string
  creatorUsername: string | null
  startsAt: string
  endsAt: string
  status: string
  createdAt: string
}

interface LeaderboardEntry {
  rank: number
  userId: string
  displayName: string
  username: string | null
  bestScore: number
  attempts: number
}

export default function GroupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { refreshBalance } = useCreditsNotification()

  const [session, setSession] = useState<SessionData | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [playerCount, setPlayerCount] = useState(0)
  const [turnCount, setTurnCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gameKey, setGameKey] = useState(0)
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0)
  const [creatingNew, setCreatingNew] = useState(false)
  const gameContainerRef = useRef<HTMLDivElement>(null)
  const hasTrackedJoin = useRef(false)

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/group-play/${token}`)
      if (!res.ok) {
        if (res.status === 404) {
          setError('Group session not found')
        } else {
          setError('Failed to load session')
        }
        return
      }
      const data = await res.json()
      setSession(data.session)
      setLeaderboard(data.leaderboard)
      setPlayerCount(data.playerCount)
      setTurnCount(data.turnCount || 0)
      if (!hasTrackedJoin.current) {
        const uiId = toUiGameId(data.session.gameTypeId)
        if (uiId) trackGroupPlayJoined({ game_type: uiId, player_count: data.playerCount })
        hasTrackedJoin.current = true
      }
      // Refresh balance when session ended/settled (picks up pending claims)
      if (data.session.status === 'ended' || data.session.status === 'settled') {
        refreshBalance()
      }
    } catch {
      setError('Failed to load session')
    } finally {
      setLoading(false)
    }
  }, [token, refreshBalance])

  useEffect(() => {
    if (!authLoading && user) {
      fetchSession()
    }
  }, [fetchSession, authLoading, user])

  // Auto-refetch when session timer expires (triggers lazy settlement + claim bar)
  useEffect(() => {
    if (!session || session.status !== 'live') return
    const msLeft = new Date(session.endsAt).getTime() - Date.now()
    if (msLeft <= 0) {
      fetchSession()
      return
    }
    const timer = setTimeout(() => fetchSession(), msLeft + 500)
    return () => clearTimeout(timer)
  }, [session, fetchSession])

  const isEnded = session ? (session.status === 'ended' || session.status === 'settled' || new Date(session.endsAt) < new Date()) : false
  const uiGameId = session ? toUiGameId(session.gameTypeId) : null
  const gameDef = uiGameId ? GAMES[uiGameId] : null
  const GameIcon = uiGameId ? (GAME_ICONS[uiGameId] || GAME_ICONS.emoji_keypad) : GAME_ICONS.emoji_keypad
  const GameComponent = uiGameId ? GAME_COMPONENTS[uiGameId] : null

  const handleGameComplete = (data?: { score?: number; valid?: boolean; rank?: number }) => {
    if (uiGameId) trackGameCompleted({ game_type: uiGameId, ...data })
    refreshBalance()
    setTimeout(() => {
      setLeaderboardRefreshKey(k => k + 1)
      fetchSession()
    }, 500)
  }

  const handleStartNewRound = async () => {
    if (!uiGameId || creatingNew) return
    setCreatingNew(true)
    try {
      const res = await fetch('/api/group-play/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: uiGameId }),
      })
      if (res.ok) {
        const data = await res.json()
        router.push(`/group/${data.joinToken}`)
      }
    } catch {
      // silent
    } finally {
      setCreatingNew(false)
    }
  }

  if (authLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-1/4 mb-8" />
          <div className="h-96 bg-slate-200 dark:bg-slate-800 rounded" />
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-8 text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Login Required</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-6">You need to be logged in to join group play.</p>
          <div className="flex justify-center gap-4">
            <Link href={`/auth/login?next=/group/${token}`} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-6 rounded-lg transition">
              Login
            </Link>
            <Link href={`/auth/signup?next=/group/${token}`} className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 px-6 rounded-lg transition">
              Sign Up
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-1/4 mb-8" />
          <div className="h-96 bg-slate-200 dark:bg-slate-800 rounded" />
        </div>
      </div>
    )
  }

  if (error || !session || !gameDef || !uiGameId) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-8 text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Session Not Found</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-6">{error || 'This group session does not exist.'}</p>
          <Link href="/" className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-6 rounded-lg transition">
            Back to Home
          </Link>
        </div>
      </div>
    )
  }

  const iconColors = gameDef.iconColors

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 overflow-x-hidden select-none">
      {/* Header */}
      <div className="mb-6">
        <Link href="/" className="flex items-start gap-3 min-w-0 group">
          <GameIcon className={`w-10 h-10 shrink-0 ${iconColors.icon}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-title group-hover:text-slate-300 transition">{gameDef.name}</h1>
              {(() => { const skill = getSkillForGame(uiGameId); return skill ? (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${skill.colors.bg} ${skill.colors.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${skill.colors.dot}`} />
                  {skill.name}
                </span>
              ) : null })()}
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">{gameDef.description}</p>
          </div>
        </Link>
      </div>

      {/* Session Ended Banner */}
      {isEnded && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Session Ended</h2>
          </div>
          {leaderboard.length > 0 && (
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-3">
              Winner: <span className="font-bold text-yellow-500">{leaderboard[0].displayName}</span> with {leaderboard[0].bestScore.toLocaleString()} points
            </p>
          )}
          <button
            onClick={handleStartNewRound}
            disabled={creatingNew}
            className="bg-yellow-500 hover:bg-yellow-400 disabled:bg-yellow-500/50 text-slate-900 font-bold py-2.5 px-6 rounded-lg transition"
          >
            {creatingNew ? 'Creating...' : 'Start Another Round'}
          </button>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Game Area */}
        <div className="md:col-span-2">
          <div ref={gameContainerRef}>
            {GameComponent && (
              <GameComponent
                key={gameKey}
                onGameComplete={handleGameComplete}
                groupSessionId={session.id}
              />
            )}
          </div>
          <div className="mt-3">
            <Link
              href="/"
              className="w-full flex items-center justify-center gap-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 font-semibold py-2.5 rounded-lg transition text-base"
            >
              <Gamepad2 className="w-5 h-5" />
              All Games
            </Link>
          </div>
        </div>

        {/* Session Info + Leaderboard Column */}
        <div className="space-y-4">
          {/* Session Info Card */}
          <GroupSessionBar
            endsAt={session.endsAt}
            playerCount={playerCount}
            joinToken={token}
            isEnded={isEnded}
            creatorName={session.creatorName}
            creatorUsername={session.creatorUsername}
            gameName={gameDef.name}
          />

          <GroupPlayLeaderboard
            joinToken={token}
            refreshKey={leaderboardRefreshKey}
            isLive={!isEnded}
            turnCount={turnCount}
            endsAt={session.endsAt}
          />

        </div>
      </div>

      {/* About promo */}
      <Link href="/about" className="mt-8 block rounded-xl overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-yellow-500/50 transition-colors">
        <Image src="/team-selfie.png" alt="Podium Arena — 5 mind skills" width={1073} height={585} className="w-full sm:w-1/2 sm:mx-auto" />
        <div className="px-4 py-3 text-center">
          <p className="font-bold text-sm text-slate-900 dark:text-white">Compete across 5 mind skills</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">21 games, daily leaderboards, free credits. Learn more about Podium Arena.</p>
        </div>
      </Link>

    </div>
  )
}
