'use client'

import { useState } from 'react'
import { useLocale } from '@/components/locale-provider'
import { common } from '@/lib/i18n/messages/common'

// Read-only link field + copy button. Clicking the field selects it all, so manual copying still works when copying fails (e.g. not on https)
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const t = common[useLocale()]

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={value}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-md border border-foreground/20 bg-transparent px-3 py-1.5 font-mono text-xs"
      />
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-md border border-foreground/20 px-3 py-1.5 text-sm hover:bg-foreground/[0.04]"
      >
        {copied ? t.copied : t.copy}
      </button>
    </div>
  )
}
