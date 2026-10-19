// Calculations for the analytics page. Pure functions, no IO, covered by tests.
// Inputs are already-converted records (all dates are Tokyo-time 'YYYY-MM-DD'), so the same code
// works for database data and demo data.

import { byBaselineOrder, daysBetween } from './progress'

export type LessonRec = {
  studentId: string
  date: string
  status: string // done | canceled | rescheduled | leave | scheduled
  mood: number | null // 1 smooth / 2 stuck / 3 needs revisiting
}

export type CheckpointRec = {
  studentId: string
  seq: number
  dueDate: string | null
  doneOn: string | null // done_at converted to a Tokyo date
  dateTbd: boolean
}

const MISSED = new Set(['canceled', 'rescheduled', 'leave'])

// Add days to a 'YYYY-MM-DD' date (computed in UTC, so the host time zone doesn't matter)
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function rate(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole
}

// ── Held / missed lessons ─────────────────────────────────

export type LessonStats = { total: number; held: number; missed: number; missRate: number | null }

export function lessonStats(lessons: LessonRec[]): LessonStats {
  const held = lessons.filter((l) => l.status === 'done').length
  const missed = lessons.filter((l) => MISSED.has(l.status)).length
  // total counts only lessons that have happened (held + missed); scheduled ones are left out
  return { total: held + missed, held, missed, missRate: rate(missed, held + missed) }
}

// ── Checkpoints done on time ─────────────────────────────
// Only checkpoints with a settled outcome count:
// - done: done date ≤ due date = on time (finishing early counts as on time), otherwise late
// - not done and the due date has passed (< today) = overdue
// A checkpoint due today and not ticked yet doesn't count (same as progress: due today is not late).
// Ongoing items and TBD dates don't count either (no reliable due date).

export type Timeliness = {
  resolved: number
  onTime: number
  late: number
  overdue: number
  onTimeRate: number | null
  avgDaysLate: number | null // average days late, over checkpoints finished late
}

type Outcome = 'onTime' | 'late' | 'overdue' | null

function outcome(c: CheckpointRec, today: string): Outcome {
  if (c.dueDate === null || c.dateTbd) return null
  if (c.doneOn !== null) return c.doneOn <= c.dueDate ? 'onTime' : 'late'
  return c.dueDate < today ? 'overdue' : null
}

export function timeliness(checkpoints: CheckpointRec[], today: string): Timeliness {
  let onTime = 0
  let late = 0
  let overdue = 0
  let daysLate = 0
  for (const c of checkpoints) {
    const o = outcome(c, today)
    if (o === 'onTime') onTime++
    else if (o === 'late') {
      late++
      daysLate += daysBetween(c.dueDate!, c.doneOn!)
    } else if (o === 'overdue') overdue++
  }
  const resolved = onTime + late + overdue
  return {
    resolved,
    onTime,
    late,
    overdue,
    onTimeRate: rate(onTime, resolved),
    avgDaysLate: late === 0 ? null : daysLate / late,
  }
}

// ── Mood ─────────────────────────────────────────────────

export type MoodPoint = { date: string; mood: 1 | 2 | 3 }

// The last n held lessons that have a mood, oldest first
export function recentMoods(lessons: LessonRec[], n = 12): MoodPoint[] {
  return lessons
    .filter((l): l is LessonRec & { mood: 1 | 2 | 3 } => l.status === 'done' && (l.mood === 1 || l.mood === 2 || l.mood === 3))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(-n)
    .map((l) => ({ date: l.date, mood: l.mood }))
}

// Share of "needs revisiting" among lessons with a mood in the last `days` days
export function revisitShare(lessons: LessonRec[], today: string, days = 28): number | null {
  const recent = lessons.filter(
    (l) => l.status === 'done' && l.mood !== null && daysBetween(l.date, today) < days && l.date <= today
  )
  return rate(recent.filter((l) => l.mood === 3).length, recent.length)
}

// ── Missed lessons vs. on-time checkpoints ───────────────
// Each settled checkpoint owns a window: after the previous checkpoint's due date up to its own due date
// (the first checkpoint's window is open at the start). Checkpoints are split into two groups by whether
// a canceled / rescheduled / leave lesson falls in that window, and each group gets its own on-time rate.

export type Group = { n: number; onTime: number; onTimeRate: number | null }
export type MissedVsOnTime = { withMissed: Group; withoutMissed: Group }

export function missedVsOnTime(
  checkpoints: CheckpointRec[],
  lessons: LessonRec[],
  today: string
): MissedVsOnTime {
  const groups = { withMissed: { n: 0, onTime: 0 }, withoutMissed: { n: 0, onTime: 0 } }

  for (const studentId of new Set(checkpoints.map((c) => c.studentId))) {
    const dated = checkpoints
      .filter((c): c is CheckpointRec & { dueDate: string } => c.studentId === studentId && c.dueDate !== null)
      .sort(byBaselineOrder)
    const missedDates = lessons
      .filter((l) => l.studentId === studentId && MISSED.has(l.status))
      .map((l) => l.date)

    let windowStart: string | null = null // exclusive
    for (const c of dated) {
      const o = outcome(c, today)
      if (o !== null) {
        const hadMissed = missedDates.some((d) => (windowStart === null || d > windowStart) && d <= c.dueDate)
        const g = hadMissed ? groups.withMissed : groups.withoutMissed
        g.n++
        if (o === 'onTime') g.onTime++
      }
      windowStart = c.dueDate
    }
  }

  return {
    withMissed: { ...groups.withMissed, onTimeRate: rate(groups.withMissed.onTime, groups.withMissed.n) },
    withoutMissed: { ...groups.withoutMissed, onTimeRate: rate(groups.withoutMissed.onTime, groups.withoutMissed.n) },
  }
}
