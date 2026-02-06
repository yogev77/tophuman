'use client'

import { useCreditsNotification } from './CreditsNotificationProvider'
import { useAuth } from '@/hooks/useAuth'
import { X, Trophy, Gift } from 'lucide-react'

export function BottomNotificationBar() {
  const { user } = useAuth()
  const {
    dailyGrantAvailable,
    hasPendingClaims,
    pendingTotal,
    loading,
    claimCredits,
    isBottomBarDismissed,
    dismissBottomBar,
  } = useCreditsNotification()

  // Show footer banner for both daily grants and pending winnings
  const hasClaimable = dailyGrantAvailable || hasPendingClaims

  if (!user || loading || !hasClaimable || isBottomBarDismissed) {
    return null
  }

  // Prioritize showing winnings over daily grant
  const isPrizeWinning = hasPendingClaims
  const message = isPrizeWinning
    ? `You won ${pendingTotal} $Credits!`
    : 'Daily credits ready to claim.'
  const buttonText = isPrizeWinning ? 'Claim Winnings' : 'Claim Credits'

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 border-t ${
      isPrizeWinning
        ? 'bg-gradient-to-r from-yellow-900/90 to-amber-900/90 border-yellow-600'
        : 'bg-slate-800 border-slate-700'
    }`}>
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {isPrizeWinning ? (
            <Trophy className="w-5 h-5 text-yellow-400" />
          ) : (
            <Gift className="w-5 h-5 text-yellow-400" />
          )}
          <p className="text-sm text-slate-300">
            <span className={`font-semibold ${isPrizeWinning ? 'text-yellow-400' : 'text-white'}`}>
              {message}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => claimCredits()}
            className={`font-semibold text-sm px-4 py-1.5 rounded-lg transition ${
              isPrizeWinning
                ? 'bg-yellow-500 hover:bg-yellow-400 text-slate-900 animate-pulse'
                : 'bg-yellow-500 hover:bg-yellow-400 text-slate-900'
            }`}
          >
            {buttonText}
          </button>
          <button
            onClick={dismissBottomBar}
            className="text-slate-500 hover:text-slate-300 transition p-1"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
