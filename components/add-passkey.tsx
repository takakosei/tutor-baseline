'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient, passkeyErrorMessage } from '@/lib/supabase/client'
import { useLocale } from '@/components/locale-provider'
import { auth } from '@/lib/i18n/messages/auth'

// Adds a passkey to the current account. Registration calls navigator.credentials.create(), so it has to run in the browser
export function AddPasskey() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const locale = useLocale()
  const t = auth[locale]

  async function add() {
    setPending(true)
    setMessage(null)
    const supabase = createClient()
    const { data, error } = await supabase.auth.registerPasskey()
    if (error) {
      setMessage(passkeyErrorMessage(error, locale))
      setPending(false)
      return
    }
    // Record which kind of device added it so the list can tell them apart (iCloud Keychain syncs to other Apple devices)
    const ua = navigator.userAgent
    const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Macintosh/.test(ua) ? 'Mac' : t.otherDevice
    await supabase.auth.passkey.update({ passkeyId: data.id, friendlyName: t.addedOn(device) })
    setPending(false)
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={add}
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity disabled:opacity-50"
      >
        {pending ? t.adding : t.add}
      </button>
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  )
}
