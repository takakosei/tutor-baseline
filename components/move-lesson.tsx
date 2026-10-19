'use client'

import { useActionState, useEffect, useRef } from 'react'
import { moveLesson, type MoveState } from '@/app/(app)/schedule-actions'
import { SubmitButton } from '@/components/submit-button'
import { formatMonthDay } from '@/lib/format'
import type { Occurrence } from '@/lib/schedule'
import { useLocale } from '@/components/locale-provider'
import type { Locale } from '@/lib/i18n/locale'
import { common } from '@/lib/i18n/messages/common'
import { schedule } from '@/lib/i18n/messages/schedule'

const input = 'rounded-md border border-foreground/20 bg-transparent px-2 py-1 text-sm'

// "Reschedule" next to an upcoming lesson: moves this one occurrence only (the weekly slot stays). A moved lesson can be moved back.
// If the move is rejected (clash with another lesson, invalid time) the reason shows in the form; on success the form closes
export function MoveLesson({ o }: { o: Occurrence }) {
  const [state, action] = useActionState<MoveState, FormData>(moveLesson, {})
  const ref = useRef<HTMLDetailsElement>(null)
  const locale = useLocale()
  const t = schedule[locale].move
  useEffect(() => {
    if (state.saved && ref.current) ref.current.open = false
  }, [state.saved])

  const moved = o.movedFrom && o.movedFromStart && o.movedFromEnd
  return (
    // On a phone the form opens below the button (a popover would go off-screen); on wide screens it floats at the bottom right
    <details ref={ref} className="relative text-xs max-sm:open:basis-full">
      <summary className="w-fit cursor-pointer list-none rounded-md border border-foreground/20 px-3 py-1 font-medium hover:bg-foreground/[0.04] [&::-webkit-details-marker]:hidden">
        {t.button}
      </summary>
      <div className="mt-1.5 space-y-2 rounded-md border border-foreground/10 bg-background p-3 text-sm shadow-sm sm:absolute sm:right-0 sm:z-10 sm:mt-1 sm:w-[19rem]">
        <p className="text-xs text-foreground/60">{t.onlyOnce}</p>
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="key" value={o.key} />
          <input type="date" name="date" required defaultValue={o.date} aria-label={t.date} className={input} />
          <span className="flex items-center gap-1">
            <input type="time" name="start" required defaultValue={o.start ?? ''} aria-label={t.start} className={input} />
            {o.trial ? (
              <span className="text-xs text-foreground/60">{t.oneHour}</span>
            ) : (
              <>
                –<input type="time" name="end" required defaultValue={o.end ?? ''} aria-label={t.end} className={input} />
              </>
            )}
          </span>
          <SubmitButton small pendingText="…">{common[locale].save}</SubmitButton>
        </form>
        {moved && (
          <form action={action} className="flex flex-wrap items-center gap-2 border-t border-foreground/10 pt-2 text-xs">
            <input type="hidden" name="key" value={o.key} />
            <input type="hidden" name="restore" value="1" />
            <span className="text-foreground/60">
              {t.original(`${formatMonthDay(o.movedFrom!, locale)} ${o.movedFromStart}–${o.movedFromEnd}`)}
            </span>
            <SubmitButton small secondary pendingText="…">
              {t.restore}
            </SubmitButton>
          </form>
        )}
        {state.error && (
          <p aria-live="polite" className="rounded-md bg-red-500/10 px-2 py-1.5 text-xs text-red-700 dark:text-red-400">
            {state.error}
          </p>
        )}
      </div>
    </details>
  )
}

// A moved lesson: shows the original time next to the new one (tutor views). Also used in server components, so it takes a locale prop
export function MovedNote({ o, locale, className = '' }: { o: Occurrence; locale: Locale; className?: string }) {
  if (!o.movedFrom) return null
  const same = o.movedFrom === o.date
  return (
    <span className={`text-xs text-amber-700 dark:text-amber-400 ${className}`}>
      {schedule[locale].move.note(same ? null : formatMonthDay(o.movedFrom), o.movedFromStart ?? null)}
    </span>
  )
}
