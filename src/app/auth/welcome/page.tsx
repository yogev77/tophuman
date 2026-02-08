'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Trophy } from 'lucide-react'
import { Spinner } from '@/components/Spinner'

function WelcomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('Processing...')

  useEffect(() => {
    const processReferral = async () => {
      const referralCode = localStorage.getItem('referralCode')
      const next = searchParams.get('next') || '/'

      // Auto-grant first daily credits so new users start with a balance
      try {
        await fetch('/api/credits/grant', { method: 'POST' })
      } catch (err) {
        console.error('Auto-grant error:', err)
      }

      if (referralCode) {
        setStatus('Applying referral bonus...')
        try {
          const res = await fetch('/api/credits/referral', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ referralCode }),
          })

          if (res.ok) {
            setStatus('Referral bonus applied! Redirecting...')
          }
          // Clear the referral code regardless of success
          localStorage.removeItem('referralCode')
        } catch (err) {
          console.error('Referral error:', err)
        }
      }

      // Short delay to show status, then redirect
      setTimeout(() => {
        router.push(next)
      }, 1500)
    }

    processReferral()
  }, [router, searchParams])

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="bg-slate-800 rounded-xl p-8 max-w-md w-full text-center">
        <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-4">Welcome to Podium Arena!</h2>
        <p className="text-slate-300 mb-4">Your email has been verified.</p>
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
