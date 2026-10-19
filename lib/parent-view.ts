// The parent page's field allow-list. Every piece of text on the parent page passes through here. Pure functions,
// no IO, covered by tests.
//
// Outputs only: display name, goal, end label, start / end date (for the timeline and countdown), a progress summary
//   (count done + a neutral state), checkpoints visible to parents (title / criterion / date / done), held lessons
//   with a parent summary (date / summary / trial / past-paper practice), lessons scheduled in the next two weeks
//   (date / start and end / past-paper practice / whether the time was changed, without the original time), grade
//   metrics the teacher made visible to parents (name / unit / maximum / higher or lower is better / each record's
//   date and value), tuition totals for months published to parents (the details are in toParentStatement), days and
//   start times open for extra-lesson requests (free or not, never who holds a slot), and the parent's own requests
//   (kind / date / time / status, without the message)
// Never outputs: note (on lessons and grade records), risk_level, risk_note, billable, mood, days behind,
//   catch-up hours, or the internal name
// Amounts (rates, per-lesson amounts, totals) appear only in the statements for months published to parents: the
// same statement the teacher prints for them
//
// The database queries (lib/parent-data.ts) already select only allow-listed columns; copying field by field here
// again means nothing leaks even if a caller passes extra fields.

import { byBaselineOrder, computeProgress } from './progress'
import { addDays } from './analytics'
import {
  buildStatement,
  expandOccurrences,
  type BillingLesson,
  type ScheduleRule,
  type StatementItem,
  type StatementTag,
  type StoredLesson,
} from './schedule'
import { byDate } from './metrics'
import { freeDays, type Busy, type Window } from './booking'

export type ParentView = {
  displayName: string | null
  goal: string | null
  endLabel: string | null
  startDate: string | null
  endDate: string | null
  summary: { total: number; done: number; state: 'ahead' | 'ontrack' | 'behind' } | null
  checkpoints: { title: string; criterion: string | null; dueDate: string | null; done: boolean }[]
  lessons: { date: string; summary: string; trial: boolean; proctor: boolean }[] // proctor = past-paper practice (a proctored session on the teacher's side)
  upcoming: { date: string; start: string | null; end: string | null; proctor: boolean; moved: boolean }[] // moved = the time was changed (the parent page marks it)
  grades: (ParentGrade & { parts: ParentGrade[] })[] // parts = this metric's parts (e.g. an aptitude-test total → I, II, III); empty if none

  statements: { month: string; fee: number }[] // months published to parents, newest first
  // Extra-lesson requests: the lesson length and each day's free start times for the two weeks from tomorrow.
  // null when the teacher hasn't opened requests (the parent page hides them)
  booking: { minutes: number; days: { date: string; starts: string[] }[] } | null
  // The parent's own requests (today onward, not withdrawn), by date
  requests: RequestOut[]
}

export type ParentGrade = {
  name: string
  unit: string
  maxValue: number | null
  lowerIsBetter: boolean // e.g. a time: lower is better (parents need to know which way a trend line is progress)
  records: { date: string; value: number }[] // by date (same date: in the order entered)
}

export type RequestOut = {
  kind: 'add' | 'leave'
  date: string
  start: string
  end: string
  status: 'pending' | 'accepted' | 'declined'
}

// One month's tuition statement (only for months published to parents), the same as the one the teacher prints:
// each billable lesson's date, time, duration, rate (per session for past-paper practice), amount and tag (trial /
// past-paper practice / late cancellation); each other item's date, label and amount; and the total.
// Not output: lesson notes, item ids, the student's internal name
export type ParentStatement = {
  month: string
  issuedOn: string // the day the teacher published it
  rows: {
    date: string
    start: string | null
    end: string | null
    minutes: number | null
    rate: number
    perSession: boolean
    fee: number
    tag: StatementTag | null
  }[]
  lessons: number
  minutes: number
  lessonFee: number
  items: { date: string | null; label: string; amount: number }[]
  fee: number
}

export function toParentStatement(
  month: string,
  issuedOn: string,
  lessons: BillingLesson[],
  studentRate: number | null,
  items: StatementItem[]
): ParentStatement {
  const st = buildStatement(lessons, studentRate, month, items)
  return {
    month,
    issuedOn,
    rows: st.rows.map((r) => ({
      date: r.date,
      start: r.start,
      end: r.end,
      minutes: r.minutes,
      rate: r.rate,
      perSession: r.perSession,
      fee: r.fee,
      tag: r.tag,
    })),
    lessons: st.lessons,
    minutes: st.minutes,
    lessonFee: st.lessonFee,
    items: st.items.map((e) => ({ date: e.date, label: e.label, amount: e.amount })),
    fee: st.fee,
  }
}

type StudentIn = {
  display_name: string | null
  goal: string | null
  end_label: string | null
  start_date: string | null
  end_date: string | null
}
type CheckpointIn = {
  id: string
  seq: number
  due_date: string | null
  title: string
  criterion: string | null
  done_at: string | null
  parent_visible: boolean
}
type LessonIn = { date: string; status: string; parent_summary: string | null; trial?: boolean; proctor?: boolean }
type MetricIn = {
  id: string
  name: string
  unit: string
  direction: number
  max_value: number | null
  parent_visible: boolean
  parent_id?: string | null // the metric this is a part of (a part's parent visibility follows its parent)
}
type MetricRecordIn = { id: string; metric_id: string; date: string; value: number; created_at: string }
type RequestIn = { kind: string; date: string; start_time: string; end_time: string; status: string }

