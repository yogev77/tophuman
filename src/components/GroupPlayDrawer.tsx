'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Clock, Users } from 'lucide-react'
import { useGroupPlay, ActiveGroup } from './GroupPlayProvider'
import { GAME_ICONS } from '@/lib/game-icons'
import { CC } from '@/lib/currency'

function formatTimeRemaining(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now()
  if (diff <= 0) return '0:00'
  const totalSec = Math.floor(diff / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min >= 1) return `${min}m`
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function isEndingSoon(endsAt: string): boolean {
  return new Date(endsAt).getTime() - Date.now() < 2 * 60 * 1000
}

function sortGroups(groups: ActiveGroup[]): ActiveGroup[] {
  return [...groups].sort((a, b) => {
    // Ending soonest first
    const timeA = new Date(a.endsAt).getTime()
    const timeB = new Date(b.endsAt).getTime()
    if (timeA !== timeB) return timeA - timeB
    // Then highest pool (turns)
    if (b.turnCount !== a.turnCount) return b.turnCount - a.turnCount
    // Then most players
    return b.playerCount - a.playerCount
  })
}

export function GroupPlayDrawer() {
  const router = useRouter()
  const { activeGroups, showDrawer, setShowDrawer } = useGroupPlay()
  const [, setTick] = useState(0)

  // Live countdown tick every second when drawer is open
  useEffect(() => {
    if (!showDrawer) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [showDrawer])

  const sorted = sortGroups(activeGroups)

  const handleGroupClick = (joinToken: string) => {
    setShowDrawer(false)
    router.push(`/group/${joinToken}`)
  }

  return (
    <>
      {/* Backdrop */}
      {showDrawer && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setShowDrawer(false)}
        />
      )}

      {/* Drawer panel */}
      <div
        className={`relative z-50 overflow-hidden transition-all duration-200 ${
          showDrawer ? 'max-h-[400px]' : 'max-h-0'
        }`}
      >
        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          {/* Drawer header */}
          <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Group Play</h3>
            <button
              onClick={() => setShowDrawer(false)}
              className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Group list */}
          <div className="max-w-6xl mx-auto max-h-[340px] overflow-y-auto">
            {sorted.map(group => {
              const Icon = GAME_ICONS[group.gameId] || GAME_ICONS.emoji_keypad
              const endingSoon = isEndingSoon(group.endsAt)

              return (
                <button
                  key={group.id}
                  onClick={() => handleGroupClick(group.joinToken)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition text-left"
                >
                  <div className="p-1.5 bg-purple-500/20 rounded-lg shrink-0">
                    <Icon className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {group.gameName}
                      </span>
                      {endingSoon && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-500/20 text-red-500">
                          Ending Soon
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimeRemaining(group.endsAt)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {group.playerCount}
                      </span>
                      <span><CC />{group.turnCount}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
