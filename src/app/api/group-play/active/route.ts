import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { toUiGameId, getGameName } from '@/lib/skills'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const userId = profile.user_id
    const service = createServiceClient()
    const now = new Date().toISOString()

    // Lazy-expire any live sessions that have ended
    await service
      .from('group_sessions')
      .update({ status: 'ended' })
      .eq('status', 'live')
      .lt('ends_at', now)

    // Fetch all currently live sessions
    const { data: liveSessions } = await service
      .from('group_sessions')
      .select('id, join_token, game_type_id, created_by, ends_at')
      .eq('status', 'live')
      .gt('ends_at', now)

    if (!liveSessions || liveSessions.length === 0) {
      return NextResponse.json({ groups: [] })
    }

    // Find which sessions the user has turns in
    const sessionIds = liveSessions.map(s => s.id)
    const { data: userTurns } = await service
      .from('game_turns')
      .select('group_session_id')
      .eq('user_id', userId)
      .in('group_session_id', sessionIds)

    const userSessionIds = new Set(userTurns?.map(t => t.group_session_id) || [])

    // Filter to sessions where user is creator or participant
    const userSessions = liveSessions.filter(
      s => s.created_by === userId || userSessionIds.has(s.id)
    )

    if (userSessions.length === 0) {
      return NextResponse.json({ groups: [] })
    }

    // Get turn counts + distinct players for each session
    const userSessionIds2 = userSessions.map(s => s.id)
    const { data: allTurns } = await service
      .from('game_turns')
      .select('group_session_id, user_id')
      .in('group_session_id', userSessionIds2)

    const sessionStats: Record<string, { players: Set<string>; turns: number }> = {}
    for (const t of allTurns || []) {
      if (!sessionStats[t.group_session_id]) {
        sessionStats[t.group_session_id] = { players: new Set(), turns: 0 }
      }
      sessionStats[t.group_session_id].players.add(t.user_id)
      sessionStats[t.group_session_id].turns++
    }

    const groups = userSessions.map(s => {
      const uiId = toUiGameId(s.game_type_id)
      const stats = sessionStats[s.id]
      // Include the creator in player count
      const playerSet = stats ? new Set(stats.players) : new Set<string>()
      playerSet.add(s.created_by)

      return {
        id: s.id,
        joinToken: s.join_token,
        gameName: getGameName(uiId),
        gameId: uiId,
        endsAt: s.ends_at,
        playerCount: playerSet.size,
        turnCount: stats?.turns || 0,
      }
    })

    return NextResponse.json({ groups })
  } catch (err) {
    console.error('Group play active error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
