import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's profile to get user_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, banned_at, display_name')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (profile.banned_at) {
      return NextResponse.json({ error: 'Account banned' }, { status: 403 })
    }

    // Get balance from ledger
    const { data: balance } = await supabase.rpc('get_user_balance', {
      p_user_id: profile.user_id,
    })

    // Check if daily grant is available
    const today = new Date().toISOString().split('T')[0]
    const { data: grantToday } = await supabase
      .from('credit_ledger')
      .select('id')
      .eq('user_id', profile.user_id)
      .eq('utc_day', today)
      .eq('event_type', 'daily_grant')
      .limit(1)

    const alreadyGranted = grantToday && grantToday.length > 0

    // Generate referral code from user_id (use last 8 chars for cleaner URLs)
    const referralCode = profile.user_id.replace('usr_', '').slice(-8)

    return NextResponse.json({
      balance: balance ?? 0,
      dailyGrantAvailable: !alreadyGranted,
      userId: profile.user_id,
      displayName: profile.display_name,
      referralCode,
    })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
