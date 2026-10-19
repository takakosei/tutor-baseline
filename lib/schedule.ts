// Scheduling and billing calculations. Pure functions, no IO, covered by tests.
// Dates are 'YYYY-MM-DD' (Tokyo), times are 'HH:MM' (Tokyo).

import { addDays } from './analytics'

// ── Slots ────────────────────────────────────────────────
// Four standard slots: shortcuts when picking a time, and a faint background on the schedule (lessons themselves
// are drawn at their real start and end times)
export const BANDS = [
  { start: '10:00', end: '12:00' },
  { start: '13:00', end: '15:00' },
  { start: '16:00', end: '18:00' },
  { start: '19:00', end: '21:00' },
] as const

// Trial lesson: one per student, fixed at 1 hour for ¥1,000. When logged as held it's recorded as 60 minutes at a
// ¥1,000/hour rate snapshot
export const TRIAL = { minutes: 60, ratePerHour: 1000 } as const

// Proctored session: the student works through a past paper while the teacher supervises, billed at a fixed fee per
// session (the proctoring fee in the student profile, students.proctor_fee). The teacher sees it as "proctor";
// parents (parent page, tuition statement) see "past-paper practice". Both names are in lib/i18n/messages/common.ts
// (proctorTag / proctorParent). Weekday names come from weekdayName in lib/format.ts

// Database time columns return 'HH:MM:SS'; normalize to 'HH:MM'
export function hhmm(time: string | null): string | null {
  return time === null ? null : time.slice(0, 5)
}

// Add minutes to an 'HH:MM' time (within the same day)
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const t = h * 60 + m + minutes
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return eh * 60 + em - (sh * 60 + sm)
}

// ── Schedule timeline ────────────────────────────────────
// The schedule is drawn to real time: a lesson's position and height are its start and end. The four standard slots
// are only a background reference

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

// Timeline range (in minutes): at least the four standard slots (10:00–21:00), widened to the hour for earlier / later lessons
export function timelineRange(items: { start: string | null; end: string | null }[]): { from: number; to: number } {
  let from = toMinutes(BANDS[0].start)
  let to = toMinutes(BANDS[BANDS.length - 1].end)
  for (const o of items) {
    if (o.start) from = Math.min(from, Math.floor(toMinutes(o.start) / 60) * 60)
    if (o.end) to = Math.max(to, Math.ceil(toMinutes(o.end) / 60) * 60)
  }
  return { from, to }
}

// Overlapping lessons on the same day are shown side by side: returns each lesson's column (lane) and the number of
// columns in its overlapping group (of). Touching edges don't overlap (15:30–17:30 and 17:30–19:30 stack, each full width)
export function dayLanes(items: { key: string; start: string; end: string }[]): Map<string, { lane: number; of: number }> {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
  const out = new Map<string, { lane: number; of: number }>()
  let group: { key: string; lane: number }[] = []
  let laneEnds: string[] = [] // end time of the last lesson in each column
  let groupEnd = ''
  const close = () => {
    for (const g of group) out.set(g.key, { lane: g.lane, of: laneEnds.length })
    group = []
    laneEnds = []
  }
  for (const o of sorted) {
    if (group.length > 0 && o.start >= groupEnd) close()
    let lane = laneEnds.findIndex((end) => end <= o.start)
    if (lane === -1) lane = laneEnds.push(o.end) - 1
    else laneEnds[lane] = o.end
    group.push({ key: o.key, lane })
    groupEnd = group.length === 1 || o.end > groupEnd ? o.end : groupEnd
  }
  close()
  return out
}

// 0 = Monday … 6 = Sunday
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

// The Monday of this week
export function mondayOf(date: string): string {
  return addDays(date, -weekdayOf(date))
}

// ── Rules + stored rows → concrete lessons ───────────────

export type ScheduleRule = {
  id: string
  studentId: string
  weekday: number
  start: string
  end: string
  startsOn: string
  endsOn: string | null
  proctor?: boolean // proctored session
}

export type LessonStatus = 'scheduled' | 'done' | 'canceled' | 'rescheduled'

export type StoredLesson = {
  id: string
  studentId: string
  date: string
  status: string
  start: string | null
  end: string | null
  scheduleId: string | null
  trial?: boolean
  online?: boolean // online lesson
  proctor?: boolean // proctored session
  movedFrom?: string | null // for a moved lesson: its original date (identifies which day of the rule it was)
  movedFromStart?: string | null // the original start / end (absent on the parent page, which can't read them)
  movedFromEnd?: string | null
}

