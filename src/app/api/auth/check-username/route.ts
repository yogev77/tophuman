import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { validateUsername } from '@/lib/username-validation'

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
