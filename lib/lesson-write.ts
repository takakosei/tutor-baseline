import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './supabase/database.types'
import { TRIAL, addMinutes, expandOccurrences, hhmm, lessonsWindow, minutesBetween, ruleActiveOn, ruleDay, timesOverlap } from './schedule'
import { clearUnderLessons } from './booking'
import { toTokyoDate } from './progress'

// Shared logic for writing a lesson. Both the web app (Server Actions) and the Claude Desktop assistant
// (mcp/server.mts) use it, so the logging rules (match the lesson already scheduled that day, snapshot the rate,
// leave is never billed) live in one place. The supabase client passed in carries the teacher's session, so every
// read and write goes through RLS.
// A lesson is addressed by a key: 'L:<lesson id>' = an existing row; 'S:<schedule id>:<date>' = derived from a
// weekly rule, not stored yet

export type Supabase = SupabaseClient<Database>

// In-person and online hourly rates (online unset = same as in-person), and the fee per proctored session
// (unset = null, and a proctored session can't be logged as held)
export async function studentRates(
  supabase: Supabase,
  studentId: string
): Promise<{ rate: number | null; onlineRate: number | null; proctorFee: number | null }> {
  const { data, error } = await supabase
    .from('students')
    .select('rate_per_hour, online_rate_per_hour, proctor_fee')
    .eq('id', studentId)
    .single()
  if (error) throw error
  return { rate: data.rate_per_hour, onlineRate: data.online_rate_per_hour ?? data.rate_per_hour, proctorFee: data.proctor_fee }
}

// A billable proctored session needs a fee. Without one it isn't logged (the amount would be 0); the teacher sets
// the fee in the student profile first
export const NO_PROCTOR_FEE = 'This student has no proctoring fee yet. Set "Proctoring fee per session" in the student profile (Edit) first'

export type Resolved = {
  lessonId: string | null
  studentId: string
  date: string
  start: string | null
  end: string | null
  scheduleId: string | null
  trial: boolean
  proctor: boolean // proctored session
}

