'use client'

import { useState, useEffect, useRef } from 'react'
import { Check, Users, Clock, Share2 } from 'lucide-react'

interface GroupSessionBarProps {
  endsAt: string
  playerCount: number
  joinToken: string
  isEnded: boolean
  turnCount?: number
}

function formatGroupCountdown(ms: number): string {
  if (ms <= 0) return '0:00'
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function GroupSessionBar({ endsAt, playerCount, joinToken, isEnded }: GroupSessionBarProps) {
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
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Private Group on Podium Arena',
          text: 'Join my private group play session!',
          url,
        })
        return
      } catch {
        // fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // silent
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl px-4 py-3">
      {/* Row 1: Label */}
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-4 h-4 text-purple-500" />
        <span className="text-sm font-bold text-purple-600 dark:text-purple-400">Private Group</span>
      </div>

      {/* Row 2: Stats + Invite */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          {isEnded || timeLeft <= 0 ? (
            <span className="text-red-400 font-medium">Ended</span>
          ) : (
            <span className="text-yellow-500 font-mono font-medium">{formatGroupCountdown(timeLeft)}</span>
          )}
        </div>

        <div className="w-px h-4 bg-slate-300 dark:bg-slate-600" />

        <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          <Users className="w-3.5 h-3.5 text-slate-400" />
          <span>{playerCount}</span>
        </div>

        <div className="ml-auto">
          <button
            onClick={handleInvite}
            className="flex items-center gap-1.5 text-sm border border-yellow-500 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10 px-3 py-1.5 rounded-lg transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Share2 className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Invite'}
          </button>
        </div>
      </div>
    </div>
  )
}
