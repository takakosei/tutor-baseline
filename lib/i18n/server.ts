import 'server-only'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_LOCALE, fromAcceptLanguage, isLocale, type Locale } from './locale'

// When the teacher picks a language on the Account page it's written to this cookie too, so the login page
// keeps that language after sign-out
export const LOCALE_COOKIE = 'locale'

// Pages without login (login, demo, <html lang>): cookie > browser language > default
export const getVisitorLocale = cache(async (): Promise<Locale> => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()])
  const saved = cookieStore.get(LOCALE_COOKIE)?.value
  if (isLocale(saved)) return saved
  return fromAcceptLanguage(headerList.get('accept-language')) ?? DEFAULT_LOCALE
})

// Teacher pages: profiles.locale (RLS, only the teacher's own row is readable); if unset, as above
export const getTeacherLocale = cache(async (): Promise<Locale> => {
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('locale').maybeSingle()
  return isLocale(data?.locale) ? data.locale : getVisitorLocale()
})
