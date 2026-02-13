import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { SKILLS, GAME_LIST, toDbGameTypeId, toUiGameId, computeSkillLevel } from '@/lib/skills'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params
    const supabase = createServiceClient()

    // Look up profile by username
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('username', username)
      .limit(1)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    // Get this player's completed turns with scores
    const { data: playerTurns } = await supabase
      .from('game_turns')
      .select('game_type_id, score')
      .eq('user_id', profile.user_id)
      .eq('status', 'completed')
      .eq('flagged', false)
      .is('group_session_id', null)

    // Aggregate: plays per UI game ID + best score per DB game type
    const playsPerGame = new Map<string, number>()
    const playerBestPerGame = new Map<string, number>()
    for (const t of playerTurns || []) {
      const uiId = toUiGameId(t.game_type_id)
      playsPerGame.set(uiId, (playsPerGame.get(uiId) || 0) + 1)
      const cur = playerBestPerGame.get(t.game_type_id) ?? -1
      if ((t.score ?? 0) > cur) playerBestPerGame.set(t.game_type_id, t.score ?? 0)
    }

    // Fetch ALL players' turns for games this player has played (for percentile + rank)
    const playedDbIds = [...playerBestPerGame.keys()]
    // Map: dbGameTypeId -> Map<userId, { plays, bestScore }>
    const allByGame = new Map<string, Map<string, { plays: number; best: number }>>()

    if (playedDbIds.length > 0) {
      const { data: allTurns } = await supabase
        .from('game_turns')
        .select('user_id, game_type_id, score')
        .in('game_type_id', playedDbIds)
        .eq('status', 'completed')
        .eq('flagged', false)
        .is('group_session_id', null)

      for (const t of allTurns || []) {
        if (!allByGame.has(t.game_type_id)) allByGame.set(t.game_type_id, new Map())
        const gm = allByGame.get(t.game_type_id)!
        const ex = gm.get(t.user_id)
        const score = t.score ?? 0
        if (ex) {
          ex.plays++
          if (score > ex.best) ex.best = score
        } else {
          gm.set(t.user_id, { plays: 1, best: score })
        }
      }
    }

    // Compute per-skill results
    const skillResults = Object.values(SKILLS).map(skill => {
      const gameIds = GAME_LIST.filter(g => g.skill === skill.id).map(g => g.id)
      let totalPlays = 0
      let gamesPlayed = 0

      for (const gid of gameIds) {
        const plays = playsPerGame.get(gid) || 0
        totalPlays += plays
        if (plays > 0) gamesPlayed++
      }

      const level = computeSkillLevel(totalPlays)
      let rank = 1
      let totalPlayers = 0
      let percentile = 0

      if (totalPlays > 0) {
        // Score-based rank + percentile: for each game the player played,
        // compute rank (by best score) and percentile, then average
        let pctSum = 0
        let rankSum = 0
        let pctCount = 0
        let playerCountMax = 0

        for (const gid of gameIds) {
          const dbId = toDbGameTypeId(gid)
          const playerBest = playerBestPerGame.get(dbId)
          if (playerBest === undefined) continue

          const gameUsers = allByGame.get(dbId)
          if (!gameUsers) continue

          const allBests = Array.from(gameUsers.values()).map(d => d.best)
          const total = allBests.length
          const beaten = allBests.filter(s => s < playerBest).length
          const gameRank = total - beaten // 1 = best

          rankSum += gameRank
          if (total > playerCountMax) playerCountMax = total

          if (total <= 1) {
            pctSum += 0.5
          } else {
            pctSum += beaten / (total - 1)
          }
          pctCount++
        }

        if (pctCount > 0) {
          percentile = pctSum / pctCount
          rank = Math.round(rankSum / pctCount)
          totalPlayers = playerCountMax
        }
      }

      return {
        skillId: skill.id,
        name: skill.name,
        level,
        totalPlays,
        gamesPlayed,
        totalGames: gameIds.length,
        rank,
        totalPlayers,
        percentile,
      }
    })

    return NextResponse.json({ skills: skillResults })
  } catch (err) {
    console.error('Skills API error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
