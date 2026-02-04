'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/hooks/useTheme'
import { Sun, Moon, Check, X, Loader2, Pencil } from 'lucide-react'

export default function ProfilePage() {
  const [displayName, setDisplayName] = useState('')
  const [originalName, setOriginalName] = useState('')
  const [username, setUsername] = useState('')
  const [originalUsername, setOriginalUsername] = useState('')
  const [editingUsername, setEditingUsername] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [usernameMessage, setUsernameMessage] = useState<string | null>(null)
  const [savingUsername, setSavingUsername] = useState(false)
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()

  const fetchProfile = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      setEmail(user.email || '')

      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id, display_name, username')
        .eq('id', user.id)
        .single()

      if (profile) {
        setDisplayName(profile.display_name || '')
        setOriginalName(profile.display_name || '')
        setUsername(profile.username || '')
        setOriginalUsername(profile.username || '')
        setUserId(profile.user_id)
      }
    } catch (err) {
      console.error('Profile fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [router])

  const checkUsername = useCallback(async (value: string) => {
    if (!value || value.length < 3) {
      setUsernameStatus('idle')
      setUsernameMessage(null)
      return
    }

    if (value.toLowerCase() === originalUsername.toLowerCase()) {
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
  }, [originalUsername])

  useEffect(() => {
    if (!editingUsername) return
    const timer = setTimeout(() => {
      if (username) {
        checkUsername(username)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [username, checkUsername, editingUsername])

  const handleSaveUsername = async () => {
    if (username === originalUsername) {
      setEditingUsername(false)
      return
    }

    if (usernameStatus !== 'available') {
      setMessage({ type: 'error', text: 'Please choose an available username' })
      return
    }

    setSavingUsername(true)
    setMessage(null)

    try {
      const res = await fetch('/api/profile/username', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update username')
      }

      setOriginalUsername(username)
      setEditingUsername(false)
      setUsernameStatus('idle')
      setMessage({ type: 'success', text: 'Username updated!' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update username' })
    } finally {
      setSavingUsername(false)
    }
  }

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const handleSave = async () => {
    if (!displayName.trim()) {
      setMessage({ type: 'error', text: 'Display name cannot be empty' })
      return
    }

    if (displayName.length > 20) {
      setMessage({ type: 'error', text: 'Display name must be 20 characters or less' })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim(), updated_at: new Date().toISOString() })
        .eq('id', user.id)

      if (error) throw error

      setOriginalName(displayName.trim())
      setMessage({ type: 'success', text: 'Profile updated!' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-800 rounded w-1/3 mb-8"></div>
          <div className="h-48 bg-slate-800 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-8">Your Profile</h1>

      <div className="bg-slate-800 rounded-xl p-6 space-y-6">
        <div>
          <label className="block text-sm text-slate-400 mb-1">User ID</label>
          <div className="text-slate-300 font-mono text-sm">{userId}</div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Email</label>
          <div className="text-slate-300">{email}</div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Username</label>
          {editingUsername ? (
            <div className="space-y-2">
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  maxLength={20}
                  className={`w-full bg-slate-700 border rounded-lg px-4 py-3 text-white focus:outline-none transition pr-10 ${
                    usernameStatus === 'available' ? 'border-green-500' :
                    usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'border-red-500' :
                    'border-slate-600 focus:border-yellow-500'
                  }`}
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
                <p className="text-xs text-red-400">{usernameMessage}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleSaveUsername}
                  disabled={savingUsername || (usernameStatus !== 'available' && username !== originalUsername)}
                  className="flex-1 bg-yellow-500 hover:bg-yellow-400 disabled:bg-yellow-500/30 text-slate-900 disabled:text-slate-900/50 font-semibold py-2 rounded-lg transition text-sm"
                >
                  {savingUsername ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setUsername(originalUsername)
                    setEditingUsername(false)
                    setUsernameStatus('idle')
                    setUsernameMessage(null)
                  }}
                  className="flex-1 border border-slate-600 hover:border-slate-500 text-slate-400 hover:text-white font-semibold py-2 rounded-lg transition text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-slate-300">@{username}</div>
              <button
                onClick={() => setEditingUsername(true)}
                className="p-2 text-slate-400 hover:text-white transition"
                title="Edit username"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between sm:hidden">
          <label className="text-sm text-slate-400">Theme</label>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-5 h-5 text-yellow-400" />
                <span className="text-sm text-slate-300">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-5 h-5 text-slate-400" />
                <span className="text-sm text-slate-300">Dark</span>
              </>
            )}
          </button>
        </div>

        <div>
          <label htmlFor="displayName" className="block text-sm text-slate-300 mb-2">
            Display Name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={20}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition"
            placeholder="Enter display name"
          />
          <p className="text-xs text-slate-500 mt-1">{displayName.length}/20 characters</p>
        </div>

        {message && (
          <div className={`p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-500/20 border border-green-500/30 text-green-400'
              : 'bg-red-500/20 border border-red-500/30 text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || displayName === originalName}
          className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:bg-yellow-500/30 text-slate-900 disabled:text-slate-900/50 font-bold py-3 rounded-lg transition"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>

        <button
          onClick={handleSignOut}
          className="w-full border-2 border-slate-600 hover:border-slate-500 text-slate-400 hover:text-white font-bold py-3 rounded-lg transition"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
