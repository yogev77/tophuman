import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const service = createServiceClient()

    // Look up session by join_token
    const { data: session, error: sessionError } = await service
      .from('group_sessions')
      .select('*')
      .eq('join_token', token)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Lazy expiration: if ended, update status
    const now = new Date()
    const endsAt = new Date(session.ends_at)
    let status = session.status
    if (endsAt < now && status === 'live') {
      status = 'ended'
      await service
        .from('group_sessions')
        .update({ status: 'ended' })
        .eq('id', session.id)
    }

    // Fetch group leaderboard: best score per user
    const { data: turns } = await service
      .from('game_turns')
      .select('user_id, score, completion_time_ms')
      .eq('group_session_id', session.id)
      .eq('status', 'completed')
      .eq('flagged', false)
      .not('score', 'is', null)

    // Group by user_id, keep best score
    const userBest: Record<string, { score: number; timeMs: number | null; attempts: number }> = {}
    for (const t of turns || []) {
      const prev = userBest[t.user_id]
      if (!prev) {
        userBest[t.user_id] = { score: t.score!, timeMs: t.completion_time_ms, attempts: 1 }
      } else {
        prev.attempts++
        if (t.score! > prev.score) {
          prev.score = t.score!
          prev.timeMs = t.completion_time_ms
        }
      }
    }

    // Fetch profiles for all participants
    const userIds = Object.keys(userBest)
    // Also include creator
    if (!userIds.includes(session.created_by)) {
      userIds.push(session.created_by)
    }

    let profileMap: Record<string, { display_name: string | null; username: string }> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await service
        .from('profiles')
        .select('user_id, display_name, username')
        .in('user_id', userIds)

      for (const p of profiles || []) {
        profileMap[p.user_id] = { display_name: p.display_name, username: p.username }
      }
    }

    // Build leaderboard sorted by score desc
    const leaderboard = Object.entries(userBest)
      .sort(([, a], [, b]) => b.score - a.score)
      .map(([userId, data], index) => ({
        rank: index + 1,
        userId,
        displayName: profileMap[userId]?.display_name || profileMap[userId]?.username || 'Unknown',
        username: profileMap[userId]?.username || null,
        bestScore: data.score,
        bestTimeMs: data.timeMs,
        attempts: data.attempts,
      }))

    // Get creator profile
    const creatorProfile = profileMap[session.created_by]

    // Settlement: transition 'ended' → 'settled'
    let settled = false
    if (status === 'ended') {
      // Atomically claim settlement (prevents double-settle)
      const { data: settledRows } = await service
        .from('group_sessions')
        .update({ status: 'settled' })
        .eq('id', session.id)
        .eq('status', 'ended')
        .select()

      if (settledRows && settledRows.length > 0) {
        const pool = (turns || []).length

        if (pool > 0 && Object.keys(userBest).length > 0) {
          // Winner = highest unflagged score
          const sortedUsers = Object.entries(userBest)
            .sort(([, a], [, b]) => b.score - a.score)
          const winnerId = sortedUsers[0][0]

          // Split: 50% winner, 30% rebate, 20% sink
          const winnerAmount = Math.floor(pool * 0.5)
          const rebatePoolAmount = Math.floor(pool * 0.3)
          let sinkAmount = pool - winnerAmount - rebatePoolAmount

          // Rebate distribution with weight cap at 10
          const rebates: { userId: string; weight: number; amount: number }[] = []
          let totalWeight = 0
          for (const [userId, data] of Object.entries(userBest)) {
            if (userId === winnerId) continue
            const weight = Math.min(data.attempts, 10)
            totalWeight += weight
            rebates.push({ userId, weight, amount: 0 })
          }

          let distributed = 0
          if (totalWeight > 0) {
            for (const r of rebates) {
              r.amount = Math.floor((rebatePoolAmount * r.weight) / totalWeight)
              distributed += r.amount
            }
          }
          sinkAmount += rebatePoolAmount - distributed

          const today = new Date().toISOString().split('T')[0]

          // Winner prize claim
          if (winnerAmount > 0) {
            await service.from('pending_claims').insert({
              user_id: winnerId,
              claim_type: 'prize_win',
              amount: winnerAmount,
              settlement_id: null,
              utc_day: today,
              metadata: { game_type_id: session.game_type_id, group_session_id: session.id },
            })
          }

          // Rebate claims
          for (const r of rebates) {
            if (r.amount <= 0) continue
            await service.from('pending_claims').insert({
              user_id: r.userId,
              claim_type: 'rebate',
              amount: r.amount,
              settlement_id: null,
              utc_day: today,
              metadata: { game_type_id: session.game_type_id, group_session_id: session.id },
            })
          }

          // Treasury sink
          if (sinkAmount > 0) {
            const { data: treasurySetting } = await service
              .from('site_settings')
              .select('value')
              .eq('key', 'treasury_user_id')
              .single()

            let treasuryUserId: string | null = null
            if (treasurySetting?.value) {
              const { data: tById } = await service
                .from('profiles')
                .select('user_id')
                .eq('user_id', treasurySetting.value)
                .limit(1)
              treasuryUserId = tById?.[0]?.user_id
              if (!treasuryUserId) {
                const { data: tByName } = await service
                  .from('profiles')
                  .select('user_id')
                  .eq('username', treasurySetting.value)
                  .limit(1)
                treasuryUserId = tByName?.[0]?.user_id || treasurySetting.value
              }
            }

            if (treasuryUserId) {
              await service.from('credit_ledger').insert({
                user_id: treasuryUserId,
                event_type: 'sink',
                amount: sinkAmount,
                metadata: { source: 'group_treasury_sink', group_session_id: session.id },
              })
            }
          }

          settled = true
        }
      }
      status = 'settled'
    }

    return NextResponse.json({
      session: {
        id: session.id,
        joinToken: session.join_token,
        gameTypeId: session.game_type_id,
        createdBy: session.created_by,
        creatorName: creatorProfile?.display_name || creatorProfile?.username || 'Unknown',
        creatorUsername: creatorProfile?.username || null,
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        status,
        createdAt: session.created_at,
      },
      leaderboard,
      playerCount: new Set([...Object.keys(userBest), session.created_by]).size,
      turnCount: (turns || []).length,
      settled,
    })
  } catch (err) {
    console.error('Group play get error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
