import Link from 'next/link'
import type { Progress } from '@/lib/progress'
import type { PrepNote } from '@/lib/lessons'
import { formatHours, formatMonthDay } from '@/lib/format'
import { formatDuration, type Occurrence } from '@/lib/schedule'
import { RiskStripe, statusLabel, StateText } from '@/components/progress-summary'
import { BaselineTimeline } from '@/components/baseline-timeline'
import { OccurrenceActions } from '@/components/occurrence-actions'
import { MovedNote } from '@/components/move-lesson'
import { SubmitButton } from '@/components/submit-button'
import { KindField, TimeFields } from '@/components/time-fields'
import { ScheduleError } from '@/components/schedule-error'
import { ProctorTag, TrialTag } from '@/components/trial-tag'
import type { Locale } from '@/lib/i18n/locale'
import { common } from '@/lib/i18n/messages/common'
import { dashboard } from '@/lib/i18n/messages/dashboard'
import { addExtraLesson } from '../schedule-actions'
import { acceptRequest, declineRequest, dismissRequest } from '../booking-actions'
import { ScheduleBoard, type WeeklyRow } from './schedule-board'
import { StudentList } from './student-list'

// The dashboard's view: page.tsx loads and computes the data and passes it in; nothing here touches the database
// (so it can also be previewed locally with sample data)

export type DashboardRow = {
  id: string
  name: string
  status: string
  start_date: string | null
  end_date: string | null
  end_label: string | null
  risk_level: string | null
  risk_note: string | null
  progress: Progress
  next: { title: string; due_date: string | null; date_tbd: boolean } | null
  daysLeft: number | null
  hoursLeft: number | null
  missed: number
  timeline: { title: string; dueDate: string; done: boolean }[]
}

type Totals = { minutes: number; fee: number; lessons: number }
export type PendingRequest = {
  id: string
  studentId: string
  kind: 'add' | 'leave'
  date: string
  start: string
  end: string
  message: string | null
}

type CheckpointTodo = { id: string; title: string; due_date: string; studentId: string; overdue: boolean }

const card = 'rounded-xl border border-foreground/10'
const input = 'rounded-md border border-foreground/20 bg-transparent px-2 py-1 text-sm'

