import { redirect } from 'next/navigation'

export default function LoginPage() {
  redirect('/auth/signup?mode=login')
}
