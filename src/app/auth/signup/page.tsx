'use client'

import { useState, useEffect, Suspense, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Gift, Check, X, Loader2 } from 'lucide-react'

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
                <p className="text-sm text-slate-300">Your friend will get 100 $Credits when you verify your email!</p>
              </div>
            </div>
          )}

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
              ? 'Get 5 free $Credits daily!'
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
