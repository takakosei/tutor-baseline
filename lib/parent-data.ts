import 'server-only'

import { createAdminClient } from './supabase/admin'
import { toParentStatement, toParentView, type ParentStatement, type ParentView } from './parent-view'
import { addDays } from './analytics'
import { addMinutes, expandOccurrences, hhmm, lessonsWindow, toBillingLesson, type Occurrence, type ScheduleRule, type StoredLesson } from './schedule'
import { toTokyoDate } from './progress'
import { DAYS_AHEAD, OPEN_WINDOWS, blockedBusy, busyTimes, canAdd, leaveable, usualMinutes, type Busy, type Window } from './booking'
import { isLocale, toLocale, type Locale } from './i18n/locale'

// The parent page's only data access (all reads and writes are here). Every query names its columns (never
// select *) and selects no internal field; the result is then copied through an allow-list by toParentView.
// Not found, link disabled or a malformed token all return null → the page 404s, without saying which (so it never
// reveals whether a link ever existed).
// In the database, service_role can read only the columns used here (the column-level grants in the schema). Adding
// a column or a filter means updating the grants too, or the query fails with permission denied. That is intended:
// internal columns (note, risk_note…) can't be read at all.
// There are only two writes: a parent's extra-lesson or leave request (lesson_requests); the server re-checks that
// the request is allowed before writing. Leave takes effect at once: the lesson is recorded as leave (lessons, where
// service_role can write only those few columns)

// 32 random bytes as base64url = 43 characters. A malformed token is treated as not found without querying the database
const TOKEN = /^[A-Za-z0-9_-]{43}$/
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

// Limits against link abuse: at most 3 pending extra-lesson requests, and at most 10 requests per 24 hours
const MAX_PENDING_ADDS = 3
const MAX_PER_DAY = 10

type Db = ReturnType<typeof createAdminClient>
type Student = NonNullable<Awaited<ReturnType<typeof findStudent>>>

// The student with this token, if the teacher has the parent link turned on
async function findStudent(db: Db, token: string) {
  const { data, error } = await db
    .from('students')
    .select('id, owner_id, display_name, goal, end_label, start_date, end_date, rate_per_hour, parent_locale')
    .eq('parent_token', token)
    .eq('parent_enabled', true)
    .maybeSingle()
  if (error) throw error
  return data
}

// Tuition statements for the months the teacher has published to parents. Computed the same way as the teacher's
// statement (buildStatement), reading only the columns needed for the amounts: lesson notes and parent summaries
// aren't read (and aren't granted)
async function loadStatements(
  db: Db,
  student: { id: string; rate_per_hour: number | null },
  published: { month: string; published_at: string }[]
): Promise<ParentStatement[]> {
  if (published.length === 0) return []
  const [lessons, items] = await Promise.all([
    db
      .from('lessons')
      .select('date, status, duration_min, start_time, end_time, billable, rate_per_hour, trial, online, proctor, proctor_fee')
      .eq('student_id', student.id)
      .neq('status', 'scheduled'),
    db
      .from('statement_items')
      .select('id, month, date, label, amount')
      .eq('student_id', student.id)
      .in(
        'month',
        published.map((p) => p.month)
      ),
  ])
  if (lessons.error) throw lessons.error
  if (items.error) throw items.error
  const billing = lessons.data.map((l) => toBillingLesson(l, student.id))
  return published.map((p) =>
    toParentStatement(p.month, toTokyoDate(new Date(p.published_at)), billing, student.rate_per_hour, items.data)
  )
}

// This student's parent page language (students.parent_locale), independent of the teacher's own language.
// Unset = null, and the page falls back to the browser language
function studentLocale(student: Student): Locale | null {
  return isLocale(student.parent_locale) ? student.parent_locale : null
}

