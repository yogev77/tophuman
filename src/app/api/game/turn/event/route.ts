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
    const { turnToken, eventType, clientTimestampMs, ...clientData } = body

    if (!turnToken || !eventType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

    const serverTimestamp = new Date()

    // Check time limit
    const spec = turn.spec as { timeLimitMs: number }
    const startedAt = new Date(turn.started_at!)
    const elapsed = serverTimestamp.getTime() - startedAt.getTime()

    if (elapsed > spec.timeLimitMs + 5000) {
      // 5 second grace period for network latency
      await supabase
        .from('game_turns')
        .update({ status: 'expired' })
        .eq('id', turn.id)
      return NextResponse.json({ error: 'Turn timed out' }, { status: 400 })
    }

    // Get current event count for index
    const { count } = await supabase
      .from('turn_events')
      .select('*', { count: 'exact', head: true })
      .eq('turn_id', turn.id)

    const eventIndex = (count ?? 0)

    // Max event cap: prevent flooding (500 events per turn)
    if (eventIndex >= 500) {
      return NextResponse.json({ error: 'Too many events' }, { status: 429 })
    }

    // Get previous hash for chain
    const { data: prevEvent } = await supabase
      .from('turn_events')
      .select('event_hash')
      .eq('turn_id', turn.id)
      .order('event_index', { ascending: false })
      .limit(1)
      .single()

    const prevHash = prevEvent?.event_hash || null

    // Calculate event hash
    const eventData = JSON.stringify({
      turnId: turn.id,
      eventType,
      eventIndex,
      clientData,
      serverTimestamp: serverTimestamp.toISOString(),
      prevHash,
    })
    const eventHash = crypto.createHash('sha256').update(eventData).digest('hex')

    // Record event - store all client data
    const { error: eventError } = await supabase.from('turn_events').insert({
      turn_id: turn.id,
      event_type: eventType,
      event_index: eventIndex,
      client_timestamp_ms: clientTimestampMs,
      client_data: clientData,
      server_timestamp: serverTimestamp.toISOString(),
      prev_hash: prevHash,
      event_hash: eventHash,
    })

    if (eventError) {
      console.error('Event insert error:', eventError)
      return NextResponse.json({ error: 'Failed to record event' }, { status: 500 })
    }

    // Special handling for reaction time - return delay for request_signal
    if (eventType === 'request_signal') {
      const spec = turn.spec as { delays?: number[] }
      const round = clientData.round ?? 0
      const delay = spec.delays?.[round] ?? 2000
      return NextResponse.json({
        received: true,
        eventIndex,
        delay,
        serverTimestamp: serverTimestamp.toISOString(),
      })
    }

    return NextResponse.json({
      received: true,
      eventIndex,
      serverTimestamp: serverTimestamp.toISOString(),
    })
  } catch (err) {
    console.error('Event error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
