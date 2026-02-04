import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const serviceSupabase = await createServiceClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { referralCode } = body

    if (!referralCode) {
      return NextResponse.json({ error: 'Referral code required' }, { status: 400 })
    }

    // Get current user's profile
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('user_id, referred_by')
      .eq('id', user.id)
      .single()

    if (!currentProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Check if already used a referral
    if (currentProfile.referred_by) {
      return NextResponse.json({ error: 'Already used a referral' }, { status: 400 })
    }

    // Find referrer by matching the last 8 chars of their user_id
    const { data: profiles } = await serviceSupabase
      .from('profiles')
      .select('user_id')

    const referrer = profiles?.find(p =>
      p.user_id.replace('usr_', '').slice(-8) === referralCode
    )

    if (!referrer) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 })
    }

    // Can't refer yourself
    if (referrer.user_id === currentProfile.user_id) {
      return NextResponse.json({ error: 'Cannot refer yourself' }, { status: 400 })
    }

    const today = new Date().toISOString().split('T')[0]

    // Mark current user as referred
    await serviceSupabase
      .from('profiles')
      .update({ referred_by: referrer.user_id })
      .eq('user_id', currentProfile.user_id)

    // Grant 100 credits to referrer
    await serviceSupabase
      .from('credit_ledger')
      .insert({
        user_id: referrer.user_id,
        amount: 100,
        event_type: 'referral_bonus',
        utc_day: today,
        memo: `Referral bonus for inviting ${currentProfile.user_id}`,
      })

    return NextResponse.json({ success: true, creditsGranted: 100 })
  } catch (err) {
    console.error('Referral error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
