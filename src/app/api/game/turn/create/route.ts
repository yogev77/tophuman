import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateTurnSpec, getClientSpec, DEFAULT_CONFIG } from '@/lib/game/emoji-keypad'
import { generateImageRotateTurnSpec, getImageRotateClientSpec, DEFAULT_IMAGE_ROTATE_CONFIG } from '@/lib/game/image-rotate'
import { generateReactionTimeTurnSpec, getReactionTimeClientSpec, DEFAULT_REACTION_TIME_CONFIG } from '@/lib/game/reaction-time'
import { generateWhackAMoleTurnSpec, getWhackAMoleClientSpec, DEFAULT_WHACK_A_MOLE_CONFIG } from '@/lib/game/whack-a-mole'
import { generateTypingSpeedTurnSpec, getTypingSpeedClientSpec, DEFAULT_TYPING_SPEED_CONFIG } from '@/lib/game/typing-speed'
import { generateMentalMathTurnSpec, getMentalMathClientSpec, DEFAULT_MENTAL_MATH_CONFIG } from '@/lib/game/mental-math'
import { generateColorMatchTurnSpec, getColorMatchClientSpec, DEFAULT_COLOR_MATCH_CONFIG } from '@/lib/game/color-match'
import { generateVisualDiffTurnSpec, getVisualDiffClientSpec, DEFAULT_VISUAL_DIFF_CONFIG } from '@/lib/game/visual-diff'
import { generateAudioPatternTurnSpec, getAudioPatternClientSpec, DEFAULT_AUDIO_PATTERN_CONFIG } from '@/lib/game/audio-pattern'
import { generateDragSortTurnSpec, getDragSortClientSpec, DEFAULT_DRAG_SORT_CONFIG } from '@/lib/game/drag-sort'
import { generateFollowMeTurnSpec, getFollowMeClientSpec, DEFAULT_FOLLOW_ME_CONFIG } from '@/lib/game/follow-me'
import { generateDuckShootTurnSpec, getDuckShootClientSpec, DEFAULT_DUCK_SHOOT_CONFIG } from '@/lib/game/duck-shoot'
import { generateMemoryCardsTurnSpec, getMemoryCardsClientSpec, DEFAULT_MEMORY_CARDS_CONFIG } from '@/lib/game/memory-cards'
import { generateNumberChainTurnSpec, getNumberChainClientSpec, DEFAULT_NUMBER_CHAIN_CONFIG } from '@/lib/game/number-chain'
import { generateGridlockTurnSpec, getGridlockClientSpec, DEFAULT_GRIDLOCK_CONFIG } from '@/lib/game/gridlock'
import { generateReactionBarsTurnSpec, getReactionBarsClientSpec, DEFAULT_REACTION_BARS_CONFIG } from '@/lib/game/reaction-bars'
import { generateImagePuzzleTurnSpec, getImagePuzzleClientSpec, DEFAULT_IMAGE_PUZZLE_CONFIG } from '@/lib/game/image-puzzle'
import { generateDrawMeTurnSpec, getDrawMeClientSpec, DEFAULT_DRAW_ME_CONFIG } from '@/lib/game/draw-me'
import { generateBeatMatchTurnSpec, getBeatMatchClientSpec, DEFAULT_BEAT_MATCH_CONFIG } from '@/lib/game/beat-match'
import { createServiceClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Get game type from request body
    const body = await request.json().catch(() => ({}))
    const requestedGameType = body.gameType as string | undefined
    const groupSessionId = body.groupSessionId as string | undefined

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check email verification
    if (!user.email_confirmed_at) {
      return NextResponse.json({ error: 'Email not verified' }, { status: 403 })
    }

    // Get user's profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, banned_at')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (profile.banned_at) {
      return NextResponse.json({ error: 'Account banned' }, { status: 403 })
    }

    // Check balance
    const { data: balance } = await supabase.rpc('get_user_balance', {
      p_user_id: profile.user_id,
    })

    if ((balance ?? 0) < 1) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 400 })
    }

    // Rate limit: max 5 turns per minute per user
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString()
    const { count: recentTurns } = await supabase
      .from('game_turns')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profile.user_id)
      .gte('created_at', oneMinuteAgo)

    if ((recentTurns ?? 0) >= 5) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    // Use requested game type or fall back to active game type setting
    let activeGameType: string
    if (requestedGameType) {
      activeGameType = requestedGameType
    } else {
      const { data: gameSetting } = await supabase
        .from('game_settings')
        .select('value')
        .eq('key', 'active_game_type')
        .single()
      activeGameType = (gameSetting?.value as string) || 'emoji_keypad'
    }

    // Validate game type against whitelist
    const VALID_GAME_TYPES = new Set([
      'emoji_keypad', 'emoji_keypad_sequence', 'image_rotate', 'reaction_time',
      'whack_a_mole', 'typing_speed', 'mental_math', 'color_match',
      'visual_diff', 'audio_pattern', 'drag_sort', 'follow_me',
      'duck_shoot', 'memory_cards', 'number_chain', 'gridlock',
      'reaction_bars', 'image_puzzle', 'draw_me', 'beat_match',
    ])

    if (!VALID_GAME_TYPES.has(activeGameType)) {
      return NextResponse.json({ error: 'Invalid game type' }, { status: 400 })
    }

    // Validate group session if provided
    if (groupSessionId) {
      const service = createServiceClient()
      const { data: groupSession } = await service
        .from('group_sessions')
        .select('id, game_type_id, status, ends_at')
        .eq('id', groupSessionId)
        .single()

      if (!groupSession) {
        return NextResponse.json({ error: 'Group session not found' }, { status: 400 })
      }
      if (groupSession.status !== 'live') {
        return NextResponse.json({ error: 'Group session has ended' }, { status: 400 })
      }
      if (new Date(groupSession.ends_at) < new Date()) {
        return NextResponse.json({ error: 'Group session has expired' }, { status: 400 })
      }
      // The DB game type must match (compare using the DB game type IDs)
      const dbGameType = activeGameType === 'emoji_keypad' ? 'emoji_keypad_sequence' : activeGameType
      if (groupSession.game_type_id !== dbGameType) {
        return NextResponse.json({ error: 'Game type mismatch' }, { status: 400 })
      }
    }

    const today = new Date().toISOString().split('T')[0]

    let spec: Record<string, unknown>
    let clientSpec: Record<string, unknown>
    let gameTypeId: string

    console.log('Active game type:', activeGameType)

    try {
      switch (activeGameType) {
        case 'image_rotate': {
          const imageSpec = generateImageRotateTurnSpec(profile.user_id, DEFAULT_IMAGE_ROTATE_CONFIG)
          spec = imageSpec as unknown as Record<string, unknown>
          clientSpec = getImageRotateClientSpec(imageSpec) as unknown as Record<string, unknown>
          gameTypeId = 'image_rotate'
          break
        }
        case 'reaction_time': {
          const rtSpec = generateReactionTimeTurnSpec(profile.user_id, DEFAULT_REACTION_TIME_CONFIG)
          spec = rtSpec as unknown as Record<string, unknown>
          clientSpec = getReactionTimeClientSpec(rtSpec) as unknown as Record<string, unknown>
          gameTypeId = 'reaction_time'
          break
        }
        case 'whack_a_mole': {
          const wamSpec = generateWhackAMoleTurnSpec(profile.user_id, DEFAULT_WHACK_A_MOLE_CONFIG)
          spec = wamSpec as unknown as Record<string, unknown>
          clientSpec = getWhackAMoleClientSpec(wamSpec) as unknown as Record<string, unknown>
          gameTypeId = 'whack_a_mole'
          break
        }
        case 'typing_speed': {
          const tsSpec = generateTypingSpeedTurnSpec(profile.user_id, DEFAULT_TYPING_SPEED_CONFIG)
          spec = tsSpec as unknown as Record<string, unknown>
          clientSpec = getTypingSpeedClientSpec(tsSpec) as unknown as Record<string, unknown>
          gameTypeId = 'typing_speed'
          break
        }
        case 'mental_math': {
          const mmSpec = generateMentalMathTurnSpec(profile.user_id, DEFAULT_MENTAL_MATH_CONFIG)
          spec = mmSpec as unknown as Record<string, unknown>
          clientSpec = getMentalMathClientSpec(mmSpec) as unknown as Record<string, unknown>
          gameTypeId = 'mental_math'
          break
        }
        case 'color_match': {
          const cmSpec = generateColorMatchTurnSpec(profile.user_id, DEFAULT_COLOR_MATCH_CONFIG)
          spec = cmSpec as unknown as Record<string, unknown>
          clientSpec = getColorMatchClientSpec(cmSpec) as unknown as Record<string, unknown>
          gameTypeId = 'color_match'
          break
        }
        case 'visual_diff': {
          const vdSpec = generateVisualDiffTurnSpec(profile.user_id, DEFAULT_VISUAL_DIFF_CONFIG)
          spec = vdSpec as unknown as Record<string, unknown>
          clientSpec = getVisualDiffClientSpec(vdSpec) as unknown as Record<string, unknown>
          gameTypeId = 'visual_diff'
          break
        }
        case 'audio_pattern': {
          const apSpec = generateAudioPatternTurnSpec(profile.user_id, DEFAULT_AUDIO_PATTERN_CONFIG)
          spec = apSpec as unknown as Record<string, unknown>
          clientSpec = getAudioPatternClientSpec(apSpec) as unknown as Record<string, unknown>
          gameTypeId = 'audio_pattern'
          break
        }
        case 'drag_sort': {
          const dsSpec = generateDragSortTurnSpec(profile.user_id, DEFAULT_DRAG_SORT_CONFIG)
          spec = dsSpec as unknown as Record<string, unknown>
          clientSpec = getDragSortClientSpec(dsSpec) as unknown as Record<string, unknown>
          gameTypeId = 'drag_sort'
          break
        }
        case 'follow_me': {
          const fmSpec = generateFollowMeTurnSpec(profile.user_id, DEFAULT_FOLLOW_ME_CONFIG)
          spec = fmSpec as unknown as Record<string, unknown>
          clientSpec = getFollowMeClientSpec(fmSpec) as unknown as Record<string, unknown>
          gameTypeId = 'follow_me'
          break
        }
        case 'duck_shoot': {
          const dsSpec = generateDuckShootTurnSpec(profile.user_id, DEFAULT_DUCK_SHOOT_CONFIG)
          spec = dsSpec as unknown as Record<string, unknown>
          clientSpec = getDuckShootClientSpec(dsSpec) as unknown as Record<string, unknown>
          gameTypeId = 'duck_shoot'
          break
        }
        case 'memory_cards': {
          const mcSpec = generateMemoryCardsTurnSpec(profile.user_id, DEFAULT_MEMORY_CARDS_CONFIG)
          spec = mcSpec as unknown as Record<string, unknown>
          clientSpec = getMemoryCardsClientSpec(mcSpec) as unknown as Record<string, unknown>
          gameTypeId = 'memory_cards'
          break
        }
        case 'number_chain': {
          const ncSpec = generateNumberChainTurnSpec(profile.user_id, DEFAULT_NUMBER_CHAIN_CONFIG)
          spec = ncSpec as unknown as Record<string, unknown>
          clientSpec = getNumberChainClientSpec(ncSpec) as unknown as Record<string, unknown>
          gameTypeId = 'number_chain'
          break
        }
        case 'gridlock': {
          const glSpec = generateGridlockTurnSpec(profile.user_id, DEFAULT_GRIDLOCK_CONFIG)
          spec = glSpec as unknown as Record<string, unknown>
          clientSpec = getGridlockClientSpec(glSpec) as unknown as Record<string, unknown>
          gameTypeId = 'gridlock'
          break
        }
        case 'reaction_bars': {
          const rbSpec = generateReactionBarsTurnSpec(profile.user_id, DEFAULT_REACTION_BARS_CONFIG)
          spec = rbSpec as unknown as Record<string, unknown>
          clientSpec = getReactionBarsClientSpec(rbSpec) as unknown as Record<string, unknown>
          gameTypeId = 'reaction_bars'
          break
        }
        case 'image_puzzle': {
          const ipSpec = generateImagePuzzleTurnSpec(profile.user_id, DEFAULT_IMAGE_PUZZLE_CONFIG)
          spec = ipSpec as unknown as Record<string, unknown>
          clientSpec = getImagePuzzleClientSpec(ipSpec) as unknown as Record<string, unknown>
          gameTypeId = 'image_puzzle'
          break
        }
        case 'draw_me': {
          const dmSpec = generateDrawMeTurnSpec(profile.user_id, DEFAULT_DRAW_ME_CONFIG)
          spec = dmSpec as unknown as Record<string, unknown>
          clientSpec = getDrawMeClientSpec(dmSpec) as unknown as Record<string, unknown>
          gameTypeId = 'draw_me'
          break
        }
        case 'beat_match': {
          const bmSpec = generateBeatMatchTurnSpec(profile.user_id, DEFAULT_BEAT_MATCH_CONFIG)
          spec = bmSpec as unknown as Record<string, unknown>
          clientSpec = getBeatMatchClientSpec(bmSpec) as unknown as Record<string, unknown>
          gameTypeId = 'beat_match'
          break
        }
        default: {
          // Default: Emoji keypad sequence game
          const { data: gameConfig } = await supabase
            .from('daily_game_config')
            .select('parameters')
            .eq('utc_day', today)
            .single()

          const config = gameConfig?.parameters
            ? { ...DEFAULT_CONFIG, ...(gameConfig.parameters as object) }
            : DEFAULT_CONFIG

          const emojiSpec = generateTurnSpec(profile.user_id, config)
          spec = emojiSpec as unknown as Record<string, unknown>
          clientSpec = getClientSpec(emojiSpec) as unknown as Record<string, unknown>
          gameTypeId = 'emoji_keypad_sequence'
        }
      }
    } catch (specErr) {
      console.error('Spec generation error:', specErr)
      return NextResponse.json({ error: 'Failed to generate game spec' }, { status: 500 })
    }

    // Generate turn token
    const tokenRandom = crypto.randomBytes(32).toString('hex')
    const turnToken = `turn_${tokenRandom}_${Date.now()}`

    // Create turn record
    const expiresAt = new Date(Date.now() + 60000) // 60 seconds to start

    const { data: turn, error: turnError } = await supabase
      .from('game_turns')
      .insert({
        turn_token: turnToken,
        user_id: profile.user_id,
        game_type_id: gameTypeId,
        utc_day: today,
        seed: (spec as { seed?: string }).seed || crypto.randomUUID(),
        spec: spec,
        expires_at: expiresAt.toISOString(),
        status: 'pending',
        group_session_id: groupSessionId || null,
      })
      .select()
      .single()

    if (turnError) {
      console.error('Turn creation error:', turnError)
      return NextResponse.json({ error: 'Failed to create turn' }, { status: 500 })
    }

    // Spend credit (atomic — advisory lock prevents double-spend)
    const { data: spent } = await supabase.rpc('spend_credit', {
      p_user_id: profile.user_id,
      p_turn_id: turn.id,
      p_game_type_id: gameTypeId,
    })

    if (!spent) {
      // Rollback turn
      await supabase.from('game_turns').delete().eq('id', turn.id)
      return NextResponse.json({ error: 'Failed to spend credit' }, { status: 500 })
    }

    return NextResponse.json({
      turnId: turn.id,
      turnToken,
      spec: clientSpec,
      gameType: activeGameType,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (err) {
    console.error('Create turn error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
