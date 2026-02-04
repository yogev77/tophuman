'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
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
  ArrowLeft,
  Gift,
  LucideIcon,
} from 'lucide-react'

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
}

function GamePageContent() {
  const searchParams = useSearchParams()
  const gameTypeParam = searchParams.get('type')
  const { user, loading: authLoading } = useAuth()
  const { balance, dailyGrantAvailable, claimDailyGrant, refreshBalance, loading: creditsLoading } = useCredits()

  // Use URL param or default to emoji_keypad
  const gameType = gameTypeParam && GAME_CONFIG[gameTypeParam] ? gameTypeParam : 'emoji_keypad'
  const config = GAME_CONFIG[gameType]
  const GameIcon = config.icon

  const handleGameComplete = () => {
    refreshBalance()
  }

  if (authLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-800 rounded w-1/4 mb-8"></div>
          <div className="h-96 bg-slate-800 rounded"></div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-slate-800 rounded-xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Login Required</h2>
          <p className="text-slate-300 mb-6">
            You need to be logged in to play games.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/auth/login"
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-lg transition"
            >
              Login
            </Link>
            <Link
              href="/auth/signup"
              className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-lg transition"
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
      <div className="max-w-6xl mx-auto px-4 py-8">
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
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Game Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <GameIcon className="w-6 h-6 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">{config.name}</h1>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <div className="bg-slate-800 rounded-xl p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-slate-400">Your Balance:</span>
              {creditsLoading ? (
                <div className="h-8 w-20 bg-slate-700 animate-pulse rounded"></div>
              ) : (
                <span className="text-2xl font-bold text-yellow-400">{balance} $Credits</span>
              )}
            </div>
            {dailyGrantAvailable && (
              <button
                onClick={claimDailyGrant}
                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg transition flex items-center gap-2"
              >
                <Gift className="w-5 h-5" />
                Claim 5 Daily $Credits
              </button>
            )}
          </div>

          {!creditsLoading && balance < 1 && !dailyGrantAvailable && (
            <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-xl p-4 mb-6 text-center">
              <p className="text-yellow-400">
                You need at least 1 $Credit to play. Come back tomorrow for your daily grant!
              </p>
            </div>
          )}

          {(balance >= 1 || dailyGrantAvailable) && (
            <GameComponent onGameComplete={handleGameComplete} />
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
      <div className="max-w-6xl mx-auto px-4 py-8">
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
