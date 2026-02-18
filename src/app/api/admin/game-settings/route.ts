import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const VALID_GAME_TYPES = [
  'emoji_keypad',
  'image_rotate',
  'reaction_time',
  'whack_a_mole',
  'typing_speed',
  'mental_math',
  'color_match',
  'visual_diff',
  'audio_pattern',
  'drag_sort',
  'follow_me',
  'duck_shoot',
  'beat_match',
  'grid_recall',
  'maze_path',
]

export async function GET() {
  try {
    // Require admin auth for game settings
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: adminCheck } = await authClient
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
    if (!adminCheck?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const supabase = await createServiceClient()

    // Get all game type settings
    const { data: gameTypes, error } = await supabase
      .from('game_types')
      .select('id, name, description, active, opens_at')
      .in('id', VALID_GAME_TYPES)

    if (error) {
      console.error('Fetch game types error:', error)
      return NextResponse.json({ error: 'Failed to fetch game settings' }, { status: 500 })
    }

    // Create a map for easy lookup, with defaults for missing games
    const gamesMap: Record<string, { isActive: boolean; opensAt: string | null }> = {}

    for (const gameId of VALID_GAME_TYPES) {
      const dbGame = gameTypes?.find(g => g.id === gameId)
      gamesMap[gameId] = {
        isActive: dbGame?.active ?? false,
        opensAt: dbGame?.opens_at ?? null,
      }
    }

    return NextResponse.json({ games: gamesMap })
  } catch (err) {
    console.error('Game settings error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { gameId, isActive, opensAt } = body

    if (!gameId || !VALID_GAME_TYPES.includes(gameId)) {
      return NextResponse.json({ error: 'Invalid game type' }, { status: 400 })
    }

    if (typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'isActive must be a boolean' }, { status: 400 })
    }

    // Validate opensAt if provided
    if (opensAt !== null && opensAt !== undefined) {
      const date = new Date(opensAt)
      if (isNaN(date.getTime())) {
        return NextResponse.json({ error: 'Invalid opensAt date' }, { status: 400 })
      }
    }

    // Use service client for the update to bypass RLS
    const serviceClient = await createServiceClient()

    // Upsert game type setting
    const { error: upsertError } = await serviceClient
      .from('game_types')
      .upsert({
        id: gameId,
        name: getGameName(gameId),
        description: getGameDescription(gameId),
        active: isActive,
        opens_at: opensAt || null,
      }, {
        onConflict: 'id'
      })

    if (upsertError) {
      console.error('Upsert error:', upsertError)
      return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      gameId,
      isActive,
      opensAt: opensAt || null,
    })
  } catch (err) {
    console.error('Game settings error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

function getGameName(gameId: string): string {
  const names: Record<string, string> = {
    emoji_keypad: 'Sequence',
    image_rotate: 'Puzzle Spin',
    reaction_time: 'Reaction Tap',
    whack_a_mole: 'Whack-a-Mole',
    typing_speed: 'Typing Speed',
    mental_math: 'Mental Math',
    color_match: 'Color Match',
    visual_diff: 'Spot the Diff',
    audio_pattern: 'Simon Says',
    drag_sort: 'Drag & Sort',
    follow_me: 'Follow Me',
    duck_shoot: 'Target Shoot',
    maze_path: 'Maze Path',
  }
  return names[gameId] || gameId
}

function getGameDescription(gameId: string): string {
  const descriptions: Record<string, string> = {
    emoji_keypad: 'Memorize and repeat the emoji pattern',
    image_rotate: 'Rotate tiles to complete the image',
    reaction_time: 'Click as fast as you can when the signal appears',
    whack_a_mole: 'Hit the moles as they pop up',
    typing_speed: 'Type the phrase as fast and accurately as possible',
    mental_math: 'Solve arithmetic problems quickly',
    color_match: 'Match the target color using RGB sliders',
    visual_diff: 'Find all the differences between two images',
    audio_pattern: 'Listen and repeat the sound sequence',
    drag_sort: 'Arrange items in the correct order',
    follow_me: 'Trace the path as accurately as possible',
    duck_shoot: 'Hit the moving targets with precision',
    maze_path: 'Find and trace the path through the maze',
  }
  return descriptions[gameId] || ''
}
