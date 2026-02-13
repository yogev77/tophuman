import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { toDbGameTypeId, GAMES } from '@/lib/skills'
import crypto from 'crypto'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id, banned_at')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }
    if (profile.banned_at) {
      return NextResponse.json({ error: 'Account banned' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const gameType = body.gameType as string | undefined

    if (!gameType || !GAMES[gameType]) {
      return NextResponse.json({ error: 'Invalid game type' }, { status: 400 })
    }

    const dbGameTypeId = toDbGameTypeId(gameType)
    const joinToken = crypto.randomBytes(16).toString('base64url')
    const endsAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min

    const { data: session, error: insertError } = await supabase
      .from('group_sessions')
      .insert({
        join_token: joinToken,
        game_type_id: dbGameTypeId,
        created_by: profile.user_id,
        ends_at: endsAt,
      })
      .select()
      .single()

    if (insertError || !session) {
      console.error('Group session create error:', insertError)
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }

    return NextResponse.json({
      sessionId: session.id,
      joinToken,
      gameType: dbGameTypeId,
      endsAt,
    })
  } catch (err) {
    console.error('Group play create error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
