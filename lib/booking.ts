// Calculations for parents' extra-lesson and leave requests. Pure functions, no IO, covered by tests.
//
// Bookable time = 10:00–21:00 every day (OPEN) − busy time.
// Busy time = the teacher's "unavailable" cells (blocked_times, 30-minute cells, weekly or for one date)
//           + every student's scheduled / held lessons (leave doesn't count) + other parents' pending extra-lesson requests.
// Parents only get "which day, which start times are free". They never learn who holds a slot or why
// the teacher is unavailable (parents never see other students).

import { addDays } from './analytics'
import { formatMonthDay } from './format'
import type { Locale } from './i18n/locale'
import { mail } from './i18n/messages/mail'
import { addMinutes, minutesBetween, timesOverlap, toMinutes, weekdayOf, type Occurrence } from './schedule'

export type Window = { weekday: number; start: string; end: string }
export type Busy = { date: string; start: string; end: string }

export const STEP = 30 // start times are offered every 30 minutes
export const DAYS_AHEAD = 14 // requests reach up to two weeks ahead (same as the parent page's upcoming lessons); the earliest is tomorrow
export const DEFAULT_MINUTES = 120

// The range parents can book: 10:00–21:00 every day (the same range the schedule draws). The teacher marks
// times they don't want booked as "unavailable", cell by cell
export const OPEN = { start: '10:00', end: '21:00' } as const
export const OPEN_WINDOWS: Window[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, ...OPEN }))
export const CELL = 30 // one "unavailable" cell: 30 minutes

// Start times of the cells that can be marked unavailable: 10:00, 10:30 … 20:30
export function cellStarts(): string[] {
  const out: string[] = []
  for (let t = toMinutes(OPEN.start); t < toMinutes(OPEN.end); t += CELL) out.push(addMinutes('00:00', t))
  return out
}

// One "unavailable" cell. Weekly cells have a validity range (validFrom to validTo, null = open-ended), so an edit
// only affects today onward and past days stay as they were
export type BlockedCell = {
  weekday: number | null
  date: string | null
  start: string
  validFrom?: string | null
  validTo?: string | null
}

// Whether this cell makes day d unavailable
export function blockedOn(c: BlockedCell, d: string): boolean {
  if (c.date !== null) return c.date === d
  return c.weekday === weekdayOf(d) && (!c.validFrom || c.validFrom <= d) && (!c.validTo || d <= c.validTo)
}

// Unavailable cells → busy times for the days from..to (weekly cells expand to every matching day in their validity range)
export function blockedBusy(cells: BlockedCell[], from: string, to: string): Busy[] {
  const out: Busy[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const c of cells) {
      if (blockedOn(c, d)) out.push({ date: d, start: c.start, end: addMinutes(c.start, CELL) })
    }
  }
  return out
}

// Saving weekly unavailable cells: the cells valid now (current) → the wanted set (want, '<weekday> HH:MM').
// Removed cells that started before today end yesterday (end, past days stay as they were); cells added today
// are deleted outright (remove). New cells start today (add)
export function planWeekly(
  current: { id: string; key: string; validFrom: string }[],
  want: Set<string>,
  today: string
): { end: string[]; remove: string[]; add: string[] } {
  const gone = current.filter((c) => !want.has(c.key))
  const have = new Set(current.map((c) => c.key))
  return {
    end: gone.filter((c) => c.validFrom < today).map((c) => c.id),
    remove: gone.filter((c) => c.validFrom >= today).map((c) => c.id),
    add: [...want].filter((k) => !have.has(k)).sort(),
  }
}

// ── A cell holds either a lesson or "unavailable", never both ──
// Unavailable cells under lessons are cleared; nothing before today is touched:
// - weekly cells: the period with a lesson is cut out of the cell's validity range. Weekly lessons cut out
//   their rule's validity range (leave days included: that time belongs to the student, so a leave frees it
//   rather than turning it back into unavailable); one-off lessons cut out just their day. Of what remains, the
//   first span keeps the original row if it still starts on the original date (its end date changes); every
//   other span becomes a new row. If nothing remains, the row is deleted
// - single-date cells: deleted when a lesson sits on that date and time (leave and canceled lessons don't count)
export type BlockedWeeklyRow = { id: string; weekday: number; start: string; validFrom: string; validTo: string | null }
export type BlockedDatedRow = { id: string; date: string; start: string }
type Span = [string, string | null] // start date, end date (inclusive; null = open-ended)

