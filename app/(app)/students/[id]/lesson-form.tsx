import { SubmitButton } from '@/components/submit-button'
import { addLesson } from './actions'
import type { Locale } from '@/lib/i18n/locale'
import { common } from '@/lib/i18n/messages/common'
import { student } from '@/lib/i18n/messages/student'

const pill =
  'cursor-pointer rounded-full border border-foreground/20 px-3 py-1 text-sm peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-2'

// Log a lesson in 30 seconds. Defaults cover the most common case: today, held, duration from the schedule
// (120 minutes if nothing is scheduled), billable.
// The "held" and "leave" field groups are switched with CSS :has(), with no client JS;
// both groups are submitted and addLesson keeps the one matching status.
// error: when a day has several lessons and it's unclear which one to log, the times of those lessons (comma-separated)
export function LessonForm({
  studentId,
  today,
  error,
  locale,
}: {
  studentId: string
  today: string
  error?: string
  locale: Locale
}) {
  const t = student[locale]
  const f = t.lessonForm
  return (
    <details id="log" open={error !== undefined} className="rounded-xl border border-foreground/10">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{f.title}</summary>

      <form action={addLesson} className="group space-y-4 border-t border-foreground/10 px-4 py-4">
        <input type="hidden" name="studentId" value={studentId} />
        {error !== undefined && (
          <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {f.ambiguous(error.split(',').join(f.listSep))}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            name="date"
            defaultValue={today}
            required
            aria-label={f.date}
            className="rounded-md border border-foreground/20 bg-transparent px-2 py-1 text-sm"
          />
          <div className="flex gap-2" role="radiogroup" aria-label={f.status}>
            <Choice name="status" value="done" id="lesson-status-done" defaultChecked>{f.held}</Choice>
            <Choice name="status" value="leave">{common[locale].lessonStatus.leave}</Choice>
          </div>
          {/* For days like proctoring on Sunday morning and a lesson in the afternoon: when ticked, the log goes on the proctoring session */}
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="proctor" />
            {common[locale].proctorTag} <span className="text-xs text-foreground/50">{f.proctorNote}</span>
          </label>
        </div>

        {/* Held */}
        <div className="hidden flex-wrap items-center gap-3 group-has-[#lesson-status-done:checked]:flex">
          <select
            name="duration_min"
            defaultValue=""
            aria-label={f.duration}
            className="rounded-md border border-foreground/20 bg-transparent px-2 py-1 text-sm"
          >
            <option value="">{f.durationDefault}</option>
            {[60, 90, 120, 150, 180].map((m) => (
              <option key={m} value={m}>{t.minutes(m)}</option>
            ))}
          </select>
          <div className="flex gap-2" role="radiogroup" aria-label={f.mood}>
            {[1, 2, 3].map((m) => (
              <Choice key={m} name="mood" value={String(m)}>{t.moods[m]}</Choice>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="billable_done" defaultChecked />
            {t.billable}
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="online" />
            {common[locale].onlineTag} <span className="text-xs text-foreground/50">{f.onlineNote}</span>
          </label>
        </div>

        {/* Leave */}
        <div className="flex flex-wrap items-center gap-3 group-has-[#lesson-status-done:checked]:hidden">
          <input
            name="cancel_reason"
            placeholder={f.leaveReasonPlaceholder}
            aria-label={f.leaveReason}
            className="min-w-0 flex-1 rounded-md border border-foreground/20 bg-transparent px-3 py-1.5 text-sm"
          />
        </div>

        <label className="block space-y-1">
          <span className="text-sm">
            {t.internalNote} <span className="text-xs text-foreground/50">{t.onlyYou}</span>
          </span>
          <textarea
            name="note"
            rows={2}
            placeholder={f.notePlaceholder}
            className="w-full rounded-md border border-foreground/20 bg-transparent px-3 py-2 text-sm"
          />
        </label>

        {/* The line for parents: parents see only this, never the internal note, and it must not compare the child with other
            students or judge their personality or mood. Kept visually separate from the internal note */}
        <label className="hidden space-y-1 rounded-md bg-amber-500/10 p-3 group-has-[#lesson-status-done:checked]:block">
          <span className="text-sm">
            {t.parentSummary}
            <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-800 dark:text-amber-300">
              {t.parentVisible}
            </span>
          </span>
          <textarea
            name="parent_summary"
            rows={2}
            placeholder={f.parentSummaryPlaceholder}
            className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm"
          />
          <span className="block text-xs text-foreground/60">
            {f.parentSummaryHint}
          </span>
        </label>

        <SubmitButton pendingText={t.saving}>{common[locale].save}</SubmitButton>
      </form>
    </details>
  )
}

function Choice({
  name,
  value,
  id,
  defaultChecked,
  children,
}: {
  name: string
  value: string
  id?: string
  defaultChecked?: boolean
  children: React.ReactNode
}) {
  return (
    <label>
      <input
        type="radio"
        name={name}
        value={value}
        id={id}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <span className={pill}>{children}</span>
    </label>
  )
}
