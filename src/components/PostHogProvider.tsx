'use client'

import posthog from 'posthog-js'
import { useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'

function PostHogAuthSync() {
  const { user } = useAuth()
  const prevUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    const currentId = user?.id ?? null

    if (currentId && currentId !== prevUserIdRef.current) {
      posthog.identify(currentId, {
        email: user!.email,
      })
    } else if (!currentId && prevUserIdRef.current) {
      posthog.reset()
    }

    prevUserIdRef.current = currentId
  }, [user])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return

    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: true,
      loaded: (ph) => {
        if (process.env.NODE_ENV === 'development') {
          ph.debug()
        }
      },
    })
  }, [])

  return (
    <>
      <PostHogAuthSync />
      {children}
    </>
  )
}
