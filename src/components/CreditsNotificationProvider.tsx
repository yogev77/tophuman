'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { useCredits } from '@/hooks/useCredits'
import { toast } from 'sonner'
import { ClaimSuccessModal } from './ClaimSuccessModal'

interface CreditsNotificationContextType {
  balance: number
  dailyGrantAvailable: boolean
  pendingTotal: number
  hasPendingClaims: boolean
  displayName: string | null
  username: string | null
  referralCode: string | null
  userId: string | null
  loading: boolean
  error: string | null
  claimCredits: () => Promise<boolean>
  refreshBalance: () => Promise<void>
  isCounterAnimating: boolean
  isBottomBarDismissed: boolean
  dismissBottomBar: () => void
  hasUnseenNotification: boolean
  markNotificationSeen: () => void
}

const CreditsNotificationContext = createContext<CreditsNotificationContextType | undefined>(undefined)

export function CreditsNotificationProvider({ children }: { children: React.ReactNode }) {
  const credits = useCredits()
  const [isCounterAnimating, setIsCounterAnimating] = useState(false)
  const [isBottomBarDismissed, setIsBottomBarDismissed] = useState(true) // Start hidden to avoid flash
  const [hasUnseenNotification, setHasUnseenNotification] = useState(false)
  const [claimModal, setClaimModal] = useState<{
    isOpen: boolean
    amount: number
    newBalance: number
    reason: 'daily' | 'prize' | 'referral' | 'rebate'
    claimedItems: { type: string; amount: number }[]
  }>({ isOpen: false, amount: 0, newBalance: 0, reason: 'daily', claimedItems: [] })

  const hasPendingClaims = credits.pendingTotal > 0
  const hasClaimable = credits.dailyGrantAvailable || hasPendingClaims

  // Track previous claimable state to detect new claims
  const prevHasClaimableRef = useRef<boolean | null>(null)

  // Check sessionStorage on mount and reset bar when new claims appear
  useEffect(() => {
    // Skip until loading is done
    if (credits.loading) return

    const dismissed = sessionStorage.getItem('credits-bar-dismissed')
    const wasDismissed = dismissed === 'true'

    // If we have claimable credits and the state changed from no claims to having claims
    // OR this is first load with claims, show the bar
    if (hasClaimable) {
      if (prevHasClaimableRef.current === false || prevHasClaimableRef.current === null) {
        // New claims arrived! Reset dismissed state and show notification
        setIsBottomBarDismissed(false)
        setHasUnseenNotification(true)
        sessionStorage.removeItem('credits-bar-dismissed')
      } else if (!wasDismissed) {
        setIsBottomBarDismissed(false)
        setHasUnseenNotification(true)
      }
    } else {
      setIsBottomBarDismissed(wasDismissed)
      setHasUnseenNotification(false)
    }

    prevHasClaimableRef.current = hasClaimable
  }, [credits.loading, hasClaimable])

  const dismissBottomBar = useCallback(() => {
    setIsBottomBarDismissed(true)
    sessionStorage.setItem('credits-bar-dismissed', 'true')
  }, [])

  const markNotificationSeen = useCallback(() => {
    setHasUnseenNotification(false)
  }, [])

  const closeClaimModal = useCallback(() => {
    setClaimModal(prev => ({ ...prev, isOpen: false }))
    // Refresh the page to update pool/ticker data after claiming
    window.location.reload()
  }, [])

  // Unified claim function that handles both daily grants and pending winnings
  const claimCredits = useCallback(async () => {
    // First claim pending winnings if any
    if (credits.pendingTotal > 0) {
      const result = await credits.claimWinnings()

      if (result) {
        // Trigger counter animation
        setIsCounterAnimating(true)
        setTimeout(() => setIsCounterAnimating(false), 1200)

        // Show celebratory modal with breakdown
        setClaimModal({
          isOpen: true,
          amount: result.totalClaimed,
          newBalance: result.newBalance,
          reason: result.primaryType === 'prize' ? 'prize' :
                  result.primaryType === 'referral' ? 'referral' : 'rebate',
          claimedItems: result.claimed || [],
        })

        // Dismiss bottom bar and clear notification
        setIsBottomBarDismissed(true)
        setHasUnseenNotification(false)
        sessionStorage.setItem('credits-bar-dismissed', 'true')
        return true
      } else {
        toast.error(credits.error || 'Failed to claim winnings. Please try again.', { duration: 4000 })
        return false
      }
    }

    // Otherwise claim daily grant
    if (credits.dailyGrantAvailable) {
      const success = await credits.claimDailyGrant()

      if (success) {
        // Trigger counter animation
        setIsCounterAnimating(true)
        setTimeout(() => setIsCounterAnimating(false), 1200)

        // Show celebratory modal with breakdown
        setClaimModal({
          isOpen: true,
          amount: 10,
          newBalance: credits.balance + 10,
          reason: 'daily',
          claimedItems: [{ type: 'daily_grant', amount: 10 }],
        })

        // Dismiss bottom bar and clear notification
        setIsBottomBarDismissed(true)
        setHasUnseenNotification(false)
        sessionStorage.setItem('credits-bar-dismissed', 'true')
      } else {
        toast.error(credits.error || 'Failed to claim credits. Please try again.', { duration: 4000 })
      }

      return success
    }

    return false
  }, [credits])

  return (
    <CreditsNotificationContext.Provider value={{
      balance: credits.balance,
      dailyGrantAvailable: credits.dailyGrantAvailable,
      pendingTotal: credits.pendingTotal,
      hasPendingClaims,
      displayName: credits.displayName,
      username: credits.username,
      referralCode: credits.referralCode,
      userId: credits.userId,
      loading: credits.loading,
      error: credits.error,
      claimCredits,
      refreshBalance: credits.refreshBalance,
      isCounterAnimating,
      isBottomBarDismissed,
      dismissBottomBar,
      hasUnseenNotification,
      markNotificationSeen,
    }}>
      {children}
      <ClaimSuccessModal
        isOpen={claimModal.isOpen}
        onClose={closeClaimModal}
        amount={claimModal.amount}
        newBalance={claimModal.newBalance}
        reason={claimModal.reason}
        claimedItems={claimModal.claimedItems}
      />
    </CreditsNotificationContext.Provider>
  )
}

export function useCreditsNotification() {
  const context = useContext(CreditsNotificationContext)
  if (context === undefined) {
    throw new Error('useCreditsNotification must be used within CreditsNotificationProvider')
  }
  return context
}
