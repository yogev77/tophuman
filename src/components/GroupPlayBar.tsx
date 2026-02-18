'use client'

import { useRef, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Users, Clock } from 'lucide-react'
import { useGroupPlay } from './GroupPlayProvider'
import { GroupPlayDrawer } from './GroupPlayDrawer'
import { CC } from '@/lib/currency'
function formatCountdown(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now()
  if (diff <= 0) return '0:00'
  const totalSec = Math.floor(diff / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export function GroupPlayBar() {
  const { activeGroups, hasActiveGroups, showDrawer, setShowDrawer } = useGroupPlay()
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (hasActiveGroups) {
      setShouldRender(true)
      // Delay to allow DOM paint before animating in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    } else {
      setVisible(false)
    }
  }, [hasActiveGroups])

  // Live countdown tick every second
  useEffect(() => {
    if (!hasActiveGroups) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [hasActiveGroups])

  // Remove from DOM after exit animation
  const handleTransitionEnd = () => {
    if (!visible && !hasActiveGroups) {
      setShouldRender(false)
    }
  }

  if (!shouldRender) return null

  const totalPlayers = activeGroups.reduce((sum, g) => sum + g.playerCount, 0)
  const totalPool = activeGroups.reduce((sum, g) => sum + g.turnCount, 0)
  // On a group page, show that group's timer; otherwise show the soonest
  const groupToken = pathname.startsWith('/group/') ? pathname.split('/')[2] : null
  const currentGroup = groupToken ? activeGroups.find(g => g.joinToken === groupToken) : null
  const timerGroup = currentGroup ?? activeGroups.reduce((a, b) =>
    new Date(a.endsAt).getTime() < new Date(b.endsAt).getTime() ? a : b
  )

  return (
    <>
      <div
        ref={barRef}
        onTransitionEnd={handleTransitionEnd}
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{
          maxHeight: visible ? '48px' : '0px',
          opacity: visible ? 1 : 0,
        }}
      >
        <button
          onClick={() => setShowDrawer(!showDrawer)}
          className="w-full bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 py-2 transition hover:bg-slate-100 dark:hover:bg-slate-700/50"
        >
          <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-purple-500" />
              <span className="font-medium text-purple-600 dark:text-purple-400">Group Play</span>
              <span className="inline-flex items-center gap-1 tabular-nums text-slate-600 dark:text-slate-300">
                · <Clock className="w-3.5 h-3.5" />
                {formatCountdown(timerGroup.endsAt)}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span>Players: {totalPlayers}</span>
              <span>Pool: <span className="text-yellow-500 font-medium"><CC />{totalPool}</span></span>
            </div>
          </div>
        </button>
      </div>
      <GroupPlayDrawer />
    </>
  )
}
