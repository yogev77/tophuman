'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Suspense } from 'react'

function LoginRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next')

  useEffect(() => {
    const params = new URLSearchParams({ mode: 'login' })
    if (next) params.set('next', next)
    router.replace(`/auth/signup?${params.toString()}`)
  }, [router, next])

  return null
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginRedirect />
    </Suspense>
  )
}
