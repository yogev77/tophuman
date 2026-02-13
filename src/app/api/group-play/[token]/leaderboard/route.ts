import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const service = createServiceClient()

    // Look up session by join_token
    const { data: session } = await service
      .from('group_sessions')
      .select('id, ends_at, status')
      .eq('join_token', token)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Check live status
    const isEnded = session.status === 'ended' || new Date(session.ends_at) < new Date()

    // Fetch group turns
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

    // Fetch profiles
    const userIds = Object.keys(userBest)
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

    return NextResponse.json({
      leaderboard,
      playerCount: userIds.length,
      turnCount: (turns || []).length,
      isEnded,
    })
  } catch (err) {
    console.error('Group leaderboard error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