export async function resolve(supabase: Supabase, key: string): Promise<Resolved> {
  if (key.startsWith('L:')) {
    const { data, error } = await supabase
      .from('lessons')
      .select('id, student_id, date, start_time, end_time, schedule_id, trial, proctor')
      .eq('id', key.slice(2))
      .single()
    if (error) throw error
    return {
      lessonId: data.id,
      studentId: data.student_id,
      date: data.date,
      start: data.start_time?.slice(0, 5) ?? null,
      end: data.end_time?.slice(0, 5) ?? null,
      scheduleId: data.schedule_id,
      trial: data.trial,
      proctor: data.proctor,
    }
  }
  const [, scheduleId, date] = key.split(':')
  if (!scheduleId || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new Error('Invalid lesson')
  const { data, error } = await supabase
    .from('schedules')
    .select('id, student_id, start_time, end_time, proctor')
    .eq('id', scheduleId)
    .single()
  if (error) throw error
  return {
    lessonId: null,
    studentId: data.student_id,
    date,
    start: data.start_time.slice(0, 5),
    end: data.end_time.slice(0, 5),
    scheduleId: data.id,
    trial: false,
    proctor: data.proctor,
  }
}

export type LessonPatch = {
  status: string
  start_time?: string
  end_time?: string
  billable?: boolean
  online?: boolean
  duration_min?: number | null
  rate_per_hour?: number | null
  proctor_fee?: number | null // proctoring fee snapshot
  cancel_reason?: string | null
  rescheduled_to?: string | null
  note?: string | null
  parent_summary?: string | null
  mood?: number | null
}

// Leave: not billed, no duration. Used by the dashboard's Leave button and when approving a parent's leave request
export const LEAVE: LessonPatch = {
  status: 'leave',
  billable: false,
  online: false,
  duration_min: null,
  rate_per_hour: null,
  proctor_fee: null,
  cancel_reason: null,
}

// Updates an existing row; for a rule-derived lesson, inserts one (with its rule, times and proctor flag). Returns the lesson id
export async function write(supabase: Supabase, r: Resolved, patch: LessonPatch): Promise<string> {
  if (r.lessonId) {
    const { error } = await supabase.from('lessons').update(patch).eq('id', r.lessonId)
    if (error) throw error
    return r.lessonId
  }
  const { data, error } = await supabase
    .from('lessons')
    .insert({
      student_id: r.studentId,
      date: r.date,
      schedule_id: r.scheduleId,
      start_time: r.start,
      end_time: r.end,
      proctor: r.proctor,
      ...patch,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

type Slot = { key: string; start: string | null; end: string | null; status: string; proctor: boolean }

// This student's lessons on this date, in two groups:
// open = not logged yet (rule-derived lessons with no row yet + one-off lessons with status = scheduled)
// recorded = already logged (held / leave), e.g. marked held on the dashboard first
export async function lessonsOn(
  supabase: Supabase,
  studentId: string,
  date: string
): Promise<{ open: Slot[]; recorded: Slot[] }> {
  const [rules, rows] = await Promise.all([
    supabase.from('schedules').select('id, weekday, start_time, end_time, starts_on, ends_on, proctor').eq('student_id', studentId),
    // Lessons on this date, plus lessons originally on this date that were moved elsewhere (their rule has no lesson here then)
    supabase
      .from('lessons')
      .select('id, date, status, start_time, end_time, schedule_id, proctor, moved_from')
      .eq('student_id', studentId)
      .or(lessonsWindow(date, date)),
  ])
  if (rules.error) throw rules.error
  if (rows.error) throw rows.error
  const taken = new Set(rows.data.map((l) => ruleDay({ scheduleId: l.schedule_id, date: l.date, movedFrom: l.moved_from })))
  const stored = rows.data.filter((l) => l.date === date)
  const slot = (l: (typeof stored)[number]): Slot => ({
    key: `L:${l.id}`,
    start: l.start_time?.slice(0, 5) ?? null,
    end: l.end_time?.slice(0, 5) ?? null,
    status: l.status,
    proctor: l.proctor,
  })
  return {
    open: [
      ...rules.data
        .filter(
          (r) =>
            !taken.has(`${r.id}:${date}`) &&
            ruleActiveOn(
              { id: r.id, studentId, weekday: r.weekday, start: r.start_time, end: r.end_time, startsOn: r.starts_on, endsOn: r.ends_on },
              date
            )
        )
        .map((r) => ({
          key: `S:${r.id}:${date}`,
          start: r.start_time.slice(0, 5),
          end: r.end_time.slice(0, 5),
          status: 'scheduled',
          proctor: r.proctor,
        })),
      ...stored.filter((l) => l.status === 'scheduled').map(slot),
    ],
    recorded: stored.filter((l) => l.status === 'done' || l.status === 'leave').map(slot),
  }
}

// Which lesson to log onto when none is named: first the unlogged ones, then the logged ones (to add notes rather
// than create a second row). With a start time, lessons starting then come first; if none match, a lesson with no
// time counts too (its time is filled in rather than creating a row). With proctor given, only that kind is
// considered (proctoring on Sunday morning and a lesson in the afternoon: "log the proctored session" matches the
// morning). null = no matching lesson that day (create one); 'ambiguous' = several match, a start time is needed
export function pickLesson(
  open: (Pick<Slot, 'key' | 'start'> & { proctor?: boolean })[],
  recorded: (Pick<Slot, 'key' | 'start'> & { proctor?: boolean })[],
  start: string | null,
  proctor?: boolean
): string | null | 'ambiguous' {
  const kind = (o: { proctor?: boolean }) => proctor === undefined || (o.proctor ?? false) === proctor
  for (const list of [open.filter(kind), recorded.filter(kind)]) {
    const exact = start ? list.filter((o) => o.start === start) : list
    const match = exact.length > 0 || !start ? exact : list.filter((o) => o.start === null)
    if (match.length === 1) return match[0].key
    if (match.length > 1) return 'ambiguous'
  }
  return null
}

// Start / end times to write: a lesson that already has times keeps them; one without gets the given start time
// (end: the given end, else start + duration, else start + 120 minutes)
export function lessonTimes(
  existing: { start: string | null } | null,
  input: { start?: string | null; end?: string | null },
  durationMin: number | null
): { start_time?: string; end_time?: string } {
  if (existing?.start || !input.start) return {}
  return { start_time: input.start, end_time: input.end ?? addMinutes(input.start, durationMin ?? 120) }
}

export type LessonLog = {
  studentId: string
  date: string
  status: 'done' | 'leave'
  durationMin?: number | null // omitted: a logged lesson keeps its duration, otherwise the scheduled length is used
  defaultMinutes?: number | null // duration when neither exists (nothing scheduled that day). The web quick log passes 120
  mood?: number | null
  billable?: boolean // only meaningful for held lessons; leave is never billed
  note?: string | null
  parentSummary?: string | null
  reason?: string | null // reason for leave
  key?: string | null // set when opened from a specific lesson; otherwise that day's lesson is found automatically (pickLesson)
  start?: string | null // picks the lesson by start time when the day has several; written to a lesson that had no time
  end?: string | null // end time (defaults to start + duration)
  online?: boolean // online lesson (omitted: a logged lesson keeps its value, a new one is in person)
  proctor?: boolean // proctored: only proctored / only regular lessons are matched that day, and a new row is that kind.
  // Omitted = no filter (a new row is a regular lesson)
}

export type LessonRow = {
  status: string
  billable: boolean
  online?: boolean
  rate_per_hour: number | null
  proctor_fee?: number | null
  duration_min: number | null
  mood: number | null
  note: string | null
  parent_summary: string | null
  cancel_reason: string | null
}

// The fields to write. On an existing row, anything not given this time keeps its old value (e.g. the duration
// recorded when the lesson was marked held on the dashboard); anything given overwrites it. Leave is never billed
// and has no duration, mood or parent summary.
// A trial lesson is a fixed 1 hour at ¥1,000: whatever length is entered, it's logged as 60 minutes × ¥1,000/hour.
// Proctored sessions are billed per session: the amount is the fee snapshot (proctor_fee), not an hourly rate,
// and they're never online. The duration is still recorded
export function mergeLog(
  input: LessonLog,
  prev: LessonRow | null,
  scheduledMin: number | null,
  rate: number | null,
  trial = false,
  onlineRate: number | null = rate, // online hourly rate (unset = same as in-person)
  proctor = false,
  proctorFee: number | null = null // the student's current proctoring fee
) {
  const held = input.status === 'done'
  const wasHeld = prev?.status === 'done' ? prev : null
  const wasLeave = prev?.status === 'leave' ? prev : null
  const billable = held && (input.billable ?? wasHeld?.billable ?? true)
  const online = held && !proctor && (input.online ?? wasHeld?.online ?? false)
  // Rate snapshot: a logged lesson keeps its rate (later price changes don't affect it); switching between in-person
  // and online takes a fresh snapshot of the current rate
  const kept = wasHeld?.billable && (wasHeld.online ?? false) === online ? wasHeld.rate_per_hour : null
  const keptFee = wasHeld?.billable ? (wasHeld.proctor_fee ?? null) : null
  return {
    status: input.status,
    billable,
    online,
    rate_per_hour: !billable || proctor ? null : trial ? TRIAL.ratePerHour : (kept ?? (online ? onlineRate : rate)), // rate snapshot
    proctor_fee: billable && proctor ? (keptFee ?? proctorFee) : null, // proctoring fee snapshot
    note: input.note ?? prev?.note ?? null,
    duration_min: !held
      ? null
      : trial
        ? TRIAL.minutes
        : (input.durationMin ?? wasHeld?.duration_min ?? scheduledMin ?? input.defaultMinutes ?? null),
    mood: held ? (input.mood ?? wasHeld?.mood ?? null) : null,
    parent_summary: held ? (input.parentSummary ?? wasHeld?.parent_summary ?? null) : null,
    cancel_reason: held ? null : (input.reason ?? wasLeave?.cancel_reason ?? null),
  }
}

export type LogOutcome =
  | {
      mode: 'planned' | 'recorded' | 'new' // onto a scheduled lesson / onto an already-logged row / a new row
      start: string | null
      end: string | null
    }
  | { mode: 'ambiguous'; times: string[] } // several lessons match that day and nothing was written: a start time is needed

// Logs a lesson. If a lesson is scheduled that day it's logged onto that one (a separate row would leave the
// scheduled one showing as unlogged); if it's already logged (e.g. marked held first) the row is updated; only
// when the day has no lesson is a new row created
export async function logLesson(supabase: Supabase, input: LessonLog): Promise<LogOutcome> {
  let key = input.key ?? null
  let mode: LogOutcome['mode'] = 'planned'
  if (!key) {
    const { open, recorded } = await lessonsOn(supabase, input.studentId, input.date)
    const picked = pickLesson(open, recorded, input.start ?? null, input.proctor)
    if (picked === 'ambiguous') {
      return { mode: 'ambiguous', times: [...open, ...recorded].map((o) => `${o.start ?? '?'}–${o.end ?? '?'}`) }
    }
    key = picked
    mode = picked === null ? 'new' : open.some((o) => o.key === picked) ? 'planned' : 'recorded'
  }
  const r = key ? await resolve(supabase, key) : null
  if (r && (r.studentId !== input.studentId || r.date !== input.date)) throw new Error('This lesson does not belong to this student or date')

  let prev: LessonRow | null = null
  if (r?.lessonId) {
    const { data, error } = await supabase
      .from('lessons')
      .select('status, billable, online, rate_per_hour, proctor_fee, duration_min, mood, note, parent_summary, cancel_reason')
      .eq('id', r.lessonId)
      .single()
    if (error) throw error
    prev = data
  }
  const trial = r?.trial ?? false
  const proctor = r?.proctor ?? input.proctor ?? false
  const rates =
    input.status === 'done' && !trial ? await studentRates(supabase, input.studentId) : { rate: null, onlineRate: null, proctorFee: null }
  const scheduledMin = r?.start && r?.end ? minutesBetween(r.start, r.end) : null
  const fields = mergeLog(input, prev, scheduledMin, rates.rate, trial, rates.onlineRate, proctor, rates.proctorFee)
  if (proctor && fields.billable && fields.proctor_fee === null) throw new Error(NO_PROCTOR_FEE)
  // For a new row, or one without times, write the times given now
  const times = lessonTimes(r, input, fields.duration_min ?? input.durationMin ?? input.defaultMinutes ?? null)

  if (r) {
    await write(supabase, r, { ...fields, ...times })
  } else {
    const { error } = await supabase.from('lessons').insert({ student_id: input.studentId, date: input.date, proctor, ...fields, ...times })
    if (error) throw error
  }
  return { mode, start: r?.start ?? times.start_time ?? null, end: r?.end ?? times.end_time ?? null }
}

// Adds a one-off lesson (not weekly). If the student already has an overlapping lesson that day (scheduled or held;
// leave doesn't count) nothing is added and the clashing lesson is returned, so the same lesson can't be added twice.
// Shared by the web app and the assistant.
// proctor = proctored session (the caller checks first that the student has a proctoring fee)
export async function scheduleExtraLesson(
  supabase: Supabase,
  input: { studentId: string; date: string; start: string; end: string; proctor?: boolean }
): Promise<{ conflict: { start: string; end: string } | null }> {
  const { open, recorded } = await lessonsOn(supabase, input.studentId, input.date)
  const hit = [...open, ...recorded].find(
    (o): o is Slot & { start: string; end: string } =>
      o.status !== 'leave' && o.start !== null && o.end !== null && timesOverlap({ start: o.start, end: o.end }, input)
  )
  if (hit) return { conflict: { start: hit.start, end: hit.end } }
  const { error } = await supabase
    .from('lessons')
    .insert({
      student_id: input.studentId,
      date: input.date,
      status: 'scheduled',
      start_time: input.start,
      end_time: input.end,
      proctor: input.proctor ?? false,
    })
  if (error) throw error
  return { conflict: null }
}

// Schedules or moves the trial lesson (one per student, fixed at 1 hour): creates it if there is none; if it's
// scheduled or on leave, changes its date and time (leave goes back to scheduled). A held trial is left alone.
// If another lesson of the student clashes that day nothing changes and the clashing lesson is returned
export async function setTrialLesson(
  supabase: Supabase,
  input: { studentId: string; date: string; start: string }
): Promise<{ done: boolean; conflict: { start: string; end: string } | null }> {
  const end = addMinutes(input.start, TRIAL.minutes)
  const { data: existing, error: e0 } = await supabase
    .from('lessons')
    .select('id, status')
    .eq('student_id', input.studentId)
    .eq('trial', true)
    .maybeSingle()
  if (e0) throw e0
  if (existing?.status === 'done') return { done: true, conflict: null }

  const { open, recorded } = await lessonsOn(supabase, input.studentId, input.date)
  const hit = [...open, ...recorded].find(
    (o): o is Slot & { start: string; end: string } =>
      o.key !== `L:${existing?.id}` &&
      o.status !== 'leave' &&
      o.start !== null &&
      o.end !== null &&
      timesOverlap({ start: o.start, end: o.end }, { start: input.start, end })
  )
  if (hit) return { done: false, conflict: { start: hit.start, end: hit.end } }

  const planned = { date: input.date, start_time: input.start, end_time: end, status: 'scheduled' }
  const { error } = existing
    ? await supabase
        .from('lessons')
        .update({ ...planned, billable: true, duration_min: null, rate_per_hour: null, cancel_reason: null })
        .eq('id', existing.id)
    : await supabase.from('lessons').insert({ ...planned, student_id: input.studentId, trial: true })
  if (error) throw error
  return { done: false, conflict: null }
}

// A cell holds either a lesson or "unavailable": removes unavailable cells (blocked_times) under lessons (the
// calculation is clearUnderLessons in lib/booking.ts). Called after adding a lesson or weekly time, scheduling a
// trial, changing a time, undoing a leave, approving an extra lesson and saving unavailable cells (shared by the web
// app and the assistant). Goes through RLS, so it only touches the teacher's own rows
export async function clearBlockedUnderLessons(supabase: Supabase): Promise<void> {
  const today = toTokyoDate(new Date())
  const { data: blocked, error: e0 } = await supabase
    .from('blocked_times')
    .select('id, owner_id, weekday, date, start_time, valid_from, valid_to')
    .or(`and(weekday.not.is.null,or(valid_to.is.null,valid_to.gte.${today})),date.gte.${today}`)
  if (e0) throw e0
  if (blocked.length === 0) return

  const [rules, lessons] = await Promise.all([
    supabase.from('schedules').select('id, student_id, weekday, start_time, end_time, starts_on, ends_on').or(`ends_on.is.null,ends_on.gte.${today}`),
    supabase.from('lessons').select('id, student_id, date, status, start_time, end_time, schedule_id, moved_from').or(lessonsWindow(today)),
  ])
  if (rules.error) throw rules.error
  if (lessons.error) throw lessons.error

  const ruleList = rules.data.map((r) => ({
    id: r.id,
    studentId: r.student_id,
    weekday: r.weekday,
    start: hhmm(r.start_time)!,
    end: hhmm(r.end_time)!,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
  }))
  const stored = lessons.data.map((l) => ({
    id: l.id,
    studentId: l.student_id,
    date: l.date,
    status: l.status,
    start: hhmm(l.start_time),
    end: hhmm(l.end_time),
    scheduleId: l.schedule_id,
    movedFrom: l.moved_from,
  }))
  // Expand as far as the latest single-date unavailable cell or one-off lesson
  const horizon = [today, ...blocked.map((b) => b.date ?? today), ...stored.map((l) => l.date)].sort().at(-1)!
  const occupied = expandOccurrences(ruleList, stored, today, horizon)
    .filter((o): o is typeof o & { start: string; end: string } => (o.status === 'scheduled' || o.status === 'done') && o.start !== null && o.end !== null)
    .map((o) => ({ date: o.date, start: o.start, end: o.end, fromRule: o.scheduleId !== null }))

  const weekly = blocked.filter((b) => b.weekday !== null)
  const plan = clearUnderLessons(
    weekly.map((b) => ({ id: b.id, weekday: b.weekday!, start: hhmm(b.start_time)!, validFrom: b.valid_from!, validTo: b.valid_to })),
    blocked.filter((b) => b.date !== null).map((b) => ({ id: b.id, date: b.date!, start: hhmm(b.start_time)! })),
    ruleList,
    occupied,
    today
  )
  if (plan.end.length + plan.remove.length + plan.add.length === 0) return

  // Shorten / delete the old rows before adding new ones (a cell can have only one open-ended row at a time)
  for (const e of plan.end) {
    const { error } = await supabase.from('blocked_times').update({ valid_to: e.validTo }).eq('id', e.id)
    if (error) throw error
  }
  if (plan.remove.length > 0) {
    const { error } = await supabase.from('blocked_times').delete().in('id', plan.remove)
    if (error) throw error
  }
  if (plan.add.length > 0) {
    const owner = weekly[0]?.owner_id ?? blocked[0].owner_id
    const { error } = await supabase
      .from('blocked_times')
      .insert(plan.add.map((a) => ({ owner_id: owner, weekday: a.weekday, date: null, start_time: a.start, valid_from: a.validFrom, valid_to: a.validTo })))
    if (error) throw error
  }
}