function cut(spans: Span[], from: string, to: string | null): Span[] {
  const out: Span[] = []
  for (const [f, t] of spans) {
    if ((t !== null && t < from) || (to !== null && to < f)) {
      out.push([f, t])
      continue
    }
    if (f < from) out.push([f, addDays(from, -1)])
    if (to !== null && (t === null || to < t)) out.push([addDays(to, 1), t])
  }
  return out
}

export function clearUnderLessons(
  weekly: BlockedWeeklyRow[],
  dated: BlockedDatedRow[],
  rules: { weekday: number; start: string; end: string; startsOn: string; endsOn: string | null }[],
  occupied: { date: string; start: string; end: string; fromRule: boolean }[], // lesson times from today on (leave and canceled don't count)
  today: string
): {
  end: { id: string; validTo: string }[]
  remove: string[]
  add: { weekday: number; start: string; validFrom: string; validTo: string | null }[]
} {
  const end: { id: string; validTo: string }[] = []
  const remove: string[] = []
  const add: { weekday: number; start: string; validFrom: string; validTo: string | null }[] = []

  for (const row of weekly) {
    const cell = { start: row.start, end: addMinutes(row.start, CELL) }
    const busy: Span[] = [
      ...rules
        .filter((r) => r.weekday === row.weekday && timesOverlap(r, cell))
        .map((r): Span => [r.startsOn > today ? r.startsOn : today, r.endsOn]),
      ...occupied
        .filter((o) => !o.fromRule && o.date >= today && weekdayOf(o.date) === row.weekday && timesOverlap(o, cell))
        .map((o): Span => [o.date, o.date]),
    ].filter(([f, t]) => t === null || f <= t)
    let spans: Span[] = [[row.validFrom, row.validTo]]
    for (const [f, t] of busy) spans = cut(spans, f, t)
    if (spans.length === 1 && spans[0][0] === row.validFrom && spans[0][1] === row.validTo) continue

    const [first, ...rest] = spans
    if (first && first[0] === row.validFrom) {
      end.push({ id: row.id, validTo: first[1]! }) // the original row got shorter (the first span can't still be open-ended)
      add.push(...rest.map(([f, t]) => ({ weekday: row.weekday, start: row.start, validFrom: f, validTo: t })))
    } else {
      remove.push(row.id)
      add.push(...spans.map(([f, t]) => ({ weekday: row.weekday, start: row.start, validFrom: f, validTo: t })))
    }
  }

  for (const row of dated) {
    const cell = { start: row.start, end: addMinutes(row.start, CELL) }
    if (row.date >= today && occupied.some((o) => o.date === row.date && timesOverlap(o, cell))) remove.push(row.id)
  }
  return { end, remove, add }
}

// Merge same-day windows that overlap or touch (Sat 10–14 + Sat 14–18 = 10–18, so a lesson can span both)
export function mergeWindows(ws: { start: string; end: string }[]): { start: string; end: string }[] {
  const sorted = [...ws].sort((a, b) => a.start.localeCompare(b.start))
  const out: { start: string; end: string }[] = []
  for (const w of sorted) {
    const last = out[out.length - 1]
    if (last && w.start <= last.end) {
      if (w.end > last.end) last.end = w.end
    } else {
      out.push({ ...w })
    }
  }
  return out
}

// Start times on this date for a lesson of `minutes` minutes: the whole lesson fits in the teacher's open time
// and touches no busy time. One every STEP minutes from the start of each window
export function freeStarts(windows: Window[], busy: Busy[], date: string, minutes: number): string[] {
  const wd = weekdayOf(date)
  const day = mergeWindows(windows.filter((w) => w.weekday === wd))
  const taken = busy.filter((b) => b.date === date)
  const out: string[] = []
  for (const w of day) {
    for (let t = 0; toMinutes(w.start) + t + minutes <= toMinutes(w.end); t += STEP) {
      const slot = { start: addMinutes(w.start, t), end: addMinutes(w.start, t + minutes) }
      if (!taken.some((b) => timesOverlap(b, slot))) out.push(slot.start)
    }
  }
  return out
}