// One month's tuition statement, opened from the parent page. A month not published to parents doesn't exist (404)
export async function loadParentStatement(
  token: string,
  month: string
): Promise<{ displayName: string | null; statement: ParentStatement; locale: Locale | null } | null> {
  if (!TOKEN.test(token) || !MONTH.test(month)) return null
  const db = createAdminClient()
  const student = await findStudent(db, token)
  if (!student) return null
  const { data: published, error } = await db
    .from('statement_months')
    .select('month, published_at')
    .eq('student_id', student.id)
    .eq('month', month)
    .maybeSingle()
  if (error) throw error
  if (!published) return null
  const [statement] = await loadStatements(db, student, [published])
  return { displayName: student.display_name, statement, locale: studentLocale(student) }
}

// The schedule for the two weeks from today: weekly rules and stored lessons for all of the teacher's students (times
// and status only, no notes), the teacher's unavailable cells, whether extra-lesson requests are open, and every
// student's pending extra-lesson requests. Used to draw this student's upcoming lessons and to work out which of the
// teacher's times are taken. Other students' data is only used to compute free time and never leaves this file
type Week = {
  rules: ScheduleRule[] // this student's
  lessons: StoredLesson[] // this student's
  occurrences: Occurrence[] // all students'
  windows: Window[] // open = 10:00–21:00 every day; closed = empty (the parent page hides extra-lesson requests)
  others: Busy[] // unavailable cells + every student's pending extra-lesson requests
  teacherLocale: string | null
}

async function loadWeeks(db: Db, student: Student, today: string): Promise<Week> {
  const to = addDays(today, DAYS_AHEAD)
  const { data: siblings, error } = await db.from('students').select('id').eq('owner_id', student.owner_id)
  if (error) throw error
  const ids = siblings.map((s) => s.id)
  const [rules, lessons, blocked, profile, pending] = await Promise.all([
    db
      .from('schedules')
      .select('id, student_id, weekday, start_time, end_time, starts_on, ends_on, proctor')
      .in('student_id', ids)
      .lte('starts_on', to)
      .or(`ends_on.is.null,ends_on.gte.${today}`),
    db
      .from('lessons')
      .select('id, student_id, date, status, start_time, end_time, schedule_id, proctor, moved_from')
      .in('student_id', ids)
      .or(lessonsWindow(today, to)), // include lessons moved out of the range, so the original day doesn't reappear from the rule
    db
      .from('blocked_times')
      .select('weekday, date, start_time, valid_from, valid_to')
      .eq('owner_id', student.owner_id)
      .or(`date.is.null,date.gte.${today}`),
    db.from('profiles').select('booking_open, locale').eq('id', student.owner_id).maybeSingle(),
    db
      .from('lesson_requests')
      .select('date, start_time, end_time')
      .in('student_id', ids)
      .eq('kind', 'add')
      .eq('status', 'pending')
      .gte('date', today),
  ])
  if (rules.error) throw rules.error
  if (lessons.error) throw lessons.error
  if (blocked.error) throw blocked.error
  if (profile.error) throw profile.error
  if (pending.error) throw pending.error

  const allRules: ScheduleRule[] = rules.data.map((r) => ({
    id: r.id,
    studentId: r.student_id,
    weekday: r.weekday,
    start: hhmm(r.start_time)!,
    end: hhmm(r.end_time)!,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    proctor: r.proctor,
  }))
  const allLessons: StoredLesson[] = lessons.data.map((l) => ({
    id: l.id,
    studentId: l.student_id,
    date: l.date,
    status: l.status,
    start: hhmm(l.start_time),
    end: hhmm(l.end_time),
    scheduleId: l.schedule_id,
    proctor: l.proctor,
    movedFrom: l.moved_from,
  }))
  return {
    rules: allRules.filter((r) => r.studentId === student.id),
    lessons: allLessons.filter((l) => l.studentId === student.id),
    occurrences: expandOccurrences(allRules, allLessons, today, to),
    windows: profile.data?.booking_open ? OPEN_WINDOWS : [],
    teacherLocale: profile.data?.locale ?? null,
    others: [
      ...blockedBusy(
        blocked.data.map((b) => ({
          weekday: b.weekday,
          date: b.date,
          start: hhmm(b.start_time)!,
          validFrom: b.valid_from,
          validTo: b.valid_to,
        })),
        today,
        to
      ),
      ...pending.data.map((p) => ({ date: p.date, start: hhmm(p.start_time)!, end: hhmm(p.end_time)! })),
    ],
  }
}

