'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback, useRef } from 'react'
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
import { Leaderboard } from '@/components/Leaderboard'
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
  Gauge,
  Puzzle,
  Brush,
  ArrowLeft,
  LucideIcon,
  CalendarCheck,
  Share2,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react'
import { C, CC } from '@/lib/currency'

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
  reaction_bars: { bg: 'bg-purple-500/20', icon: 'text-purple-400' },
  image_puzzle: { bg: 'bg-yellow-500/20', icon: 'text-yellow-400' },
  draw_me: { bg: 'bg-stone-500/20', icon: 'text-stone-400' },
}

const GAME_CONFIG: Record<string, {
  component: React.ComponentType<{ onGameComplete?: () => void }>
  name: string
  description: string
  leaderboardType: string
  icon: LucideIcon
}> = {
  emoji_keypad: {
    component: EmojiKeypadGame,
    name: 'Emoji Sequence',
    description: 'Memorize the emoji sequence, then tap them in order.',
    leaderboardType: 'emoji_keypad_sequence',
    icon: Target,
  },
  image_rotate: {
    component: ImageRotateGame,
    name: 'Puzzle Rotation',
    description: 'Rotate the tiles to restore the original image.',
    leaderboardType: 'image_rotate',
    icon: RotateCw,
  },
  reaction_time: {
    component: ReactionTimeGame,
    name: 'Reaction Tap',
    description: 'Tap when the color changes. Skip the fakes.',
    leaderboardType: 'reaction_time',
    icon: Zap,
  },
  whack_a_mole: {
    component: WhackAMoleGame,
    name: 'Whack-a-Mole',
    description: 'Tap the moles as fast as you can. Avoid the bombs.',
    leaderboardType: 'whack_a_mole',
    icon: Hammer,
  },
  typing_speed: {
    component: TypingSpeedGame,
    name: 'Typing Speed',
    description: 'Type the text as fast and accurately as you can.',
    leaderboardType: 'typing_speed',
    icon: Keyboard,
  },
  mental_math: {
    component: MentalMathGame,
    name: 'Mental Math',
    description: 'Solve arithmetic problems as quickly as possible.',
    leaderboardType: 'mental_math',
    icon: Calculator,
  },
  color_match: {
    component: ColorMatchGame,
    name: 'Color Match',
    description: 'Match the target color as closely as you can.',
    leaderboardType: 'color_match',
    icon: Palette,
  },
  visual_diff: {
    component: VisualDiffGame,
    name: 'Spot Difference',
    description: 'Find the differences between the two images.',
    leaderboardType: 'visual_diff',
    icon: ScanEye,
  },
  audio_pattern: {
    component: AudioPatternGame,
    name: 'Audio Pattern',
    description: 'Listen to the pattern, then repeat it.',
    leaderboardType: 'audio_pattern',
    icon: Music,
  },
  drag_sort: {
    component: DragSortGame,
    name: 'Drag & Sort',
    description: 'Drag the items into the correct order.',
    leaderboardType: 'drag_sort',
    icon: GripVertical,
  },
  follow_me: {
    component: FollowMeGame,
    name: 'Follow Me',
    description: 'Trace the path from start to finish. 3 levels.',
    leaderboardType: 'follow_me',
    icon: Pencil,
  },
  duck_shoot: {
    component: DuckShootGame,
    name: 'Target Shoot',
    description: 'Tap to fire. Hit red. Avoid green. 10 shots.',
    leaderboardType: 'duck_shoot',
    icon: Crosshair,
  },
  memory_cards: {
    component: MemoryCardsGame,
    name: 'Memory Cards',
    description: 'Flip cards and find all matching pairs.',
    leaderboardType: 'memory_cards',
    icon: LayoutGrid,
  },
  number_chain: {
    component: NumberChainGame,
    name: 'Number Chain',
    description: 'Tap the numbers in ascending order.',
    leaderboardType: 'number_chain',
    icon: Hash,
  },
  gridlock: {
    component: GridlockGame,
    name: 'Gridlock',
    description: 'Slide blocks to free the green piece. 3 rounds.',
    leaderboardType: 'gridlock',
    icon: ParkingSquare,
  },
  reaction_bars: {
    component: ReactionBarsGame,
    name: 'Reaction Bars',
    description: 'Stop oscillating bars at the target. Speed + accuracy.',
    leaderboardType: 'reaction_bars',
    icon: Gauge,
  },
  image_puzzle: {
    component: ImagePuzzleGame,
    name: 'Image Puzzle',
    description: 'Place missing pieces to complete the image.',
    leaderboardType: 'image_puzzle',
    icon: Puzzle,
  },
  draw_me: {
    component: DrawMeGame,
    name: 'Draw Me',
    description: 'Copy the reference path. 3 rounds of increasing difficulty.',
    leaderboardType: 'draw_me',
    icon: Brush,
  },
}

