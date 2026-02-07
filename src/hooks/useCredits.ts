'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface PendingClaim {
  id: string
  claim_type: string
  amount: number
  utc_day: string
  metadata: Record<string, unknown> | null
}

interface CreditsState {
  balance: number
  dailyGrantAvailable: boolean
  pendingClaims: PendingClaim[]
  pendingTotal: number
  userId: string | null
  displayName: string | null
  username: string | null
  referralCode: string | null
  loading: boolean
  error: string | null
}

export function useCredits() {
  const [state, setState] = useState<CreditsState>({
    balance: 0,
    dailyGrantAvailable: false,
    pendingClaims: [],
    pendingTotal: 0,
    userId: null,
    displayName: null,
    username: null,
    referralCode: null,
    loading: true,
    error: null,
  })

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/credits/balance')
      if (!res.ok) {
        if (res.status === 401) {
          setState(s => ({ ...s, loading: false }))
          return
        }
        throw new Error('Failed to fetch balance')
      }
      const data = await res.json()
      setState({
        balance: data.balance,
        dailyGrantAvailable: data.dailyGrantAvailable,
        pendingClaims: data.pendingClaims || [],
        pendingTotal: data.pendingTotal || 0,
        userId: data.userId,
        displayName: data.displayName,
        username: data.username || null,
        referralCode: data.referralCode,
        loading: false,
        error: null,
      })
    } catch (err) {
      setState(s => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()

    // Fetch balance initially
    fetchBalance()

    // Re-fetch when auth state changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        fetchBalance()
      } else if (event === 'SIGNED_OUT') {
        setState({
          balance: 0,
          dailyGrantAvailable: false,
          pendingClaims: [],
          pendingTotal: 0,
          userId: null,
          displayName: null,
          username: null,
          referralCode: null,
          loading: false,
          error: null,
        })
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchBalance])

  const claimDailyGrant = async () => {
    try {
      const res = await fetch('/api/credits/grant', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to claim')
      }
      const data = await res.json()
      setState(s => ({
        ...s,
        balance: data.newBalance,
        dailyGrantAvailable: false,
      }))
      return true
    } catch (err) {
      setState(s => ({
        ...s,
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
      return false
    }
  }

  const claimWinnings = async (): Promise<{
    success: boolean
    totalClaimed: number
    newBalance: number
    primaryType: 'prize' | 'rebate' | 'referral' | 'daily'
    claimed: { type: string; amount: number }[]
  } | null> => {
    try {
      const res = await fetch('/api/credits/claim-winnings', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to claim winnings')
      }
      const data = await res.json()
      setState(s => ({
        ...s,
        balance: data.newBalance,
        pendingClaims: [],
        pendingTotal: 0,
      }))
      return {
        success: true,
        totalClaimed: data.totalClaimed,
        newBalance: data.newBalance,
        primaryType: data.primaryType,
        claimed: data.claimed || [],
      }
    } catch (err) {
      setState(s => ({
        ...s,
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
      return null
    }
  }

  return {
    ...state,
    claimDailyGrant,
    claimWinnings,
    refreshBalance: fetchBalance,
  }
}
