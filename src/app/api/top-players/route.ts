import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Reverse map: DB game_type_id -> UI game ID
const DB_TO_UI_MAP: Record<string, string> = {
  emoji_keypad_sequence: 'emoji_keypad',
}

function toUiGameId(dbId: string): string {
  return DB_TO_UI_MAP[dbId] || dbId
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
  number_chain: 'Number Chain',
  memory_cards: 'Memory Cards',
  gridlock: 'Gridlock',
}

export interface TopPlayerEntry {
  gameId: string
  gameName: string
  playerName: string
  playerUsername: string | null
  score: number
  poolSize?: number
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

    // Fetch all completed non-flagged turns, ordered by score desc
    // We'll process both all-time and today in one pass
    const { data: turns, error } = await supabase
      .from('game_turns')
      .select('user_id, game_type_id, score, utc_day, created_at')
      .eq('status', 'completed')
      .eq('flagged', false)
      .gt('score', 0)
      .order('score', { ascending: false })

    if (error || !turns || turns.length === 0) {
      return NextResponse.json({ allTime: [], today: [] })
    }

    // Best score per game (all-time) and today (current cycle only), plus today's pool size
    const allTimeBest = new Map<string, { userId: string; score: number }>()
    const todayBest = new Map<string, { userId: string; score: number }>()
    const todayPoolSize = new Map<string, number>()

    // Count today's turns per game for pool size (current cycle only)
    let poolQuery = supabase
      .from('game_turns')
      .select('game_type_id')
      .eq('utc_day', today)

    if (cycleStartTime) {
      poolQuery = poolQuery.gt('created_at', cycleStartTime)
    }

    const { data: todayTurns } = await poolQuery

    for (const t of todayTurns || []) {
      const gameId = toUiGameId(t.game_type_id)
      todayPoolSize.set(gameId, (todayPoolSize.get(gameId) || 0) + 1)
    }

    for (const t of turns) {
      const gameId = toUiGameId(t.game_type_id)

      // All-time: first occurrence per game is highest (ordered desc)
      if (!allTimeBest.has(gameId)) {
        allTimeBest.set(gameId, { userId: t.user_id, score: t.score })
      }

      // Today: only current cycle (after last settlement)
      if (t.utc_day === today && !todayBest.has(gameId)) {
        if (!cycleStartTime || t.created_at > cycleStartTime) {
          todayBest.set(gameId, { userId: t.user_id, score: t.score })
        }
      }
    }

    // Collect all user IDs we need names for
    const userIds = new Set<string>()
    for (const v of allTimeBest.values()) userIds.add(v.userId)
    for (const v of todayBest.values()) userIds.add(v.userId)

    if (userIds.size === 0) {
      return NextResponse.json({ allTime: [], today: [] })
    }

    // Fetch display names (game_turns.user_id is the TEXT user_id, not the UUID id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name, username')
      .in('user_id', [...userIds])

    const nameMap = new Map<string, string>()
    const usernameMap = new Map<string, string>()
    for (const p of profiles || []) {
      nameMap.set(p.user_id, p.display_name || p.username || 'Anonymous')
      if (p.username) {
        usernameMap.set(p.user_id, p.username)
      }
    }

    // Sort by today's pool size (most active games first), both tables use same order
    const buildList = (map: Map<string, { userId: string; score: number }>, includePool: boolean): TopPlayerEntry[] => {
      const list: TopPlayerEntry[] = []
      for (const [gameId, { userId, score }] of map) {
        list.push({
          gameId,
          gameName: GAME_NAMES[gameId] || gameId,
          playerName: nameMap.get(userId) || 'Anonymous',
          playerUsername: usernameMap.get(userId) || null,
          score,
          ...(includePool ? { poolSize: todayPoolSize.get(gameId) || 0 } : {}),
        })
      }
      list.sort((a, b) => (todayPoolSize.get(b.gameId) || 0) - (todayPoolSize.get(a.gameId) || 0))
      return list
    }

    return NextResponse.json({
      allTime: buildList(allTimeBest, false),
      today: buildList(todayBest, true),
    })
  } catch (err) {
    console.error('Top players error:', err)
    return NextResponse.json({ allTime: [], today: [] })
  }
}
