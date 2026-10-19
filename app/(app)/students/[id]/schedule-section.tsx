import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { addDays } from '@/lib/analytics'
import { formatMonthDay, weekdayName } from '@/lib/format'
import {
  expandOccurrences,
  formatDuration,
  hhmm,
  monthRange,
  totals,
  unlogged,
} from '@/lib/schedule'
import { loadBillingLessons, loadScheduleWindow } from '@/lib/schedule-data'
import { WeekGrid } from '@/components/week-grid'
import { OccurrenceActions } from '@/components/occurrence-actions'
import { MovedNote } from '@/components/move-lesson'
import { SubmitButton } from '@/components/submit-button'
import { KindField, TimeFields } from '@/components/time-fields'
import { ScheduleError } from '@/components/schedule-error'
import { addExtraLesson, addRule, deleteRule, stopRule } from '../../schedule-actions'
import { ProctorTag, TrialTag } from '@/components/trial-tag'
import type { Locale } from '@/lib/i18n/locale'
import { getTeacherLocale } from '@/lib/i18n/server'
import { schedule } from '@/lib/i18n/messages/schedule'
import { student } from '@/lib/i18n/messages/student'

const input = 'rounded-md border border-foreground/20 bg-transparent px-2 py-1 text-sm'

// The Schedule section on the student page: this month / total, the tuition statement, weekly times, upcoming lessons,
// and a weekly timetable that highlights only this student
export async function ScheduleSection({
  studentId,
  rate,
  today,
  weekStart,
  error,
  errorAt,
}: {
  studentId: string
  rate: number | null
  today: string
  weekStart: string
  error?: string
  errorAt?: string
}) {
  const supabase = await createClient()
  const locale = await getTeacherLocale()
  const t = student[locale].schedule
  const soon = addDays(today, 14)
  const [rulesRes, studentsRes, mine, week, billing] = await Promise.all([
    supabase
      .from('schedules')
      .select('id, weekday, start_time, end_time, starts_on, ends_on, proctor')
      .eq('student_id', studentId)
      .or(`ends_on.is.null,ends_on.gte.${today}`)
      .order('weekday'),
    supabase.from('students').select('id, name, display_name'),
    loadScheduleWindow(addDays(today, -14), soon, studentId),
    loadScheduleWindow(weekStart, addDays(weekStart, 6)),
    loadBillingLessons(studentId),
  ])
  if (rulesRes.error) throw rulesRes.error
  if (studentsRes.error) throw studentsRes.error

  const labels = new Map(studentsRes.data.map((s) => [s.id, s.display_name ?? s.name]))
  const mineOcc = expandOccurrences(mine.rules, mine.lessons, addDays(today, -14), soon)
  const notLogged = unlogged(mineOcc, today)
  const upcoming = mineOcc.filter((o) => o.date >= today && o.date <= soon && o.status !== 'leave')
  const weekOcc = expandOccurrences(week.rules, week.lessons, weekStart, addDays(weekStart, 6))

  const thisMonth = today.slice(0, 7)
  const lastMonth = addDays(`${thisMonth}-01`, -1).slice(0, 7)
  const monthT = totals(billing, () => rate, monthRange(thisMonth))
  const allT = totals(billing, () => rate)

  return (
    <section id="schedule" className="space-y-4">
      <h2 className="text-sm font-medium text-foreground/60">{t.title}</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label={t.month(Number(thisMonth.slice(5)))} value={formatDuration(monthT.minutes)} note={t.tileNote(monthT.lessons, `¥${monthT.fee.toLocaleString('ja-JP')}`)} />
        <Tile label={t.sinceStart} value={formatDuration(allT.minutes)} note={t.tileNote(allT.lessons, `¥${allT.fee.toLocaleString('ja-JP')}`)} />
        <div className="col-span-2 flex flex-col justify-center gap-1 rounded-xl border border-foreground/10 px-4 py-3 text-sm sm:col-span-1">
          <span className="text-xs text-foreground/60">{t.statement}</span>
          <Link href={`/students/${studentId}/statement?month=${thisMonth}`} className="underline">
            {t.month(Number(thisMonth.slice(5)))}
          </Link>
          <Link href={`/students/${studentId}/statement?month=${lastMonth}`} className="text-foreground/60 underline">
            {t.month(Number(lastMonth.slice(5)))}
          </Link>
        </div>
      </div>
      {rate === null && (
        <p className="text-xs text-amber-700 dark:text-amber-400">{t.noRate}</p>
      )}

      <div className="space-y-2">
        <p className="text-xs text-foreground/50">{t.weekly}</p>
        {rulesRes.data.length === 0 ? (
          <p className="text-sm text-foreground/50">{t.notSet}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {rulesRes.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  {t.everyWeekday(weekdayName(r.weekday, locale))} {hhmm(r.start_time)}–{hhmm(r.end_time)}
                  {r.proctor && <ProctorTag locale={locale} className="ml-1.5" />}
                </span>
                <span className="text-xs text-foreground/50">
                  {r.starts_on > today ? t.startsOn(formatMonthDay(r.starts_on)) : t.effectiveFrom(formatMonthDay(r.starts_on))}
                  {r.ends_on && t.until(formatMonthDay(r.ends_on))}
                </span>
                <details className="text-xs text-foreground/40">
                  <summary className="cursor-pointer list-none hover:text-foreground">{t.stop}</summary>
                  <div className="mt-1 flex flex-wrap gap-3">
                    <form action={stopRule}>
                      <input type="hidden" name="ruleId" value={r.id} />
                      <button type="submit" className="text-red-600 hover:underline">{t.stopFromTomorrow}</button>
                    </form>
                    <form action={deleteRule}>
                      <input type="hidden" name="ruleId" value={r.id} />
                      <button type="submit" className="text-foreground/60 hover:underline">{t.deleteMistake}</button>
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        <ScheduleError locale={locale} code={error} at={errorAt} only="rule" />
        <details className="rounded-xl border border-dashed border-foreground/25 text-sm">
          <summary className="cursor-pointer px-3 py-2">{t.addRule}</summary>
          <form action={addRule} className="flex flex-wrap items-center gap-2 border-t border-foreground/10 px-3 py-3">
            <input type="hidden" name="studentId" value={studentId} />
            <input type="hidden" name="back" value={`/students/${studentId}?week=${weekStart}`} />
            <select name="weekday" defaultValue="2" aria-label={t.weekday} className={input}>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <option key={i} value={i}>{t.everyWeekday(weekdayName(i, locale))}</option>
              ))}
            </select>
            <TimeFields locale={locale} />
            <KindField locale={locale} />
            <label className="flex items-center gap-1 text-xs text-foreground/60">
              {t.fromPrefix}
              <input type="date" name="starts_on" defaultValue={today} className={input} />
              {t.fromSuffix}
            </label>
            <SubmitButton small pendingText="…">{student[locale].add}</SubmitButton>
          </form>
        </details>
      </div>

      {notLogged.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-red-600">{t.notLogged}</p>
          <Rows items={notLogged} locale={locale} />
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs text-foreground/50">{t.nextTwoWeeks}</p>
        {upcoming.length === 0 ? (
          <p className="text-sm text-foreground/50">{t.noneScheduled}</p>
        ) : (
          <Rows items={upcoming} locale={locale} />
        )}
        <ScheduleError locale={locale} code={error} at={errorAt} only="extra" />
        <details className="rounded-xl border border-dashed border-foreground/25 text-sm">
          <summary className="cursor-pointer px-3 py-2">{t.addExtra}</summary>
          <form action={addExtraLesson} className="flex flex-wrap items-center gap-2 border-t border-foreground/10 px-3 py-3">
            <input type="hidden" name="studentId" value={studentId} />
            <input type="hidden" name="back" value={`/students/${studentId}?week=${weekStart}`} />
            <input type="date" name="date" required defaultValue={today} aria-label={schedule[locale].move.date} className={input} />
            <TimeFields locale={locale} />
            <KindField locale={locale} />
            <SubmitButton small pendingText="…">{t.addLesson}</SubmitButton>
          </form>
        </details>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-foreground/50">{t.thisWeek}</p>
        <WeekGrid
          locale={locale}
          weekStart={weekStart}
          occurrences={weekOcc}
          labelOf={(id) => labels.get(id) ?? '?'}
          today={today}
          highlight={studentId}
          navHref={(w) => (w ? `/students/${studentId}?week=${w}` : `/students/${studentId}`)}
        />
      </div>
    </section>
  )
}

function Rows({ items, locale }: { items: ReturnType<typeof expandOccurrences>; locale: Locale }) {
  return (
    <ul className="divide-y divide-foreground/10 rounded-xl border border-foreground/10">
      {items.map((o) => (
        <li key={o.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
          <span>
            {formatMonthDay(o.date, locale)}
            <span className="ml-2 tabular-nums text-foreground/60">{o.start && o.end ? `${o.start}–${o.end}` : student[locale].schedule.noTime}</span>
            {o.trial && <TrialTag locale={locale} className="ml-1.5" />}
            {o.proctor && <ProctorTag locale={locale} className="ml-1.5" />}
            <MovedNote locale={locale} o={o} className="ml-2" />
          </span>
          <OccurrenceActions locale={locale} o={o} />
        </li>
      ))}
    </ul>
  )
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="space-y-0.5 rounded-xl border border-foreground/10 px-4 py-3">
      <p className="text-xs text-foreground/60">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-xs text-foreground/50">{note}</p>
    </div>
  )
}