export type Occurrence = {
  key: string // stored: 'L:<lesson id>'; derived from a rule, not stored yet: 'S:<schedule id>:<date>'
  studentId: string
  date: string
  start: string | null
  end: string | null
  status: string
  lessonId: string | null
  scheduleId: string | null
  trial: boolean // trial lesson
  online?: boolean // online lesson (known only for stored lessons)
  proctor?: boolean // proctored session (from the rule for rule-derived lessons)
  movedFrom?: string | null // time was changed: the original date (stored lessons only)
  movedFromStart?: string | null
  movedFromEnd?: string | null
}

export function ruleActiveOn(rule: ScheduleRule, date: string): boolean {
  return (
    weekdayOf(date) === rule.weekday &&
    rule.startsOn <= date &&
    (rule.endsOn === null || date <= rule.endsOn)
  )
}

// Whether two time ranges overlap (touching edges don't: 13:00–15:00 and 15:00–17:00 don't overlap)
export function timesOverlap(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return a.start < b.end && b.start < a.end
}

// Whether a new weekly rule clashes with one of the student's existing rules: same weekday, overlapping times, and
// a real day on which both are active (e.g. the old rule ends today and the new one starts today: if today isn't
// that weekday, there's no clash). Returns the clashing rule
export function conflictingRule(
  rules: ScheduleRule[],
  next: { weekday: number; start: string; end: string; startsOn: string }
): ScheduleRule | null {
  return (
    rules.find((r) => {
      if (r.weekday !== next.weekday || !timesOverlap(r, next)) return false
      if (r.endsOn === null) return true // neither rule ends, so they clash sooner or later
      const from = r.startsOn > next.startsOn ? r.startsOn : next.startsOn
      for (let d = from, i = 0; d <= r.endsOn && i < 7; d = addDays(d, 1), i++) {
        if (weekdayOf(d) === r.weekday) return true
      }
      return false
    }) ?? null
  )
}

// Which rule and day a rule-based lesson belongs to: a moved lesson counts by its original date
export function ruleDay(l: Pick<StoredLesson, 'scheduleId' | 'date' | 'movedFrom'>): string | null {
  return l.scheduleId === null ? null : `${l.scheduleId}:${l.movedFrom ?? l.date}`
}

// Lessons in a date range (a PostgREST or filter): those dated in the range, plus those originally in it and moved
// elsewhere. Without them, the original day would show the rule's lesson again. No `to` = open-ended
export function lessonsWindow(from: string, to?: string): string {
  const range = (col: string) => (to ? `and(${col}.gte.${from},${col}.lte.${to})` : `${col}.gte.${from}`)
  return `${range('date')},${range('moved_from')}`
}

// All lessons from `from` to `to` (inclusive).
// If a rule has a stored row for a day (held / leave / moved…) the row is used; otherwise the rule produces a
// "scheduled" lesson. Moved rows show on their new date. lessons may include rows dated outside the range (originally
// inside it, moved out); they only serve to remove the original lesson
export function expandOccurrences(
  rules: ScheduleRule[],
  lessons: StoredLesson[],
  from: string,
  to: string
): Occurrence[] {
  const recorded = new Set(lessons.map(ruleDay).filter((k) => k !== null))
  const out: Occurrence[] = []

  for (let date = from; date <= to; date = addDays(date, 1)) {
    for (const r of rules) {
      if (!ruleActiveOn(r, date) || recorded.has(`${r.id}:${date}`)) continue
      out.push({
        key: `S:${r.id}:${date}`,
        studentId: r.studentId,
        date,
        start: r.start,
        end: r.end,
        status: 'scheduled',
        lessonId: null,
        scheduleId: r.id,
        trial: false,
        proctor: r.proctor ?? false,
      })
    }
  }
  for (const l of lessons) {
    if (l.date < from || l.date > to) continue
    out.push({
      key: `L:${l.id}`,
      studentId: l.studentId,
      date: l.date,
      start: l.start,
      end: l.end,
      status: l.status,
      lessonId: l.id,
      scheduleId: l.scheduleId,
      trial: l.trial ?? false,
      online: l.online ?? false,
      proctor: l.proctor ?? false,
      movedFrom: l.movedFrom ?? null,
      movedFromStart: l.movedFromStart ?? null,
      movedFromEnd: l.movedFromEnd ?? null,
    })
  }

  return out.sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      (a.start ?? '99:99').localeCompare(b.start ?? '99:99') ||
      a.studentId.localeCompare(b.studentId)
  )
}

