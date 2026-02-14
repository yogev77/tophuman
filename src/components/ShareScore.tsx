'use client'

import { useState } from 'react'
import { Share2, Check } from 'lucide-react'
import { useCredits } from '@/hooks/useCredits'
import { CC } from '@/lib/currency'

interface ShareScoreProps {
  gameName: string
  score: number
  rank?: number
  inline?: boolean
}

export function ShareScore({ gameName, score, rank, inline }: ShareScoreProps) {
  const [copied, setCopied] = useState(false)
  const { referralCode } = useCredits()

  const referralUrl = typeof window !== 'undefined' && referralCode
    ? `${window.location.origin}/auth/signup?ref=${referralCode}`
    : typeof window !== 'undefined'
    ? window.location.origin
    : ''

  const shareText = rank
    ? `I just scored ${score.toLocaleString()} points and ranked #${rank} in ${gameName} on Podium Arena! Can you beat me?`
    : `I just scored ${score.toLocaleString()} points in ${gameName} on Podium Arena! Can you beat me?`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n\n${referralUrl}`)
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
          title: `${gameName} Score - Podium Arena`,
          text: shareText,
          url: referralUrl,
        })
      } catch {
        handleCopy()
      }
    } else {
      handleCopy()
    }
  }

  if (inline) {
    return (
      <button
        onClick={handleShare}
        className="flex items-center justify-center gap-2 border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 rounded-lg transition"
      >
        {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
        {copied ? 'Copied!' : 'Share Score'}
      </button>
    )
  }

  return (
    <div className="w-full max-w-xs mx-auto mt-4">
      <button
        onClick={handleShare}
        className="w-full flex items-center justify-center gap-2 border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 font-bold py-3 rounded-lg transition"
      >
        {copied ? <Check className="w-5 h-5" /> : <Share2 className="w-5 h-5" />}
        {copied ? 'Copied!' : 'Share Score'}
      </button>
      <p className="text-sm text-slate-400 mt-3 text-center">
        Invite people to compete with you and get <span className="text-yellow-400 font-semibold">100 <CC />Credits</span> when they join!
      </p>
    </div>
  )
}