export function toParentView(
  student: StudentIn,
  checkpoints: CheckpointIn[],
  lessons: LessonIn[],
  today: string,
  {
    schedule = { rules: [], lessons: [] },
    grades = { metrics: [], records: [] },
    statements = [],
    booking,
    requests = [],
  }: {
    schedule?: { rules: ScheduleRule[]; lessons: StoredLesson[] }
    grades?: { metrics: MetricIn[]; records: MetricRecordIn[] }
    statements?: ParentStatement[]
    // The teacher's open times, busy times (all students' lessons + pending requests) and this student's lesson length.
    // Busy times are only used to compute free time and are never output
    booking?: { windows: Window[]; busy: Busy[]; minutes: number }
    requests?: RequestIn[]
  } = {}
): ParentView {
  const visible = checkpoints.filter((c) => c.parent_visible === true)
  const dated = visible
    .filter((c): c is CheckpointIn & { due_date: string } => c.due_date !== null)
    .sort((a, b) => byBaselineOrder({ dueDate: a.due_date, seq: a.seq }, { dueDate: b.due_date, seq: b.seq }))
  const ongoing = visible.filter((c) => c.due_date === null).sort((a, b) => a.seq - b.seq)

  // Progress counts only checkpoints visible to parents: the teacher's own to-dos shouldn't make the child look behind.
  // Only state is used, not offsetDays / catchUpHours (those are internal judgments)
  const progress = computeProgress(
    dated.map((c) => ({ id: c.id, seq: c.seq, dueDate: c.due_date, title: c.title, doneAt: c.done_at })),
    today
  )

  return {
    displayName: student.display_name,
    goal: student.goal,
    endLabel: student.end_label,
    startDate: student.start_date,
    endDate: student.end_date,
    summary:
      progress.state === 'none'
        ? null
        : {
            total: dated.length,
            done: dated.filter((c) => c.done_at !== null).length,
            state: progress.state,
          },
    checkpoints: [...dated, ...ongoing].map((c) => ({
      title: c.title,
      criterion: c.criterion,
      dueDate: c.due_date,
      done: c.done_at !== null,
    })),
    lessons: lessons
      .filter((l) => l.status === 'done' && l.parent_summary !== null && l.parent_summary.trim() !== '')
      .map((l) => ({ date: l.date, summary: l.parent_summary!.trim(), trial: l.trial === true, proctor: l.proctor === true })),
    // Only lessons still scheduled: canceled / rescheduled ones are hidden (the new date of a rescheduled lesson is a
    // scheduled lesson, so it shows). A lesson whose time was changed shows the new time with a mark (the original
    // date and time aren't given)
    upcoming: expandOccurrences(schedule.rules, schedule.lessons, today, addDays(today, 14))
      .filter((o) => o.status === 'scheduled')
      .map((o) => ({ date: o.date, start: o.start, end: o.end, proctor: o.proctor === true, moved: !!o.movedFrom })),
    // Only metrics visible to parents that have records. Record notes aren't in the input, and only date and value
    // are copied here. Parts (parent_id) go into their parent's parts; parts of a hidden parent never appear. A parent
    // with no records of its own still shows if its parts have records
    grades: (() => {
      const visible = grades.metrics.filter((m) => m.parent_visible === true)
      const ids = new Set(visible.map((m) => m.id))
      const toGrade = (m: MetricIn): ParentGrade => ({
        name: m.name,
        unit: m.unit,
        maxValue: m.max_value,
        lowerIsBetter: m.direction === -1,
        records: byDate(
          grades.records
            .filter((r) => r.metric_id === m.id)
            .map((r) => ({ id: r.id, metricId: r.metric_id, date: r.date, value: r.value, createdAt: r.created_at }))
        ).map((r) => ({ date: r.date, value: r.value })),
      })
      return visible
        .filter((m) => !m.parent_id)
        .map((m) => ({
          ...toGrade(m),
          parts: visible
            .filter((p) => p.parent_id === m.id && ids.has(m.id))
            .map(toGrade)
            .filter((g) => g.records.length > 0)
            .sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .filter((g) => g.records.length > 0 || g.parts.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name))
    })(),
    // The parent page lists only months and totals; details open separately (toParentStatement)
    statements: statements
      .map((st) => ({ month: st.month, fee: st.fee }))
      .sort((a, b) => b.month.localeCompare(a.month)),
    booking:
      booking && booking.windows.length > 0
        ? { minutes: booking.minutes, days: freeDays(booking.windows, booking.busy, today, booking.minutes) }
        : null,
    requests: requests
      .filter(
        (r): r is RequestIn & { kind: RequestOut['kind']; status: RequestOut['status'] } =>
          (r.kind === 'add' || r.kind === 'leave') &&
          (r.status === 'pending' || r.status === 'accepted' || r.status === 'declined') &&
          r.date >= today
      )
      .map((r) => ({ kind: r.kind, date: r.date, start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5), status: r.status }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)),
  }
}
