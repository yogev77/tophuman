import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// This endpoint is called by Vercel Cron at midnight UTC
// Configure in vercel.json: { "crons": [{ "path": "/api/cron/settlement", "schedule": "0 0 * * *" }] }

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (set CRON_SECRET in environment)
    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient()
    const today = new Date().toISOString().split('T')[0]

    // Find ALL past days with unsettled pools (active or frozen from failed attempts)
    // This catches missed cron runs and partial settlements
    const { data: unsettledPools } = await supabase
      .from('daily_pools')
      .select('utc_day')
      .lt('utc_day', today)
      .in('status', ['active', 'frozen'])
      .order('utc_day', { ascending: true })

    const daysToSettle = [...new Set((unsettledPools || []).map((p: { utc_day: string }) => p.utc_day))]

    // Always include yesterday as fallback (in case daily_pools entry doesn't exist
    // but game_turns do — e.g. if spend_credit didn't upsert the pool row)
    const yesterday = new Date()
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]
    if (!daysToSettle.includes(yesterdayStr)) {
      daysToSettle.push(yesterdayStr)
    }

    // Settle each day — settleDay() is idempotent via cycle logic
    const allResults = []
    for (const day of daysToSettle) {
      const result = await settleDay(supabase, day)
      allResults.push({ utcDay: day, ...result })
    }

    const settled = allResults.filter(r => r.gameSettlements && r.gameSettlements.length > 0)

    return NextResponse.json({
      success: true,
      message: settled.length > 0
        ? `Settled ${settled.length} day(s): ${settled.map(r => r.utcDay).join(', ')}`
        : 'No pools to settle',
      daysProcessed: allResults,
    })
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
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Manual settlement error:', msg)
    return NextResponse.json({ error: 'Settlement failed', details: msg }, { status: 500 })
  }
}

interface GameSettlement {
  gameTypeId: string
  settlementId: string
  winner: string
  winnerAmount: number
  rebateTotal: number
  sinkAmount: number
  participantCount: number
  poolTotal: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function settleDay(supabase: any, utcDay: string) {
  // Get all distinct game types that had completed turns this day
  const { data: gameTurnsRaw } = await supabase
    .from('game_turns')
    .select('game_type_id')
    .eq('utc_day', utcDay)
    .eq('status', 'completed')
    .is('group_session_id', null)

  if (!gameTurnsRaw || gameTurnsRaw.length === 0) {
    return {
      success: true,
      message: 'No pool to settle',
      gameSettlements: [],
    }
  }

  const distinctGames = [...new Set(gameTurnsRaw.map((t: { game_type_id: string }) => t.game_type_id))] as string[]

  // Resolve treasury user once (shared across all games)
  const { data: treasurySetting } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'treasury_user_id')
    .single()

  let treasuryUserId: string | null = null
  if (treasurySetting?.value) {
    const { data: tById } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('user_id', treasurySetting.value)
      .limit(1)

    treasuryUserId = tById?.[0]?.user_id
    if (!treasuryUserId) {
      const { data: tByName } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('username', treasurySetting.value)
        .limit(1)
      treasuryUserId = tByName?.[0]?.user_id || treasurySetting.value
    }
  }

  const gameSettlements: GameSettlement[] = []
  const skippedGames: string[] = []
  const failedGames: { gameTypeId: string; error: string }[] = []

  for (const gameTypeId of distinctGames) {
    try {
      const result = await settleGame(supabase, utcDay, gameTypeId, treasuryUserId)
      if (result) {
        gameSettlements.push(result)
      } else {
        skippedGames.push(gameTypeId)
      }
    } catch (gameErr) {
      const msg = gameErr instanceof Error ? gameErr.message : String(gameErr)
      console.error(`Settlement failed for ${gameTypeId} on ${utcDay}:`, msg)
      failedGames.push({ gameTypeId, error: msg })
    }
  }

  // Treasury snapshot once after all games settled
  if (gameSettlements.length > 0) {
    await recordTreasurySnapshot(supabase, utcDay, treasuryUserId, gameSettlements)
  }

