'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { useCreditsNotification } from './CreditsNotificationProvider'

export interface ActiveGroup {
  id: string
  joinToken: string
  gameName: string
  gameId: string
  endsAt: string
  playerCount: number
  turnCount: number
}

interface GroupPlayContextType {
  activeGroups: ActiveGroup[]
  hasActiveGroups: boolean
  loading: boolean
  showDrawer: boolean
  setShowDrawer: (show: boolean) => void
  refreshGroups: () => Promise<void>
}

const GroupPlayContext = createContext<GroupPlayContextType | undefined>(undefined)

const POLL_INTERVAL = 30_000 // 30 seconds

export function GroupPlayProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useCreditsNotification()
  const [activeGroups, setActiveGroups] = useState<ActiveGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [showDrawer, setShowDrawer] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/group-play/active')
      if (!res.ok) return
      const data = await res.json()
      setActiveGroups(data.groups || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!userId) {
      setActiveGroups([])
      setLoading(false)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    setLoading(true)
    fetchGroups()

    intervalRef.current = setInterval(fetchGroups, POLL_INTERVAL)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [userId, fetchGroups])

  return (
    <GroupPlayContext.Provider value={{
      activeGroups,
      hasActiveGroups: activeGroups.length > 0,
      loading,
      showDrawer,
      setShowDrawer,
      refreshGroups: fetchGroups,
    }}>
      {children}
    </GroupPlayContext.Provider>
  )
}

export function useGroupPlay() {
  const context = useContext(GroupPlayContext)
  if (context === undefined) {
    throw new Error('useGroupPlay must be used within GroupPlayProvider')
  }
  return context
}
