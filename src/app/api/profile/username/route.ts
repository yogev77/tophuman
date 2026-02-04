import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const RESERVED_USERNAMES = [
  'admin',
  'administrator',
  'support',
  'system',
  'tophuman',
  'moderator',
  'mod',
  'staff',
  'help',
  'info',
  'contact',
  'root',
  'null',
  'undefined',
]

const RATE_LIMIT_MS = 24 * 60 * 60 * 1000 // 24 hours

function validateUsername(username: string): { valid: boolean; message?: string } {
  if (!username) {
    return { valid: false, message: 'Username is required' }
  }

  if (username.length < 3) {
    return { valid: false, message: 'Username must be at least 3 characters' }
  }

  if (username.length > 20) {
    return { valid: false, message: 'Username must be 20 characters or less' }
  }

  if (!/^[a-zA-Z]/.test(username)) {
    return { valid: false, message: 'Username must start with a letter' }
  }

  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(username)) {
    return { valid: false, message: 'Username can only contain letters, numbers, and underscores' }
  }

  if (RESERVED_USERNAMES.includes(username.toLowerCase())) {
    return { valid: false, message: 'This username is reserved' }
  }

  return { valid: true }
}

export async function PATCH(request: NextRequest) {
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

    // Get current profile
    const serviceClient = await createServiceClient()
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('username, username_changed_at')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Check if same username
    if (profile.username.toLowerCase() === username.toLowerCase()) {
      return NextResponse.json({ error: 'This is already your username' }, { status: 400 })
    }

    // Check rate limit
    if (profile.username_changed_at) {
      const lastChange = new Date(profile.username_changed_at).getTime()
      const now = Date.now()
      if (now - lastChange < RATE_LIMIT_MS) {
        const hoursLeft = Math.ceil((RATE_LIMIT_MS - (now - lastChange)) / (60 * 60 * 1000))
        return NextResponse.json(
          { error: `You can change your username again in ${hoursLeft} hours` },
          { status: 429 }
        )
      }
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

    // Update username
    const { error: updateError } = await serviceClient
      .from('profiles')
      .update({
        username,
        username_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('Username update error:', updateError)
      return NextResponse.json({ error: 'Failed to update username' }, { status: 500 })
    }

    return NextResponse.json({ success: true, username })
  } catch (err) {
    console.error('Username update error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
