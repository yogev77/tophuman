import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const serviceClient = await createServiceClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's profile to get user_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, banned_at, display_name, username')
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

    // Check for pending claims (settlement winnings) - use service client to bypass RLS
    const { data: pendingClaims } = await serviceClient
      .from('pending_claims')
      .select('id, claim_type, amount, utc_day, metadata')
      .eq('user_id', profile.user_id)
      .is('claimed_at', null)
      .order('created_at', { ascending: false })

    const pendingTotal = pendingClaims?.reduce((sum, c) => sum + c.amount, 0) ?? 0

    // Generate referral code from user_id (use last 8 chars for cleaner URLs)
    const referralCode = profile.user_id.replace('usr_', '').slice(-8)

    return NextResponse.json({
      balance: balance ?? 0,
      dailyGrantAvailable: !alreadyGranted,
      pendingClaims: pendingClaims ?? [],
      pendingTotal,
      userId: profile.user_id,
      displayName: profile.display_name,
      username: profile.username,
      referralCode,
    })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
