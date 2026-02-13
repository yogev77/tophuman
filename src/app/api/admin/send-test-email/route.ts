import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { getTemplateById } from '@/lib/email-templates'
import { NextRequest, NextResponse } from 'next/server'

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
    const { templateId, targetEmail } = body

    if (!templateId || typeof templateId !== 'string') {
      return NextResponse.json({ error: 'Template ID required' }, { status: 400 })
    }

    if (!targetEmail || typeof targetEmail !== 'string' || !targetEmail.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    const template = getTemplateById(templateId)
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const anonClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const serviceClient = createServiceClient()

    switch (template.supabaseEvent) {
      case 'signup': {
        // Signup needs a new user — use admin API to generate link which sends the email
        const { error } = await serviceClient.auth.admin.generateLink({
          type: 'signup',
          email: targetEmail,
          password: crypto.randomUUID(),
        })
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 502 })
        }
        break
      }

      case 'invite': {
        const { error } = await serviceClient.auth.admin.generateLink({
          type: 'invite',
          email: targetEmail,
        })
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 502 })
        }
        break
      }

      case 'recovery': {
        // Just send recovery to the email — must be an existing user
        const { error } = await anonClient.auth.resetPasswordForEmail(targetEmail)
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 502 })
        }
        break
      }

      case 'magiclink': {
        // Just send magic link to the email — works for existing users
        const { error } = await anonClient.auth.signInWithOtp({ email: targetEmail })
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 502 })
        }
        break
      }

      default:
        return NextResponse.json({ error: 'Unsupported email type' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
