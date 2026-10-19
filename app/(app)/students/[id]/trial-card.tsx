import { createClient } from '@/lib/supabase/server'
import { formatMonthDay } from '@/lib/format'
import { TRIAL, hhmm, type Occurrence } from '@/lib/schedule'
import { OccurrenceActions } from '@/components/occurrence-actions'
import { ScheduleError } from '@/components/schedule-error'
import { SubmitButton } from '@/components/submit-button'
import { setTrial } from '../../schedule-actions'
import { getTeacherLocale } from '@/lib/i18n/server'
import { schedule } from '@/lib/i18n/messages/schedule'
import { student } from '@/lib/i18n/messages/student'

const input = 'rounded-md border border-foreground/20 bg-transparent px-2 py-1 text-sm'

// The trial lesson at the top of the student page (one per student, a fixed 1 hour at ¥1,000):
// - no trial lesson and no lessons yet → a reminder with date and start-time fields
// - scheduled but not logged → shows the time + done / leave; the time can be changed
// - on leave → book a new time
// - done, or no trial lesson but regular lessons already under way → not shown
export async function TrialCard({
  studentId,
  today,
  weekStart,
  error,
  errorAt,
}: {
  studentId: string
  today: string
  weekStart: string
  error?: string
  errorAt?: string
}) {
  const supabase = await createClient()
  const locale = await getTeacherLocale()
  const t = student[locale].trial
  const [trialRes, heldRes] = await Promise.all([
    supabase.from('lessons').select('id, date, status, start_time, end_time').eq('student_id', studentId).eq('trial', true).maybeSingle(),
    supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('student_id', studentId).eq('status', 'done'),
  ])
  if (trialRes.error) throw trialRes.error
  if (heldRes.error) throw heldRes.error
  const trial = trialRes.data
  if (trial?.status === 'done' || (!trial && (heldRes.count ?? 0) > 0)) return null

  const start = hhmm(trial?.start_time ?? null)
  const end = hhmm(trial?.end_time ?? null)
  const when = trial ? `${formatMonthDay(trial.date, locale)} ${start ?? ''}–${end ?? ''}` : null
  const occurrence: Occurrence | null =
    trial?.status === 'scheduled'
      ? { key: `L:${trial.id}`, studentId, date: trial.date, start, end, status: 'scheduled', lessonId: trial.id, scheduleId: null, trial: true }
      : null

  const form = (label: string) => (
    <form action={setTrial} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="form" value="trial" />
      <input type="hidden" name="back" value={`/students/${studentId}?week=${weekStart}`} />
      <input type="date" name="date" required defaultValue={trial?.date ?? today} aria-label={t.date} className={input} />
      <input type="time" name="start" required defaultValue={start ?? ''} aria-label={t.start} className={input} />
      <span className="text-xs text-foreground/60">{schedule[locale].move.oneHour}</span>
      <SubmitButton small pendingText="…">{label}</SubmitButton>
    </form>
  )

  return (
    <section id="trial" className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] px-4 py-3 text-sm">
      {!trial && (
        <>
          <p>
            <span className="font-medium">{t.none}</span>
            <span className="text-foreground/60">
              {t.noneNote(TRIAL.minutes / 60, `¥${((TRIAL.ratePerHour * TRIAL.minutes) / 60).toLocaleString('ja-JP')}`)}
            </span>
          </p>
          {form(t.book)}
        </>
      )}
      {occurrence && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              <span className="font-medium">{t.lesson}</span>
              <span className="ml-2 tabular-nums">{when}</span>
              {trial!.date < today && <span className="ml-2 text-red-600">{t.notLogged}</span>}
            </p>
            <OccurrenceActions locale={locale} o={occurrence} move={false} />
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-foreground/60">{schedule[locale].move.button}</summary>
            <div className="pt-2">{form(t.change)}</div>
          </details>
        </>
      )}
      {trial?.status === 'leave' && (
        <>
          <p>
            <span className="font-medium">{t.onLeave}</span>
            <span className="ml-2 text-foreground/60">{t.onLeaveNote(when ?? '')}</span>
          </p>
          {form(t.rebook)}
        </>
      )}
      <ScheduleError locale={locale} code={error} at={errorAt} only="trial" />
    </section>
  )
}
