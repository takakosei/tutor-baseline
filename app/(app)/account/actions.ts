'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { isLocale } from '@/lib/i18n/locale'
import { LOCALE_COOKIE } from '@/lib/i18n/server'

export async function deletePasskey(formData: FormData) {
  const passkeyId = String(formData.get('passkeyId') ?? '')
  const supabase = await createClient()
  const { error } = await supabase.auth.passkey.delete({ passkeyId })
  if (error) throw error
  revalidatePath('/account')
}

// The teacher's own UI language (profiles.locale; RLS only allows updating their own row).
// Also written to a cookie, so the login page and <html lang> keep the same language after signing out
export async function setLocale(formData: FormData) {
  const locale = formData.get('locale')
  if (!isLocale(locale)) throw new Error('invalid locale')
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const id = claims?.claims.sub
  if (!id) throw new Error('not signed in')
  const { data, error } = await supabase.from('profiles').update({ locale }).eq('id', id).select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('profile not found')
  ;(await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  revalidatePath('/', 'layout')
}
