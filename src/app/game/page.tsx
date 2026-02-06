'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useCredits } from '@/hooks/useCredits'
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
import { Leaderboard } from '@/components/Leaderboard'
import { ReferralBanner } from '@/components/ReferralBanner'
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
  ArrowLeft,
  LucideIcon,
} from 'lucide-react'

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

const GAME_CONFIG: Record<string, {
  component: React.ComponentType<{ onGameComplete?: () => void }>
  name: string
  leaderboardType: string
  icon: LucideIcon
}> = {
  emoji_keypad: {
    component: EmojiKeypadGame,
    name: 'Emoji Sequence',
    leaderboardType: 'emoji_keypad_sequence',
    icon: Target,
  },
  image_rotate: {
    component: ImageRotateGame,
    name: 'Image Puzzle',
    leaderboardType: 'image_rotate',
    icon: RotateCw,
  },
  reaction_time: {
    component: ReactionTimeGame,
    name: 'Reaction Time',
    leaderboardType: 'reaction_time',
    icon: Zap,
  },
  whack_a_mole: {
    component: WhackAMoleGame,
    name: 'Whack-a-Mole',
    leaderboardType: 'whack_a_mole',
    icon: Hammer,
  },
  typing_speed: {
    component: TypingSpeedGame,
    name: 'Typing Speed',
    leaderboardType: 'typing_speed',
    icon: Keyboard,
  },
  mental_math: {
    component: MentalMathGame,
    name: 'Mental Math',
    leaderboardType: 'mental_math',
    icon: Calculator,
  },
  color_match: {
    component: ColorMatchGame,
    name: 'Color Match',
    leaderboardType: 'color_match',
    icon: Palette,
  },
  visual_diff: {
    component: VisualDiffGame,
    name: 'Spot Difference',
    leaderboardType: 'visual_diff',
    icon: ScanEye,
  },
  audio_pattern: {
    component: AudioPatternGame,
    name: 'Audio Pattern',
    leaderboardType: 'audio_pattern',
    icon: Music,
  },
  drag_sort: {
    component: DragSortGame,
    name: 'Drag & Sort',
    leaderboardType: 'drag_sort',
    icon: GripVertical,
  },
  follow_me: {
    component: FollowMeGame,
    name: 'Follow Me',
    leaderboardType: 'follow_me',
    icon: Pencil,
  },
  duck_shoot: {
    component: DuckShootGame,
    name: 'Target Shoot',
    leaderboardType: 'duck_shoot',
    icon: Crosshair,
  },
}

function GamePageContent() {
  const searchParams = useSearchParams()
  const gameTypeParam = searchParams.get('type')
  const { user, loading: authLoading } = useAuth()
  const { balance, dailyGrantAvailable, refreshBalance, referralCode, loading: creditsLoading } = useCredits()

  // Use URL param or default to emoji_keypad
  const gameType = gameTypeParam && GAME_CONFIG[gameTypeParam] ? gameTypeParam : 'emoji_keypad'
  const config = GAME_CONFIG[gameType]
  const iconColors = GAME_ICON_COLORS[gameType] || GAME_ICON_COLORS.emoji_keypad
  const GameIcon = config.icon
  const [poolSize, setPoolSize] = useState<number | null>(null)

  const fetchPoolSize = useCallback(async () => {
    try {
      const res = await fetch('/api/games')
      if (res.ok) {
        const data = await res.json()
        const game = data.games?.find((g: { id: string }) => g.id === gameType)
        if (game) setPoolSize(game.poolSize)
      }
    } catch {}
  }, [gameType])

  useEffect(() => {
    fetchPoolSize()
  }, [fetchPoolSize])

  const handleGameComplete = () => {
    refreshBalance()
    fetchPoolSize()
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
    <div className="max-w-6xl mx-auto px-4 py-8 overflow-x-hidden">
      {/* Game Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <div className={`p-2 ${iconColors.bg} rounded-lg`}>
            <GameIcon className={`w-6 h-6 ${iconColors.icon}`} />
          </div>
          <h1 className="text-2xl font-bold text-white font-title">{config.name}</h1>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          {!creditsLoading && balance < 1 && !dailyGrantAvailable && referralCode && (
            <ReferralBanner referralCode={referralCode} />
          )}

          {(balance >= 1 || dailyGrantAvailable) && (
            <GameComponent onGameComplete={handleGameComplete} />
          )}
        </div>

        <div>
          <div className="bg-slate-800 rounded-xl p-4 mb-6">
            <div className="text-lg font-bold text-yellow-400">
              {poolSize !== null ? (
                poolSize > 0 ? `${poolSize.toLocaleString()} $Credits Pool` : 'No Pool Yet'
              ) : (
                <span className="animate-pulse">Loading...</span>
              )}
            </div>
          </div>
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
