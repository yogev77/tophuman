import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

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

    if (turn.status !== 'pending') {
      return NextResponse.json({ error: 'Turn already started or completed' }, { status: 400 })
    }

    if (new Date(turn.expires_at) < new Date()) {
      await supabase
        .from('game_turns')
        .update({ status: 'expired' })
        .eq('id', turn.id)
      return NextResponse.json({ error: 'Turn expired' }, { status: 400 })
    }

    const serverStartTime = new Date()

    // Update turn to active
    const { error: updateError } = await supabase
      .from('game_turns')
      .update({
        status: 'active',
        started_at: serverStartTime.toISOString(),
      })
      .eq('id', turn.id)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to start turn' }, { status: 500 })
    }

    // Record start event
    const eventHash = crypto
      .createHash('sha256')
      .update(`${turn.id}_start_${serverStartTime.toISOString()}`)
      .digest('hex')

    await supabase.from('turn_events').insert({
      turn_id: turn.id,
      event_type: 'start',
      event_index: 0,
      server_timestamp: serverStartTime.toISOString(),
      event_hash: eventHash,
    })

    return NextResponse.json({
      started: true,
      serverStartTime: serverStartTime.toISOString(),
      timeLimitMs: (turn.spec as { timeLimitMs: number }).timeLimitMs,
    })
  } catch (err) {
    console.error('Start turn error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