  const totalPool = gameSettlements.reduce((s, g) => s + g.poolTotal, 0)
  const totalPrize = gameSettlements.reduce((s, g) => s + g.winnerAmount, 0)
  const totalRebate = gameSettlements.reduce((s, g) => s + g.rebateTotal, 0)
  const totalSink = gameSettlements.reduce((s, g) => s + g.sinkAmount, 0)

  return {
    success: failedGames.length === 0,
    message: failedGames.length > 0
      ? `Settlement partial: ${gameSettlements.length} settled, ${failedGames.length} failed.`
      : `Settlement complete! ${gameSettlements.length} game(s) settled across ${totalPool} total credits.`,
    gameSettlements,
    skippedGames: skippedGames.length > 0 ? skippedGames : undefined,
    failedGames: failedGames.length > 0 ? failedGames : undefined,
    summary: {
      gamesSettled: gameSettlements.length,
      totalPool,
      totalPrize,
      totalRebate,
      totalSink,
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function settleGame(supabase: any, utcDay: string, gameTypeId: string, treasuryUserId: string | null): Promise<GameSettlement | null> {
  // Find existing settlements for this game+day to determine cycle
  const { data: allSettlements } = await supabase
    .from('settlements')
    .select('id, status, completed_at')
    .eq('utc_day', utcDay)
    .eq('game_type_id', gameTypeId)
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
  const idempotencyKey = `settlement_${utcDay}_${gameTypeId}_c${cycleNum}`

  // Count turns for THIS game in current cycle
  let turnsQuery = supabase
    .from('game_turns')
    .select('user_id, score')
    .eq('utc_day', utcDay)
    .eq('game_type_id', gameTypeId)
    .eq('status', 'completed')
    .is('group_session_id', null)

  if (cycleStart) {
    turnsQuery = turnsQuery.gt('created_at', cycleStart)
  }

  const { data: cycleTurns } = await turnsQuery

  if (!cycleTurns || cycleTurns.length === 0) {
    return null // Skip this game — no turns
  }

  const total = cycleTurns.length

  // Freeze this game's pool
  await supabase
    .from('daily_pools')
    .update({ status: 'frozen', frozen_at: new Date().toISOString() })
    .eq('utc_day', utcDay)
    .eq('game_type_id', gameTypeId)
    .eq('status', 'active')

  // Get winner (highest score for this game, unflagged only)
  let winnersQuery = supabase
    .from('game_turns')
    .select('user_id, score, completed_at')
    .eq('utc_day', utcDay)
    .eq('game_type_id', gameTypeId)
    .eq('status', 'completed')
    .eq('flagged', false)
    .is('group_session_id', null)
    .order('score', { ascending: false })
    .limit(1)

  if (cycleStart) {
    winnersQuery = winnersQuery.gt('created_at', cycleStart)
  }

  const { data: winners } = await winnersQuery

  if (!winners || winners.length === 0) {
    return null // No valid (unflagged) completions for this game
  }

  const winner = winners[0]

  // Get all participants except winner (this game only)
  let participantsQuery = supabase
    .from('game_turns')
    .select('user_id')
    .eq('utc_day', utcDay)
    .eq('game_type_id', gameTypeId)
    .eq('status', 'completed')
    .is('group_session_id', null)
    .neq('user_id', winner.user_id)
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

  // Calculate distribution
  const winnerAmount = Math.floor(total * 0.5)
  const rebatePool = Math.floor(total * 0.3)
  let sinkAmount = total - winnerAmount - rebatePool

  // Calculate rebates with weight capping
  const rebates: { userId: string; weight: number; amount: number }[] = []
  let totalWeight = 0

  for (const [userId, turns] of Object.entries(turnCounts)) {
    const weight = Math.min(turns as number, 10)
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

  // If only 1 player (winner), the 30% rebate pool also goes to sink
  // (already handled: no participants → totalWeight=0 → distributed=0 → sinkAmount gets full rebatePool)

  // Compute deterministic hash
  const computationInput = JSON.stringify({
    utcDay,
    gameTypeId,
    total,
    winner: winner.user_id,
    winnerAmount,
    rebates: rebates.map(r => ({ u: r.userId, a: r.amount })),
    sinkAmount,
  })
  const computationHash = crypto.createHash('sha256').update(computationInput).digest('hex')

  // Create settlement record (per game)
  const { data: settlement, error: settlementError } = await supabase
    .from('settlements')
    .insert({
      utc_day: utcDay,
      game_type_id: gameTypeId,
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
    console.error(`Settlement creation error for ${gameTypeId}:`, settlementError)
    throw new Error(`Failed to create settlement for ${gameTypeId}: ${settlementError.message}`)
  }

  // Create pending claims
  // Winner prize
  const { error: winnerClaimError } = await supabase.from('pending_claims').insert({
    user_id: winner.user_id,
    claim_type: 'prize_win',
    amount: winnerAmount,
    settlement_id: settlement.id,
    utc_day: utcDay,
    metadata: { rank: 1, game_type_id: gameTypeId },
  })

  if (winnerClaimError) {
    console.error(`Failed to create winner claim for ${gameTypeId}:`, winnerClaimError)
  }

  // Rebates — one claim per user for this game
  for (const r of rebates) {
    if (r.amount <= 0) continue
    const { error: rebateError } = await supabase.from('pending_claims').insert({
      user_id: r.userId,
      claim_type: 'rebate',
      amount: r.amount,
      settlement_id: settlement.id,
      utc_day: utcDay,
      metadata: { turns: r.weight, game_type_id: gameTypeId },
    })
    if (rebateError) {
      console.error(`Failed to create rebate claim for ${gameTypeId}:`, rebateError)
    }
  }

  // Treasury sink: auto-claim sink amount directly to treasury user's ledger
  if (sinkAmount > 0 && treasuryUserId) {
    const { error: sinkError } = await supabase.from('credit_ledger').insert({
      user_id: treasuryUserId,
      event_type: 'sink',
      amount: sinkAmount,
      utc_day: utcDay,
      reference_id: settlement.id,
      reference_type: 'settlement',
      metadata: { source: 'treasury_sink', auto_claimed: true, game_type_id: gameTypeId },
    })
    if (sinkError) {
      console.error(`Failed to auto-claim treasury sink for ${gameTypeId}:`, sinkError)
    }
  } else if (sinkAmount > 0) {
    console.warn(`No treasury_user_id configured — ${sinkAmount} credits from ${gameTypeId} sink are unclaimed`)
  }

  // Mark settlement complete
  await supabase
    .from('settlements')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', settlement.id)

  // Update this game's pool status
  await supabase
    .from('daily_pools')
    .update({
      status: 'settled',
      settled_at: new Date().toISOString(),
      settlement_id: settlement.id,
    })
    .eq('utc_day', utcDay)
    .eq('game_type_id', gameTypeId)
    .in('status', ['active', 'frozen'])

  return {
    gameTypeId,
    settlementId: settlement.id,
    winner: winner.user_id,
    winnerAmount,
    rebateTotal: distributed,
    sinkAmount,
    participantCount: Object.keys(turnCounts).length + 1,
    poolTotal: total,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recordTreasurySnapshot(supabase: any, utcDay: string, treasuryUserId: string | null, gameSettlements: GameSettlement[]) {
  try {
    if (!treasuryUserId) return

    const { data: snapProfile } = await supabase
      .from('profiles')
      .select('user_id, username')
      .eq('user_id', treasuryUserId)
      .limit(1)

    const snapshotUsername = snapProfile?.[0]?.username || null

    const { data: snapshotBalance } = await supabase.rpc('get_user_balance', { p_user_id: treasuryUserId })

    const gamesSummary = gameSettlements.map(g => `${g.gameTypeId}:${g.sinkAmount}`).join(', ')

    await supabase.from('treasury_snapshots').insert({
      utc_day: utcDay,
      balance: snapshotBalance ?? 0,
      treasury_user_id: treasuryUserId,
      treasury_username: snapshotUsername,
      notes: `Auto-snapshot after ${gameSettlements.length} game settlement(s) (${gamesSummary})`,
    })
  } catch (snapshotErr) {
    console.error('Failed to record treasury snapshot:', snapshotErr)
    // Non-critical — don't fail the settlement over this
  }
}
