'use client'

import { useEffect, useState } from 'react'
import { Gift, X, Sparkles } from 'lucide-react'

interface ClaimSuccessModalProps {
  isOpen: boolean
  onClose: () => void
  amount: number
  newBalance: number
  reason: 'daily' | 'prize' | 'referral' | 'rebate'
}

export function ClaimSuccessModal({ isOpen, onClose, amount, newBalance, reason }: ClaimSuccessModalProps) {
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true)
      // Auto-close after 5 seconds
      const timer = setTimeout(() => {
        onClose()
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const getContent = () => {
    switch (reason) {
      case 'daily':
        return {
          title: 'Daily Credits Claimed!',
          subtitle: 'Your daily reward is ready to play',
          icon: <Gift className="w-12 h-12 text-yellow-400" />,
          message: 'Come back tomorrow for more free credits!',
        }
      case 'prize':
        return {
          title: 'You Won!',
          subtitle: 'Congratulations on your victory',
          icon: <Sparkles className="w-12 h-12 text-yellow-400" />,
          message: 'You topped the leaderboard and earned prize credits!',
        }
      case 'referral':
        return {
          title: 'Referral Bonus!',
          subtitle: 'Thanks for spreading the word',
          icon: <Gift className="w-12 h-12 text-green-400" />,
          message: 'Your friend joined and you earned bonus credits!',
        }
      case 'rebate':
        return {
          title: 'Participation Reward!',
          subtitle: 'Thanks for playing',
          icon: <Gift className="w-12 h-12 text-blue-400" />,
          message: 'You earned credits for participating in yesterday\'s games!',
        }
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
        className={`relative bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl border border-slate-700 transform transition-all duration-300 ${
          isAnimating ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-white transition"
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
        <h2 className="text-2xl font-bold text-white mb-1 font-title">
          {content.title}
        </h2>
        <p className="text-slate-400 text-sm mb-6">
          {content.subtitle}
        </p>

        {/* Amount */}
        <div className="bg-slate-700/50 rounded-xl p-4 mb-4">
          <div className="text-4xl font-bold text-yellow-400 mb-1">
            +{amount} $Credits
          </div>
          <div className="text-slate-400 text-sm">
            New balance: <span className="text-white font-semibold">{newBalance} $Credits</span>
          </div>
        </div>

        {/* Message */}
        <p className="text-slate-300 text-sm mb-6">
          {content.message}
        </p>

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
