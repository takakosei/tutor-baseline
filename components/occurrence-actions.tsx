import { SubmitButton } from '@/components/submit-button'
import { MoveLesson } from '@/components/move-lesson'
import { markDone, markLeave, resetOccurrence } from '@/app/(app)/schedule-actions'
import type { Occurrence } from '@/lib/schedule'
import type { Locale } from '@/lib/i18n/locale'
import { common } from '@/lib/i18n/messages/common'
import { schedule } from '@/lib/i18n/messages/schedule'

// Actions next to a lesson. Not yet recorded: done / online (done, at the online rate) / leave / reschedule;
// already recorded: the status + undo.
// move = false hides "reschedule" (the trial-lesson card has its own reschedule form)
export function OccurrenceActions({ o, move = true, locale }: { o: Occurrence; move?: boolean; locale: Locale }) {
  const t = schedule[locale].actions
  if (o.status !== 'scheduled') {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className={o.status === 'done' ? 'text-foreground/60' : 'text-amber-700 dark:text-amber-400'}>
          {common[locale].lessonStatus[o.status] ?? o.status}
          {o.status === 'done' && o.online && t.onlineSuffix}
        </span>
        {o.lessonId && (
          <details className="relative text-foreground/40">
            <summary className="cursor-pointer list-none hover:text-foreground">{t.undo}</summary>
            <form action={resetOccurrence} className="absolute right-0 z-10 mt-1 rounded-md border border-foreground/10 bg-background p-2 shadow-sm">
              <input type="hidden" name="lessonId" value={o.lessonId} />
              <button type="submit" className="whitespace-nowrap text-red-600 hover:underline">
                {t.confirmUndo}
              </button>
            </form>
          </details>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <form action={markDone}>
        <input type="hidden" name="key" value={o.key} />
        <SubmitButton small pendingText="…">{t.done}</SubmitButton>
      </form>
      {/* Done online: billed at the online rate (not for trial lessons, which have a fixed price, or proctored sessions, which are billed per session) */}
      {!o.trial && !o.proctor && (
        <form action={markDone}>
          <input type="hidden" name="key" value={o.key} />
          <input type="hidden" name="online" value="1" />
          <SubmitButton small secondary pendingText="…">{t.online}</SubmitButton>
        </form>
      )}
      <form action={markLeave}>
        <input type="hidden" name="key" value={o.key} />
        <SubmitButton small secondary pendingText="…">{t.leave}</SubmitButton>
      </form>
      {move && <MoveLesson o={o} />}
    </div>
  )
}
