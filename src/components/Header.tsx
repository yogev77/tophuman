'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useCredits } from '@/hooks/useCredits'
import { useTheme } from '@/hooks/useTheme'
import { Share2, Copy, Check, Gift, Sun, Moon, Trophy } from 'lucide-react'

export function Header() {
  const { user, loading: authLoading } = useAuth()
  const { balance, dailyGrantAvailable, claimDailyGrant, displayName, referralCode, loading: creditsLoading } = useCredits()
  const { theme, toggleTheme } = useTheme()
  const [showCreditsMenu, setShowCreditsMenu] = useState(false)
  const [copied, setCopied] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const referralUrl = typeof window !== 'undefined' && referralCode
    ? `${window.location.origin}/auth/signup?ref=${referralCode}`
    : ''

  // Use displayName, or extract username from email if not set
  const userName = displayName || (user?.email ? user.email.split('@')[0] : '?')

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
          title: 'Join Podium Arena!',
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
          <Link href="/" className="flex items-center gap-2 text-2xl font-bold text-white font-title">
            <Trophy className="w-6 h-6 text-yellow-400" />
            Podium Arena
          </Link>

          <nav className="flex items-center gap-6">
            {!authLoading && user ? (
              <>
                <div className="flex items-center gap-3">
                  {!creditsLoading && (
                    <div className="relative" ref={menuRef}>
                      <button
                        onClick={() => setShowCreditsMenu(!showCreditsMenu)}
                        className="text-yellow-400 font-semibold hover:text-yellow-300 transition"
                      >
                        <span className="sm:hidden">{balance} $C</span>
                        <span className="hidden sm:inline">{balance} $Credits</span>
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
                                className="flex-1 flex items-center justify-center gap-2 border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 px-3 py-2 rounded-lg transition text-sm"
                              >
                                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                {copied ? 'Copied!' : 'Copy Link'}
                              </button>
                              <button
                                onClick={handleShare}
                                className="flex-1 flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-slate-900 px-3 py-2 rounded-lg transition text-sm"
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

                  <div className="flex items-center gap-3">
                    <Link
                      href="/profile"
                      className="text-slate-400 hover:text-white text-sm transition"
                    >
                      <span className="sm:hidden w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white font-semibold text-sm">
                        {userName[0].toUpperCase()}
                      </span>
                      <span className="hidden sm:inline">{userName}</span>
                    </Link>
                    <button
                      onClick={toggleTheme}
                      className="hidden sm:block p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
                      aria-label="Toggle theme"
                    >
                      {theme === 'dark' ? (
                        <Sun className="w-5 h-5 text-yellow-400" />
                      ) : (
                        <Moon className="w-5 h-5 text-slate-600" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : !authLoading ? (
              <div className="flex items-center gap-3">
                <Link
                  href="/auth/signup"
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition text-slate-400 hover:text-white text-sm font-medium"
                >
                  Connect
                </Link>
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
                  aria-label="Toggle theme"
                >
                  {theme === 'dark' ? (
                    <Sun className="w-5 h-5 text-yellow-400" />
                  ) : (
                    <Moon className="w-5 h-5 text-slate-600" />
                  )}
                </button>
              </div>
            ) : null}
          </nav>
        </div>
      </div>
    </header>
  )
}
