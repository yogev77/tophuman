'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ProfileRedirect() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const redirect = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/auth/login')
          return
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', user.id)
          .single()

        if (profile?.username) {
          router.replace(`/player/${profile.username}`)
        } else {
          // Fallback: if no username set, stay on a minimal page
          setLoading(false)
        }
      } catch {
        router.push('/')
      }
    }
    redirect()
  }, [router])

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
    <div className="max-w-md mx-auto px-4 py-8 text-center">
      <p className="text-slate-400">Redirecting to your profile...</p>
    </div>
  )
}
