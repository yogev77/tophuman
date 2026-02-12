'use client'

import { useCreditsNotification } from './CreditsNotificationProvider'
import { useAuth } from '@/hooks/useAuth'
import { X, Trophy, Gift, Loader2 } from 'lucide-react'
import { C } from '@/lib/currency'

export function BottomNotificationBar() {
  const { user } = useAuth()
  const {
    dailyGrantAvailable,
    hasPendingClaims,
    pendingTotal,
    loading,
    claimCredits,
    isClaiming,
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
    ? `You won ${pendingTotal} ${C}Credits!`
    : 'Daily credits ready to claim.'
  const buttonText = isPrizeWinning ? 'Claim Winnings' : 'Claim Credits'

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 border-t ${
      isPrizeWinning
        ? 'bg-gradient-to-r from-yellow-700/95 to-amber-700/95 dark:from-yellow-900/90 dark:to-amber-900/90 border-yellow-600'
        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
    }`}>
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {isPrizeWinning ? (
            <Trophy className="w-5 h-5 text-yellow-300 dark:text-yellow-400" />
          ) : (
            <Gift className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          )}
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <span className={`font-semibold ${isPrizeWinning ? 'text-yellow-100 dark:text-yellow-400' : 'text-slate-900 dark:text-white'}`}>
              {message}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => claimCredits()}
            disabled={isClaiming}
            className={`font-semibold text-sm px-4 py-1.5 rounded-lg transition flex items-center gap-2 ${
              isClaiming
                ? 'bg-yellow-500/60 text-slate-900/60 cursor-not-allowed'
                : isPrizeWinning
                  ? 'bg-yellow-500 hover:bg-yellow-400 text-slate-900 animate-pulse'
                  : 'bg-yellow-500 hover:bg-yellow-400 text-slate-900'
            }`}
          >
            {isClaiming && <Loader2 className="w-4 h-4 animate-spin" />}
            {isClaiming ? 'Claiming...' : buttonText}
          </button>
          <button
            onClick={dismissBottomBar}
            className={`transition p-1 ${isPrizeWinning ? 'text-yellow-200/70 hover:text-white' : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'}`}
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
