import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check email verification
    if (!user.email_confirmed_at) {
      return NextResponse.json({ error: 'Email not verified' }, { status: 403 })
    }

    // Get user's profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, banned_at')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (profile.banned_at) {
      return NextResponse.json({ error: 'Account banned' }, { status: 403 })
    }

    // Grant daily credits
    const { data: granted, error: grantError } = await supabase.rpc('grant_daily_credits', {
      p_user_id: profile.user_id,
    })

    if (grantError) {
      console.error('Grant error:', grantError)
      return NextResponse.json({ error: 'Failed to grant credits' }, { status: 500 })
    }

    if (!granted) {
      return NextResponse.json({ error: 'Already granted today' }, { status: 400 })
    }

    // Get new balance
    const { data: balance } = await supabase.rpc('get_user_balance', {
      p_user_id: profile.user_id,
    })

    return NextResponse.json({
      success: true,
      granted: 5,
      newBalance: balance ?? 0,
    })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
