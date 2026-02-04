'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useCredits } from '@/hooks/useCredits'
import { Share2, Copy, Check, ChevronDown, Gift } from 'lucide-react'

export function Header() {
  const { user, loading: authLoading, signOut } = useAuth()
  const { balance, dailyGrantAvailable, claimDailyGrant, displayName, referralCode, loading: creditsLoading } = useCredits()
  const [showCreditsMenu, setShowCreditsMenu] = useState(false)
  const [copied, setCopied] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const referralUrl = typeof window !== 'undefined' && referralCode
    ? `${window.location.origin}/auth/signup?ref=${referralCode}`
    : ''

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowCreditsMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join TopHuman!',
          text: 'Play skill games and win $Credits! Join using my link:',
          url: referralUrl,
        })
      } catch {
        handleCopy()
      }
    } else {
      handleCopy()
    }
  }

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
                <Link href="/" className="text-slate-300 hover:text-white transition">
                  Play
                </Link>

                <div className="flex items-center gap-3">
                  {!creditsLoading && (
                    <div className="relative" ref={menuRef}>
                      <button
                        onClick={() => setShowCreditsMenu(!showCreditsMenu)}
                        className="flex items-center gap-2 text-yellow-400 font-semibold hover:text-yellow-300 transition"
                      >
                        {balance} $Credits
                        <ChevronDown className={`w-4 h-4 transition-transform ${showCreditsMenu ? 'rotate-180' : ''}`} />
                      </button>

                      {showCreditsMenu && (
                        <div className="absolute right-0 mt-2 w-72 bg-slate-800 rounded-xl shadow-xl border border-slate-700 z-50 overflow-hidden">
                          <div className="p-4 border-b border-slate-700">
                            <div className="text-center">
                              <span className="text-3xl font-bold text-yellow-400">{balance}</span>
                              <span className="text-slate-400 ml-2">$Credits</span>
                            </div>
                          </div>

                          {dailyGrantAvailable && (
                            <button
                              onClick={() => {
                                claimDailyGrant()
                                setShowCreditsMenu(false)
                              }}
                              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-700 transition text-left"
                            >
                              <Gift className="w-5 h-5 text-green-400" />
                              <div>
                                <div className="text-white font-semibold">Claim Daily $Credits</div>
                                <div className="text-sm text-slate-400">Get 5 free credits</div>
                              </div>
                            </button>
                          )}

                          <div className="p-4 border-t border-slate-700">
                            <div className="flex items-center gap-2 mb-3">
                              <Share2 className="w-4 h-4 text-purple-400" />
                              <span className="text-white font-semibold">Invite Friends</span>
                            </div>
                            <p className="text-sm text-slate-400 mb-3">
                              Get <span className="text-yellow-400 font-bold">100 $Credits</span> when friends join!
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={handleCopy}
                                className="flex-1 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg transition text-sm"
                              >
                                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                {copied ? 'Copied!' : 'Copy Link'}
                              </button>
                              <button
                                onClick={handleShare}
                                className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg transition text-sm"
                              >
                                <Share2 className="w-4 h-4" />
                                Share
                              </button>
                            </div>
                          </div>
                        </div>
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
