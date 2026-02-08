import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = request.nextUrl
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 100)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

    const serviceClient = createServiceClient()

    const [countResult, snapshotsResult] = await Promise.all([
      serviceClient
        .from('treasury_snapshots')
        .select('id', { count: 'exact', head: true }),
      serviceClient
        .from('treasury_snapshots')
        .select('id, utc_day, balance, treasury_user_id, treasury_username, notes, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),
    ])

    if (snapshotsResult.error) {
      console.error('Treasury snapshots fetch error:', snapshotsResult.error)
      return NextResponse.json({ error: 'Failed to fetch snapshots' }, { status: 500 })
    }

    return NextResponse.json({
      snapshots: snapshotsResult.data || [],
      total: countResult.count ?? 0,
    })
  } catch (err) {
    console.error('Treasury snapshots error:', err)
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

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const notes = body.notes || null

    const serviceClient = createServiceClient()

    // Get treasury_user_id from site_settings
    const { data: treasurySetting } = await serviceClient
      .from('site_settings')
      .select('value')
      .eq('key', 'treasury_user_id')
      .single()

    if (!treasurySetting?.value) {
      return NextResponse.json({ error: 'No treasury user configured' }, { status: 400 })
    }

    const treasuryIdentifier = treasurySetting.value

    // Resolve to actual user_id and username
    // Resolve treasury user safely (avoid filter injection)
    const { data: tById } = await serviceClient
      .from('profiles')
      .select('user_id, username')
      .eq('user_id', treasuryIdentifier)
      .limit(1)

    let treasuryProfile = tById?.[0]
    if (!treasuryProfile) {
      const { data: tByName } = await serviceClient
        .from('profiles')
        .select('user_id, username')
        .eq('username', treasuryIdentifier)
        .limit(1)
      treasuryProfile = tByName?.[0]
    }

    const treasuryUserId = treasuryProfile?.user_id || treasuryIdentifier
    const treasuryUsername = treasuryProfile?.username || null

    // Get current balance
    const { data: balance } = await serviceClient.rpc('get_user_balance', { p_user_id: treasuryUserId })

    const utcDay = new Date().toISOString().split('T')[0]

    const { data: snapshot, error: insertError } = await serviceClient
      .from('treasury_snapshots')
      .insert({
        utc_day: utcDay,
        balance: balance ?? 0,
        treasury_user_id: treasuryUserId,
        treasury_username: treasuryUsername,
        notes,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Treasury snapshot insert error:', insertError)
      return NextResponse.json({ error: 'Failed to record snapshot' }, { status: 500 })
    }

    return NextResponse.json({ snapshot })
  } catch (err) {
    console.error('Treasury snapshot error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