// Changes the time of one upcoming lesson (this time only; the weekly rule is untouched). Returns what to write:
//   'same'   = unchanged, nothing to do
//   'delete' = a rule-based lesson moved back to its original time → delete the row and fall back to the rule's lesson
//   fields   = the lesson's new date and times, plus the original date / times (recorded on the first move and kept
//              on later ones). A one-off lesson moved back to its original time has the original cleared (no longer moved)
export function planMove(
  current: {
    date: string
    start: string | null
    end: string | null
    movedFrom: string | null
    movedFromStart: string | null
    movedFromEnd: string | null
    fromRule: boolean // a lesson from a weekly rule
  },
  next: { date: string; start: string; end: string }
):
  | 'same'
  | 'delete'
  | { date: string; start_time: string; end_time: string; moved_from: string | null; moved_from_start: string | null; moved_from_end: string | null } {
  const same = (a: { date: string; start: string | null; end: string | null }) =>
    a.date === next.date && a.start === next.start && a.end === next.end
  if (same(current)) return 'same'
  const original = current.movedFrom
    ? { date: current.movedFrom, start: current.movedFromStart, end: current.movedFromEnd }
    : { date: current.date, start: current.start, end: current.end }
  const back = same(original)
  if (back && current.fromRule) return 'delete'
  return {
    date: next.date,
    start_time: next.start,
    end_time: next.end,
    moved_from: back ? null : original.date,
    moved_from_start: back ? null : original.start,
    moved_from_end: back ? null : original.end,
  }
}

// Total minutes of teaching still scheduled (the dashboard student card's "about Xh left": lessons from today to the
// end date). Leave, canceled and held lessons don't count; proctored sessions don't (no teaching); lessons without a
// time don't
export function scheduledMinutes(occurrences: Occurrence[]): number {
  return occurrences
    .filter((o) => o.status === 'scheduled' && !o.proctor && o.start !== null && o.end !== null)
    .reduce((sum, o) => sum + minutesBetween(o.start!, o.end!), 0)
}

// Past lessons still marked scheduled = held but not logged (or missed and not logged)
export function unlogged(occurrences: Occurrence[], today: string): Occurrence[] {
  return occurrences.filter((o) => o.status === 'scheduled' && o.date < today)
}

// ── Hours and amounts ────────────────────────────────────

export type BillingLesson = {
  studentId: string
  date: string
  status: string
  durationMin: number | null
  start: string | null
  end: string | null
  billable: boolean
  ratePerHour: number | null // hourly rate snapshot taken when logged
  trial?: boolean
  online?: boolean // online lesson (tagged on the statement; the rate is already in the snapshot)
  proctor?: boolean // proctored session: billed per session, amount = proctorFee
  proctorFee?: number | null // proctoring fee snapshot taken when logged
}

// A database row → BillingLesson. Shared by the teacher side (schedule-data) and the parent page (parent-data)
export function toBillingLesson(
  l: {
    date: string
    status: string
    duration_min: number | null
    start_time: string | null
    end_time: string | null
    billable: boolean
    rate_per_hour: number | null
    trial: boolean
    online?: boolean
    proctor?: boolean
    proctor_fee?: number | null
  },
  studentId: string
): BillingLesson {
  return {
    studentId,
    date: l.date,
    status: l.status,
    durationMin: l.duration_min,
    start: hhmm(l.start_time),
    end: hhmm(l.end_time),
    billable: l.billable,
    ratePerHour: l.rate_per_hour,
    trial: l.trial,
    online: l.online ?? false,
    proctor: l.proctor ?? false,
    proctorFee: l.proctor_fee ?? null,
  }
}

// A lesson's minutes: the recorded duration if there is one, otherwise the scheduled start and end
export function lessonMinutes(l: Pick<BillingLesson, 'durationMin' | 'start' | 'end'>): number | null {
  if (l.durationMin !== null) return l.durationMin
  if (l.start !== null && l.end !== null) return minutesBetween(l.start, l.end)
  return null
}

// A lesson's fee (whole yen). Held lessons count, and so do canceled / rescheduled lessons marked as still billable.
// The rate snapshot comes first; the student's current rate is used only when there is no snapshot. A proctored
// session is its fee snapshot (a database constraint guarantees every billed proctored session has one)
export function lessonFee(l: BillingLesson, studentRate: number | null): number {
  if (!l.billable || l.status === 'scheduled') return 0
  if (l.proctor) return l.proctorFee ?? 0
  const rate = l.ratePerHour ?? studentRate ?? 0
  return Math.round(((lessonMinutes(l) ?? 0) * rate) / 60)
}

export type Totals = { minutes: number; fee: number; lessons: number }

// Working time counts only held lessons; amounts follow lessonFee
export function totals(
  lessons: BillingLesson[],
  rateOf: (studentId: string) => number | null,
  range?: { from: string; to: string }
): Totals {
  let minutes = 0
  let fee = 0
  let count = 0
  for (const l of lessons) {
    if (range && (l.date < range.from || l.date > range.to)) continue
    if (l.status === 'done') {
      minutes += lessonMinutes(l) ?? 0
      count++
    }
    fee += lessonFee(l, rateOf(l.studentId))
  }
  return { minutes, fee, lessons: count }
}

