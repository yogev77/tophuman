import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Map UI game IDs to database game_type_ids (for legacy compatibility)
const DB_GAME_TYPE_MAP: Record<string, string> = {
  emoji_keypad: 'emoji_keypad_sequence', // Legacy: stored as emoji_keypad_sequence in DB
}

// Get the database ID for a game
function getDbGameTypeId(uiId: string): string {
  return DB_GAME_TYPE_MAP[uiId] || uiId
}

const GAME_INFO: Record<string, { name: string; description: string }> = {
  emoji_keypad: {
    name: 'Emoji Sequence',
    description: 'Memorize and repeat the emoji pattern',
  },
  image_rotate: {
    name: 'Image Puzzle',
    description: 'Rotate tiles to complete the image',
  },
  reaction_time: {
    name: 'Reaction Time',
    description: 'Click as fast as you can when the signal appears',
  },
  whack_a_mole: {
    name: 'Whack-a-Mole',
    description: 'Hit the moles as they pop up',
  },
  typing_speed: {
    name: 'Typing Speed',
    description: 'Type the phrase as fast and accurately as possible',
  },
  mental_math: {
    name: 'Mental Math',
    description: 'Solve arithmetic problems quickly',
  },
  color_match: {
    name: 'Color Match',
    description: 'Match the target color using RGB sliders',
  },
  visual_diff: {
    name: 'Spot Difference',
    description: 'Find all the differences between two images',
  },
  audio_pattern: {
    name: 'Audio Pattern',
    description: 'Listen and repeat the sound sequence',
  },
  drag_sort: {
    name: 'Drag & Sort',
    description: 'Arrange items in the correct order',
  },
  follow_me: {
    name: 'Follow Me',
    description: 'Trace the path as accurately as possible',
  },
  duck_shoot: {
    name: 'Duck Shoot',
    description: 'Shoot the moving ducks before they escape',
  },
}

export async function GET() {
  try {
    const supabase = await createServiceClient()
    const today = new Date().toISOString().split('T')[0]
    const now = new Date()

    // Get all game types from database
    const { data: gameTypes } = await supabase
      .from('game_types')
      .select('id, name, description, active, opens_at')

    // Get today's stats for all games
    const { data: todayStats } = await supabase
      .from('game_turns')
      .select('game_type_id, user_id, score')
      .eq('utc_day', today)
      .eq('status', 'completed')
      .eq('flagged', false)

    // Get pool info
    const { data: pool } = await supabase
      .from('daily_pools')
      .select('*')
      .eq('utc_day', today)
      .single()

    // Calculate time until midnight UTC (settlement)
    const midnight = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0
    ))
    const msUntilSettlement = midnight.getTime() - now.getTime()

    // Get ALL turns today (including incomplete) for pool calculation
    const { data: allTurns } = await supabase
      .from('game_turns')
      .select('game_type_id')
      .eq('utc_day', today)

    // Calculate pool per game (each turn = 1 credit)
    const gamePoolSize = new Map<string, number>()
    for (const turn of allTurns || []) {
      gamePoolSize.set(turn.game_type_id, (gamePoolSize.get(turn.game_type_id) || 0) + 1)
    }

    // Process stats per game (from completed turns only)
    const gameStats = new Map<string, {
      players: Set<string>
      topScore: number
      turnCount: number
    }>()

    for (const turn of todayStats || []) {
      if (!gameStats.has(turn.game_type_id)) {
        gameStats.set(turn.game_type_id, {
          players: new Set(),
          topScore: 0,
          turnCount: 0,
        })
      }
      const stats = gameStats.get(turn.game_type_id)!
      stats.players.add(turn.user_id)
      stats.turnCount++
      if (turn.score && turn.score > stats.topScore) {
        stats.topScore = turn.score
      }
    }

    // Build response
    const games = Object.entries(GAME_INFO).map(([id, info]) => {
      const dbGameTypeId = getDbGameTypeId(id)
      const dbGame = gameTypes?.find(g => g.id === id)
      const stats = gameStats.get(dbGameTypeId)

      // Determine if game is currently playable
      const isActive = dbGame?.active ?? false
      const opensAt = dbGame?.opens_at ? new Date(dbGame.opens_at) : null

      // Game is playable if active AND (no opens_at OR opens_at has passed)
      const isPlayable = isActive && (!opensAt || opensAt <= now)

      return {
        id,
        name: info.name,
        description: info.description,
        isActive,
        isPlayable,
        opensAt: dbGame?.opens_at || null,
        poolSize: gamePoolSize.get(dbGameTypeId) ?? 0,
        todayStats: {
          playerCount: stats?.players.size ?? 0,
          topScore: stats?.topScore ?? 0,
          turnCount: stats?.turnCount ?? 0,
        },
      }
    })

    return NextResponse.json({
      games,
      pool: {
        totalCredits: pool?.total_credits ?? 0,
        uniquePlayers: pool?.unique_players ?? 0,
        totalTurns: pool?.total_turns ?? 0,
      },
      msUntilSettlement,
      utcDay: today,
    })
  } catch (err) {
    console.error('Games API error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
