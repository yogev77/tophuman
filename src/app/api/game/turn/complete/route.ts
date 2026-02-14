import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { validateTurn, TurnSpec } from '@/lib/game/emoji-keypad'
import { validateImageRotateTurn, ImageRotateTurnSpec } from '@/lib/game/image-rotate'
import { validateReactionTimeTurn, ReactionTimeTurnSpec } from '@/lib/game/reaction-time'
import { validateWhackAMoleTurn, WhackAMoleTurnSpec } from '@/lib/game/whack-a-mole'
import { validateTypingSpeedTurn, TypingSpeedTurnSpec } from '@/lib/game/typing-speed'
import { validateMentalMathTurn, MentalMathTurnSpec } from '@/lib/game/mental-math'
import { validateColorMatchTurn, ColorMatchTurnSpec } from '@/lib/game/color-match'
import { validateVisualDiffTurn, VisualDiffTurnSpec } from '@/lib/game/visual-diff'
import { validateAudioPatternTurn, AudioPatternTurnSpec } from '@/lib/game/audio-pattern'
import { validateDragSortTurn, DragSortTurnSpec } from '@/lib/game/drag-sort'
import { validateFollowMeTurn, FollowMeTurnSpec } from '@/lib/game/follow-me'
import { validateDuckShootTurn, DuckShootTurnSpec } from '@/lib/game/duck-shoot'
import { validateMemoryCardsTurn, MemoryCardsTurnSpec } from '@/lib/game/memory-cards'
import { validateNumberChainTurn, NumberChainTurnSpec } from '@/lib/game/number-chain'
import { validateGridlockTurn, GridlockTurnSpec } from '@/lib/game/gridlock'
import { validateReactionBarsTurn, ReactionBarsTurnSpec } from '@/lib/game/reaction-bars'
import { validateImagePuzzleTurn, ImagePuzzleTurnSpec } from '@/lib/game/image-puzzle'
import { validateDrawMeTurn, DrawMeTurnSpec } from '@/lib/game/draw-me'
import { validateBeatMatchTurn, BeatMatchTurnSpec } from '@/lib/game/beat-match'
import { validateGridRecallTurn, GridRecallTurnSpec } from '@/lib/game/grid-recall'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { turnToken } = body

    if (!turnToken) {
      return NextResponse.json({ error: 'Turn token required' }, { status: 400 })
    }

    // Get user's profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get and validate turn
    const { data: turn, error: turnError } = await supabase
      .from('game_turns')
      .select('*')
      .eq('turn_token', turnToken)
      .eq('user_id', profile.user_id)
      .single()

    if (turnError || !turn) {
      return NextResponse.json({ error: 'Turn not found' }, { status: 404 })
    }

    if (turn.status !== 'active') {
      return NextResponse.json({ error: 'Turn not active' }, { status: 400 })
    }

    // Server-side elapsed time cross-check
    if (turn.started_at) {
      const elapsedMs = Date.now() - new Date(turn.started_at).getTime()
      const turnSpec = turn.spec as { timeLimitMs?: number }
      const maxAllowedMs = (turnSpec.timeLimitMs || 120000) + 10000 // 10s grace for network
      if (elapsedMs > maxAllowedMs) {
        await supabase.from('game_turns').update({ status: 'expired' }).eq('id', turn.id)
        return NextResponse.json({ error: 'Turn expired' }, { status: 400 })
      }
    }

    // Get all events for this turn
    const { data: events, error: eventsError } = await supabase
      .from('turn_events')
      .select('*')
      .eq('turn_id', turn.id)
      .order('event_index', { ascending: true })

    if (eventsError) {
      return NextResponse.json({ error: 'Failed to get events' }, { status: 500 })
    }

    // Verify event hash chain integrity (soft check — flag, don't reject)
    // Concurrent events (e.g. rapid drag swaps) can break the chain legitimately
    let hashChainBroken = false
    if (events && events.length > 0) {
      for (let i = 0; i < events.length; i++) {
        if (i === 0) {
          if (events[i].prev_hash !== null) {
            hashChainBroken = true
            break
          }
        } else {
          if (events[i].prev_hash !== events[i - 1].event_hash) {
            hashChainBroken = true
            break
          }
        }
      }
    }

    // Determine game type and validate accordingly
    const gameType = turn.game_type_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any

    const baseEvents = (events || []).map(e => ({
      eventType: e.event_type,
      serverTimestamp: new Date(e.server_timestamp),
      clientTimestampMs: e.client_timestamp_ms ?? undefined,
      ...(e.client_data as object || {}),
    }))

    switch (gameType) {
      case 'image_rotate': {
        const spec = turn.spec as unknown as ImageRotateTurnSpec
        result = validateImageRotateTurn(spec, baseEvents)
        break
      }
      case 'reaction_time': {
        const spec = turn.spec as unknown as ReactionTimeTurnSpec
        result = validateReactionTimeTurn(spec, baseEvents)
        break
      }
      case 'whack_a_mole': {
        const spec = turn.spec as unknown as WhackAMoleTurnSpec
        result = validateWhackAMoleTurn(spec, baseEvents)
        break
      }
      case 'typing_speed': {
        const spec = turn.spec as unknown as TypingSpeedTurnSpec
        result = validateTypingSpeedTurn(spec, baseEvents)
        break
      }
      case 'mental_math': {
        const spec = turn.spec as unknown as MentalMathTurnSpec
        result = validateMentalMathTurn(spec, baseEvents)
        break
      }
      case 'color_match': {
        const spec = turn.spec as unknown as ColorMatchTurnSpec
        result = validateColorMatchTurn(spec, baseEvents)
        break
      }
      case 'visual_diff': {
        const spec = turn.spec as unknown as VisualDiffTurnSpec
        result = validateVisualDiffTurn(spec, baseEvents)
        break
      }
      case 'audio_pattern': {
        const spec = turn.spec as unknown as AudioPatternTurnSpec
        result = validateAudioPatternTurn(spec, baseEvents)
        break
      }
      case 'drag_sort': {
        const spec = turn.spec as unknown as DragSortTurnSpec
        result = validateDragSortTurn(spec, baseEvents)
        break
      }
      case 'follow_me': {
        const spec = turn.spec as unknown as FollowMeTurnSpec
        result = validateFollowMeTurn(spec, baseEvents)
        break
      }
      case 'duck_shoot': {
        const spec = turn.spec as unknown as DuckShootTurnSpec
        result = validateDuckShootTurn(spec, baseEvents)
        break
      }
      case 'memory_cards': {
        const spec = turn.spec as unknown as MemoryCardsTurnSpec
        result = validateMemoryCardsTurn(spec, baseEvents)
        break
      }
      case 'number_chain': {
        const spec = turn.spec as unknown as NumberChainTurnSpec
        result = validateNumberChainTurn(spec, baseEvents)
        break
      }
      case 'gridlock': {
        const spec = turn.spec as unknown as GridlockTurnSpec
        result = validateGridlockTurn(spec, baseEvents)
        break
      }
      case 'reaction_bars': {
        const spec = turn.spec as unknown as ReactionBarsTurnSpec
        result = validateReactionBarsTurn(spec, baseEvents)
        break
      }
      case 'image_puzzle': {
        const spec = turn.spec as unknown as ImagePuzzleTurnSpec
        result = validateImagePuzzleTurn(spec, baseEvents)
        break
      }
      case 'draw_me': {
        const spec = turn.spec as unknown as DrawMeTurnSpec
        result = validateDrawMeTurn(spec, baseEvents)
        break
      }
      case 'beat_match': {
        const spec = turn.spec as unknown as BeatMatchTurnSpec
        result = validateBeatMatchTurn(spec, baseEvents)
        break
      }
      case 'grid_recall': {
        const spec = turn.spec as unknown as GridRecallTurnSpec
        result = validateGridRecallTurn(spec, baseEvents)
        break
      }
      default: {
        // Default: emoji keypad validation
        const transformedEvents = baseEvents.map(e => ({
          ...e,
          tapIndex: (e as { tapIndex?: number }).tapIndex,
        }))
        const spec = turn.spec as unknown as TurnSpec
        result = validateTurn(spec, transformedEvents)
      }
    }

    const completedAt = new Date()

    // Update turn with results
    const penalties = result.mistakes ?? result.extraRotations ?? 0
    const { error: updateError } = await supabase
      .from('game_turns')
      .update({
        status: result.valid ? 'completed' : 'invalid',
        completed_at: completedAt.toISOString(),
        score: result.score ?? null,
        completion_time_ms: result.completionTimeMs ?? null,
        penalties: penalties,
        flagged: result.flag ?? false,
        fraud_signals: result.flag ? { reason: result.reason, hashChainBroken } : hashChainBroken ? { hashChainBroken } : null,
      })
      .eq('id', turn.id)

    if (updateError) {
      console.error('Update turn error:', updateError)
      return NextResponse.json({ error: 'Failed to complete turn' }, { status: 500 })
    }

    if (!result.valid) {
      return NextResponse.json({
        valid: false,
        ...result,
      })
    }

    // Get rank preview
    const { data: rankData } = await supabase
      .from('game_turns')
      .select('score')
      .eq('utc_day', turn.utc_day)
      .eq('game_type_id', gameType)
      .eq('status', 'completed')
      .eq('flagged', false)
      .gt('score', result.score!)
      .order('score', { ascending: false })

    const rank = (rankData?.length ?? 0) + 1

    return NextResponse.json({
      valid: true,
      rank,
      ...result,
    })
  } catch (err) {
    console.error('Complete turn error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
