'use client'

import { GAME_ICONS } from '@/lib/game-icons'
import { GAMES } from '@/lib/skills'

interface GameLoadingProps {
  gameId: string
  message?: string
}

export function GameLoading({ gameId, message = 'Preparing game...' }: GameLoadingProps) {
  const Icon = GAME_ICONS[gameId]
  const colors = GAMES[gameId]?.iconColors

  return (
    <div className="flex flex-col items-center justify-center py-16">
      {Icon && (
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center animate-[breathe_2s_ease-in-out_infinite] ${colors?.bg || 'bg-slate-500/15'}`}>
          <Icon className={`w-7 h-7 ${colors?.icon || 'text-slate-400'}`} />
        </div>
      )}
      <p className="text-slate-400 text-sm mt-4">{message}</p>
    </div>
  )
}
