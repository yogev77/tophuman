'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface CreditsState {
  balance: number
  dailyGrantAvailable: boolean
  userId: string | null
  displayName: string | null
  referralCode: string | null
  loading: boolean
  error: string | null
}

export function useCredits() {
  const [state, setState] = useState<CreditsState>({
    balance: 0,
    dailyGrantAvailable: false,
    userId: null,
    displayName: null,
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
        userId: data.userId,
        displayName: data.displayName,
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
          userId: null,
          displayName: null,
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

  return {
    ...state,
    claimDailyGrant,
    refreshBalance: fetchBalance,
  }
}
