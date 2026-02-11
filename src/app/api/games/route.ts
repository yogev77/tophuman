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
    name: 'Puzzle Rotation',
    description: 'Rotate tiles to complete the image',
  },
  reaction_time: {
    name: 'Reaction Tap',
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
    name: 'Target Shoot',
    description: 'Hit the moving targets with precision',
  },
  memory_cards: {
    name: 'Memory Cards',
    description: 'Match pairs of cards',
  },
  number_chain: {
    name: 'Number Chain',
    description: 'Tap numbers in order',
  },
  gridlock: {
    name: 'Gridlock',
    description: 'Solve sliding puzzles',
  },
  reaction_bars: {
    name: 'Reaction Bars',
    description: 'Stop oscillating bars at the target width',
  },
  image_puzzle: {
    name: 'Image Puzzle',
    description: 'Place missing pieces to complete the image',
  },
  draw_me: {
    name: 'Draw Me',
    description: 'Reproduce the reference path from sight',
  },
}

export async function GET() {
  try {
    const supabase = createServiceClient()
    const today = new Date().toISOString().split('T')[0]
    const now = new Date()

    // Get all game types from database
    const { data: gameTypes } = await supabase
      .from('game_types')
      .select('id, name, description, active, opens_at')

    // Check for a completed settlement today (to know the cycle boundary)
    const { data: todaySettlement } = await supabase
      .from('settlements')
      .select('completed_at')
      .eq('utc_day', today)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single()

    // If there was a settlement today, only count turns after it
    const cycleStartTime = todaySettlement?.completed_at || null

    // Get today's stats for all games (only from current cycle)
    let statsQuery = supabase
      .from('game_turns')
      .select('game_type_id, user_id, score')
      .eq('utc_day', today)
      .eq('status', 'completed')
      .eq('flagged', false)

    if (cycleStartTime) {
      statsQuery = statsQuery.gt('created_at', cycleStartTime)
    }

    const { data: todayStats } = await statsQuery

    // Calculate time until midnight UTC (settlement)
    const midnight = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0
    ))
    const msUntilSettlement = midnight.getTime() - now.getTime()

    // Get ALL turns today (including incomplete) for pool calculation
    // Only count turns from current cycle (after settlement if there was one)
    const gamePoolSize = new Map<string, number>()
    const allCyclePlayers = new Set<string>()
    let totalCycleTurns = 0

    {
      let poolQuery = supabase
        .from('game_turns')
        .select('game_type_id, user_id')
        .eq('utc_day', today)

      if (cycleStartTime) {
        poolQuery = poolQuery.gt('created_at', cycleStartTime)
      }

      const { data: allTurns } = await poolQuery

      // Calculate pool per game (each turn = 1 credit)
      for (const turn of allTurns || []) {
        gamePoolSize.set(turn.game_type_id, (gamePoolSize.get(turn.game_type_id) || 0) + 1)
        allCyclePlayers.add(turn.user_id)
        totalCycleTurns++
      }
    }

    // Process stats per game (from completed turns only)
    const gameStats = new Map<string, {
      players: Set<string>
      topScore: number
      topPlayerId: string | null
      turnCount: number
    }>()

    for (const turn of todayStats || []) {
      if (!gameStats.has(turn.game_type_id)) {
        gameStats.set(turn.game_type_id, {
          players: new Set(),
          topScore: 0,
          topPlayerId: null,
          turnCount: 0,
        })
      }
      const stats = gameStats.get(turn.game_type_id)!
      stats.players.add(turn.user_id)
      stats.turnCount++
      if (turn.score && turn.score > stats.topScore) {
        stats.topScore = turn.score
        stats.topPlayerId = turn.user_id
      }
    }

    // Get display names for top players
    const topPlayerIds = Array.from(gameStats.values())
      .map(s => s.topPlayerId)
      .filter((id): id is string => id !== null)

    const topPlayerNames = new Map<string, string>()
    const topPlayerUsernames = new Map<string, string>()
    if (topPlayerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, username')
        .in('user_id', topPlayerIds)

      for (const profile of profiles || []) {
        topPlayerNames.set(profile.user_id, profile.display_name || profile.username || 'Anonymous')
        if (profile.username) {
          topPlayerUsernames.set(profile.user_id, profile.username)
        }
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

      const topPlayerId = stats?.topPlayerId
      const topPlayerName = topPlayerId ? topPlayerNames.get(topPlayerId) : null
      const topPlayerUsername = topPlayerId ? topPlayerUsernames.get(topPlayerId) : null

      return {
        id,
        name: info.name,
        description: info.description,
        isActive,
        isPlayable,
        opensAt: dbGame?.opens_at || null,
        poolSize: gamePoolSize.get(dbGameTypeId) ?? 0,
        todayStats: {
          // Stats are already filtered to current cycle (post-settlement)
          playerCount: stats?.players.size ?? 0,
          topScore: stats?.topScore ?? 0,
          topPlayerName: topPlayerName || null,
          topPlayerUsername: topPlayerUsername || null,
          turnCount: stats?.turnCount ?? 0,
        },
      }
    })

    // Calculate total pool from current cycle turns
    let totalPoolCredits = 0
    for (const size of gamePoolSize.values()) {
      totalPoolCredits += size
    }

    return NextResponse.json({
      games,
      pool: {
        // Use calculated values from current cycle, not the pool table (which may have old data)
        totalCredits: totalPoolCredits,
        uniquePlayers: allCyclePlayers.size,
        totalTurns: totalCycleTurns,
        status: totalCycleTurns === 0 && cycleStartTime ? 'settled' : 'active',
      },
      msUntilSettlement,
      utcDay: today,
    })
  } catch (err) {
    console.error('Games API error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
