import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient()

    const searchParams = request.nextUrl.searchParams
    const day = searchParams.get('day') || new Date().toISOString().split('T')[0]
    const gameType = searchParams.get('gameType') || 'emoji_keypad_sequence'
    const period = searchParams.get('period') || 'today' // 'today' or 'alltime'
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    let entries: {
      rank: number
      userId: string
      displayName: string
      bestScore: number
      bestTimeMs: number | null
      turnsPlayed: number
    }[] = []

    if (period === 'alltime') {
      // All-time leaderboard - best score ever per user for this game type
      const { data: allTimeData, error: allTimeError } = await supabase
        .from('game_turns')
        .select(`
          user_id,
          score,
          completion_time_ms
        `)
        .eq('game_type_id', gameType)
        .eq('status', 'completed')
        .eq('flagged', false)
        .not('score', 'is', null)
        .order('score', { ascending: false })
        .limit(200) // Get more to group by user

      if (allTimeError) {
        console.error('All-time leaderboard error:', allTimeError)
        return NextResponse.json({ error: 'Failed to get leaderboard' }, { status: 500 })
      }

      // Get unique user IDs to fetch profiles
      const userIds = [...new Set((allTimeData || []).map(e => e.user_id))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, username')
        .in('user_id', userIds)

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p.display_name || p.username]))

      // Group by user, keeping best score
      const userBest = new Map<string, { score: number; timeMs: number | null; displayName: string; count: number }>()

      for (const entry of allTimeData || []) {
        const existing = userBest.get(entry.user_id)
        const displayName = profileMap.get(entry.user_id)

        if (!existing || entry.score > existing.score) {
          userBest.set(entry.user_id, {
            score: entry.score,
            timeMs: entry.completion_time_ms,
            displayName: displayName || `Player ${entry.user_id.slice(-6)}`,
            count: (existing?.count || 0) + 1,
          })
        } else {
          existing.count++
        }
      }

      // Convert to array and sort
      const sorted = Array.from(userBest.entries())
        .map(([userId, data]) => ({
          userId,
          bestScore: data.score,
          bestTimeMs: data.timeMs,
          displayName: data.displayName,
          turnsPlayed: data.count,
        }))
        .sort((a, b) => b.bestScore - a.bestScore)
        .slice(0, limit)

      entries = sorted.map((entry, index) => ({
        rank: index + 1,
        ...entry,
      }))
    } else {
      // Today's leaderboard - filter by day and game type
      const { data: todayData, error: todayError } = await supabase
        .from('game_turns')
        .select(`
          user_id,
          score,
          completion_time_ms
        `)
        .eq('game_type_id', gameType)
        .eq('utc_day', day)
        .eq('status', 'completed')
        .eq('flagged', false)
        .not('score', 'is', null)
        .order('score', { ascending: false })
        .limit(200)

      if (todayError) {
        console.error('Today leaderboard error:', todayError)
        return NextResponse.json({ error: 'Failed to get leaderboard' }, { status: 500 })
      }

      // Get unique user IDs to fetch profiles
      const userIds = [...new Set((todayData || []).map(e => e.user_id))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, username')
        .in('user_id', userIds)

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p.display_name || p.username]))

      // Group by user, keeping best score for today
      const userBest = new Map<string, { score: number; timeMs: number | null; displayName: string; count: number }>()

      for (const entry of todayData || []) {
        const existing = userBest.get(entry.user_id)
        const displayName = profileMap.get(entry.user_id)

        if (!existing || entry.score > existing.score) {
          userBest.set(entry.user_id, {
            score: entry.score,
            timeMs: entry.completion_time_ms,
            displayName: displayName || `Player ${entry.user_id.slice(-6)}`,
            count: (existing?.count || 0) + 1,
          })
        } else {
          existing.count++
        }
      }

      const sorted = Array.from(userBest.entries())
        .map(([userId, data]) => ({
          userId,
          bestScore: data.score,
          bestTimeMs: data.timeMs,
          displayName: data.displayName,
          turnsPlayed: data.count,
        }))
        .sort((a, b) => b.bestScore - a.bestScore)
        .slice(0, limit)

      entries = sorted.map((entry, index) => ({
        rank: index + 1,
        ...entry,
      }))
    }

    // Get pool info (only for today)
    const { data: pool } = await supabase
      .from('daily_pools')
      .select('*')
      .eq('utc_day', day)
      .single()

    // Calculate time until midnight UTC
    const now = new Date()
    const midnight = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0
    ))
    const msUntilSettlement = midnight.getTime() - now.getTime()

    return NextResponse.json({
      entries,
      pool: {
        totalCredits: pool?.total_credits ?? 0,
        uniquePlayers: pool?.unique_players ?? 0,
        totalTurns: pool?.total_turns ?? 0,
        status: pool?.status ?? 'active',
      },
      utcDay: day,
      gameType,
      period,
      msUntilSettlement,
    })
  } catch (err) {
    console.error('Leaderboard error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