function OutOfCreditsView({ referralCode }: { referralCode: string | null }) {
  const [copied, setCopied] = useState(false)

  const referralUrl = typeof window !== 'undefined' && referralCode
    ? `${window.location.origin}/auth/signup?ref=${referralCode}`
    : ''

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl)
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
          url: referralUrl,
        })
      } catch {
        handleCopy()
      }
    } else {
      handleCopy()
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
              Daily credits are only available when you visit &mdash; unclaimed days are lost, so don&apos;t miss out!
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
                <div className="flex gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-2 border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 px-4 py-2 rounded-lg transition text-sm"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy Link'}
                  </button>
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-slate-900 px-4 py-2 rounded-lg transition text-sm"
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function GamePageContent() {
  const searchParams = useSearchParams()
  const gameTypeParam = searchParams.get('type')
  const { user, loading: authLoading } = useAuth()
  const { balance, dailyGrantAvailable, refreshBalance, referralCode, loading: creditsLoading } = useCreditsNotification()

  // Use URL param or default to emoji_keypad
  const gameType = gameTypeParam && GAME_CONFIG[gameTypeParam] ? gameTypeParam : 'emoji_keypad'
  const config = GAME_CONFIG[gameType]
  const iconColors = GAME_ICON_COLORS[gameType] || GAME_ICON_COLORS.emoji_keypad
  const GameIcon = config.icon
  const [poolSize, setPoolSize] = useState<number | null>(null)
  const [msUntilSettlement, setMsUntilSettlement] = useState(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const gameContainerRef = useRef<HTMLDivElement>(null)
  const [gameKey, setGameKey] = useState(0)

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

  const handleGameComplete = () => {
    refreshBalance()
    fetchPoolSize()
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

  const GameComponent = config.component

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 overflow-x-hidden select-none">
      {/* Game Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <div className={`p-3 ${iconColors.bg} rounded-xl`}>
            <GameIcon className={`w-10 h-10 ${iconColors.icon}`} />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white font-title">{config.name}</h1>
            <p className="text-slate-400 text-sm">{config.description}</p>
          </div>
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
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          {!creditsLoading && balance < 1 && !dailyGrantAvailable ? (
            <OutOfCreditsView referralCode={referralCode} />
          ) : (balance >= 1 || dailyGrantAvailable) ? (
            <div ref={gameContainerRef}>
              <GameComponent key={gameKey} onGameComplete={handleGameComplete} />
            </div>
          ) : null}
          {poolSize !== null && poolSize > 0 && (
            <div className="bg-slate-800 rounded-xl mt-3 py-4 px-6 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xl font-bold text-yellow-400 font-title">
                  Pool: {poolSize.toLocaleString()} <CC />Credits
                </p>
                <div className="text-xs text-slate-400 mt-1">
                  50% Winner &ndash; 30% Back &ndash; 20% Treasury
                </div>
              </div>
              <div className="text-right shrink-0 pt-1.5">
                <div className="text-sm font-mono text-yellow-400">
                  {formatCountdown(msUntilSettlement)}
                </div>
                <div className="text-xs text-slate-400">till settlement</div>
              </div>
            </div>
          )}
        </div>

        <div>
          <Leaderboard
            gameType={config.leaderboardType}
            gameTypeName={config.name}
          />
        </div>
      </div>
    </div>
  )
}

export default function GamePage() {
  return (
    <Suspense fallback={
      <div className="max-w-6xl mx-auto px-4 py-8 overflow-x-hidden">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-800 rounded w-1/4 mb-8"></div>
          <div className="h-96 bg-slate-800 rounded"></div>
        </div>
      </div>
    }>
      <GamePageContent />
    </Suspense>
  )
}
