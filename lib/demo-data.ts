// Demo data for the analytics page: seeded pseudo-random generation, in memory only, never written to the database.
// It shows what the pages look like before there are many real lesson records, and the README screenshots use it
// so no real student appears. Each fictional student has different traits so every chart has something to show.

import { addDays, type CheckpointRec, type LessonRec } from './analytics'
import type { ScheduleRule, StoredLesson } from './schedule'
import type { Locale } from './i18n/locale'
import { demo } from './i18n/messages/demo'

// mulberry32: a small deterministic PRNG; the same seed always yields the same sequence
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Names depend on the locale (students in lib/i18n/messages/demo.ts, keyed by id); the generated records don't
type Profile = {
  id: string
  weekdays: number[] // lesson days each week (0 = Sunday)
  missP: number // chance a lesson is missed (recorded as leave)
  missPRecent: number // miss chance over the last 6 weeks (simulates drifting toward on-demand lessons)
  mood: [number, number, number] // weights for smooth / stuck / needs revisiting
  lateBase: number // base chance a checkpoint is late
  stopsWeeksAgo?: number // lessons stopped this many weeks ago (a student who has gone quiet)
}

const PROFILES: Profile[] = [
  { id: 'demo-a', weekdays: [2, 6], missP: 0.05, missPRecent: 0.05, mood: [0.6, 0.3, 0.1], lateBase: 0.15 },
  { id: 'demo-b', weekdays: [3, 5], missP: 0.1, missPRecent: 0.4, mood: [0.35, 0.45, 0.2], lateBase: 0.25 },
  { id: 'demo-c', weekdays: [4], missP: 0.08, missPRecent: 0.08, mood: [0.5, 0.4, 0.1], lateBase: 0.2 },
  { id: 'demo-d', weekdays: [1], missP: 0.3, missPRecent: 0.6, mood: [0.3, 0.5, 0.2], lateBase: 0.35, stopsWeeksAgo: 5 },
]

const WEEKS = 20
const CHECKPOINT_EVERY_DAYS = 21

export function demoData(
  today: string,
  locale: Locale
): {
  students: { id: string; name: string }[]
  lessons: LessonRec[]
  checkpoints: CheckpointRec[]
} {
  const rand = prng(20260925)
  const start = addDays(today, -WEEKS * 7)
  const lessons: LessonRec[] = []
  const checkpoints: CheckpointRec[] = []

  for (const p of PROFILES) {
    const stop = p.stopsWeeksAgo ? addDays(today, -p.stopsWeeksAgo * 7) : today
    const recentFrom = addDays(today, -42)

    // Lessons
    for (let day = 0; day <= WEEKS * 7; day++) {
      const date = addDays(start, day)
      if (date > stop) break
      if (!p.weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) continue
      const missP = date >= recentFrom ? p.missPRecent : p.missP
      if (rand() < missP) {
        lessons.push({ studentId: p.id, date, status: 'leave', mood: null })
        continue
      }
      const r = rand()
      const mood = r < p.mood[0] ? 1 : r < p.mood[0] + p.mood[1] ? 2 : 3
      lessons.push({ studentId: p.id, date, status: 'done', mood: rand() < 0.9 ? mood : null })
    }

    // Checkpoints: one every 3 weeks. The more lessons missed in the window, the likelier it is late or not done
    let seq = 0
    let prevDue = start
    for (let due = addDays(start, CHECKPOINT_EVERY_DAYS); due <= addDays(today, 42); due = addDays(due, CHECKPOINT_EVERY_DAYS)) {
      seq++
      const missed = lessons.filter(
        (l) => l.studentId === p.id && l.status !== 'done' && l.date > prevDue && l.date <= due
      ).length
      prevDue = due
      let doneOn: string | null = null
      if (due > stop) {
        doneOn = null // due after lessons stopped: not done
      } else if (due < today) {
        if (rand() >= Math.min(0.9, p.lateBase + 0.25 * missed)) {
          doneOn = addDays(due, -Math.floor(rand() * 4)) // on time: 0–3 days before the due date
        } else {
          const late = addDays(due, 2 + Math.floor(rand() * 12)) // 2–13 days late; not done if that date hasn't come yet
          doneOn = late < today ? late : null
        }
      } else if (rand() < 0.1) {
        doneOn = addDays(today, -1) // occasionally finished early
      }
      checkpoints.push({ studentId: p.id, seq, dueDate: due, doneOn, dateTbd: false })
    }
  }

  const names = demo[locale].students
  return { students: PROFILES.map(({ id }) => ({ id, name: names[id] ?? id })), lessons, checkpoints }
}

// Schedule demo: fictional students' weekly times plus a few lessons this week (held / leave / extra)
export function demoWeek(today: string): {
  students: { id: string; name: string }[]
  rules: ScheduleRule[]
  lessons: StoredLesson[]
} {
  const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7))
  const since = addDays(monday, -28)
  const rule = (id: string, studentId: string, weekday: number, start: string, end: string): ScheduleRule => ({
    id, studentId, weekday, start, end, startsOn: since, endsOn: null,
  })
  const rules = [
    rule('r-a1', 'demo-a', 1, '19:00', '21:00'),
    rule('r-a2', 'demo-a', 5, '10:00', '12:00'),
    rule('r-b1', 'demo-b', 2, '19:00', '21:00'),
    rule('r-b2', 'demo-b', 4, '19:00', '21:00'),
    rule('r-c1', 'demo-c', 3, '15:30', '17:30'), // not on a standard slot: drawn at its real time
    rule('r-d1', 'demo-d', 0, '16:00', '18:00'),
  ]
  const lessons: StoredLesson[] = [
    { id: 'l1', studentId: 'demo-d', date: monday, status: 'done', start: '16:00', end: '18:00', scheduleId: 'r-d1' },
    { id: 'l2', studentId: 'demo-a', date: addDays(monday, 1), status: 'done', start: '19:00', end: '21:00', scheduleId: 'r-a1' },
    { id: 'l3', studentId: 'demo-b', date: addDays(monday, 2), status: 'done', start: '19:00', end: '21:00', scheduleId: 'r-b1' },
    { id: 'l4', studentId: 'demo-b', date: addDays(monday, 5), status: 'scheduled', start: '13:00', end: '15:00', scheduleId: null },
    { id: 'l5', studentId: 'demo-a', date: addDays(monday, 6), status: 'scheduled', start: '10:00', end: '12:00', scheduleId: null },
    // spans two standard slots (16–18 and 19–21)
    { id: 'l6', studentId: 'demo-d', date: addDays(monday, 3), status: 'scheduled', start: '17:30', end: '19:30', scheduleId: null },
    // lunchtime, outside every standard slot
    { id: 'l7', studentId: 'demo-c', date: addDays(monday, 5), status: 'scheduled', start: '12:00', end: '13:00', scheduleId: null },
    // leave: not shown
    { id: 'l8', studentId: 'demo-b', date: addDays(monday, 3), status: 'leave', start: '19:00', end: '21:00', scheduleId: 'r-b2' },
  ]
  return {
    students: [
      { id: 'demo-a', name: 'A' },
      { id: 'demo-b', name: 'B' },
      { id: 'demo-c', name: 'C' },
      { id: 'demo-d', name: 'D' },
    ],
    rules,
    lessons,
  }
}
