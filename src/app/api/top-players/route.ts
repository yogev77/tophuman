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
}

export interface TopPlayerEntry {
  gameId: string
  gameName: string
  playerName: string
  score: number
}

export async function GET() {
  try {
    const supabase = createServiceClient()
    const today = new Date().toISOString().split('T')[0]

    // Fetch all completed non-flagged turns, ordered by score desc
    // We'll process both all-time and today in one pass
    const { data: turns, error } = await supabase
      .from('game_turns')
      .select('user_id, game_type_id, score, utc_day')
      .eq('status', 'completed')
      .eq('flagged', false)
      .gt('score', 0)
      .order('score', { ascending: false })

    if (error || !turns || turns.length === 0) {
      return NextResponse.json({ allTime: [], today: [] })
    }

    // Best score per game (all-time) and today
    const allTimeBest = new Map<string, { userId: string; score: number }>()
    const todayBest = new Map<string, { userId: string; score: number }>()

    for (const t of turns) {
      const gameId = toUiGameId(t.game_type_id)

      // All-time: first occurrence per game is highest (ordered desc)
      if (!allTimeBest.has(gameId)) {
        allTimeBest.set(gameId, { userId: t.user_id, score: t.score })
      }

      // Today
      if (t.utc_day === today && !todayBest.has(gameId)) {
        todayBest.set(gameId, { userId: t.user_id, score: t.score })
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
    for (const p of profiles || []) {
      nameMap.set(p.user_id, p.display_name || p.username || 'Anonymous')
    }

    // Build responses
    const buildList = (map: Map<string, { userId: string; score: number }>): TopPlayerEntry[] => {
      const list: TopPlayerEntry[] = []
      for (const [gameId, { userId, score }] of map) {
        list.push({
          gameId,
          gameName: GAME_NAMES[gameId] || gameId,
          playerName: nameMap.get(userId) || 'Anonymous',
          score,
        })
      }
      list.sort((a, b) => b.score - a.score)
      return list
    }

    return NextResponse.json({
      allTime: buildList(allTimeBest),
      today: buildList(todayBest),
    })
  } catch (err) {
    console.error('Top players error:', err)
    return NextResponse.json({ allTime: [], today: [] })
  }
}
