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

    const serviceClient = createServiceClient()
    const key = request.nextUrl.searchParams.get('key')

    if (key) {
      const { data, error } = await serviceClient
        .from('site_settings')
        .select('*')
        .eq('key', key)
        .single()

      if (error && error.code !== 'PGRST116') {
        return NextResponse.json({ error: 'Failed to fetch setting' }, { status: 500 })
      }

      return NextResponse.json({ setting: data || null })
    }

    const { data, error } = await serviceClient
      .from('site_settings')
      .select('*')

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }

    return NextResponse.json({ settings: data || [] })
  } catch (err) {
    console.error('Site settings GET error:', err)
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

    const body = await request.json()
    const { key, value } = body

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'key is required' }, { status: 400 })
    }

    if (value === undefined || value === null || typeof value !== 'string') {
      return NextResponse.json({ error: 'value is required (string)' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    const { data, error } = await serviceClient
      .from('site_settings')
      .upsert(
        { key, value, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
      .select()
      .single()

    if (error) {
      console.error('Site settings upsert error:', error)
      return NextResponse.json({ error: 'Failed to save setting' }, { status: 500 })
    }

    return NextResponse.json({ success: true, setting: data })
  } catch (err) {
    console.error('Site settings POST error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
