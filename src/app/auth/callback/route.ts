import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceSupabase } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const AUTO_USERNAME_PATTERN = /^player_[a-f0-9]{8}$/

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    // For password recovery, redirect to reset page instead of welcome
    const isPasswordReset = next === '/auth/reset-password'

    // Collect cookies to apply to final response
    const cookiesToApply: { name: string; value: string; options: Record<string, unknown> }[] = []

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookies) {
            cookies.forEach(({ name, value, options }) => {
              cookiesToApply.push({ name, value, options: options as Record<string, unknown> })
            })
          },
        },
      }
    )

    const { error, data } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('[auth/callback] exchangeCodeForSession failed:', error.message, error.status)
    }
    if (!error && data.user) {
      let redirectTo: string

      if (isPasswordReset) {
        redirectTo = `${origin}/auth/reset-password`
      } else {
        // Check if this user has an auto-generated username (Google OAuth)
        let needsUsername = false
        try {
          const serviceClient = createServiceSupabase(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          )
          const { data: profile } = await serviceClient
            .from('profiles')
            .select('username')
            .eq('id', data.user.id)
            .single()

          if (profile && AUTO_USERNAME_PATTERN.test(profile.username)) {
            needsUsername = true
          }
        } catch {
          // If profile check fails, proceed to welcome (non-blocking)
        }

        redirectTo = needsUsername
          ? `${origin}/auth/choose-username`
          : `${origin}/auth/welcome?next=${encodeURIComponent(next)}`
      }

      const response = NextResponse.redirect(redirectTo)
      cookiesToApply.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options)
      })
      return response
    }
  }

  console.error('[auth/callback] Auth failed — no code or session exchange failed. code:', code ? 'present' : 'missing')
  return NextResponse.redirect(`${origin}/auth/login?error=verification_failed`)
}
