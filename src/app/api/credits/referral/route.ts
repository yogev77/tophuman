import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { normalizeEmail, isDisposableEmail } from '@/lib/utils'

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

    // Validate referral code format (hex, exactly 8 chars)
    if (typeof referralCode !== 'string' || !/^[a-f0-9]{8}$/i.test(referralCode)) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 })
    }

    // Anti-fraud: Check for disposable email
    if (user.email && isDisposableEmail(user.email)) {
      console.warn(`Referral blocked: disposable email ${user.email}`)
      return NextResponse.json({ error: 'Referral not available for this account' }, { status: 400 })
    }

    // Anti-fraud: Normalize email and check for duplicates
    const normalizedEmail = user.email ? normalizeEmail(user.email) : null

    if (normalizedEmail) {
      // Check if another account with the same normalized email already used a referral
      const { data: existingReferrals } = await serviceSupabase
        .from('profiles')
        .select('user_id, normalized_email, referred_by')
        .eq('normalized_email', normalizedEmail)
        .not('referred_by', 'is', null)

      // If another account with same base email already got a referral, block
      const otherAccountUsedReferral = existingReferrals?.some(
        p => p.user_id !== `usr_${user.id.replace(/-/g, '')}`
      )

      if (otherAccountUsedReferral) {
        console.warn(`Referral blocked: duplicate normalized email ${normalizedEmail}`)
        return NextResponse.json({ error: 'Referral not available for this account' }, { status: 400 })
      }
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

    // Find referrer by matching the last 8 chars of their user_id (targeted query)
    const { data: matchingProfiles } = await serviceSupabase
      .from('profiles')
      .select('user_id, created_at')
      .like('user_id', `%${referralCode}`)

    const referrer = matchingProfiles?.find(p =>
      p.user_id.replace('usr_', '').slice(-8) === referralCode.toLowerCase()
    )

    if (!referrer) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 })
    }

    // Can't refer yourself
    if (referrer.user_id === currentProfile.user_id) {
      return NextResponse.json({ error: 'Cannot refer yourself' }, { status: 400 })
    }

    // Anti-fraud: Referrer account must be at least 7 days old
    const referrerAge = Date.now() - new Date(referrer.created_at).getTime()
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    if (referrerAge < sevenDays) {
      return NextResponse.json({ error: 'Referral not available yet' }, { status: 400 })
    }

    // Anti-fraud: Max 10 successful referrals per referrer
    const { count: referralCount } = await serviceSupabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('referred_by', referrer.user_id)

    if ((referralCount ?? 0) >= 10) {
      return NextResponse.json({ error: 'Referral code no longer available' }, { status: 400 })
    }

    const today = new Date().toISOString().split('T')[0]

    // Atomically mark current user as referred (only if not already set)
    const { data: updatedRows, error: updateError } = await serviceSupabase
      .from('profiles')
      .update({
        referred_by: referrer.user_id,
        normalized_email: normalizedEmail,
      })
      .eq('user_id', currentProfile.user_id)
      .is('referred_by', null)
      .select('user_id')

    if (updateError || !updatedRows || updatedRows.length === 0) {
      return NextResponse.json({ error: 'Already used a referral' }, { status: 400 })
    }

    // Grant 100 credits to referrer
    // TODO: Consider deferring this until referred user plays N games
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
