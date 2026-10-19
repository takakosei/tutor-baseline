'use client'

import { useLocale } from '@/components/locale-provider'
import { app } from '@/lib/i18n/messages/app'

// Placeholder shown immediately when navigating between pages (while the server fetches data). It reads no data, so it
// appears at once (the language comes from the outer layout's LocaleProvider, with no extra database query)
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={app[useLocale()].loading}>
      <div className="h-6 w-40 animate-pulse rounded bg-foreground/10" />
      <div className="h-24 animate-pulse rounded-md bg-foreground/[0.06]" />
      <div className="h-24 animate-pulse rounded-md bg-foreground/[0.06]" />
      <div className="h-24 animate-pulse rounded-md bg-foreground/[0.06]" />
    </div>
  )
}
