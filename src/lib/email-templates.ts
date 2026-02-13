export interface EmailTemplate {
  id: string
  name: string
  description: string
  supabaseEvent: 'signup' | 'invite' | 'recovery' | 'magiclink'
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'confirm_signup',
    name: 'Confirm Signup',
    description: 'Verification email new users receive after signing up. Contains confirmation link.',
    supabaseEvent: 'signup',
  },
  {
    id: 'reset_password',
    name: 'Reset Password',
    description: 'Password reset email with a recovery link.',
    supabaseEvent: 'recovery',
  },
  {
    id: 'magic_link',
    name: 'Magic Link',
    description: 'Passwordless login email with a one-time login link.',
    supabaseEvent: 'magiclink',
  },
  {
    id: 'invite_user',
    name: 'Invite User',
    description: 'Admin invitation email to onboard a new user.',
    supabaseEvent: 'invite',
  },
]

export function getTemplateById(id: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find(t => t.id === id)
}
