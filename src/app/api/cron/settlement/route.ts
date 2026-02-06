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
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function settleDay(supabase: any, utcDay: string) {
  const idempotencyKey = `settlement_${utcDay}`

  // Check for existing settlement
  const { data: existingSettlement } = await supabase
    .from('settlements')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .single()

  if (existingSettlement?.status === 'completed') {
    return {
      success: false,
      message: `Already settled on ${existingSettlement.completed_at}. Winner: ${existingSettlement.winner_user_id}, Amount: ${existingSettlement.winner_amount}`,
      settlement: existingSettlement,
    }
  }

  // Get pool for the day
  const { data: pool } = await supabase
    .from('daily_pools')
    .select('*')
    .eq('utc_day', utcDay)
    .single()

  if (!pool || pool.total_credits === 0) {
    return {
      success: true,
      message: 'No pool to settle',
    }
  }

  // Freeze the pool
  await supabase
    .from('daily_pools')
    .update({ status: 'frozen', frozen_at: new Date().toISOString() })
    .eq('utc_day', utcDay)

  // Get winner (highest score)
  const { data: winners } = await supabase
    .from('game_turns')
    .select('user_id, score, completed_at')
    .eq('utc_day', utcDay)
    .eq('status', 'completed')
    .eq('flagged', false)
    .order('score', { ascending: false })
    .limit(1)

  if (!winners || winners.length === 0) {
    return {
      success: true,
      message: 'No valid completions',
    }
  }

  const winner = winners[0]

  // Get all participants except winner
  const { data: participants } = await supabase
    .from('game_turns')
    .select('user_id')
    .eq('utc_day', utcDay)
    .eq('status', 'completed')
    .neq('user_id', winner.user_id)
    .order('score', { ascending: false })
    .limit(1000)

  // Count turns per participant
  const turnCounts: Record<string, number> = {}
  for (const p of participants || []) {
    turnCounts[p.user_id] = (turnCounts[p.user_id] || 0) + 1
  }

  // Calculate distribution
  const total = pool.total_credits
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
    throw new Error('Failed to create settlement')
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

  // Mark settlement complete
  await supabase
    .from('settlements')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', settlement.id)

  // Update pool status
  await supabase
    .from('daily_pools')
    .update({
      status: 'settled',
      settled_at: new Date().toISOString(),
      settlement_id: settlement.id,
    })
    .eq('utc_day', utcDay)

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