// First and last day of a month
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const from = `${month}-01`
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return { from, to: addDays(next, -1) }
}

// Every month from first to last ('YYYY-MM', inclusive), in order
export function monthsBetween(first: string, last: string): string[] {
  const months: string[] = []
  for (let m = first; m <= last; m = addDays(monthRange(m).to, 1).slice(0, 7)) months.push(m)
  return months
}

// Income page (opened from the dashboard's all-time total): earnings per month, split by student.
// fee counts lessons only (the same figure as the dashboard, via totals). Other statement items (materials bought
// for the student, discounts) aren't lesson fees, so they go in extras and are not added to fee
export type StudentIncome = Totals & { studentId: string; extras: number }
export type MonthIncome = Totals & { month: string; extras: number; byStudent: StudentIncome[] }

export function monthlyIncome(
  lessons: BillingLesson[],
  rateOf: (studentId: string) => number | null,
  months: string[],
  extras: { studentId: string; month: string; amount: number }[] = []
): MonthIncome[] {
  return months.map((month) => {
    const { from, to } = monthRange(month)
    const inMonth = lessons.filter((l) => l.date >= from && l.date <= to)
    const items = extras.filter((e) => e.month === month)
    const byStudent = [...new Set([...inMonth.map((l) => l.studentId), ...items.map((e) => e.studentId)])]
      .map((studentId) => ({
        studentId,
        ...totals(
          inMonth.filter((l) => l.studentId === studentId),
          rateOf
        ),
        extras: items.filter((e) => e.studentId === studentId).reduce((sum, e) => sum + e.amount, 0),
      }))
      // skip students whose only lessons this month were unbilled cancellations
      .filter((s) => s.lessons > 0 || s.fee > 0 || s.extras !== 0)
      .sort((a, b) => b.fee - a.fee || b.minutes - a.minutes)
    return {
      month,
      ...totals(inMonth, rateOf),
      extras: items.reduce((sum, e) => sum + e.amount, 0),
      byStudent,
    }
  })
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h${m}m`
}

// ── Tuition statement ────────────────────────────────────

export type StatementRow = {
  date: string
  start: string | null
  end: string | null
  minutes: number | null
  rate: number // hourly rate; the per-session price when perSession
  perSession: boolean // billed per session (proctored)
  fee: number
  tag: StatementTag | null // a computed tag, not the lesson note (lessons.note). The displayed text is in components/statement-paper.tsx
}

// trial / past-paper practice / past-paper practice · late cancellation (billed) / late cancellation (billed) / online
export type StatementTag = 'trial' | 'proctor' | 'proctor-cancelled' | 'cancelled' | 'online'

// An "other" item on the tuition statement: materials bought for the student (added), a discount (subtracted) and
// so on. amount is in yen, positive = added, negative = subtracted. month decides which statement it's on; the date
// is optional
export type StatementItem = { id: string; month: string; date: string | null; label: string; amount: number }

// The tag on a statement row (parents see this statement too, so proctored sessions read as past-paper practice)
function rowTag(l: BillingLesson): StatementTag | null {
  const cancelled = l.status !== 'done'
  if (l.trial) return 'trial'
  if (l.proctor) return cancelled ? 'proctor-cancelled' : 'proctor'
  return cancelled ? 'cancelled' : l.online ? 'online' : null
}

export function buildStatement(
  lessons: BillingLesson[],
  studentRate: number | null,
  month: string,
  extras: StatementItem[] = []
): {
  rows: StatementRow[]
  lessons: number
  minutes: number
  lessonFee: number // lesson fee subtotal
  items: StatementItem[] // this month's other items, by date
  fee: number // total = lesson fees + other items
} {
  const { from, to } = monthRange(month)
  const rows = lessons
    .filter((l) => l.date >= from && l.date <= to && l.billable && l.status !== 'scheduled')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.start ?? '').localeCompare(b.start ?? '')))
    .map((l) => ({
      date: l.date,
      start: l.start,
      end: l.end,
      minutes: lessonMinutes(l),
      rate: l.proctor ? (l.proctorFee ?? 0) : (l.ratePerHour ?? studentRate ?? 0),
      perSession: l.proctor ?? false,
      fee: lessonFee(l, studentRate),
      tag: rowTag(l),
    }))
  // dated items by date, undated ones last
  const items = extras
    .filter((e) => e.month === month)
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.id.localeCompare(b.id))
  const lessonFeeTotal = rows.reduce((sum, r) => sum + r.fee, 0)
  return {
    rows,
    lessons: rows.length,
    minutes: rows.reduce((sum, r) => sum + (r.minutes ?? 0), 0),
    lessonFee: lessonFeeTotal,
    items,
    fee: lessonFeeTotal + items.reduce((sum, e) => sum + e.amount, 0),
  }
}
