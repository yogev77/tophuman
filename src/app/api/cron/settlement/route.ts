import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// This endpoint is called by Vercel Cron at midnight UTC
// Configure in vercel.json: { "crons": [{ "path": "/api/cron/settlement", "schedule": "0 0 * * *" }] }

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (set CRON_SECRET in environment)
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createServiceClient()

    // Settle previous day (since cron runs at midnight)
    const yesterday = new Date()
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    const utcDay = yesterday.toISOString().split('T')[0]

    const result = await settleDay(supabase, utcDay)

    return NextResponse.json(result)
  } catch (err) {
    console.error('Settlement cron error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// Also allow POST for manual triggering from admin panel
export async function POST(request: NextRequest) {
  try {
    // Use regular client for auth (has cookies)
    const authClient = await createClient()

    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if admin
    const { data: profile } = await authClient
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { utcDay } = body

    if (!utcDay) {
      return NextResponse.json({ error: 'utcDay required' }, { status: 400 })
    }

    // Use service client for settlement operations (bypasses RLS)
    const serviceClient = await createServiceClient()
    const result = await settleDay(serviceClient, utcDay)

    // Log admin action
    await serviceClient.from('audit_logs').insert({
      actor_type: 'admin',
      actor_id: user.id,
      action: 'manual_settlement',
      resource_type: 'settlement',
      resource_id: utcDay,
      details: result,
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('Manual settlement error:', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function settleDay(supabase: any, utcDay: string) {
  // Find all settlements for this day (any status) to avoid idempotency key collisions
  const { data: allSettlements } = await supabase
    .from('settlements')
    .select('id, status, completed_at')
    .eq('utc_day', utcDay)
    .order('created_at', { ascending: false })

  // Clean up stale 'processing' settlements from failed attempts
  const staleProcessing = (allSettlements || []).filter((s: { status: string }) => s.status === 'processing')
  for (const stale of staleProcessing) {
    await supabase.from('settlements').delete().eq('id', stale.id)
  }

  // Use completed settlements for cycle boundary
  const completedSettlements = (allSettlements || []).filter((s: { status: string }) => s.status === 'completed')
  const lastSettlement = completedSettlements[0] || null
  const cycleStart = lastSettlement?.completed_at || null
  const cycleNum = completedSettlements.length + 1
  const idempotencyKey = `settlement_${utcDay}_c${cycleNum}`

  // Count turns in current cycle (after last settlement, or all if none)
  let turnsQuery = supabase
    .from('game_turns')
    .select('user_id, score, game_type_id')
    .eq('utc_day', utcDay)
    .eq('status', 'completed')

  if (cycleStart) {
    turnsQuery = turnsQuery.gt('created_at', cycleStart)
  }

  const { data: cycleTurns } = await turnsQuery

  if (!cycleTurns || cycleTurns.length === 0) {
    return {
      success: true,
      message: cycleStart
        ? `No new turns since last settlement at ${cycleStart}`
        : 'No pool to settle',
    }
  }

  // Pool = number of turns in this cycle (each turn costs 1 credit)
  const total = cycleTurns.length

  if (total === 0) {
    return {
      success: true,
      message: 'No pool to settle (zero credits)',
    }
  }

  // Freeze all active pools for the day
  await supabase
    .from('daily_pools')
    .update({ status: 'frozen', frozen_at: new Date().toISOString() })
    .eq('utc_day', utcDay)
    .eq('status', 'active')

  // Get winner (highest score in this cycle, unflagged only)
  let winnersQuery = supabase
    .from('game_turns')
    .select('user_id, score, completed_at')
    .eq('utc_day', utcDay)
    .eq('status', 'completed')
    .eq('flagged', false)
    .order('score', { ascending: false })
    .limit(1)

  if (cycleStart) {
    winnersQuery = winnersQuery.gt('created_at', cycleStart)
  }

  const { data: winners } = await winnersQuery

  if (!winners || winners.length === 0) {
    return {
      success: true,
      message: 'No valid completions',
    }
  }

  const winner = winners[0]

  // Get all participants except winner (this cycle only)
  let participantsQuery = supabase
    .from('game_turns')
    .select('user_id')
    .eq('utc_day', utcDay)
    .eq('status', 'completed')
    .neq('user_id', winner.user_id)
    .order('score', { ascending: false })
    .limit(1000)

  if (cycleStart) {
    participantsQuery = participantsQuery.gt('created_at', cycleStart)
  }

  const { data: participants } = await participantsQuery

  // Count turns per participant
  const turnCounts: Record<string, number> = {}
  for (const p of participants || []) {
    turnCounts[p.user_id] = (turnCounts[p.user_id] || 0) + 1
  }

  // Calculate distribution (total = number of turns in this cycle)
  const winnerAmount = Math.floor(total * 0.5)
  const rebatePool = Math.floor(total * 0.3)
  let sinkAmount = total - winnerAmount - rebatePool

  // Calculate rebates with weight capping
  const rebates: { userId: string; weight: number; amount: number }[] = []
  let totalWeight = 0

  for (const [userId, turns] of Object.entries(turnCounts)) {
    const weight = Math.min(turns as number, 10) // Cap at 10
    totalWeight += weight
    rebates.push({ userId, weight, amount: 0 })
  }

  // Distribute rebates proportionally
  let distributed = 0
  if (totalWeight > 0) {
    for (const r of rebates) {
      r.amount = Math.floor((rebatePool * r.weight) / totalWeight)
      distributed += r.amount
    }
  }

  // Remainder goes to sink
  sinkAmount += rebatePool - distributed

  // Compute deterministic hash
  const computationInput = JSON.stringify({
    utcDay,
    total,
    winner: winner.user_id,
    winnerAmount,
    rebates: rebates.map(r => ({ u: r.userId, a: r.amount })),
    sinkAmount,
  })
  const computationHash = crypto.createHash('sha256').update(computationInput).digest('hex')

  // Create settlement record
  const { data: settlement, error: settlementError } = await supabase
    .from('settlements')
    .insert({
      utc_day: utcDay,
      status: 'processing',
      pool_total: total,
      participant_count: Object.keys(turnCounts).length + 1,
      winner_user_id: winner.user_id,
      winner_amount: winnerAmount,
      rebate_total: distributed,
      sink_amount: sinkAmount,
      computation_hash: computationHash,
      idempotency_key: idempotencyKey,
    })
    .select()
    .single()

  if (settlementError) {
    console.error('Settlement creation error:', settlementError)
    throw new Error(`Failed to create settlement: ${settlementError.message}`)
  }

  // Create pending claims (users must claim their winnings)
  // Winner prize
  const { error: winnerClaimError } = await supabase.from('pending_claims').insert({
    user_id: winner.user_id,
    claim_type: 'prize_win',
    amount: winnerAmount,
    settlement_id: settlement.id,
    utc_day: utcDay,
    metadata: { rank: 1 },
  })

  if (winnerClaimError) {
    console.error('Failed to create winner claim:', winnerClaimError)
  }

  // Rebates
  for (const r of rebates) {
    if (r.amount > 0) {
      const { error: rebateError } = await supabase.from('pending_claims').insert({
        user_id: r.userId,
        claim_type: 'rebate',
        amount: r.amount,
        settlement_id: settlement.id,
        utc_day: utcDay,
        metadata: { turns: r.weight },
      })
      if (rebateError) {
        console.error('Failed to create rebate claim:', rebateError)
      }
    }
  }

  // Treasury sink: auto-claim sink amount directly to treasury user's ledger
  if (sinkAmount > 0) {
    const { data: treasurySetting } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'treasury_user_id')
      .single()

    if (treasurySetting?.value) {
      // Resolve the treasury user's actual user_id from profiles
      // (site_settings may store a username like "podiumarena" instead of user_id)
      const { data: treasuryProfiles } = await supabase
        .from('profiles')
        .select('user_id')
        .or(`user_id.eq.${treasurySetting.value},username.eq.${treasurySetting.value}`)
        .limit(1)

      const treasuryUserId = treasuryProfiles?.[0]?.user_id || treasurySetting.value

      // Auto-claim: insert directly into credit_ledger (no pending_claim needed for treasury)
      const { error: sinkError } = await supabase.from('credit_ledger').insert({
        user_id: treasuryUserId,
        event_type: 'sink',
        amount: sinkAmount,
        utc_day: utcDay,
        reference_id: settlement.id,
        reference_type: 'settlement',
        metadata: { source: 'treasury_sink', auto_claimed: true },
      })
      if (sinkError) {
        console.error('Failed to auto-claim treasury sink:', sinkError)
      }
    } else {
      console.warn(`No treasury_user_id configured — ${sinkAmount} credits from sink are unclaimed`)
    }
  }

  // Mark settlement complete
  await supabase
    .from('settlements')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', settlement.id)

  // Update pool status (only active/frozen pools, not already-settled ones from prior cycles)
  await supabase
    .from('daily_pools')
    .update({
      status: 'settled',
      settled_at: new Date().toISOString(),
      settlement_id: settlement.id,
    })
    .eq('utc_day', utcDay)
    .in('status', ['active', 'frozen'])

  // Auto-record treasury balance snapshot after settlement
  try {
    const { data: treasurySnapshotSetting } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'treasury_user_id')
      .single()

    if (treasurySnapshotSetting?.value) {
      const { data: treasuryProfiles2 } = await supabase
        .from('profiles')
        .select('user_id, username')
        .or(`user_id.eq.${treasurySnapshotSetting.value},username.eq.${treasurySnapshotSetting.value}`)
        .limit(1)

      const snapshotUserId = treasuryProfiles2?.[0]?.user_id || treasurySnapshotSetting.value
      const snapshotUsername = treasuryProfiles2?.[0]?.username || null

      const { data: snapshotBalance } = await supabase.rpc('get_user_balance', { p_user_id: snapshotUserId })

      await supabase.from('treasury_snapshots').insert({
        utc_day: utcDay,
        balance: snapshotBalance ?? 0,
        treasury_user_id: snapshotUserId,
        treasury_username: snapshotUsername,
        notes: `Auto-snapshot after settlement ${settlement.id.slice(0, 8)}`,
      })
    }
  } catch (snapshotErr) {
    console.error('Failed to record treasury snapshot:', snapshotErr)
    // Non-critical — don't fail the settlement over this
  }

  return {
    success: true,
    message: `Settlement complete! Winner ${winner.user_id} gets ${winnerAmount} credits. Pending claim created.`,
    settlement: {
      id: settlement.id,
      utcDay,
      winner: winner.user_id,
      winnerAmount,
      rebateTotal: distributed,
      sinkAmount,
      participantCount: Object.keys(turnCounts).length + 1,
    },
  }
}
