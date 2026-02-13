'use client'

import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { useEffect, Suspense } from 'react'

function GameRedirect() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const type = searchParams.get('type')

  useEffect(() => {
    router.replace(type ? `/game/${type}` : '/')
  }, [type, router])

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 overflow-x-hidden">
      <div className="animate-pulse">
        <div className="h-8 bg-slate-800 rounded w-1/4 mb-8"></div>
        <div className="h-96 bg-slate-800 rounded"></div>
      </div>
    </div>
  )
}

export default function GamePage() {
  return (
    <Suspense fallback={
      <div className="max-w-6xl mx-auto px-4 py-8 overflow-x-hidden">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-800 rounded w-1/4 mb-8"></div>
          <div className="h-96 bg-slate-800 rounded"></div>
        </div>
      </div>
    }>
      <GameRedirect />
    </Suspense>
  )
}
