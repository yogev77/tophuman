'use client'

import { useRef, useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { useGroupPlay } from './GroupPlayProvider'
import { GroupPlayDrawer } from './GroupPlayDrawer'
import { CC } from '@/lib/currency'

export function GroupPlayBar() {
  const { activeGroups, hasActiveGroups, showDrawer, setShowDrawer } = useGroupPlay()
  const [visible, setVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

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

  // Remove from DOM after exit animation
  const handleTransitionEnd = () => {
    if (!visible && !hasActiveGroups) {
      setShouldRender(false)
    }
  }

  if (!shouldRender) return null

  const totalPlayers = activeGroups.reduce((sum, g) => sum + g.playerCount, 0)
  const totalPool = activeGroups.reduce((sum, g) => sum + g.turnCount, 0)

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
              <span className="text-slate-500 dark:text-slate-400">
                · See {activeGroups.length} {activeGroups.length === 1 ? 'Group' : 'Groups'}
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
