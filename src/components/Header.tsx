'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Link } from 'next-view-transitions'
import { useAuth } from '@/hooks/useAuth'
import { useCreditsNotification } from './CreditsNotificationProvider'
import { useTheme } from '@/hooks/useTheme'
import { Share2, Copy, Check, Gift, Sun, Moon, Trophy, History, Loader2 } from 'lucide-react'
import { C, CC } from '@/lib/currency'
import { LOGO_POLYGONS, SKILLS } from '@/lib/skills'

export function Header() {
  const { user, loading: authLoading } = useAuth()
  const { balance, dailyGrantAvailable, hasPendingClaims, pendingTotal, claimCredits, isClaiming, displayName, username: profileUsername, referralCode, loading: creditsLoading, isCounterAnimating, hasUnseenNotification, markNotificationSeen } = useCreditsNotification()
  const { theme, toggleTheme } = useTheme()
  const pathname = usePathname()
  const isHome = pathname === '/'
  const isGamePage = pathname.startsWith('/game/')
  const [showCreditsMenu, setShowCreditsMenu] = useState(false)
  const [drawerClosing, setDrawerClosing] = useState(false)
  const prevShowRef = useRef(false)
  const [copied, setCopied] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const referralUrl = typeof window !== 'undefined' && referralCode
    ? `${window.location.origin}/auth/signup?ref=${referralCode}`
    : ''

  // Use displayName, or extract username from email if not set
  const userName = displayName || (user?.email ? user.email.split('@')[0] : '?')

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        (!drawerRef.current || !drawerRef.current.contains(target))
      ) {
        setShowCreditsMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Animate drawer close on game pages (mobile only)
  const useDrawer = isGamePage && isMobile
  useEffect(() => {
    if (prevShowRef.current && !showCreditsMenu && useDrawer) {
      setDrawerClosing(true)
    } else if (showCreditsMenu) {
      setDrawerClosing(false)
    }
    prevShowRef.current = showCreditsMenu
  }, [showCreditsMenu, useDrawer])

  const shareText = 'Compete across 5 mind skills on Podium Arena. Clock resets daily.'

  const handleInvite = async () => {
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    if (isMobile && navigator.share) {
      try { await navigator.share({ title: 'Podium Arena', text: shareText, url: referralUrl }); return } catch {}
    }
    try {
      await navigator.clipboard.writeText(`${shareText}\n\n${referralUrl}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const creditsMenuContent = (
    <>
      <div className="p-4 border-b border-slate-700">
        <div className="text-center">
          <span className="text-3xl font-bold text-yellow-400">{balance}</span>
          <span className="text-slate-400 ml-2"><CC />Credits</span>
        </div>
      </div>

      {hasPendingClaims && (
        <button
          onClick={() => {
            claimCredits()
            setShowCreditsMenu(false)
          }}
          disabled={isClaiming}
          className={`w-full px-4 py-3 flex items-center gap-3 transition text-left ring-1 ring-yellow-400/30 ${isClaiming ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-700 animate-pulse-subtle'}`}
        >
          {isClaiming ? <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" /> : <Trophy className="w-5 h-5 text-yellow-400" />}
          <div>
            <div className="text-yellow-400 font-semibold">{isClaiming ? 'Claiming...' : <>Claim {pendingTotal} <CC />Credits!</>}</div>
            <div className="text-sm text-slate-400">{isClaiming ? 'Processing your winnings' : 'You have unclaimed winnings'}</div>
          </div>
        </button>
      )}

      {dailyGrantAvailable && !hasPendingClaims && (
        <button
          onClick={() => {
            claimCredits()
            setShowCreditsMenu(false)
          }}
          disabled={isClaiming}
          className={`w-full px-4 py-3 flex items-center gap-3 transition text-left ring-1 ring-green-400/30 ${isClaiming ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-700 animate-pulse-subtle'}`}
        >
          {isClaiming ? <Loader2 className="w-5 h-5 text-green-400 animate-spin" /> : <Gift className="w-5 h-5 text-green-400" />}
          <div>
            <div className="text-white font-semibold">{isClaiming ? 'Claiming...' : <>Claim Daily <CC />Credits</>}</div>
            <div className="text-sm text-slate-400">{isClaiming ? 'Processing your credits' : 'Your daily credits are ready'}</div>
          </div>
        </button>
      )}

      <Link
        href={profileUsername ? `/player/${profileUsername}?tab=history` : '/credits'}
        onClick={() => setShowCreditsMenu(false)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-700 transition text-left"
      >
        <History className="w-5 h-5 text-slate-400" />
        <div className="text-white font-semibold">Credit History</div>
      </Link>

      <div className="p-4 border-t border-slate-700">
        <div className="flex items-center gap-2 mb-3">
          <Share2 className="w-4 h-4 text-yellow-400" />
          <span className="text-white font-semibold">Invite Friends</span>
        </div>
        <p className="text-sm text-slate-400 mb-3">
          Get <span className="text-yellow-400 font-bold">100 <CC />Credits</span> when friends join!
        </p>
        <button
          onClick={handleInvite}
          className="w-full flex items-center justify-center gap-2 border-2 border-yellow-500 hover:bg-yellow-500/10 text-yellow-500 px-3 py-2 rounded-lg transition text-sm"
        >
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied!' : 'Copy Invite'}
        </button>
      </div>
    </>
  )

  return (
    <header className={`${isHome ? '' : 'sticky top-0 z-40 backdrop-blur-sm border-b border-slate-800'} bg-slate-900/95`}>
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-2xl font-bold text-white font-title">
            <svg viewBox="104 96 304 290" className="w-9 h-9 shrink-0">
              {LOGO_POLYGONS.map(p => (
                <polygon key={p.skill} fill={SKILLS[p.skill].hex} points={p.points} />
              ))}
            </svg>
            Podium Arena
          </Link>

          <nav className="flex items-center gap-6">
            {!authLoading && user ? (
              <>
                <div className="flex items-center gap-3 relative" ref={menuRef}>
                  {!creditsLoading && (
                    <div>
                      <button
                        onClick={() => {
                          const wasOpen = showCreditsMenu
                          setShowCreditsMenu(!showCreditsMenu)
                          // Mark notification as seen when opening the popup
                          if (!wasOpen && hasUnseenNotification) {
                            markNotificationSeen()
                          }
                        }}
                        className="relative text-yellow-400 font-semibold hover:text-yellow-300 transition"
                      >
                        <span className={isCounterAnimating ? 'credit-counter-animate' : ''}>
                          <span className="sm:hidden"><CC />{balance}</span>
                          <span className="hidden sm:inline"><CC />{balance} Credits</span>
                        </span>
                        {hasUnseenNotification && (
                          <span className="absolute -top-1 -right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        )}
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <Link
                      href={profileUsername ? `/player/${profileUsername}` : '/profile'}
                      className="tap-highlight text-slate-400 hover:text-white text-sm transition"
                    >
                      <span className="sm:hidden w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white font-semibold text-sm">
                        {(profileUsername || userName)[0].toUpperCase()}
                      </span>
                      <span className="hidden sm:inline">{profileUsername || userName}</span>
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

                  {showCreditsMenu && !useDrawer && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-slate-800 rounded-xl shadow-xl border border-slate-700 z-50 overflow-hidden">
                      {creditsMenuContent}
                    </div>
                  )}
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

      {(showCreditsMenu || drawerClosing) && useDrawer && (
        <div className="absolute left-0 right-0 top-full overflow-hidden z-50">
          <div
            ref={drawerRef}
            onAnimationEnd={() => { if (drawerClosing) setDrawerClosing(false) }}
            className={`border-t border-slate-700 bg-slate-800 shadow-xl ${drawerClosing ? 'pointer-events-none' : ''}`}
            style={{ animation: `slideDown 0.2s ${drawerClosing ? 'ease-in reverse forwards' : 'ease-out'}` }}
          >
            <div className="max-w-6xl mx-auto px-4 py-3">
              {creditsMenuContent}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
