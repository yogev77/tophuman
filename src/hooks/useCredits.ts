'use client'

import { useState, useEffect, useCallback } from 'react'

interface CreditsState {
  balance: number
  dailyGrantAvailable: boolean
  userId: string | null
  displayName: string | null
  loading: boolean
  error: string | null
}

export function useCredits() {
  const [state, setState] = useState<CreditsState>({
    balance: 0,
    dailyGrantAvailable: false,
    userId: null,
    displayName: null,
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
    fetchBalance()
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
