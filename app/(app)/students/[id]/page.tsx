import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { byBaselineOrder, computeProgress, daysBetween, toTokyoDate } from '@/lib/progress'
import { formatMonthDay } from '@/lib/format'
import { CheckButton } from '@/components/check-button'
import { missedStreak } from '@/lib/lessons'
import { toggleCheckpoint } from './actions'
import { LessonForm } from './lesson-form'
import { LessonList } from './lesson-list'
import { ParentLinkSection } from './parent-link'
import { ScheduleSection } from './schedule-section'
import { TrialCard } from './trial-card'
import { StudentSummary } from './student-summary'
import { GradesSection } from './grades-section'
import { GoalSection } from './goal-section'
import { mondayOf } from '@/lib/schedule'
import type { Locale } from '@/lib/i18n/locale'
import { getTeacherLocale } from '@/lib/i18n/server'
import { student } from '@/lib/i18n/messages/student'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type CheckpointRow = {
  id: string
  seq: number
  due_date: string | null
  title: string
  criterion: string | null
  date_tbd: boolean
  done_at: string | null
  parent_visible: boolean
}

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ week?: string; gradeError?: string; goalError?: string; scheduleError?: string; at?: string; logError?: string }>
}) {
  const { id } = await params
  const { week, gradeError, goalError, scheduleError, at, logError } = await searchParams
  if (!UUID.test(id)) notFound()

  const supabase = await createClient()
  const [{ data: s, error }, { data: lessons, error: lessonsError }] = await Promise.all([
    supabase
      .from('students')
      .select(
        'id, name, status, grade, goal, start_date, end_date, end_label, hours_per_week, rate_per_hour, proctor_fee, place, risk_level, risk_note, parent_enabled, parent_token, checkpoints(id, seq, due_date, title, criterion, date_tbd, done_at, parent_visible)'
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('lessons')
      .select('id, date, status, cancel_reason, duration_min, billable, online, mood, note, parent_summary, trial, proctor')
      .eq('student_id', id)
      .neq('status', 'scheduled')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30),
  ])
  if (error) throw error
  if (lessonsError) throw lessonsError
  if (!s) notFound()

  const today = toTokyoDate(new Date())
  const locale = await getTeacherLocale()
  const t = student[locale]
  const progress = computeProgress(
    s.checkpoints.map((c) => ({
      id: c.id,
      seq: c.seq,
      dueDate: c.due_date,
      title: c.title,
      doneAt: c.done_at,
    })),
    today,
    s.hours_per_week
  )

  // same order as computeProgress, so the "should be here today" divider lands at the should position
  const dated = s.checkpoints
    .filter((c): c is CheckpointRow & { due_date: string } => c.due_date !== null)
    .sort((a, b) => byBaselineOrder({ dueDate: a.due_date, seq: a.seq }, { dueDate: b.due_date, seq: b.seq }))
  const ongoing = s.checkpoints.filter((c) => c.due_date === null).sort((a, b) => a.seq - b.seq)
  const daysLeft = s.end_date ? daysBetween(today, s.end_date) : null
  const missed = missedStreak(lessons, today)
  // lesson log: the most recent held lesson stays visible (leave doesn't count) and the rest are collapsed
  const latestHeld = lessons.find((l) => l.status === 'done')
  const otherLessons = lessons.filter((l) => l !== latestHeld)

  const facts = [
    s.grade,
    s.hours_per_week ? t.summary.hoursPerWeek(s.hours_per_week) : null,
    s.rate_per_hour ? `¥${s.rate_per_hour.toLocaleString()}/h` : null,
    s.proctor_fee ? t.summary.proctorFee(`¥${s.proctor_fee.toLocaleString()}`) : null,
    s.place,
  ].filter((f): f is string => Boolean(f))

  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-sm text-foreground/60 hover:text-foreground">
        {t.allStudents}
      </Link>

      <StudentSummary
        locale={locale}
        s={s}
        facts={facts}
        daysLeft={daysLeft}
        progress={progress}
        timeline={dated.map((c) => ({ title: c.title, dueDate: c.due_date, done: c.done_at !== null }))}
        today={today}
      />

      <TrialCard
        studentId={s.id}
        today={today}
        weekStart={mondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today)}
        error={scheduleError}
        errorAt={at}
      />

      <ScheduleSection
        studentId={s.id}
        rate={s.rate_per_hour}
        today={today}
        weekStart={mondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today)}
        error={scheduleError}
        errorAt={at}
      />

      <LessonForm studentId={s.id} today={today} error={logError} locale={locale} />

      <section>
        <h2 className="mb-2 text-sm font-medium text-foreground/60">{t.page.planAxis}</h2>
        <ol className="divide-y divide-foreground/10 rounded-xl border border-foreground/10">
          {dated.map((c, i) => (
            <CheckpointItem
              locale={locale}
              key={c.id}
              c={c}
              studentId={s.id}
              today={today}
              todayLineAbove={i === progress.should}
            />
          ))}
          {progress.should === dated.length && dated.length > 0 && <TodayLine today={today} locale={locale} />}
        </ol>
      </section>

      <GoalSection studentId={s.id} today={today} error={goalError} />

      <GradesSection studentId={s.id} today={today} error={gradeError} />

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground/60">{t.page.lessonRecords}</h2>
        {missed >= 2 && (
          <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {t.page.missedStreak(missed)}
          </p>
        )}
        {latestHeld && <LessonList lessons={[latestHeld]} studentId={s.id} locale={locale} />}
        {otherLessons.length > 0 && (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm text-foreground/60 [&::-webkit-details-marker]:hidden">
              {t.page.records(otherLessons.length, latestHeld !== undefined)}
              <span aria-hidden className="text-foreground/40 transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="pt-2">
              <LessonList lessons={otherLessons} studentId={s.id} locale={locale} />
            </div>
          </details>
        )}
        {lessons.length === 0 && <LessonList lessons={[]} studentId={s.id} locale={locale} />}
      </section>

      <ParentLinkSection
        studentId={s.id}
        enabled={s.parent_enabled}
        token={s.parent_token}
        visibleCheckpoints={s.checkpoints.filter((c) => c.parent_visible).length}
        lessonsWithSummary={lessons.filter((l) => l.status === 'done' && l.parent_summary).length}
      />

      {ongoing.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-foreground/60">{t.page.ongoing}</h2>
          <ul className="divide-y divide-foreground/10 rounded-xl border border-foreground/10">
            {ongoing.map((c) => (
              <li key={c.id} className="px-4 py-3 text-sm">
                <p>{c.title}</p>
                {c.criterion && <p className="text-xs text-foreground/50">{c.criterion}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function CheckpointItem({
  c,
  studentId,
  today,
  todayLineAbove,
  locale,
}: {
  c: CheckpointRow & { due_date: string }
  studentId: string
  today: string
  todayLineAbove: boolean
  locale: Locale
}) {
  const t = student[locale]
  const done = c.done_at !== null
  const overdue = !done && c.due_date < today

  return (
    <>
      {todayLineAbove && <TodayLine today={today} locale={locale} />}
      <li className="flex gap-3 px-4 py-3">
        <form action={toggleCheckpoint}>
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="done" value={done ? '0' : '1'} />
          <CheckButton done={done} label={done ? t.page.unmarkDone(c.title) : t.page.markDone(c.title)} />
        </form>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className={`text-sm ${done ? 'text-foreground/50 line-through' : ''}`}>{c.title}</p>
            <span className={`text-xs ${overdue ? 'text-red-600' : 'text-foreground/50'}`}>
              {formatMonthDay(c.due_date, locale)}
              {c.date_tbd && t.page.dateTbd}
            </span>
          </div>
          {c.criterion && <p className="text-xs text-foreground/50">{c.criterion}</p>}
          {c.parent_visible && (
            <span className="inline-block rounded bg-amber-500/15 px-1.5 text-xs text-amber-800 dark:text-amber-300">
              {t.parentVisible}
            </span>
          )}
          {c.done_at && (
            <p className="text-xs text-foreground/40">{t.page.doneOn(formatMonthDay(toTokyoDate(new Date(c.done_at))))}</p>
          )}
        </div>
      </li>
    </>
  )
}

// Baseline: every checkpoint above this line should be done by today
function TodayLine({ today, locale }: { today: string; locale: Locale }) {
  const t = student[locale]
  return (
    <li aria-label={t.page.todayLineLabel} className="flex items-center gap-2 px-4 py-1 text-xs text-foreground/50">
      <span className="h-px flex-1 bg-foreground/20" />
      {t.page.todayLine(formatMonthDay(today))}
      <span className="h-px flex-1 bg-foreground/20" />
    </li>
  )
}
