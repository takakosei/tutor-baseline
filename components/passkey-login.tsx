'use client'

import { useState } from 'react'
import { createClient, passkeyErrorMessage } from '@/lib/supabase/client'
import { useLocale } from '@/components/locale-provider'
import { auth } from '@/lib/i18n/messages/auth'

// Passkey sign-in: after Face ID / Touch ID, the session is written to a cookie and the user goes to the dashboard
export function PasskeyLogin() {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const locale = useLocale()

  async function signIn() {
    setPending(true)
    setMessage(null)
    const { error } = await createClient().auth.signInWithPasskey()
    if (error) {
      setMessage(passkeyErrorMessage(error, locale))
      setPending(false)
      return
    }
    // A full page load, so proxy.ts and server components see the new session cookie and the pre-login router cache is cleared.
    // Deliberately not router.push: passkeys can only be tested on the production domain, so this keeps the verified approach
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/dashboard')
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className="w-full rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity disabled:opacity-50"
      >
        {pending ? auth[locale].signingIn : auth[locale].signIn}
      </button>
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  )
}
