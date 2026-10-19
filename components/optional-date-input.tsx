'use client'

import { useState } from 'react'
import { useLocale } from '@/components/locale-provider'
import { schedule } from '@/lib/i18n/messages/schedule'

// An optional date. Safari's date input cannot be cleared once set, so a "no date" button appears next to it after a date is picked
export function OptionalDateInput({
  name,
  min,
  max,
  className,
}: {
  name: string
  min?: string
  max?: string
  className?: string
}) {
  const [value, setValue] = useState('')
  const t = schedule[useLocale()].optionalDate
  return (
    <span className="inline-flex items-center gap-2">
      <input
        type="date"
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        min={min}
        max={max}
        aria-label={t.label}
        className={className}
      />
      {value ? (
        <button type="button" onClick={() => setValue('')} className="text-xs text-foreground/60 underline hover:text-foreground">
          {t.clear}
        </button>
      ) : (
        <span className="text-xs text-foreground/50">{t.hint}</span>
      )}
    </span>
  )
}
