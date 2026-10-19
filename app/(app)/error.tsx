'use client'

import { useEffect } from 'react'
import { useLocale } from '@/components/locale-provider'
import { app } from '@/lib/i18n/messages/app'

// Error fallback for signed-in pages. In production Next hides server error details and leaves only a digest,
// so this shows a plain message and a retry button; the cause can be found in the Vercel logs by digest.
// retry = fetch this page from the server again and re-render (named unstable_retry before Next 16.3)
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const t = app[useLocale()].error
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="space-y-3 py-8 text-sm">
      <p className="font-medium">{t.title}</p>
      {error.digest && <p className="text-xs text-foreground/50">{t.digest(error.digest)}</p>}
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-md border border-foreground/20 px-3 py-1.5"
      >
        {t.retry}
      </button>
    </div>
  )
}
