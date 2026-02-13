'use client'

import { use } from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Share2,
  Check,
  Trophy,
  Users,
  Play,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useCreditsNotification } from '@/components/CreditsNotificationProvider'
import { GAMES, toUiGameId, getSkillForGame } from '@/lib/skills'
import { GAME_ICONS } from '@/lib/game-icons'
import { GameThumbnail } from '@/components/GameThumbnail'
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
}

interface SessionData {
  id: string
  joinToken: string
  gameTypeId: string
  createdBy: string
  creatorName: string
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'lobby' | 'play'>('lobby')
  const [gameKey, setGameKey] = useState(0)
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0)
  const [copied, setCopied] = useState(false)
  const [creatingNew, setCreatingNew] = useState(false)
  const gameContainerRef = useRef<HTMLDivElement>(null)

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
    } catch {
      setError('Failed to load session')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (!authLoading && user) {
      fetchSession()
    }
  }, [fetchSession, authLoading, user])

  const isEnded = session ? (session.status === 'ended' || new Date(session.endsAt) < new Date()) : false
  const uiGameId = session ? toUiGameId(session.gameTypeId) : null
  const gameDef = uiGameId ? GAMES[uiGameId] : null
  const GameIcon = uiGameId ? (GAME_ICONS[uiGameId] || GAME_ICONS.emoji_keypad) : GAME_ICONS.emoji_keypad
  const GameComponent = uiGameId ? GAME_COMPONENTS[uiGameId] : null

  const handleGameComplete = () => {
    refreshBalance()
    setTimeout(() => setLeaderboardRefreshKey(k => k + 1), 500)
  }

  const handleJoinAndPlay = () => {
    setMode('play')
    setGameKey(k => k + 1)
  }

  const handlePlayAgain = () => {
    setGameKey(k => k + 1)
  }

  // Auto-start game after restart
  useEffect(() => {
    if (mode === 'play' && gameKey > 0 && gameContainerRef.current) {
      const btn = gameContainerRef.current.querySelector('button')
      if (btn instanceof HTMLButtonElement) btn.click()
    }
  }, [gameKey, mode])

  const handleCopy = async () => {
    try {
      const url = `${window.location.origin}/group/${token}`
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // silent
    }
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/group/${token}`
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Group Play: ${gameDef?.name || 'Game'}`,
          text: `Join my group play session on Podium Arena!`,
          url,
        })
      } catch {
        handleCopy()
      }
    } else {
      handleCopy()
    }
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
            <Link href="/auth/login" className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-6 rounded-lg transition">
              Login
            </Link>
            <Link href="/auth/signup" className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 px-6 rounded-lg transition">
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
        <div className="flex items-start gap-3">
          <Link href={`/game/${uiGameId}`} className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition mt-1">
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <div className={`p-3 ${iconColors.bg} rounded-xl`}>
            <GameIcon className={`w-10 h-10 ${iconColors.icon}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-title">{gameDef.name}</h1>
              {(() => { const skill = getSkillForGame(uiGameId); return skill ? (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${skill.colors.bg} ${skill.colors.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${skill.colors.dot}`} />
                  {skill.name}
                </span>
              ) : null })()}
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Created by {session.creatorName}
            </p>
          </div>
        </div>
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
          {mode === 'lobby' && !isEnded ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 text-center">
              <div className="max-w-sm mx-auto mb-6">
                <GameThumbnail gameId={uiGameId} isPlayable={true} />
              </div>
              <p className="text-slate-600 dark:text-slate-300 text-sm mb-6">{gameDef.description}</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={handleJoinAndPlay}
                  className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg transition text-lg"
                >
                  <Play className="w-5 h-5" />
                  Join & Play
                </button>
                <button
                  onClick={handleShare}
                  className="flex items-center gap-2 border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 font-bold py-3 px-6 rounded-lg transition"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Share2 className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Share Invite'}
                </button>
              </div>
            </div>
          ) : mode === 'lobby' && isEnded ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 text-center">
              <div className="max-w-sm mx-auto mb-6">
                <GameThumbnail gameId={uiGameId} isPlayable={true} />
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm">This session has ended. Start a new round to keep playing!</p>
            </div>
          ) : (
            <>
              <div ref={gameContainerRef}>
                {GameComponent && (
                  <GameComponent
                    key={gameKey}
                    onGameComplete={handleGameComplete}
                    groupSessionId={session.id}
                  />
                )}
              </div>
              {!isEnded && (
                <div className="flex items-center justify-center gap-3 mt-4">
                  <button
                    onClick={handlePlayAgain}
                    className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-2.5 px-6 rounded-lg transition"
                  >
                    Play Again
                  </button>
                  <button
                    onClick={() => setMode('lobby')}
                    className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                  >
                    Back to Lobby
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Session Info + Leaderboard Column */}
        <div className="space-y-4">
          {/* Session Info Card */}
          <GroupSessionBar
            endsAt={session.endsAt}
            playerCount={playerCount}
            joinToken={token}
            isEnded={isEnded}
          />

          <GroupPlayLeaderboard
            joinToken={token}
            refreshKey={leaderboardRefreshKey}
            isLive={!isEnded}
          />

        </div>
      </div>
    </div>
  )
}
