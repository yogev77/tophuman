import { createServiceClient } from '@/lib/supabase/server'
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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const username = searchParams.get('username')

    if (!username) {
      return NextResponse.json(
        { available: false, message: 'Username is required' },
        { status: 400 }
      )
    }

    // Validate format
    const validation = validateUsername(username)
    if (!validation.valid) {
      return NextResponse.json(
        { available: false, message: validation.message },
        { status: 200 }
      )
    }

    // Check availability in database (case-insensitive)
    const supabase = await createServiceClient()
    const { data: existing, error } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', username)
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Username check error:', error)
      return NextResponse.json(
        { available: false, message: 'Error checking username' },
        { status: 500 }
      )
    }

    if (existing) {
      return NextResponse.json(
        { available: false, message: 'Username is already taken' },
        { status: 200 }
      )
    }

    return NextResponse.json({ available: true }, { status: 200 })
  } catch (err) {
    console.error('Username check error:', err)
    return NextResponse.json(
      { available: false, message: 'Internal error' },
      { status: 500 }
    )
  }
}
