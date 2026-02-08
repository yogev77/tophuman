import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin (own profile, readable via RLS)
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { userId: rawUserId, amount, reason } = body
    const userId = typeof rawUserId === 'string' ? rawUserId.trim() : rawUserId

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    if (!amount || typeof amount !== 'number' || amount <= 0 || amount > 1000 || !Number.isInteger(amount)) {
      return NextResponse.json({ error: 'Amount must be a whole number between 1 and 1000' }, { status: 400 })
    }

    // Use service client to bypass RLS for cross-user operations
    const serviceClient = createServiceClient()

    // Daily admin grant cap: max 10,000 credits per day across all admins
    const todayForCap = new Date().toISOString().split('T')[0]
    const { data: todayGrants } = await serviceClient
      .from('credit_ledger')
      .select('amount')
      .eq('event_type', 'admin_adjustment')
      .eq('utc_day', todayForCap)
      .gt('amount', 0)

    const totalGrantedToday = (todayGrants || []).reduce((sum: number, g: { amount: number }) => sum + g.amount, 0)
    if (totalGrantedToday + amount > 10000) {
      return NextResponse.json({ error: 'Daily admin grant cap reached' }, { status: 400 })
    }

    // Verify target user exists
    const { data: targetProfiles, error: profileLookupError } = await serviceClient
      .from('profiles')
      .select('user_id, display_name')
      .eq('user_id', userId)
      .limit(1)

    const targetProfile = targetProfiles?.[0]

    if (profileLookupError || !targetProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const today = new Date().toISOString().split('T')[0]

    // Insert credit ledger entry
    const { error: ledgerError } = await serviceClient
      .from('credit_ledger')
      .insert({
        user_id: userId,
        amount: amount,
        event_type: 'admin_adjustment',
        utc_day: today,
        metadata: {
          granted_by: user.id,
          reason: reason || 'Admin grant',
        },
      })

    if (ledgerError) {
      console.error('Ledger insert error:', ledgerError)
      return NextResponse.json({ error: 'Failed to grant credits' }, { status: 500 })
    }

    // Get new balance
    const { data: newBalance } = await serviceClient.rpc('get_user_balance', {
      p_user_id: userId,
    })

    // Audit log
    await serviceClient.from('audit_logs').insert({
      actor_type: 'admin',
      actor_id: user.id,
      action: 'grant_credits',
      resource_type: 'credit_ledger',
      resource_id: userId,
      details: { amount, reason: reason || 'Admin grant', newBalance: newBalance ?? 0 },
    })

    return NextResponse.json({
      success: true,
      userId,
      displayName: targetProfile.display_name,
      amountGranted: amount,
      newBalance: newBalance ?? 0,
    })
  } catch (err) {
    console.error('Admin grant error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
