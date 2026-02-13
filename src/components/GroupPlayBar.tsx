'use client'

import { Users } from 'lucide-react'
import { useGroupPlay } from './GroupPlayProvider'
import { GroupPlayDrawer } from './GroupPlayDrawer'
import { CC } from '@/lib/currency'

export function GroupPlayBar() {
  const { activeGroups, hasActiveGroups, showDrawer, setShowDrawer } = useGroupPlay()

  if (!hasActiveGroups) return null

  const totalPlayers = activeGroups.reduce((sum, g) => sum + g.playerCount, 0)
  const totalPool = activeGroups.reduce((sum, g) => sum + g.turnCount, 0)

  return (
    <>
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
      <GroupPlayDrawer />
    </>
  )
}
