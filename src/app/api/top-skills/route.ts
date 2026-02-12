import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { SKILLS, SKILL_LIST, GAMES, toUiGameId, SkillId } from '@/lib/skills'

export interface TopSkillEntry {
  skillId: SkillId
  skillName: string
  playerName: string | null
  playerUsername: string | null
  skillScore: number
}

export async function GET() {
  try {
    const supabase = createServiceClient()
    const today = new Date().toISOString().split('T')[0]

    // Check for a completed settlement today (cycle boundary)
    const { data: todaySettlements } = await supabase
      .from('settlements')
      .select('completed_at')
      .eq('utc_day', today)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })

    const cycleStartTime = todaySettlements?.[0]?.completed_at || null

    // Fetch all completed non-flagged turns
    const { data: turns, error } = await supabase
      .from('game_turns')
      .select('user_id, game_type_id, score, utc_day, created_at')
      .eq('status', 'completed')
      .eq('flagged', false)
      .gt('score', 0)

    if (error || !turns || turns.length === 0) {
      const empty = SKILL_LIST.map(s => ({
        skillId: s.id,
        skillName: s.name,
        playerName: null,
        playerUsername: null,
        skillScore: 0,
      }))
      return NextResponse.json({ allTime: empty, today: empty })
    }

    // Track best score per user per game for both periods
    // Key: `${userId}:${uiGameId}` → best score
    const allTimeBest = new Map<string, number>()
    const todayBest = new Map<string, number>()

    for (const t of turns) {
      const uiGameId = toUiGameId(t.game_type_id)
      if (!GAMES[uiGameId]) continue

      const key = `${t.user_id}:${uiGameId}`

      // All-time best
      const prevAll = allTimeBest.get(key) || 0
      if (t.score > prevAll) allTimeBest.set(key, t.score)

      // Today best (current cycle only)
      if (t.utc_day === today) {
        if (!cycleStartTime || t.created_at > cycleStartTime) {
          const prevToday = todayBest.get(key) || 0
          if (t.score > prevToday) todayBest.set(key, t.score)
        }
      }
    }

    // For each skill, sum best-per-game scores per user, find the leader
    function computeLeaders(bestMap: Map<string, number>): Map<SkillId, { userId: string; score: number }> {
      const leaders = new Map<SkillId, { userId: string; score: number }>()

      // Collect all user IDs that appear in the map
      const userIds = new Set<string>()
      for (const key of bestMap.keys()) {
        userIds.add(key.split(':')[0])
      }

      for (const skill of SKILL_LIST) {
        const gameIds = Object.values(GAMES)
          .filter(g => g.skill === skill.id)
          .map(g => g.id)

        let bestUserId: string | null = null
        let bestScore = 0

        for (const userId of userIds) {
          let sum = 0
          for (const gid of gameIds) {
            sum += bestMap.get(`${userId}:${gid}`) || 0
          }
          if (sum > bestScore) {
            bestScore = sum
            bestUserId = userId
          }
        }

        if (bestUserId && bestScore > 0) {
          leaders.set(skill.id, { userId: bestUserId, score: bestScore })
        }
      }

      return leaders
    }

    const allTimeLeaders = computeLeaders(allTimeBest)
    const todayLeaders = computeLeaders(todayBest)

    // Collect user IDs for profile lookup
    const profileIds = new Set<string>()
    for (const v of allTimeLeaders.values()) profileIds.add(v.userId)
    for (const v of todayLeaders.values()) profileIds.add(v.userId)

    const nameMap = new Map<string, string>()
    const usernameMap = new Map<string, string>()

    if (profileIds.size > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, username')
        .in('user_id', [...profileIds])

      for (const p of profiles || []) {
        nameMap.set(p.user_id, p.display_name || p.username || 'Anonymous')
        if (p.username) usernameMap.set(p.user_id, p.username)
      }
    }

    function buildList(leaders: Map<SkillId, { userId: string; score: number }>): TopSkillEntry[] {
      return SKILL_LIST.map(skill => {
        const leader = leaders.get(skill.id)
        return {
          skillId: skill.id,
          skillName: skill.name,
          playerName: leader ? (nameMap.get(leader.userId) || 'Anonymous') : null,
          playerUsername: leader ? (usernameMap.get(leader.userId) || null) : null,
          skillScore: leader?.score || 0,
        }
      })
    }

    return NextResponse.json({
      allTime: buildList(allTimeLeaders),
      today: buildList(todayLeaders),
    })
  } catch (err) {
    console.error('Top skills error:', err)
    const empty = SKILL_LIST.map(s => ({
      skillId: s.id,
      skillName: s.name,
      playerName: null,
      playerUsername: null,
      skillScore: 0,
    }))
    return NextResponse.json({ allTime: empty, today: empty })
  }
}
