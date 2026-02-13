'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, X, Loader2 } from 'lucide-react'
import { Spinner } from '@/components/Spinner'

function ChooseUsernameContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [username, setUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [usernameMessage, setUsernameMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Check if user is logged in and needs a username
  useEffect(() => {
    const check = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/auth/signup')
        return
      }
      // Check if user already has a real username (not auto-generated)
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single()

      if (profile && !/^player_[a-f0-9]{8}$/.test(profile.username)) {
        // Already has a real username, skip to destination
        const next = new URLSearchParams(window.location.search).get('next') || localStorage.getItem('authRedirectTo') || '/'
        localStorage.removeItem('authRedirectTo')
        router.replace(next)
        return
      }
      setCheckingAuth(false)
    }
    check()
  }, [router])

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

  const handleSubmit = async (e: React.FormEvent) => {
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

    setLoading(true)
    try {
      const res = await fetch('/api/profile/set-initial-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to set username')
        return
      }

      // Success — go to welcome page for credit grant + referral
      const next = searchParams.get('next') || localStorage.getItem('authRedirectTo') || '/'
      router.push(`/auth/welcome?next=${encodeURIComponent(next)}`)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <Spinner size="md" />
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 text-center">
          Choose Your Username
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm text-center mb-6">
          Pick a unique name for the leaderboard
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm text-slate-600 dark:text-slate-300 mb-2">
              Username
            </label>
            <div className="relative">
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                required
                autoFocus
                maxLength={20}
                className={`w-full bg-slate-100 dark:bg-slate-700 border rounded-lg px-4 py-3 text-slate-900 dark:text-white focus:outline-none transition pr-10 ${
                  usernameStatus === 'available' ? 'border-green-500' :
                  usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'border-red-500' :
                  'border-slate-300 dark:border-slate-600 focus:border-yellow-500'
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

          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || usernameStatus !== 'available'}
            className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:bg-yellow-500/30 disabled:text-slate-900/50 text-slate-900 font-bold py-3 rounded-lg transition"
          >
            {loading ? 'Setting Username...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ChooseUsernamePage() {
  return (
    <Suspense fallback={
      <div className="min-h-[80vh] flex items-center justify-center">
        <Spinner size="md" />
      </div>
    }>
      <ChooseUsernameContent />
    </Suspense>
  )
}
