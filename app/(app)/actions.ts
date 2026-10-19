'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signOut() {
  const supabase = await createClient()
  // Sign out of this device only. The default scope is 'global', which would also end sessions on phones and other browsers
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/login')
}
