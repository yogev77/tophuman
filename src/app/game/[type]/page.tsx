'use client'

import { use } from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { notFound } from 'next/navigation'
import { useTransitionRouter } from 'next-view-transitions'
import { motion, AnimatePresence } from 'framer-motion'
import { formatCountdown } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useCreditsNotification } from '@/components/CreditsNotificationProvider'
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
import { Leaderboard } from '@/components/Leaderboard'
import { Link } from 'next-view-transitions'
import {
  CalendarCheck,
  Share2,
  Copy,
  Check,
  RefreshCw,
  Users,
  Gamepad2,
} from 'lucide-react'
import { C, CC } from '@/lib/currency'
import { GAMES, toDbGameTypeId, getSkillForGame } from '@/lib/skills'
import { GAME_ICONS } from '@/lib/game-icons'
import { trackGameCompleted, trackGroupPlayCreated, trackReferralShared } from '@/lib/analytics'

const GAME_COMPONENTS: Record<string, React.ComponentType<{ onGameComplete?: () => void }>> = {
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
}

function OutOfCreditsView({ referralCode }: { referralCode: string | null }) {
  const [copied, setCopied] = useState(false)

  const referralUrl = typeof window !== 'undefined' && referralCode
    ? `${window.location.origin}/auth/signup?ref=${referralCode}`
    : ''
  const shareText = 'Compete across 5 mind skills on Podium Arena. Clock resets daily.'

  const handleInvite = async () => {
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    if (isMobile && navigator.share) {
      try { await navigator.share({ title: 'Podium Arena', text: shareText, url: referralUrl }); return } catch {}
    }
    try {
      await navigator.clipboard.writeText(`${shareText}\n\n${referralUrl}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="bg-slate-800 rounded-xl p-6">
      <h3 className="text-xl font-bold text-white mb-3">You&apos;re out of <CC />Credits</h3>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-yellow-500/20 rounded-lg shrink-0 mt-0.5">
            <CalendarCheck className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <p className="text-slate-300 text-sm">
              Come back tomorrow to claim your <span className="text-yellow-400 font-semibold">free daily <CC />Credits</span>.
              Daily credits are only available when you visit.
            </p>
          </div>
        </div>

        {referralCode && (
          <div className="border-t border-slate-700 pt-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg shrink-0 mt-0.5">
                <Share2 className="w-5 h-5 text-purple-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-slate-300 text-sm mb-3">
                  Invite friends and earn <span className="text-yellow-400 font-semibold">100 <CC />Credits</span> when they join!
                </p>
                <button
                  onClick={handleInvite}
                  className="flex items-center gap-2 border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 px-4 py-2 rounded-lg transition text-sm"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy Invite'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function GamePage({ params }: { params: Promise<{ type: string }> }) {
  const { type: gameTypeParam } = use(params)
  const gameType = gameTypeParam && GAME_COMPONENTS[gameTypeParam] ? gameTypeParam : null

  if (!gameType) {
    notFound()
  }

  return <GamePageContent gameType={gameType} />
}

function GamePageContent({ gameType }: { gameType: string }) {
  const router = useTransitionRouter()
  const { user, loading: authLoading } = useAuth()
  const { balance, dailyGrantAvailable, refreshBalance, referralCode, loading: creditsLoading } = useCreditsNotification()

  const gameDef = GAMES[gameType]
  const iconColors = gameDef?.iconColors || GAMES.emoji_keypad.iconColors
  const GameIcon = GAME_ICONS[gameType] || GAME_ICONS.emoji_keypad
  const [poolSize, setPoolSize] = useState<number | null>(null)
  const [msUntilSettlement, setMsUntilSettlement] = useState(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const gameContainerRef = useRef<HTMLDivElement>(null)
  const [gameKey, setGameKey] = useState(0)
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0)
  const [gameCompleted, setGameCompleted] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)

  const fetchPoolSize = useCallback(async () => {
    try {
      const res = await fetch('/api/games')
      if (res.ok) {
        const data = await res.json()
        const game = data.games?.find((g: { id: string }) => g.id === gameType)
        if (game) setPoolSize(game.poolSize)
        if (data.msUntilSettlement) setMsUntilSettlement(data.msUntilSettlement)
      }
    } catch {}
  }, [gameType])

  useEffect(() => {
    fetchPoolSize()
  }, [fetchPoolSize])

  // Countdown timer
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setMsUntilSettlement(ms => Math.max(0, ms - 1000))
    }, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [])

  const handleGameComplete = (data?: { score?: number; valid?: boolean; rank?: number }) => {
    trackGameCompleted({ game_type: gameType, ...data })
    refreshBalance()
    fetchPoolSize()
    setGameCompleted(true)
    // Trigger immediate leaderboard refresh after a short delay to let the server process the score
    setTimeout(() => setLeaderboardRefreshKey(k => k + 1), 500)
  }

  const handleCreateGroup = async () => {
    if (creatingGroup) return
    setCreatingGroup(true)
    try {
      const res = await fetch('/api/group-play/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType }),
      })
      if (res.ok) {
        const data = await res.json()
        trackGroupPlayCreated({ game_type: gameType })
        router.push(`/group/${data.joinToken}`)
      }
    } catch {
      // silent
    } finally {
      setCreatingGroup(false)
    }
  }

  // Auto-start game after restart (gameKey > 0 means it's a restart, not initial mount)
  useEffect(() => {
    if (gameKey > 0 && gameContainerRef.current) {
      const btn = gameContainerRef.current.querySelector('button')
      if (btn instanceof HTMLButtonElement) btn.click()
    }
  }, [gameKey])

  const handleRestart = () => {
    setGameKey(k => k + 1)
  }

  if (authLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 overflow-x-hidden">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-800 rounded w-1/4 mb-8"></div>
          <div className="h-96 bg-slate-800 rounded"></div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 overflow-x-hidden">
        <div className="bg-slate-800 rounded-xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Login Required</h2>
          <p className="text-slate-300 mb-6">
            You need to be logged in to play games.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/auth/login"
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-6 rounded-lg transition"
            >
              Login
            </Link>
            <Link
              href="/auth/signup"
              className="border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 px-6 rounded-lg transition"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!user.email_confirmed_at) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 overflow-x-hidden">
        <div className="bg-slate-800 rounded-xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Email Verification Required</h2>
          <p className="text-slate-300 mb-6">
            Please verify your email address to play games.
            Check your inbox for the verification link.
          </p>
          <p className="text-slate-400 text-sm">
            Didn&apos;t receive the email? Check your spam folder.
          </p>
        </div>
      </div>
    )
  }

  const GameComponent = GAME_COMPONENTS[gameType]

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 overflow-x-hidden select-none">
      {/* Game Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6"
      >
        <div className="flex items-start gap-3">
          <Link href="/" className="flex items-start gap-3 min-w-0 flex-1 group">
            <div className={`p-3 ${iconColors.bg} rounded-xl shrink-0`}>
              <GameIcon className={`w-10 h-10 ${iconColors.icon}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-2xl font-bold text-white font-title group-hover:text-slate-300 transition truncate">{gameDef.name}</h1>
                  {(() => { const skill = getSkillForGame(gameType); return skill ? (
                    <span className={`hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${skill.colors.bg} ${skill.colors.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${skill.colors.dot}`} />
                      {skill.name}
                    </span>
                  ) : null })()}
                </div>
                {(() => { const skill = getSkillForGame(gameType); return skill ? (
                  <span className={`md:hidden inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap shrink-0 ${skill.colors.bg} ${skill.colors.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${skill.colors.dot}`} />
                    {skill.name}
                  </span>
                ) : null })()}
              </div>
              <p className="text-slate-400 text-sm">{gameDef.description}</p>
            </div>
          </Link>
          {/* Restart button - hidden, will redesign later */}
          {false && <button
            onClick={handleRestart}
            disabled={creditsLoading || (balance < 1 && !dailyGrantAvailable)}
            className="ml-auto flex items-center gap-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-bold py-2.5 px-4 rounded-lg transition shrink-0 text-base"
            title="Restart game"
          >
            <RefreshCw className="w-5 h-5" />
            {C}1
          </button>}
        </div>
      </motion.div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <AnimatePresence mode="wait">
            {!creditsLoading && (
              <motion.div
                key={balance < 1 && !dailyGrantAvailable ? 'no-credits' : 'game'}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ height: { duration: 0.35, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.3, delay: 0.05 } }}
                style={{ overflow: 'hidden' }}
              >
                {balance < 1 && !dailyGrantAvailable ? (
                  <OutOfCreditsView referralCode={referralCode} />
                ) : (
                  <div ref={gameContainerRef}>
                    <GameComponent key={gameKey} onGameComplete={handleGameComplete} />
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {/* All Games button */}
          <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.18, ease: [0.22, 1, 0.36, 1], layout: { duration: 0.3 } }}
            className="mt-3"
          >
            <Link
              href="/"
              className="w-full flex items-center justify-center gap-2 border-2 border-slate-600 hover:border-slate-400 bg-slate-100 dark:bg-slate-900 text-slate-400 hover:text-white font-semibold py-2.5 rounded-lg transition text-base"
            >
              <Gamepad2 className="w-5 h-5" />
              All Games
            </Link>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-4"
        >
          <Leaderboard
            gameType={toDbGameTypeId(gameType)}
            gameTypeName={gameDef.name}
            refreshKey={leaderboardRefreshKey}
            poolSize={poolSize}
            msUntilSettlement={msUntilSettlement}
          />

          {/* Group Play Section */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="p-2 bg-purple-500/20 rounded-lg shrink-0">
                <Users className="w-5 h-5 text-purple-500 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Group Play</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Challenge friends to a private 10-minute battle. Separate pool and leaderboard.
                </p>
              </div>
            </div>
            <button
              onClick={handleCreateGroup}
              disabled={creatingGroup}
              className="w-full flex items-center justify-center gap-2 bg-purple-500 hover:bg-purple-400 text-white font-bold py-2.5 rounded-lg transition text-sm disabled:opacity-50"
            >
              <Users className="w-4 h-4" />
              {creatingGroup ? 'Creating...' : 'Start Group Play'}
            </button>
          </div>

          {/* Invite Friends */}
          {referralCode && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 bg-yellow-500/20 rounded-lg shrink-0">
                  <Share2 className="w-5 h-5 text-yellow-500 dark:text-yellow-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Invite Friends</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Get <span className="text-yellow-400 font-bold">100 <CC />Credits</span> when friends join!
                  </p>
                </div>
              </div>
              <button
                onClick={async () => {
                  const url = `${window.location.origin}/auth/signup?ref=${referralCode}`
                  const text = 'Compete across 5 mind skills on Podium Arena. Clock resets daily.'
                  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0
                  if (isMobile && navigator.share) {
                    try { await navigator.share({ title: 'Podium Arena', text, url }); trackReferralShared({ method: 'native_share', location: 'game_page' }); return } catch {}
                  }
                  try { await navigator.clipboard.writeText(`${text}\n\n${url}`); trackReferralShared({ method: 'clipboard', location: 'game_page' }); setInviteCopied(true); setTimeout(() => setInviteCopied(false), 2000) } catch {}
                }}
                className="w-full flex items-center justify-center gap-1.5 text-sm border border-yellow-500 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10 px-3 py-2 rounded-lg transition"
              >
                {inviteCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {inviteCopied ? 'Copied!' : 'Copy Invite'}
              </button>
            </div>
          )}
        </motion.div>
      </div>

    </div>
  )
}
