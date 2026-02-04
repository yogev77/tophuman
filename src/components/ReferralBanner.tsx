'use client'

import { useState } from 'react'
import { Share2, Copy, Check } from 'lucide-react'

interface ReferralBannerProps {
  referralCode: string
}

export function ReferralBanner({ referralCode }: ReferralBannerProps) {
  const [copied, setCopied] = useState(false)

  const referralUrl = typeof window !== 'undefined'
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
          text: 'Play skill games and win $Credits! Join using my link:',
          url: referralUrl,
        })
      } catch (err) {
        // User cancelled or share failed
        handleCopy()
      }
    } else {
      handleCopy()
    }
  }

  return (
    <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-xl p-6 mb-6">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-purple-500/20 rounded-full">
          <Share2 className="w-6 h-6 text-purple-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-white mb-2">Out of $Credits?</h3>
          <p className="text-slate-300 mb-4">
            Share your invite link with friends! When they join and verify their email,
            you&apos;ll get <span className="text-yellow-400 font-bold">100 $Credits</span> as a thank you!
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 bg-slate-800 rounded-lg px-4 py-2 flex items-center gap-2 overflow-hidden">
              <span className="text-slate-400 text-sm truncate">{referralUrl}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 px-4 py-2 rounded-lg transition"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-slate-900 px-4 py-2 rounded-lg transition"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
