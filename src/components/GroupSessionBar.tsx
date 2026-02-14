'use client'

import { useState, useEffect, useRef } from 'react'
import { Check, Users, Copy, Share2 } from 'lucide-react'
import { Link } from 'next-view-transitions'

interface GroupSessionBarProps {
  endsAt: string
  playerCount: number
  joinToken: string
  isEnded: boolean
  creatorName?: string
  creatorUsername?: string | null
  gameName?: string
}

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return '0 minutes'
  const minutes = Math.ceil(ms / 60000)
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`
}

export function GroupSessionBar({ endsAt, playerCount, joinToken, isEnded, creatorName, creatorUsername, gameName }: GroupSessionBarProps) {
  const [copied, setCopied] = useState(false)
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, new Date(endsAt).getTime() - Date.now()))
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimeLeft(Math.max(0, new Date(endsAt).getTime() - Date.now()))
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [endsAt])

  const handleInvite = async () => {
    const url = `${window.location.origin}/group/${joinToken}`
    const timeStr = formatTimeLeft(timeLeft)
    const gameLabel = gameName ? ` playing ${gameName}` : ''
    const shareText = `Join my Private Group on Podium Arena! We're competing${gameLabel} head-to-head \u23F1\uFE0F ${timeStr} left.`

    // Mobile: use native share sheet
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    if (isMobile && navigator.share) {
      try {
        await navigator.share({
          title: 'Private Group on Podium Arena',
          text: shareText,
          url,
        })
        return
      } catch {
        // fall through to copy
      }
    }

    // Desktop: copy invite link
    try {
      await navigator.clipboard.writeText(`${shareText}\n\n${url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      // silent
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl px-4 py-3">
      {/* Label */}
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-4 h-4 text-purple-500" />
        <span className="text-sm font-bold text-purple-600 dark:text-purple-400">Private Group</span>
      </div>

      {/* Creator + CTA */}
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        {creatorName ? (
          <>Created by {creatorUsername ? (
            <Link href={`/player/${creatorUsername}`} className="text-yellow-500 hover:text-yellow-400 transition">
              {creatorName}
            </Link>
          ) : creatorName}. </>
        ) : ''}
        {isEnded
          ? 'This session has ended.'
          : 'Invite friends to compete before time runs out!'}
      </p>

      {!isEnded && (
        <button
          onClick={handleInvite}
          className="w-full flex items-center justify-center gap-1.5 text-sm border border-yellow-500 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10 px-3 py-2 rounded-lg transition"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Invite copied!' : 'Invite Friends'}
        </button>
      )}
    </div>
  )
}
