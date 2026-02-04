'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useCredits } from '@/hooks/useCredits'

export function Header() {
  const { user, loading: authLoading, signOut } = useAuth()
  const { balance, dailyGrantAvailable, claimDailyGrant, displayName, loading: creditsLoading } = useCredits()

  return (
    <header className="bg-slate-900 border-b border-slate-800">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-white">
            TopHuman
          </Link>

          <nav className="flex items-center gap-6">
            {!authLoading && user ? (
              <>
                <Link href="/game" className="text-slate-300 hover:text-white transition">
                  Play
                </Link>

                <div className="flex items-center gap-3">
                  {!creditsLoading && (
                    <div className="flex items-center gap-2">
                      <span className="text-yellow-400 font-semibold">
                        {balance} $Credits
                      </span>
                      {dailyGrantAvailable && (
                        <button
                          onClick={claimDailyGrant}
                          className="text-xs bg-green-600 hover:bg-green-500 text-white px-2 py-1 rounded transition"
                        >
                          Claim Daily
                        </button>
                      )}
                    </div>
                  )}

                  <Link
                    href="/profile"
                    className="text-slate-400 hover:text-white text-sm transition"
                  >
                    {displayName || user.email}
                  </Link>

                  <button
                    onClick={signOut}
                    className="text-slate-400 hover:text-white text-sm transition"
                  >
                    Sign Out
                  </button>
                </div>
              </>
            ) : !authLoading ? (
              <>
                <Link
                  href="/auth/login"
                  className="text-slate-300 hover:text-white transition"
                >
                  Login
                </Link>
                <Link
                  href="/auth/signup"
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition"
                >
                  Sign Up
                </Link>
              </>
            ) : null}
          </nav>
        </div>
      </div>
    </header>
  )
}
