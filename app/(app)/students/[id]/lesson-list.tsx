import { formatMonthDay } from '@/lib/format'
import { SubmitButton } from '@/components/submit-button'
import { deleteLesson, updateLesson } from './actions'
import { ProctorTag, TrialTag } from '@/components/trial-tag'
import type { Locale } from '@/lib/i18n/locale'
import { common } from '@/lib/i18n/messages/common'
import { student } from '@/lib/i18n/messages/student'

export type LessonRow = {
  id: string
  date: string
  status: string
  cancel_reason: string | null
  duration_min: number | null
  billable: boolean
  online?: boolean
  mood: number | null
  note: string | null
  parent_summary: string | null
  trial?: boolean
  proctor?: boolean // proctoring
}

// mood colors (the text is in the dictionary: student.moods)
const MOOD_DOT: Record<number, string> = { 1: 'bg-green-500', 2: 'bg-amber-500', 3: 'bg-red-500' }

export function LessonList({ lessons, studentId, locale }: { lessons: LessonRow[]; studentId: string; locale: Locale }) {
  const t = student[locale]
  if (lessons.length === 0) {
    return <p className="text-sm text-foreground/50">{t.lessons.empty}</p>
  }

  return (
    <ul className="divide-y divide-foreground/10 rounded-xl border border-foreground/10">
      {lessons.map((l) => {
        const held = l.status === 'done'
        return (
          <li key={l.id} className="space-y-1.5 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">{formatMonthDay(l.date, locale)}</span>
              {l.trial && <TrialTag locale={locale} />}
              {l.proctor && <ProctorTag locale={locale} />}
              <span className={held ? 'text-foreground/60' : 'text-amber-700 dark:text-amber-400'}>
                {t.lessons.status[l.status] ?? l.status}
              </span>
              {held && l.duration_min && (
                <span className="text-foreground/50">{t.minutes(l.duration_min)}</span>
              )}
              {held && l.online && <span className="rounded bg-foreground/[0.06] px-1.5 py-px text-xs text-foreground/70">{common[locale].onlineTag}</span>}
              {l.mood && MOOD_DOT[l.mood] && (
                <span className="flex items-center gap-1 text-foreground/60">
                  <span className={`size-2 rounded-full ${MOOD_DOT[l.mood]}`} />
                  {t.moods[l.mood]}
                </span>
              )}
              {held !== l.billable && (
                <span className="text-xs text-foreground/50">{l.billable ? t.billable : t.notBillable}</span>
              )}
              <details className="ml-auto text-xs text-foreground/40">
                <summary className="cursor-pointer list-none hover:text-foreground">{t.edit}</summary>
                <EditForm l={l} studentId={studentId} locale={locale} />
              </details>
              <details className="text-xs text-foreground/40">
                <summary className="cursor-pointer list-none hover:text-foreground">{t.lessons.delete}</summary>
                <form action={deleteLesson} className="mt-1">
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="studentId" value={studentId} />
                  <button type="submit" className="text-red-600 hover:underline">
                    {l.status === 'leave' ? t.lessons.undoLeave : t.lessons.confirmDelete}
                  </button>
                </form>
              </details>
            </div>

            {l.cancel_reason && <p className="text-foreground/70">{l.cancel_reason}</p>}
            {l.note && <p className="whitespace-pre-line text-foreground/70">{l.note}</p>}
            {l.parent_summary && (
              <p className="whitespace-pre-line rounded bg-amber-500/10 px-2 py-1">
                <span className="mr-2 text-xs text-amber-800 dark:text-amber-300">{t.parentVisible}</span>
                {l.parent_summary}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

const field = 'w-full rounded-md border border-foreground/20 bg-transparent px-2 py-1 text-sm text-foreground'

// Edit a recorded lesson: after marking it done, come back to add the note, mood and the line for parents
function EditForm({ l, studentId, locale }: { l: LessonRow; studentId: string; locale: Locale }) {
  const t = student[locale]
  const f = t.lessonForm
  const held = l.status === 'done'
  return (
    <form action={updateLesson} className="mt-2 w-[min(28rem,80vw)] space-y-2 rounded-md border border-foreground/10 p-3 text-sm">
      <input type="hidden" name="id" value={l.id} />
      <input type="hidden" name="studentId" value={studentId} />
      {held ? (
        <div className="flex flex-wrap items-center gap-3">
          {/* Trial lessons are a fixed 1 hour and can't be changed. The options always include the current duration, or editing
              only the note would silently change it */}
          {!l.trial && (
            <select name="duration_min" defaultValue={String(l.duration_min ?? 120)} aria-label={f.duration} className="rounded-md border border-foreground/20 bg-transparent px-2 py-1">
              {[...new Set([60, 90, 120, 150, 180, ...(l.duration_min ? [l.duration_min] : [])])]
                .sort((a, b) => a - b)
                .map((m) => (
                  <option key={m} value={m}>{t.minutes(m)}</option>
                ))}
            </select>
          )}
          <select name="mood" defaultValue={String(l.mood ?? '')} aria-label={f.mood} className="rounded-md border border-foreground/20 bg-transparent px-2 py-1">
            <option value="">{t.lessons.moodNone}</option>
            {[1, 2, 3].map((m) => (
              <option key={m} value={m}>{t.moods[m]}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-foreground">
            <input type="checkbox" name="billable" defaultChecked={l.billable} />
            {t.billable}
          </label>
          {!l.trial && !l.proctor && (
            <label className="flex items-center gap-1.5 text-foreground">
              <input type="checkbox" name="online" defaultChecked={l.online} />
              {common[locale].onlineTag}
            </label>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <input name="cancel_reason" defaultValue={l.cancel_reason ?? ''} placeholder={t.lessons.reason} aria-label={t.lessons.reason} className={field} />
          {/* Leave isn't billable; older records marked cancelled + billable stay billable when edited */}
          {l.billable && <input type="hidden" name="billable" value="on" />}
        </div>
      )}
      <label className="block space-y-1">
        <span className="text-foreground">{t.internalNote} <span className="text-xs text-foreground/50">{t.onlyYou}</span></span>
        <textarea name="note" rows={2} defaultValue={l.note ?? ''} className={field} />
      </label>
      {held && (
        <label className="block space-y-1 rounded-md bg-amber-500/10 p-2">
          <span className="text-foreground">
            {t.parentSummary}
            <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-800 dark:text-amber-300">{t.parentVisible}</span>
          </span>
          <textarea name="parent_summary" rows={2} defaultValue={l.parent_summary ?? ''} className={`${field} bg-background`} />
          <span className="block text-xs text-foreground/60">{t.parentSummaryRule}</span>
        </label>
      )}
      <SubmitButton small pendingText={t.saving}>{common[locale].save}</SubmitButton>
    </form>
  )
}