// Free start times for each day of the two weeks from tomorrow. Days with none are left out
export function freeDays(
  windows: Window[],
  busy: Busy[],
  today: string,
  minutes: number
): { date: string; starts: string[] }[] {
  const out: { date: string; starts: string[] }[] = []
  for (let i = 1; i <= DAYS_AHEAD; i++) {
    const date = addDays(today, i)
    const starts = freeStarts(windows, busy, date, minutes)
    if (starts.length > 0) out.push({ date, starts })
  }
  return out
}

// Whether a requested extra-lesson time is still free (the server checks again before writing: someone may
// have taken it since the page was opened)
export function canAdd(windows: Window[], busy: Busy[], today: string, date: string, start: string, minutes: number): boolean {
  return freeDays(windows, busy, today, minutes).some((d) => d.date === date && d.starts.includes(start))
}

// Busy times: scheduled / held lessons (all students; leave and lessons without a time don't count)
// + others (pending extra-lesson requests, unavailable cells)
export function busyTimes(occurrences: Occurrence[], others: Busy[]): Busy[] {
  const lessons = occurrences
    .filter((o): o is Occurrence & { start: string; end: string } => o.status !== 'leave' && o.start !== null && o.end !== null)
    .map((o) => ({ date: o.date, start: o.start, end: o.end }))
  return [...lessons, ...others]
}

// A student's usual lesson length: the length of the most recently started weekly rule; 2 hours if there is none.
// Proctored sessions (past-paper practice) are skipped: parents request regular lessons
export function usualMinutes(rules: { start: string; end: string; startsOn: string; proctor?: boolean }[]): number {
  const latest = rules.filter((r) => !r.proctor).sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0]
  return latest ? minutesBetween(latest.start, latest.end) : DEFAULT_MINUTES
}

// Lessons a parent can request leave for: this student's scheduled lessons (with a start time) in the next two weeks
export function leaveable(occurrences: Occurrence[], studentId: string, today: string): Occurrence[] {
  const last = addDays(today, DAYS_AHEAD)
  return occurrences.filter(
    (o) => o.studentId === studentId && o.status === 'scheduled' && o.start !== null && o.date >= today && o.date <= last
  )
}

// Notification email to the teacher (extra-lesson request / leave), in the teacher's own language (teacherLocale).
// Plain text only. The parent's message goes into the body as written; it stays out of the subject, and line breaks
// are stripped from the student label so they can't break the mail headers
export function requestMail(r: {
  studentLabel: string | null
  kind: 'add' | 'leave'
  date: string
  start: string
  end: string
  message: string | null
  dashboardUrl: string | null
  teacherLocale: Locale
}): { subject: string; text: string; fromName: string } {
  const t = mail[r.teacherLocale]
  const who = (r.studentLabel ?? t.student).replace(/[\r\n]+/g, ' ')
  const when = `${formatMonthDay(r.date, r.teacherLocale)} ${r.start}–${r.end}`
  // An extra lesson is added only once the teacher approves it; a leave already took effect, so this only informs
  const add = r.kind === 'add'
  return {
    subject: t.subject(who, add, when),
    text: [
      add ? t.addIntro(who) : t.leaveIntro(who),
      when,
      ...(r.message ? ['', t.message(r.message)] : []),
      '',
      add
        ? r.dashboardUrl
          ? t.addLink(r.dashboardUrl)
          : t.addNoLink
        : r.dashboardUrl
          ? t.leaveLink(r.dashboardUrl)
          : t.leaveNoLink,
    ].join('\n'),
    fromName: t.fromName,
  }
}

// The "open" blocks drawn on the parent page's schedule: each free start time extends by one lesson and touching
// ones merge (starts 10:00, 10:30, 11:00 with 2-hour lessons → one block 10:00–13:00). Clicking a block then
// offers its start times
export function freeBlocks(starts: string[], minutes: number): { start: string; end: string; starts: string[] }[] {
  return mergeWindows(starts.map((s) => ({ start: s, end: addMinutes(s, minutes) }))).map((b) => ({
    ...b,
    starts: starts.filter((s) => s >= b.start && addMinutes(s, minutes) <= b.end),
  }))
}
