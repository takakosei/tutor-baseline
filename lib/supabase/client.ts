import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'
import type { Locale } from '../i18n/locale'
import { auth } from '../i18n/messages/auth'

// Browser client (anon / publishable key, bound by RLS).
// Used only for passkeys, since WebAuthn has to run in the browser.
// The session is still stored in cookies, so the server side (proxy.ts / server.ts) reads it as usual.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Passkey error → one readable sentence. null = the user canceled, so there's nothing to show
export function passkeyErrorMessage(error: { code?: string; message: string; cause?: unknown }, locale: Locale): string | null {
  const cause = error.cause instanceof Error ? error.cause.name : null
  const t = auth[locale].errors
  switch (error.code) {
    case 'ERROR_CEREMONY_ABORTED':
      return null
    case 'ERROR_INVALID_DOMAIN':
    case 'ERROR_INVALID_RP_ID': {
      // The browser refused: the RP ID set in Supabase doesn't match this page's domain
      const host = window.location.hostname
      if (host === 'localhost' || host === '127.0.0.1') {
        return t.localhost
      }
      const rpId = error.message.match(/RP ID "([^"]*)"/)?.[1]
      return t.rpId(host, rpId ?? null)
    }
    case 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED':
      return t.registered
    case 'webauthn_challenge_expired':
      return t.expired
    case 'passkey_disabled':
      return t.disabled
  }
  // In Safari / Chrome, the user pressing Cancel usually surfaces as NotAllowedError
  if (cause === 'NotAllowedError' || error.message.includes('NotAllowedError')) return null
  return t.other(error.code ?? error.message)
}
