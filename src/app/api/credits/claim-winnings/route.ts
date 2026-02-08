import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Map claim_type to valid ledger event_type
const EVENT_TYPE_MAP: Record<string, string> = {
  'prize_win': 'prize_win',
  'rebate': 'rebate',
  'sink': 'sink',
  'referral_bonus': 'referral_bonus',
  'daily_grant': 'daily_grant',
}

export async function POST() {
  try {
    // Use regular client for auth
    const authClient = await createClient()

    const { data: { user }, error: authError } = await authClient.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's profile
    const { data: profile, error: profileError } = await authClient
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

    // Use service client for claim operations (bypasses RLS)
    const supabase = await createServiceClient()

    // Get all pending claims for this user
    const { data: pendingClaims, error: claimsError } = await supabase
      .from('pending_claims')
      .select('*')
      .eq('user_id', profile.user_id)
      .is('claimed_at', null)

    if (claimsError) {
      console.error('Fetch pending claims error:', claimsError)
      return NextResponse.json({ error: 'Failed to fetch claims' }, { status: 500 })
    }

    if (!pendingClaims || pendingClaims.length === 0) {
      return NextResponse.json({ error: 'No pending claims' }, { status: 400 })
    }

    // Process each claim
    const claimedItems: { type: string; amount: number; gameTypeId?: string }[] = []
    const failedClaims: { type: string; amount: number; error: string }[] = []
    let totalClaimed = 0
    const today = new Date().toISOString().split('T')[0]

    for (const claim of pendingClaims) {
      const eventType = EVENT_TYPE_MAP[claim.claim_type] || claim.claim_type
      const gameTypeId = (claim.metadata as Record<string, unknown>)?.game_type_id as string | undefined

      // Insert ledger entry with game_type_id in metadata
      const ledgerMetadata = gameTypeId ? { game_type_id: gameTypeId } : undefined
      const { data: ledgerEntry, error: ledgerError } = await supabase
        .from('credit_ledger')
        .insert({
          user_id: profile.user_id,
          event_type: eventType,
          amount: claim.amount,
          utc_day: today,
          reference_id: claim.settlement_id,
          reference_type: 'settlement',
          ...(ledgerMetadata && { metadata: ledgerMetadata }),
        })
        .select('id')
        .single()

      if (ledgerError) {
        console.error(`Ledger insert error for claim_type="${claim.claim_type}" (event_type="${eventType}"):`, ledgerError)
        failedClaims.push({ type: claim.claim_type, amount: claim.amount, error: ledgerError.message })
        continue
      }

      // Mark claim as claimed
      const { error: updateError } = await supabase
        .from('pending_claims')
        .update({
          claimed_at: new Date().toISOString(),
          ledger_entry_id: ledgerEntry.id,
        })
        .eq('id', claim.id)

      if (updateError) {
        console.error('Failed to mark claim as claimed:', updateError)
      }

      claimedItems.push({
        type: claim.claim_type,
        amount: claim.amount,
        ...(gameTypeId && { gameTypeId }),
      })
      totalClaimed += claim.amount
    }

    // Get new balance
    const { data: balance } = await supabase.rpc('get_user_balance', {
      p_user_id: profile.user_id,
    })

    // Determine the primary claim type for the modal
    const hasPrize = claimedItems.some(c => c.type === 'prize_win')
    const hasRebate = claimedItems.some(c => c.type === 'rebate')
    const hasReferral = claimedItems.some(c => c.type === 'referral_bonus')

    let primaryType: 'prize' | 'rebate' | 'referral' | 'daily' = 'rebate'
    if (hasPrize) primaryType = 'prize'
    else if (hasReferral) primaryType = 'referral'
    else if (hasRebate) primaryType = 'rebate'

    return NextResponse.json({
      success: true,
      claimed: claimedItems,
      totalClaimed,
      newBalance: balance ?? 0,
      primaryType,
      ...(failedClaims.length > 0 && { failedClaims }),
    })
  } catch (err) {
    console.error('Claim winnings error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