// The parent page's data + this student's parent page language (unset = null)
export async function loadParentView(token: string, today: string): Promise<{ view: ParentView; locale: Locale | null } | null> {
  if (!TOKEN.test(token)) return null

  const db = createAdminClient()
  const student = await findStudent(db, token)
  if (!student) return null

  const [checkpoints, lessons, week, metrics, published, requests] = await Promise.all([
    db
      .from('checkpoints')
      .select('id, seq, due_date, title, criterion, done_at, parent_visible')
      .eq('student_id', student.id)
      .eq('parent_visible', true),
    db
      .from('lessons')
      .select('date, status, parent_summary, trial, proctor')
      .eq('student_id', student.id)
      .eq('status', 'done')
      .not('parent_summary', 'is', null)
      .order('date', { ascending: false })
      .limit(20),
    // upcoming lessons and bookable times
    loadWeeks(db, student, today),
    // Grades: only metrics the teacher made visible to parents. service_role can read only these columns of the two
    // tables, so metric_records.note is unreadable
    db
      .from('metrics')
      .select('id, name, unit, direction, max_value, parent_visible, parent_id')
      .eq('student_id', student.id)
      .eq('parent_visible', true),
    // Tuition: the months published to parents
    db.from('statement_months').select('month, published_at').eq('student_id', student.id),
    // This student's own requests (the message column isn't granted, so it can't be read)
    db
      .from('lesson_requests')
      .select('kind, date, start_time, end_time, status')
      .eq('student_id', student.id)
      .gte('date', today)
      .neq('status', 'withdrawn'),
  ])
  if (checkpoints.error) throw checkpoints.error
  if (lessons.error) throw lessons.error
  if (metrics.error) throw metrics.error
  if (published.error) throw published.error
  if (requests.error) throw requests.error
  // Read records only for the metrics visible to parents
  const visibleIds = metrics.data.map((m) => m.id)
  const records =
    visibleIds.length === 0
      ? { data: [], error: null }
      : await db
          .from('metric_records')
          .select('id, metric_id, date, value, created_at')
          .eq('student_id', student.id)
          .in('metric_id', visibleIds)
  if (records.error) throw records.error

  const view = toParentView(student, checkpoints.data, lessons.data, today, {
    schedule: { rules: week.rules, lessons: week.lessons },
    grades: { metrics: metrics.data, records: records.data },
    statements: await loadStatements(db, student, published.data),
    booking: {
      windows: week.windows,
      busy: busyTimes(week.occurrences, week.others),
      minutes: usualMinutes(week.rules),
    },
    requests: requests.data,
  })
  return { view, locale: studentLocale(student) }
}

// ============ Parent requests (writes) ============

export type RequestKind = 'add' | 'leave'

// What the teacher's notification needs after a successful request. If the same slot was already requested (a
// double click), notice = null so the teacher isn't notified twice
export type RequestResult =
  | {
      ok: true
      notice: {
        studentLabel: string | null
        kind: RequestKind
        date: string
        start: string
        end: string
        message: string | null
        teacherLocale: Locale // the notification email uses the teacher's own language
      } | null
    }
  | { ok: false; code: 'gone' | 'taken' | 'too-many' | 'invalid' }

