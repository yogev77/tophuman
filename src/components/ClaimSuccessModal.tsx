'use client'

import { useEffect, useState } from 'react'
import { Gift, X, Sparkles, Trophy, Users, Coins, Vault } from 'lucide-react'
import { CC } from '@/lib/currency'

interface ClaimedItem {
  type: string
  amount: number
  gameTypeId?: string
}

const GAME_NAMES: Record<string, string> = {
  emoji_keypad_sequence: 'Sequence',
  image_rotate: 'Puzzle Spin',
  reaction_time: 'Reaction Tap',
  whack_a_mole: 'Whack-a-Mole',
  typing_speed: 'Typing Speed',
  mental_math: 'Mental Math',
  color_match: 'Color Match',
  visual_diff: 'Spot the Diff',
  audio_pattern: 'Simon Says',
  drag_sort: 'Drag & Sort',
  follow_me: 'Follow Me',
  duck_shoot: 'Target Shoot',
  memory_cards: 'Memory Cards',
  number_chain: 'Number Chain',
  gridlock: 'Gridlock',
}

interface ClaimSuccessModalProps {
  isOpen: boolean
  onClose: () => void
  amount: number
  newBalance: number
  reason: 'daily' | 'prize' | 'referral' | 'rebate'
  claimedItems?: ClaimedItem[]
}

export function ClaimSuccessModal({ isOpen, onClose, amount, newBalance, reason, claimedItems }: ClaimSuccessModalProps) {
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true)
    }
  }, [isOpen])

  if (!isOpen) return null

  const getContent = () => {
    switch (reason) {
      case 'daily':
        return {
          title: 'Daily Credits Claimed!',
          subtitle: 'Your daily reward is ready to play',
          icon: <Gift className="w-12 h-12 text-yellow-400" />,
        }
      case 'prize':
        return {
          title: 'You Won!',
          subtitle: 'Congratulations on your victory',
          icon: <Sparkles className="w-12 h-12 text-yellow-400" />,
        }
      case 'referral':
        return {
          title: 'Referral Bonus!',
          subtitle: 'Thanks for spreading the word',
          icon: <Gift className="w-12 h-12 text-green-400" />,
        }
      case 'rebate':
        return {
          title: 'Rewards Claimed!',
          subtitle: 'Thanks for playing',
          icon: <Gift className="w-12 h-12 text-blue-400" />,
        }
    }
  }

  const getItemLabel = (type: string) => {
    switch (type) {
      case 'prize_win':
        return { label: '1st Place Prize', icon: <Trophy className="w-4 h-4 text-yellow-400" /> }
      case 'rebate':
        return { label: 'Credit Back', icon: <Coins className="w-4 h-4 text-blue-400" /> }
      case 'daily_grant':
        return { label: 'Daily Claim', icon: <Gift className="w-4 h-4 text-green-400" /> }
      case 'referral_bonus':
        return { label: 'Referral Bonus', icon: <Users className="w-4 h-4 text-purple-400" /> }
      case 'sink':
        return { label: 'Treasury Deposit', icon: <Vault className="w-4 h-4 text-yellow-400" /> }
      case 'admin_adjustment':
        return { label: 'Admin Grant', icon: <Sparkles className="w-4 h-4 text-orange-400" /> }
      default:
        return { label: type.replace(/_/g, ' '), icon: <Coins className="w-4 h-4 text-slate-400" /> }
    }
  }

  const content = getContent()

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative bg-gradient-to-b from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl border border-slate-200 dark:border-slate-700 transform transition-all duration-300 ${
          isAnimating ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Animated background sparkles */}
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute top-4 left-8 w-2 h-2 bg-yellow-400 rounded-full animate-ping" style={{ animationDelay: '0s' }} />
          <div className="absolute top-12 right-12 w-1.5 h-1.5 bg-yellow-300 rounded-full animate-ping" style={{ animationDelay: '0.3s' }} />
          <div className="absolute bottom-16 left-12 w-1 h-1 bg-yellow-500 rounded-full animate-ping" style={{ animationDelay: '0.6s' }} />
          <div className="absolute bottom-8 right-8 w-2 h-2 bg-yellow-400 rounded-full animate-ping" style={{ animationDelay: '0.9s' }} />
        </div>

        {/* Icon */}
        <div className="relative mb-4">
          <div className="w-20 h-20 mx-auto bg-yellow-500/20 rounded-full flex items-center justify-center animate-bounce">
            {content.icon}
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1 font-title">
          {content.title}
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
          {content.subtitle}
        </p>

        {/* Claimed Items Breakdown */}
        <div className="bg-slate-100 dark:bg-slate-700/50 rounded-xl p-4 mb-4">
          {claimedItems && claimedItems.length > 0 ? (
            <div className="space-y-2 mb-3">
              {claimedItems.map((item, index) => {
                const { label, icon } = getItemLabel(item.type)
                const gameName = item.gameTypeId ? GAME_NAMES[item.gameTypeId] : null
                return (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {icon}
                      <div>
                        <span className="text-slate-700 dark:text-slate-300">{label}</span>
                        {gameName && (
                          <div className="text-xs text-slate-400 dark:text-slate-500">{gameName}</div>
                        )}
                      </div>
                    </div>
                    <span className="text-green-600 dark:text-green-400 font-semibold">+{item.amount}</span>
                  </div>
                )
              })}
              {claimedItems.length > 1 && (
                <div className="border-t border-slate-200 dark:border-slate-600 pt-2 mt-2 flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400 text-sm">Total</span>
                  <span className="text-yellow-600 dark:text-yellow-400 font-bold text-lg">+{amount} <CC />Credits</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mb-1">
              +{amount} <CC />Credits
            </div>
          )}
          <div className="text-slate-500 dark:text-slate-400 text-sm text-center pt-2 border-t border-slate-200 dark:border-slate-600">
            New balance: <span className="text-slate-900 dark:text-white font-semibold">{newBalance} <CC />Credits</span>
          </div>
        </div>

        {/* CTA Button */}
        <button
          onClick={onClose}
          className="w-full bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-lg transition"
        >
          Let&apos;s Play!
        </button>
      </div>
    </div>
  )
}
