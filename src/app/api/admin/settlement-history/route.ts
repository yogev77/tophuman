import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = request.nextUrl
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 50)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

    const serviceClient = createServiceClient()

    // Fetch settlements with count
    const [countResult, settlementsResult] = await Promise.all([
      serviceClient
        .from('settlements')
        .select('id', { count: 'exact', head: true }),
      serviceClient
        .from('settlements')
        .select('*')
        .order('utc_day', { ascending: false })
        .range(offset, offset + limit - 1),
    ])

    if (settlementsResult.error) {
      console.error('Settlement history fetch error:', settlementsResult.error)
      return NextResponse.json({ error: 'Failed to fetch settlements' }, { status: 500 })
    }

    const settlements = settlementsResult.data || []

    // Fetch pending_claims for all returned settlements
    const settlementIds = settlements.map((s: { id: string }) => s.id)
    let claims: Array<{
      id: string
      settlement_id: string
      user_id: string
      claim_type: string
      amount: number
      claimed_at: string | null
      metadata: Record<string, unknown> | null
    }> = []

    if (settlementIds.length > 0) {
      const { data: claimsData } = await serviceClient
        .from('pending_claims')
        .select('id, settlement_id, user_id, claim_type, amount, claimed_at, metadata')
        .in('settlement_id', settlementIds)
        .order('amount', { ascending: false })

      claims = claimsData || []
    }

    // Get display names for all user_ids in claims + settlement winners
    const allUserIds = new Set<string>()
    for (const s of settlements) {
      if (s.winner_user_id) allUserIds.add(s.winner_user_id)
    }
    for (const c of claims) {
      allUserIds.add(c.user_id)
    }

    const userNames = new Map<string, string>()
    if (allUserIds.size > 0) {
      const userIdArray = Array.from(allUserIds)

      // Look up by user_id first
      const { data: profiles } = await serviceClient
        .from('profiles')
        .select('user_id, display_name, username')
        .in('user_id', userIdArray)

      for (const p of profiles || []) {
        userNames.set(p.user_id, p.display_name || p.username || 'Anonymous')
      }

      // For any user_ids not found, try looking up by username as fallback
      const missingIds = userIdArray.filter(id => !userNames.has(id))
      if (missingIds.length > 0) {
        const { data: fallbackProfiles } = await serviceClient
          .from('profiles')
          .select('user_id, display_name, username')
          .in('username', missingIds)

        for (const p of fallbackProfiles || []) {
          // Map the username back to the original identifier used in claims
          const matchedId = missingIds.find(id => id === p.username)
          if (matchedId) {
            userNames.set(matchedId, p.display_name || p.username || 'Anonymous')
          }
        }
      }
    }

    // Group claims by settlement_id
    const claimsBySettlement = new Map<string, typeof claims>()
    for (const c of claims) {
      if (!claimsBySettlement.has(c.settlement_id)) {
        claimsBySettlement.set(c.settlement_id, [])
      }
      claimsBySettlement.get(c.settlement_id)!.push(c)
    }

    // Fetch treasury user for sink rows
    const { data: treasurySetting } = await serviceClient
      .from('site_settings')
      .select('value')
      .eq('key', 'treasury_user_id')
      .single()

    let treasuryDisplayName = 'Treasury'
    if (treasurySetting?.value) {
      // Resolve treasury user safely (avoid filter injection)
      const { data: tById } = await serviceClient
        .from('profiles')
        .select('display_name, username')
        .eq('user_id', treasurySetting.value)
        .limit(1)

      let treasuryProfile = tById?.[0]
      if (!treasuryProfile) {
        const { data: tByName } = await serviceClient
          .from('profiles')
          .select('display_name, username')
          .eq('username', treasurySetting.value)
          .limit(1)
        treasuryProfile = tByName?.[0]
      }

      if (treasuryProfile) {
        treasuryDisplayName = treasuryProfile.display_name || treasuryProfile.username || 'Treasury'
      }
    }

    // Build response with enriched data
    const enriched = settlements.map((s: {
      id: string
      utc_day: string
      status: string
      pool_total: number
      participant_count: number
      winner_user_id: string | null
      winner_amount: number | null
      rebate_total: number | null
      sink_amount: number | null
      computation_hash: string | null
      completed_at: string | null
      created_at: string
    }) => {
      const settlementClaims = (claimsBySettlement.get(s.id) || []).map(c => ({
        id: c.id,
        user_id: c.user_id,
        user_name: userNames.get(c.user_id) || 'Unknown',
        claim_type: c.claim_type,
        amount: c.amount,
        claimed: !!c.claimed_at,
        metadata: c.metadata,
      }))

      // Add synthetic sink row (auto-claimed to treasury, not in pending_claims)
      if (s.sink_amount && s.sink_amount > 0) {
        settlementClaims.push({
          id: `sink_${s.id}`,
          user_id: treasurySetting?.value || 'treasury',
          user_name: treasuryDisplayName,
          claim_type: 'sink',
          amount: s.sink_amount,
          claimed: true,
          metadata: { auto_claimed: true },
        })
      }

      return {
        ...s,
        winner_name: s.winner_user_id ? userNames.get(s.winner_user_id) || 'Unknown' : null,
        claims: settlementClaims,
      }
    })

    return NextResponse.json({
      settlements: enriched,
      total: countResult.count ?? 0,
    })
  } catch (err) {
    console.error('Settlement history error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
