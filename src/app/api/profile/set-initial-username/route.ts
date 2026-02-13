import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { validateUsername, AUTO_USERNAME_PATTERN } from '@/lib/username-validation'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { username } = body

    // Validate format
    const validation = validateUsername(username)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.message }, { status: 400 })
    }

    const serviceClient = await createServiceClient()

    // Get current profile — must have an auto-generated username
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Only allow if current username is auto-generated (prevents abuse)
    if (!AUTO_USERNAME_PATTERN.test(profile.username)) {
      return NextResponse.json({ error: 'Username already set' }, { status: 400 })
    }

    // Check availability (case-insensitive)
    const { data: existing } = await serviceClient
      .from('profiles')
      .select('id')
      .ilike('username', username)
      .neq('id', user.id)
      .limit(1)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Username is already taken' }, { status: 400 })
    }

    // Update username — do NOT set username_changed_at (doesn't burn 24h rate limit)
    const { error: updateError } = await serviceClient
      .from('profiles')
      .update({
        username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('Initial username set error:', updateError)
      return NextResponse.json({ error: 'Failed to set username' }, { status: 500 })
    }

    return NextResponse.json({ success: true, username })
  } catch (err) {
    console.error('Initial username set error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
