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
import crypto from 'crypto'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Get game type from request body
    const body = await request.json().catch(() => ({}))
    const requestedGameType = body.gameType as string | undefined

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

    const today = new Date().toISOString().split('T')[0]

    let spec: Record<string, unknown>
    let clientSpec: Record<string, unknown>
    let gameTypeId: string

    console.log('Active game type:', activeGameType, 'Raw value:', gameSetting?.value)

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
      })
      .select()
      .single()

    if (turnError) {
      console.error('Turn creation error:', turnError)
      return NextResponse.json({ error: 'Failed to create turn: ' + turnError.message }, { status: 500 })
    }

    // Spend credit
    const { data: spent } = await supabase.rpc('spend_credit', {
      p_user_id: profile.user_id,
      p_turn_id: turn.id,
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
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'Internal error: ' + message }, { status: 500 })
  }
}
