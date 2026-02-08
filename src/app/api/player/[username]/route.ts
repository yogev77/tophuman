import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Map UI game IDs to database game_type_ids (for legacy compatibility)
const DB_GAME_TYPE_MAP: Record<string, string> = {
  emoji_keypad: 'emoji_keypad_sequence',
}

// Reverse map: DB game_type_id -> UI game ID
const DB_TO_UI_MAP: Record<string, string> = {
  emoji_keypad_sequence: 'emoji_keypad',
}

function toUiGameId(dbId: string): string {
  return DB_TO_UI_MAP[dbId] || dbId
}

function getDbGameTypeId(uiId: string): string {
  return DB_GAME_TYPE_MAP[uiId] || uiId
}

const GAME_NAMES: Record<string, string> = {
  emoji_keypad: 'Emoji Sequence',
  image_rotate: 'Image Puzzle',
  reaction_time: 'Reaction Time',
  whack_a_mole: 'Whack-a-Mole',
  typing_speed: 'Typing Speed',
  mental_math: 'Mental Math',
  color_match: 'Color Match',
  visual_diff: 'Spot Difference',
  audio_pattern: 'Audio Pattern',
  drag_sort: 'Drag & Sort',
  follow_me: 'Follow Me',
  duck_shoot: 'Target Shoot',
  memory_cards: 'Memory Cards',
  number_chain: 'Number Chain',
  gridlock: 'Gridlock',
}

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
      .select('user_id, display_name, username, created_at')
      .eq('username', username)
      .limit(1)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    const today = new Date().toISOString().split('T')[0]

    // Check for a completed settlement today (cycle boundary)
    const { data: todaySettlement } = await supabase
      .from('settlements')
      .select('completed_at')
      .eq('utc_day', today)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single()

    const cycleStartTime = todaySettlement?.completed_at || null

    // Fetch all completed, unflagged turns for this player
    const { data: allTurns } = await supabase
      .from('game_turns')
      .select('game_type_id, score, utc_day, created_at')
      .eq('user_id', profile.user_id)
      .eq('status', 'completed')
      .eq('flagged', false)
      .not('score', 'is', null)
      .gt('score', 0)
      .order('score', { ascending: false })

    // Player's best score per game (all-time)
    const allTimeBest = new Map<string, number>()
    // Player's best score per game (today, current cycle)
    const todayBest = new Map<string, number>()

    for (const turn of allTurns || []) {
      const gameId = toUiGameId(turn.game_type_id)

      if (!allTimeBest.has(gameId)) {
        allTimeBest.set(gameId, turn.score)
      }

      if (turn.utc_day === today && !todayBest.has(gameId)) {
        if (!cycleStartTime || turn.created_at > cycleStartTime) {
          todayBest.set(gameId, turn.score)
        }
      }
    }

    // Get all game IDs we need ranks for
    const gameIdsNeeded = new Set([...allTimeBest.keys(), ...todayBest.keys()])

    // Fetch all today's turns in one query for pool sizes
    let todayTurnsQuery = supabase
      .from('game_turns')
      .select('game_type_id')
      .eq('utc_day', today)

    if (cycleStartTime) {
      todayTurnsQuery = todayTurnsQuery.gt('created_at', cycleStartTime)
    }

    const { data: allTodayTurns } = await todayTurnsQuery
    const poolSizeByGame = new Map<string, number>()
    for (const t of allTodayTurns || []) {
      const id = toUiGameId(t.game_type_id)
      poolSizeByGame.set(id, (poolSizeByGame.get(id) || 0) + 1)
    }

    // Compute ranks for all games in parallel
    const games = await Promise.all(
      Array.from(gameIdsNeeded).map(async (gameId) => {
        const dbGameTypeId = getDbGameTypeId(gameId)
        const gameName = GAME_NAMES[gameId] || gameId

        const allTimeScore = allTimeBest.get(gameId)
        const todayScore = todayBest.get(gameId)

        // Build parallel queries
        const queries: PromiseLike<unknown>[] = []

        // All-time rank query
        if (allTimeScore !== undefined) {
          queries.push(
            supabase
              .from('game_turns')
              .select('user_id')
              .eq('game_type_id', dbGameTypeId)
              .eq('status', 'completed')
              .eq('flagged', false)
              .gt('score', allTimeScore)
              .limit(200)
          )
        } else {
          queries.push(Promise.resolve(null))
        }

        // Today rank query
        if (todayScore !== undefined) {
          let q = supabase
            .from('game_turns')
            .select('user_id')
            .eq('game_type_id', dbGameTypeId)
            .eq('utc_day', today)
            .eq('status', 'completed')
            .eq('flagged', false)
            .gt('score', todayScore)
            .limit(200)

          if (cycleStartTime) {
            q = q.gt('created_at', cycleStartTime)
          }
          queries.push(q)
        } else {
          queries.push(Promise.resolve(null))
        }

        const [allTimeResult, todayResult] = await Promise.all(queries)

        let allTime: { score: number; rank: number } | null = null
        if (allTimeScore !== undefined && allTimeResult) {
          const { data: higherScores } = allTimeResult as { data: { user_id: string }[] | null }
          const higherUsers = new Set((higherScores || []).map(t => t.user_id))
          allTime = { score: allTimeScore, rank: higherUsers.size + 1 }
        }

        let todayEntry: { score: number; rank: number; poolSize: number } | null = null
        if (todayScore !== undefined && todayResult) {
          const { data: todayHigherScores } = todayResult as { data: { user_id: string }[] | null }
          const todayHigherUsers = new Set((todayHigherScores || []).map(t => t.user_id))
          todayEntry = {
            score: todayScore,
            rank: todayHigherUsers.size + 1,
            poolSize: poolSizeByGame.get(gameId) || 0,
          }
        }

        return { gameId, gameName, allTime, today: todayEntry }
      })
    )

    // Sort games by today's score descending, then all-time
    games.sort((a, b) => {
      const aScore = a.today?.score ?? a.allTime?.score ?? 0
      const bScore = b.today?.score ?? b.allTime?.score ?? 0
      return bScore - aScore
    })

    return NextResponse.json({
      displayName: profile.display_name || profile.username || 'Anonymous',
      username: profile.username,
      joinedAt: profile.created_at,
      games,
    })
  } catch (err) {
    console.error('Player profile error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