// Requests an extra lesson or leave. today = today in Tokyo (passed in by the caller, for tests and consistency).
// Extra lesson: the time must still be free (the teacher is open, no lesson, no one else requesting it); its length is
// this student's usual lesson length.
// Leave: must be one of this student's lessons still scheduled in the next two weeks
export async function createRequest(
  token: string,
  today: string,
  input: { kind: RequestKind; date: string; start: string; message: string | null }
): Promise<RequestResult> {
  if (!TOKEN.test(token)) return { ok: false, code: 'gone' }
  if (!DATE.test(input.date) || !TIME.test(input.start)) return { ok: false, code: 'invalid' }
  const message = input.message?.trim().slice(0, 200) || null

  const db = createAdminClient()
  const student = await findStudent(db, token)
  if (!student) return { ok: false, code: 'gone' }
  const week = await loadWeeks(db, student, today)

  let end: string
  let lesson: Occurrence | undefined // the lesson taking leave
  if (input.kind === 'add') {
    if (week.windows.length === 0) return { ok: false, code: 'invalid' } // the teacher has just closed extra-lesson requests
    const minutes = usualMinutes(week.rules)
    if (!canAdd(week.windows, busyTimes(week.occurrences, week.others), today, input.date, input.start, minutes)) {
      return { ok: false, code: 'taken' }
    }
    end = addMinutes(input.start, minutes)
  } else {
    lesson = leaveable(week.occurrences, student.id, today).find((o) => o.date === input.date && o.start === input.start)
    if (!lesson) return { ok: false, code: 'invalid' }
    end = lesson.end!
  }

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const [recent, pendingAdds] = await Promise.all([
    db.from('lesson_requests').select('id', { count: 'exact', head: true }).eq('student_id', student.id).gte('created_at', since),
    db
      .from('lesson_requests')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', student.id)
      .eq('kind', 'add')
      .eq('status', 'pending')
      .gte('date', today),
  ])
  if (recent.error) throw recent.error
  if (pendingAdds.error) throw pendingAdds.error
  if ((recent.count ?? 0) >= MAX_PER_DAY) return { ok: false, code: 'too-many' }
  if (input.kind === 'add' && (pendingAdds.count ?? 0) >= MAX_PENDING_ADDS) return { ok: false, code: 'too-many' }

  // Leave: record the lesson as leave right away (the same as the teacher pressing Leave on the dashboard: not billed,
  // no duration). A rule-derived lesson without a row gets one inserted; a stored lesson (a one-off) has its status
  // changed. Only this student's lesson, and only while it's still scheduled
  if (lesson) {
    const { error: e } = lesson.lessonId
      ? await db
          .from('lessons')
          .update({ status: 'leave', billable: false, duration_min: null, rate_per_hour: null })
          .eq('id', lesson.lessonId)
          .eq('student_id', student.id)
          .eq('status', 'scheduled')
      : await db.from('lessons').insert({
          student_id: student.id,
          date: lesson.date,
          schedule_id: lesson.scheduleId,
          start_time: lesson.start,
          end_time: lesson.end,
          status: 'leave',
          billable: false,
          proctor: lesson.proctor ?? false, // leave for a weekly proctored session is recorded as proctored too
        })
    // 23505 = the lesson was just recorded (the teacher marked it held / leave at the same moment)
    if (e?.code === '23505') return { ok: false, code: 'invalid' }
    if (e) throw e
  }

  const { error } = await db.from('lesson_requests').insert({
    student_id: student.id,
    kind: input.kind,
    date: input.date,
    start_time: input.start,
    end_time: end,
    message,
    // Leave has already taken effect, so it's stored as accepted; the teacher only sees a notice to dismiss
    ...(lesson ? { status: 'accepted', decided_at: new Date().toISOString() } : {}),
  })
  // 23505 = a pending request for the same slot already exists (a double click): treat as success, don't notify again
  if (error?.code === '23505') return { ok: true, notice: null }
  if (error) throw error
  return {
    ok: true,
    notice: {
      studentLabel: student.display_name,
      kind: input.kind,
      date: input.date,
      start: input.start,
      end,
      message,
      teacherLocale: toLocale(week.teacherLocale),
    },
  }
}

// Withdraws the parent's own pending extra-lesson request (requests the teacher has handled, and leave that has taken
// effect, can't be withdrawn: to cancel a leave, the parent contacts the teacher directly)
export async function withdrawRequest(
  token: string,
  input: { kind: RequestKind; date: string; start: string }
): Promise<boolean> {
  if (!TOKEN.test(token) || !DATE.test(input.date) || !TIME.test(input.start)) return false
  const db = createAdminClient()
  const student = await findStudent(db, token)
  if (!student) return false
  const { error } = await db
    .from('lesson_requests')
    .update({ status: 'withdrawn' })
    .eq('student_id', student.id)
    .eq('kind', input.kind)
    .eq('date', input.date)
    .eq('start_time', input.start)
    .eq('status', 'pending')
  if (error) throw error
  return true
}
