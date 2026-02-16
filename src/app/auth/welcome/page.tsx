'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Trophy, AlertCircle } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import {
  trackWelcomePageLoaded,
  trackAuthCallbackReached,
  trackCreditsGranted,
  trackReferralApplied,
  trackOnboardingComplete,
} from '@/lib/analytics'

async function grantCreditsWithRetry(): Promise<boolean> {
  const res = await fetch('/api/credits/grant', { method: 'POST' })
  if (res.status === 404) {
    // Profile trigger may be slow — retry once after 1s
    await new Promise((r) => setTimeout(r, 1000))
    const retry = await fetch('/api/credits/grant', { method: 'POST' })
    return retry.ok || retry.status === 400 || retry.status === 409 // 400/409 = already granted today
  }
  return res.ok || res.status === 400 || res.status === 409
}

function WelcomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('Processing...')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const processWelcome = async () => {
      trackWelcomePageLoaded()

      if (!sessionStorage.getItem('auth_callback_tracked')) {
        trackAuthCallbackReached({ needs_username: false })
        sessionStorage.setItem('auth_callback_tracked', 'true')
      }

      const referralCode = localStorage.getItem('referralCode')
      const next = searchParams.get('next') || localStorage.getItem('authRedirectTo') || '/'
      localStorage.removeItem('authRedirectTo')

      // Auto-grant first daily credits with retry
      const grantOk = await grantCreditsWithRetry()
      if (grantOk) {
        trackCreditsGranted()
      }
      if (!grantOk) {
        setFailed(true)
        setStatus('Something went wrong setting up your account.')
        return
      }

      if (referralCode) {
        setStatus('Applying referral bonus...')
        try {
          const res = await fetch('/api/credits/referral', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ referralCode }),
          })

          trackReferralApplied({ success: res.ok })
          if (res.ok) {
            setStatus('Referral bonus applied! Redirecting...')
          }
          localStorage.removeItem('referralCode')
        } catch (err) {
          trackReferralApplied({ success: false })
          console.error('Referral error:', err)
        }
      }

      // Short delay to show status, then redirect
      trackOnboardingComplete()
      setTimeout(() => {
        router.push(next)
      }, 1500)
    }

    processWelcome()
  }, [router, searchParams])

  if (failed) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Setup Issue</h2>
          <p className="text-slate-500 dark:text-slate-300 mb-6">{status}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-lg transition"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl p-8 max-w-md w-full text-center">
        <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Welcome to Podium Arena!</h2>
        <p className="text-slate-500 dark:text-slate-300 mb-4">Your account is ready!</p>
        <div className="flex items-center justify-center gap-2 text-blue-400">
          <Spinner size="sm" />
          <span>{status}</span>
        </div>
      </div>
    </div>
  )
}

export default function WelcomePage() {
  return (
    <Suspense fallback={
      <div className="min-h-[80vh] flex items-center justify-center">
        <Spinner size="md" />
      </div>
    }>
      <WelcomeContent />
    </Suspense>
  )
}
