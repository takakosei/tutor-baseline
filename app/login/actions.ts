'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) redirect('/login?error=empty')

  // Next has already checked that a Server Action's Origin header matches Host: localhost locally, the Vercel domain in production
  const origin = (await headers()).get('origin')
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // the only user is created in the Supabase dashboard; the login page can't create accounts
      shouldCreateUser: false,
      // must be on the allow list in Supabase → Authentication → URL Configuration → Redirect URLs
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  })

  if (error) {
    console.error('signInWithOtp failed', error.code, error.message)
    redirect(`/login?error=${encodeURIComponent(error.code ?? 'unknown')}`)
  }
  redirect('/login?sent=1')
}
