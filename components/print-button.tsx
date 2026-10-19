'use client'

import { useLocale } from '@/components/locale-provider'
import { common } from '@/lib/i18n/messages/common'

// Opens the browser's print dialog. In Safari / Chrome, "Save as PDF" produces a PDF
export function PrintButton() {
  const t = common[useLocale()]
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
    >
      {t.print}
    </button>
  )
}
