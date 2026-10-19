import { createClient } from '@/lib/supabase/server'
import { byBaselineOrder, computeProgress, daysBetween, toTokyoDate, type Progress } from '@/lib/progress'
import { addDays } from '@/lib/analytics'
import { missedStreak, prepNote, type PrepNote } from '@/lib/lessons'
import { expandOccurrences, hhmm, mondayOf, monthRange, scheduledMinutes, totals, unlogged } from '@/lib/schedule'
import { loadBillingLessons, loadScheduleWindow } from '@/lib/schedule-data'
import { getTeacherLocale } from '@/lib/i18n/server'
import { DashboardView } from './dashboard-view'

const STATUS_ORDER: Record<string, number> = { at_risk: 0, active: 1, ending: 2, cold: 3 }
// How far ahead "hours left" looks (end dates further out are only counted up to here)
const AHEAD_DAYS = 730
const DATE = /^\d{4}-\d{2}-\d{2}$/

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; scheduleError?: string; bookingError?: string; at?: string; edit?: string }>
}) {
  const { week, scheduleError, bookingError, at, edit } = await searchParams
  const today = toTokyoDate(new Date())
  const tomorrow = addDays(today, 1)
  const weekStart = mondayOf(week && DATE.test(week) ? week : today)
  // Fetch everything in one go: the timetable week + the last 14 days (to find unlogged lessons) + tomorrow
  const from = [weekStart, addDays(today, -14)].sort()[0]
  const to = [addDays(weekStart, 6), tomorrow].sort()[1]

  const supabase = await createClient()
  const [studentsRes, lessonsRes, window, ahead, billing, requestsRes, blockedRes, profileRes] = await Promise.all([
    supabase
      .from('students')
      .select(
        'id, name, display_name, status, start_date, end_date, end_label, hours_per_week, rate_per_hour, risk_level, risk_note, sort_order, checkpoints(id, seq, due_date, title, done_at, date_tbd)'
      ),
    // For the missed-lessons streak and prep notes (the last note). Only a few lessons a week, so the whole table by date descending is fine
    supabase
      .from('lessons')
      .select('student_id, date, status, note')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    loadScheduleWindow(from, to),
    // "hours left": lessons scheduled from today (weekly + extra lessons, leave excluded)
    loadScheduleWindow(today, addDays(today, AHEAD_DAYS)),
    loadBillingLessons(),
    // Alerts from parents: pending extra-lesson requests (past dates are dropped, as on the parent page) + leave not yet
    // acknowledged (last two weeks)
    supabase
      .from('lesson_requests')
      .select('id, student_id, kind, date, start_time, end_time, message, status')
      .or(`and(kind.eq.add,status.eq.pending,date.gte.${today}),and(kind.eq.leave,status.eq.accepted,seen_at.is.null,date.gte.${addDays(today, -14)})`)
      .order('date')
      .order('start_time'),
    // Unavailable times (for extra-lesson requests on the parent page): weekly ones (with validity: those overlapping this
    // week + all currently open ones, which are what gets edited; one starting later must be included too, or saving would
    // treat it as removed) + this week's one-day ones
    supabase
      .from('blocked_times')
      .select('weekday, date, start_time, valid_from, valid_to')
      .or(
        `and(weekday.not.is.null,valid_from.lte.${addDays(weekStart, 6)},or(valid_to.is.null,valid_to.gte.${weekStart})),and(weekday.not.is.null,valid_to.is.null),and(date.gte.${weekStart},date.lte.${addDays(weekStart, 6)})`
      ),
    supabase.from('profiles').select('booking_open').maybeSingle(),
  ])
  if (studentsRes.error) throw studentsRes.error
  if (lessonsRes.error) throw lessonsRes.error
  if (requestsRes.error) throw requestsRes.error
  if (blockedRes.error) throw blockedRes.error
  if (profileRes.error) throw profileRes.error
  const allStudents = studentsRes.data
  const students = allStudents.filter((s) => s.status !== 'archived')
  const archived = allStudents.filter((s) => s.status === 'archived')

  const byId = new Map(allStudents.map((s) => [s.id, s]))
  const labelOf = (id: string) => {
    const s = byId.get(id)
    return s ? (s.display_name ?? s.name) : '?'
  }
  const nameOf = (id: string) => byId.get(id)?.name ?? '?'
  const rateOf = (id: string) => byId.get(id)?.rate_per_hour ?? null

  const occurrences = expandOccurrences(window.rules, window.lessons, from, to)
  const todays = occurrences.filter((o) => o.date === today && o.status !== 'leave')
  const tomorrows = occurrences.filter((o) => o.date === tomorrow && o.status === 'scheduled')
  const notLogged = unlogged(occurrences, today)
  // Today's and tomorrow's upcoming lessons: attach the student's last note (for lesson prep)
  const prep: Record<string, PrepNote> = {}
  for (const o of [...todays, ...tomorrows]) {
    if (o.status !== 'scheduled') continue
    const p = prepNote(lessonsRes.data.filter((l) => l.student_id === o.studentId), o.date)
    if (p) prep[o.key] = p
  }
  const weekOcc = occurrences.filter((o) => o.date >= weekStart && o.date <= addDays(weekStart, 6))

  const month = monthRange(today.slice(0, 7))
  const monthTotals = totals(billing, rateOf, month)
  const allTotals = totals(billing, rateOf)

  const checkpointTodos = students.flatMap((s) =>
    s.checkpoints
      .filter((c) => c.done_at === null && c.due_date !== null && c.due_date <= addDays(today, 3))
      .map((c) => ({ ...c, due_date: c.due_date!, studentId: s.id, overdue: c.due_date! < today }))
  )
  checkpointTodos.sort((a, b) => (a.due_date < b.due_date ? -1 : 1))

  const rows = students
    .map((s) => {
      const progress = computeProgress(
        s.checkpoints.map((c) => ({ id: c.id, seq: c.seq, dueDate: c.due_date, title: c.title, doneAt: c.done_at })),
        today,
        s.hours_per_week
      )
      const next = s.checkpoints.find((c) => c.id === progress.nextId) ?? null
      const daysLeft = s.end_date ? daysBetween(today, s.end_date) : null
      // Hours left = the lessons scheduled between today and the end date (not "hours per week × weeks"), so it follows timetable
      // changes, leave and extra lessons. Proctoring doesn't count
      const left =
        daysLeft !== null && daysLeft > 0
          ? scheduledMinutes(
              expandOccurrences(
                ahead.rules.filter((r) => r.studentId === s.id),
                ahead.lessons.filter((l) => l.studentId === s.id),
                today,
                [s.end_date!, addDays(today, AHEAD_DAYS)].sort()[0]
              )
            )
          : 0
      const hoursLeft = left > 0 ? left / 60 : null
      const missed = missedStreak(lessonsRes.data.filter((l) => l.student_id === s.id), today)
      const timeline = s.checkpoints
        .filter((c): c is typeof c & { due_date: string } => c.due_date !== null)
        .sort((a, b) => byBaselineOrder({ dueDate: a.due_date, seq: a.seq }, { dueDate: b.due_date, seq: b.seq }))
        .map((c) => ({ title: c.title, dueDate: c.due_date, done: c.done_at !== null }))
      return { ...s, progress, next, daysLeft, hoursLeft, missed, timeline }
    })
    // The teacher's own order first (the dashboard's "Sort", sort_order); unsorted (newly added) students go last, by status and days behind
    .sort(
      (a, b) =>
        (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER) ||
        (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
        behindDays(b.progress) - behindDays(a.progress)
    )

  return (
    <DashboardView
      locale={await getTeacherLocale()}
      today={today}
      week={week && DATE.test(week) ? week : null}
      weekStart={weekStart}
      scheduleError={scheduleError}
      bookingError={bookingError}
      errorAt={at}
      requests={requestsRes.data.map((r) => ({
        id: r.id,
        studentId: r.student_id,
        kind: r.kind === 'leave' ? ('leave' as const) : ('add' as const),
        date: r.date,
        start: hhmm(r.start_time)!,
        end: hhmm(r.end_time)!,
        message: r.message,
      }))}
      blockedWeekly={blockedRes.data
        .filter((b) => b.weekday !== null)
        .map((b) => ({ weekday: b.weekday!, start: hhmm(b.start_time)!, from: b.valid_from!, to: b.valid_to }))}
      blockedDated={blockedRes.data.filter((b) => b.date !== null).map((b) => `${b.date} ${hhmm(b.start_time)}`)}
      bookingOpen={profileRes.data?.booking_open ?? false}
      editingBlocked={edit === '1'}
      todays={todays}
      tomorrows={tomorrows}
      notLogged={notLogged}
      prep={prep}
      checkpointTodos={checkpointTodos}
      weekOcc={weekOcc}
      rows={rows}
      archived={archived.map((s) => ({ id: s.id, name: s.name }))}
      studentOptions={students.map((s) => ({ id: s.id, name: s.name }))}
      monthTotals={monthTotals}
      allTotals={allTotals}
      nameOf={nameOf}
      labelOf={labelOf}
    />
  )
}

function behindDays(p: Progress) {
  return p.state === 'behind' ? p.offsetDays : 0
}
