import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
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

    const { searchParams } = request.nextUrl
    const userId = searchParams.get('user_id')
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 100)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

    if (!userId) {
      return NextResponse.json({ error: 'user_id required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Resolve the identifier to an actual user_id (may be a username)
    const { data: resolvedProfiles } = await serviceClient
      .from('profiles')
      .select('user_id, display_name, username')
      .or(`user_id.eq.${userId},username.eq.${userId}`)
      .limit(1)

    const resolvedUserId = resolvedProfiles?.[0]?.user_id || userId
    const displayName = resolvedProfiles?.[0]?.display_name || resolvedProfiles?.[0]?.username || userId

    // Fetch balance and entries in parallel
    const [balanceResult, countResult, entriesResult] = await Promise.all([
      serviceClient.rpc('get_user_balance', { p_user_id: resolvedUserId }),
      serviceClient
        .from('credit_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', resolvedUserId),
      serviceClient
        .from('credit_ledger')
        .select('id, event_type, amount, utc_day, reference_id, reference_type, metadata, created_at')
        .eq('user_id', resolvedUserId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),
    ])

    if (entriesResult.error) {
      console.error('Treasury history fetch error:', entriesResult.error)
      return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
    }

    return NextResponse.json({
      entries: entriesResult.data || [],
      total: countResult.count ?? 0,
      balance: balanceResult.data ?? 0,
    })
  } catch (err) {
    console.error('Treasury history error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
