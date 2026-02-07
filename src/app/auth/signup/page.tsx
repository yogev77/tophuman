'use client'

import { useState, useEffect, Suspense, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Gift, Check, X, Loader2 } from 'lucide-react'
import { C, CC } from '@/lib/currency'

function AuthContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [tab, setTab] = useState<'signup' | 'login'>('signup')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [usernameMessage, setUsernameMessage] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const supabase = createClient()

  const checkUsername = useCallback(async (value: string) => {
    if (!value || value.length < 3) {
      setUsernameStatus('idle')
      setUsernameMessage(null)
      return
    }

    setUsernameStatus('checking')
    try {
      const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(value)}`)
      const data = await res.json()

      if (data.available) {
        setUsernameStatus('available')
        setUsernameMessage(null)
      } else {
        setUsernameStatus(data.message?.includes('taken') ? 'taken' : 'invalid')
        setUsernameMessage(data.message)
      }
    } catch {
      setUsernameStatus('idle')
      setUsernameMessage('Error checking username')
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (username) {
        checkUsername(username)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [username, checkUsername])

  useEffect(() => {
    const ref = searchParams.get('ref')
    if (ref) {
      setReferralCode(ref)
      localStorage.setItem('referralCode', ref)
    }
    // Check if we should show login tab
    const mode = searchParams.get('mode')
    if (mode === 'login') {
      setTab('login')
    }
  }, [searchParams])

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!username || username.length < 3) {
      setError('Username must be at least 3 characters')
      return
    }

    if (usernameStatus !== 'available') {
      setError('Please choose an available username')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) throw error

      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      setError(error.message)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      router.push('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="bg-slate-800 rounded-xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">📧</div>
          <h2 className="text-2xl font-bold text-white mb-4">Check Your Email</h2>
          <p className="text-slate-300 mb-6">
            We&apos;ve sent a verification link to <strong>{email}</strong>.
            Click the link to verify your account and start playing!
          </p>
          <button
            onClick={() => setTab('login')}
            className="text-blue-400 hover:text-blue-300 transition"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="bg-slate-800 rounded-xl max-w-md w-full overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => { setTab('signup'); setError(null) }}
            className={`flex-1 py-4 text-sm font-semibold transition ${
              tab === 'signup'
                ? 'bg-yellow-500 text-slate-900'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign Up
          </button>
          <button
            onClick={() => { setTab('login'); setError(null) }}
            className={`flex-1 py-4 text-sm font-semibold transition ${
              tab === 'login'
                ? 'bg-yellow-500 text-slate-900'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Login
          </button>
        </div>

        <div className="p-8">
          {tab === 'signup' && referralCode && (
            <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-4 mb-6 flex items-center gap-3">
              <Gift className="w-6 h-6 text-green-400 flex-shrink-0" />
              <div>
                <p className="text-green-400 font-semibold">Referral Bonus!</p>
                <p className="text-sm text-slate-300">Your friend will get 100 <CC />Credits when you verify your email!</p>
              </div>
            </div>
          )}

          {/* Google Sign-In */}
          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-800 font-medium py-3 rounded-lg transition mb-4"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 h-px bg-slate-600"></div>
            <span className="text-sm text-slate-500">or</span>
            <div className="flex-1 h-px bg-slate-600"></div>
          </div>

          <form onSubmit={tab === 'signup' ? handleSignUp : handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm text-slate-300 mb-2">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-yellow-500 transition"
                placeholder="you@example.com"
              />
            </div>

            {tab === 'signup' && (
              <div>
                <label htmlFor="username" className="block text-sm text-slate-300 mb-2">Username</label>
                <div className="relative">
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    required
                    maxLength={20}
                    className={`w-full bg-slate-700 border rounded-lg px-4 py-3 text-white focus:outline-none transition pr-10 ${
                      usernameStatus === 'available' ? 'border-green-500' :
                      usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'border-red-500' :
                      'border-slate-600 focus:border-yellow-500'
                    }`}
                    placeholder="Choose a username"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameStatus === 'checking' && (
                      <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                    )}
                    {usernameStatus === 'available' && (
                      <Check className="w-5 h-5 text-green-500" />
                    )}
                    {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                      <X className="w-5 h-5 text-red-500" />
                    )}
                  </div>
                </div>
                {usernameMessage && (
                  <p className="text-xs text-red-400 mt-1">{usernameMessage}</p>
                )}
                {!usernameMessage && username.length > 0 && username.length < 3 && (
                  <p className="text-xs text-slate-500 mt-1">Username must be at least 3 characters</p>
                )}
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm text-slate-300 mb-2">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-yellow-500 transition"
                placeholder={tab === 'signup' ? 'At least 8 characters' : 'Your password'}
              />
            </div>

            {tab === 'signup' && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm text-slate-300 mb-2">Confirm Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-yellow-500 transition"
                  placeholder="Repeat password"
                />
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:bg-yellow-500/30 disabled:text-slate-900/50 text-slate-900 font-bold py-3 rounded-lg transition"
            >
              {loading
                ? (tab === 'signup' ? 'Creating Account...' : 'Logging in...')
                : (tab === 'signup' ? 'Create Account' : 'Login')
              }
            </button>
          </form>

          <p className="mt-6 text-center text-slate-500 text-sm">
            {tab === 'signup'
              ? `Get 10 free ${C}Credits daily!`
              : 'Welcome back!'}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full"></div>
      </div>
    }>
      <AuthContent />
    </Suspense>
  )
}