export function DashboardView({
  today,
  week,
  weekStart,
  scheduleError,
  bookingError,
  errorAt,
  requests,
  blockedWeekly,
  blockedDated,
  bookingOpen,
  editingBlocked,
  todays,
  tomorrows,
  notLogged,
  prep,
  checkpointTodos,
  weekOcc,
  rows,
  archived,
  studentOptions,
  monthTotals,
  allTotals,
  nameOf,
  labelOf,
  locale,
}: {
  today: string
  week: string | null
  weekStart: string
  scheduleError?: string
  bookingError?: string
  errorAt?: string
  requests: PendingRequest[]
  blockedWeekly: WeeklyRow[] // unavailable times marked weekly (with validity)
  blockedDated: string[] // one day only (this week): 'YYYY-MM-DD HH:MM'
  bookingOpen: boolean // whether the parent page accepts extra-lesson requests
  editingBlocked: boolean // timetable is in "Set bookable times" edit mode (after saving / changing week while editing)
  todays: Occurrence[]
  tomorrows: Occurrence[]
  notLogged: Occurrence[]
  prep: Record<string, PrepNote> // keyed by Occurrence.key
  checkpointTodos: CheckpointTodo[]
  weekOcc: Occurrence[]
  rows: DashboardRow[]
  archived: { id: string; name: string }[]
  studentOptions: { id: string; name: string }[]
  monthTotals: Totals
  allTotals: Totals
  nameOf: (id: string) => string
  labelOf: (id: string) => string
  locale: Locale
}) {
  const t = dashboard[locale]
  const behindCount = rows.filter((r) => r.progress.state === 'behind').length
  const todoCount = notLogged.length + tomorrows.length + checkpointTodos.length
  // a problem handling a parent request (?bookingError=…), shown under the alerts
  const requestError =
    bookingError && Object.hasOwn(t.bookingErrors, bookingError) ? t.bookingErrors[bookingError](errorAt ?? '') : null
  const nextToday = todays.find((o) => o.status === 'scheduled')

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-foreground/50">{common[locale].today}</p>
          <h1 className="text-2xl font-semibold">{formatMonthDay(today, locale)}</h1>
        </div>
        <p className="text-sm text-foreground/60">
          {behindCount > 0 ? <span className="text-red-600">{t.behind(behindCount)}</span> : t.noneBehind}
        </p>
      </header>

      {(requests.length > 0 || requestError) && <Reminders items={requests} nameOf={nameOf} error={requestError} locale={locale} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label={t.tiles.today}
          value={t.tiles.lessons(todays.length)}
          note={
            nextToday
              ? t.tiles.next(nextToday.start ?? '', nameOf(nextToday.studentId))
              : todays.length > 0
                ? t.tiles.allLogged
                : t.tiles.noLessons
          }
        />
        <Tile
          label={t.tiles.todo}
          value={String(todoCount)}
          note={notLogged.length > 0 ? t.tiles.unlogged(notLogged.length) : t.tiles.lessonsLogged}
          alert={notLogged.length > 0}
        />
        <Tile
          label={t.tiles.month(Number(today.slice(5, 7)))}
          value={`¥${monthTotals.fee.toLocaleString('ja-JP')}`}
          note={t.tiles.lessonsDuration(monthTotals.lessons, formatDuration(monthTotals.minutes))}
          href="/income"
        />
        <Tile
          label={t.tiles.allTime}
          value={`¥${allTotals.fee.toLocaleString('ja-JP')}`}
          note={t.tiles.lessonsDuration(allTotals.lessons, formatDuration(allTotals.minutes))}
          href="/income"
        />
      </div>

      <Section title={t.todayTitle}>
        {todays.length === 0 ? (
          <p className="text-sm text-foreground/50">{t.noLessonsToday}</p>
        ) : (
          <LessonRows items={todays} nameOf={nameOf} showDate={false} prep={prep} locale={locale} />
        )}
      </Section>

      {todoCount > 0 && (
        <Section title={t.todoTitle(todoCount)}>
          <div className="space-y-4">
            {notLogged.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-red-600">{t.notLogged}</p>
                <LessonRows items={notLogged} nameOf={nameOf} showDate locale={locale} />
              </div>
            )}
            {tomorrows.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-foreground/50">{t.tomorrow}</p>
                <ul className={`${card} divide-y divide-foreground/10 text-sm`}>
                  {tomorrows.map((o) => (
                    <li key={o.key} className="space-y-1 px-4 py-2.5">
                      <Link href={`/students/${o.studentId}`} className="hover:underline">
                        <span className="tabular-nums text-foreground/60">
                          {o.start}–{o.end}
                        </span>
                        <span className="ml-2">{nameOf(o.studentId)}</span>
                        {o.trial && <TrialTag locale={locale} className="ml-1.5" />}
                        {o.proctor && <ProctorTag locale={locale} className="ml-1.5" />}
                      </Link>
                      {prep[o.key] && <PrepLine p={prep[o.key]} locale={locale} />}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {checkpointTodos.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-foreground/50">{t.checkpointsDue}</p>
                <ul className={`${card} divide-y divide-foreground/10 text-sm`}>
                  {checkpointTodos.map((c) => (
                    <li key={c.id} className="flex flex-wrap gap-x-2 px-4 py-2.5">
                      <span className={`tabular-nums ${c.overdue ? 'text-red-600' : 'text-foreground/60'}`}>
                        {formatMonthDay(c.due_date, locale)}
                        {c.overdue && t.overdue}
                      </span>
                      <Link href={`/students/${c.studentId}`} className="hover:underline">
                        {nameOf(c.studentId)} · {c.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      <section className="space-y-3">
        {/* The heading, "Sort", "Add student" and the card order live in StudentList (sorting is drag-and-drop in the browser) */}
        <StudentList
          students={rows.map((s) => ({ id: s.id, name: s.name }))}
          cards={rows.map((s) => (
            <StudentCard key={s.id} s={s} today={today} locale={locale} />
          ))}
        />
        {archived.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-foreground/50">{t.archived(archived.length)}</summary>
            <ul className="mt-2 space-y-1">
              {archived.map((s) => (
                <li key={s.id}>
                  <Link href={`/students/${s.id}`} className="text-foreground/60 hover:underline">
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <Section id="schedule" title={t.scheduleTitle}>
        <ScheduleBoard
          key={`${weekStart} ${JSON.stringify(blockedWeekly)} ${blockedDated.join()}`}
          weekStart={weekStart}
          week={week}
          today={today}
          occurrences={weekOcc}
          labels={Object.fromEntries(weekOcc.map((o) => [o.studentId, labelOf(o.studentId)]))}
          weeklyRows={blockedWeekly}
          dated={blockedDated}
          bookingOpen={bookingOpen}
          defaultEditing={editingBlocked}
        />
        <ScheduleError locale={locale} code={scheduleError} at={errorAt} />
        <details className="rounded-xl border border-dashed border-foreground/25 text-sm">
          <summary className="cursor-pointer px-4 py-2.5">{t.addExtra}</summary>
          <form action={addExtraLesson} className="flex flex-wrap items-center gap-2 border-t border-foreground/10 px-4 py-3">
            <input type="hidden" name="back" value={week ? `/dashboard?week=${week}` : '/dashboard'} />
            <select name="studentId" required aria-label={t.student} className={input}>
              {studentOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input type="date" name="date" required defaultValue={today} aria-label={t.date} className={input} />
            <TimeFields locale={locale} />
            <KindField locale={locale} />
            <SubmitButton small pendingText="…">
              {t.addExtraButton}
            </SubmitButton>
          </form>
        </details>
      </Section>
    </div>
  )
}

// Student card: name and status, countdown, baseline timeline, expected vs actual progress, next checkpoint
function StudentCard({ s, today, locale }: { s: DashboardRow; today: string; locale: Locale }) {
  const t = dashboard[locale].card
  return (
    <Link
      href={`/students/${s.id}`}
      className={`${card} relative block space-y-3 overflow-hidden p-4 transition-colors hover:bg-foreground/[0.03]`}
    >
      <RiskStripe level={s.risk_level} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">
          {s.name}
          <span className="ml-2 text-xs font-normal text-foreground/50">{statusLabel(s.status, locale) ?? s.status}</span>
        </span>
        <span className="text-xs text-foreground/60 tabular-nums">
          {s.daysLeft !== null && (s.daysLeft >= 0 ? `D-${s.daysLeft}` : t.pastEnd)}
          {s.daysLeft !== null && s.end_label && ' · '}
          {s.end_label}
        </span>
      </div>

      <BaselineTimeline
        locale={locale}
        checkpoints={s.timeline}
        startDate={s.start_date}
        endDate={s.end_date}
        endLabel={s.end_label}
        today={today}
        markOverdue
        compact
      />

      <div className="flex justify-between gap-x-3 text-sm">
        <span className="min-w-0">
          <StateText locale={locale} progress={s.progress} />
        </span>
        {s.hoursLeft !== null && <span className="shrink-0 text-foreground/60">{t.hoursLeft(formatHours(s.hoursLeft))}</span>}
      </div>
      {s.missed >= 2 && <p className="text-xs text-red-600">{t.missed(s.missed)}</p>}

      {s.next && (
        <p className="text-sm">
          <span className="text-foreground/50">{t.next}</span>
          {s.next.title}
          {s.next.due_date && (
            <span className={s.next.due_date < today ? 'text-red-600' : 'text-foreground/60'}>
              {' · '}
              {formatMonthDay(s.next.due_date, locale)}
              {s.next.date_tbd && t.dateTbd}
            </span>
          )}
        </p>
      )}

      {s.risk_note && <p className="line-clamp-2 text-xs text-foreground/60">{s.risk_note}</p>}
    </Link>
  )
}

// href: the whole tile is a link (the two amount tiles → the income page, by month)
function Tile({
  label,
  value,
  note,
  alert = false,
  href,
}: {
  label: string
  value: string
  note: string
  alert?: boolean
  href?: string
}) {
  const body = (
    <>
      <p className="flex justify-between gap-2 text-xs text-foreground/60">
        {label}
        {href && <span aria-hidden className="text-foreground/40">›</span>}
      </p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className={`flex items-center gap-1.5 text-xs ${alert ? 'text-red-600' : 'text-foreground/50'}`}>
        {alert && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-red-500" />}
        <span className="truncate">{note}</span>
      </p>
    </>
  )
  return href ? (
    <Link href={href} className={`${card} block space-y-1 p-4 transition-colors hover:bg-foreground/[0.03]`}>
      {body}
    </Link>
  ) : (
    <div className={`${card} space-y-1 p-4`}>{body}</div>
  )
}

function Section({
  id,
  title,
  action,
  children,
}: {
  id?: string
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-foreground/60">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

// One row per lesson: time, student, actions (done / leave, or the recorded status + undo), with any prep note on the line below
function LessonRows({
  items,
  nameOf,
  showDate,
  prep = {},
  locale,
}: {
  items: Occurrence[]
  nameOf: (id: string) => string
  showDate: boolean
  prep?: Record<string, PrepNote>
  locale: Locale
}) {
  return (
    <ul className={`${card} divide-y divide-foreground/10`}>
      {items.map((o) => (
        <li key={o.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
          <Link href={`/students/${o.studentId}`} className="hover:underline">
            {showDate && <span className="mr-2 text-foreground/60">{formatMonthDay(o.date, locale)}</span>}
            <span className="tabular-nums text-foreground/60">{o.start && o.end ? `${o.start}–${o.end}` : dashboard[locale].noTime}</span>
            <span className="ml-2">{nameOf(o.studentId)}</span>
            {o.trial && <TrialTag locale={locale} className="ml-1.5" />}
            {o.proctor && <ProctorTag locale={locale} className="ml-1.5" />}
            <MovedNote locale={locale} o={o} className="ml-2" />
          </Link>
          <OccurrenceActions locale={locale} o={o} />
          {prep[o.key] && <PrepLine p={prep[o.key]} locale={locale} />}
        </li>
      ))}
    </ul>
  )
}

// Prep note: the "next time" part of the last note is shown directly; the full note expands on click
function PrepLine({ p, locale }: { p: PrepNote; locale: Locale }) {
  const t = dashboard[locale].prep
  return (
    <details className="w-full text-xs text-foreground/60">
      <summary className="cursor-pointer wrap-anywhere">
        {p.next ? (
          <>
            {t.next(formatMonthDay(p.date))}
            <span className="text-foreground">{p.next}</span>
          </>
        ) : (
          t.note(formatMonthDay(p.date))
        )}
      </summary>
      <p className="mt-1.5 rounded-md bg-foreground/[0.04] px-3 py-2 whitespace-pre-line wrap-anywhere text-foreground/70">{p.note}</p>
    </details>
  )
}

// Alerts from parents (top of the dashboard):
//   Extra lesson → "Accept" adds it to the timetable (like "Add a lesson": skipped if the time is taken, naming the clash);
//                  "Decline" dismisses it and the parent page shows it couldn't be scheduled
//   Leave → already in effect (removed from the timetable); "Got it" dismisses it
function Reminders({
  items,
  nameOf,
  error,
  locale,
}: {
  items: PendingRequest[]
  nameOf: (id: string) => string
  error: string | null
  locale: Locale
}) {
  const t = dashboard[locale].reminders
  return (
    <section id="requests" className="scroll-mt-4 space-y-2" aria-label={t.label}>
      {items.map((r) => (
        <div
          key={r.id}
          className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-l-4 border-foreground/10 px-4 py-3 text-sm ${
            r.kind === 'add' ? 'border-l-[var(--viz-bar)]' : 'border-l-amber-500'
          }`}
        >
          <div className="min-w-0 space-y-0.5">
            <p>
              <Link href={`/students/${r.studentId}`} className="font-medium hover:underline">
                {nameOf(r.studentId)}
              </Link>
              <span className="ml-1.5 text-foreground/70">{r.kind === 'add' ? t.add : t.leave}</span>
            </p>
            <p className="tabular-nums text-foreground/60">
              {formatMonthDay(r.date, locale)} {r.start}–{r.end}
              {r.kind === 'leave' && <span className="ml-1.5 text-xs">{t.removed}</span>}
            </p>
            {r.message && <p className="text-xs whitespace-pre-line wrap-anywhere text-foreground/70">{t.message(r.message)}</p>}
          </div>
          <div className="flex shrink-0 gap-2">
            {r.kind === 'add' ? (
              <>
                <form action={acceptRequest}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton small pendingText="…">
                    {t.accept}
                  </SubmitButton>
                </form>
                <form action={declineRequest}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton small secondary pendingText="…">
                    {t.decline}
                  </SubmitButton>
                </form>
              </>
            ) : (
              <form action={dismissRequest}>
                <input type="hidden" name="id" value={r.id} />
                <SubmitButton small secondary pendingText="…">
                  {t.dismiss}
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
      ))}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </section>
  )
}

