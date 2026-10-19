'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { toTokyoDate } from '@/lib/progress'
import { BANDS, TRIAL, addMinutes, conflictingRule, hhmm, minutesBetween, planMove, timesOverlap } from '@/lib/schedule'
import { dateOrNull } from '@/lib/form'
import { formatMonthDay, weekdayName } from '@/lib/format'
import { getTeacherLocale } from '@/lib/i18n/server'
import { app } from '@/lib/i18n/messages/app'
import {
  LEAVE,
  NO_PROCTOR_FEE,
  clearBlockedUnderLessons,
  lessonsOn,
  resolve,
  scheduleExtraLesson,
  setTrialLesson,
  studentRates,
  write,
} from '@/lib/lesson-write'

// All scheduling writes, shared by the dashboard and the student page. Everything goes through RLS:
// a teacher can only change their own students' lessons.
//
// A lesson is identified by a key (see Occurrence in lib/schedule.ts):
//   'L:<lesson id>'             a lesson that already has a row
//   'S:<schedule id>:<date>'    a lesson generated from a weekly rule, with no row yet → written to lessons on the first action

const TIME = /^\d{2}:\d{2}$/

function revalidate(studentId: string) {
  revalidatePath('/dashboard')
  revalidatePath(`/students/${studentId}`)
}

// After adding a lesson or rule, return to the page the form is on (keeping the week being viewed). On bad input or a clash,
// pass the reason along so it shows next to the form (a plain throw only shows a generic error in production).
// `back` only accepts the dashboard and student pages, so it can't be used as an open redirect.
function backTo(formData: FormData, error?: { code: string; at?: string }): never {
  const back = String(formData.get('back') ?? '')
  const path = /^\/(dashboard|students\/[0-9a-f-]{36})(\?week=\d{4}-\d{2}-\d{2})?$/.test(back) ? back : '/dashboard'
  // The student page has several forms: say which one so the error shows next to it
  const form = formData.get('form') === 'trial' ? 'trial' : formData.has('weekday') ? 'rule' : 'extra'
  const hash = form === 'trial' ? '#trial' : '#schedule'
  if (!error) redirect(`${path}${hash}`)
  const at = error.at ? `&at=${encodeURIComponent(error.at)}` : ''
  redirect(`${path}${path.includes('?') ? '&' : '?'}scheduleError=${form}.${error.code}${at}${hash}`)
}

// Mark as done (online=1: taught online, billed at the online rate)
export async function markDone(formData: FormData) {
  const supabase = await createClient()
  const r = await resolve(supabase, String(formData.get('key') ?? ''))
  const online = !r.trial && !r.proctor && formData.get('online') === '1'
  const rates = r.trial ? null : await studentRates(supabase, r.studentId)
  if (r.proctor && rates!.proctorFee === null) throw new Error(NO_PROCTOR_FEE)
  await write(supabase, r, {
    status: 'done',
    billable: true,
    online,
    // Trial lessons are a fixed 1 hour at ¥1,000; regular lessons are scheduled time × the student's hourly rate
    // (a snapshot; online lessons use the online rate). Proctoring is billed per session: snapshot the student's
    // current proctoring fee and still record the duration.
    duration_min: r.trial ? TRIAL.minutes : r.start && r.end ? minutesBetween(r.start, r.end) : null,
    rate_per_hour: r.trial ? TRIAL.ratePerHour : r.proctor ? null : online ? rates!.onlineRate : rates!.rate,
    proctor_fee: r.proctor ? rates!.proctorFee : null,
    cancel_reason: null,
  })
  revalidate(r.studentId)
}

// Leave: the lesson disappears from the timetable, today's lessons and the parent page (it looks deleted), but a 'leave'
// row is kept, because cancellations must leave a trace: the missed-lessons alert and the cancellation rate both count it.
// A make-up at another time is added separately as an extra lesson. Deleting this row undoes the leave.
export async function markLeave(formData: FormData) {
  const supabase = await createClient()
  const r = await resolve(supabase, String(formData.get('key') ?? ''))
  await write(supabase, r, LEAVE)
  revalidate(r.studentId)
}

// Move one upcoming lesson (this occurrence only; the weekly time stays). restore=1 moves it back to its original time.
// It is still a scheduled lesson afterwards: done / online / leave work as usual, the fee follows the new duration,
// and it doesn't count as a leave. The first move of a rule-generated lesson writes a row recording the original date and
// times (so the rule no longer produces a lesson on the original day); moving it back deletes that row.
// Trial lessons are a fixed 1 hour, so only the start time matters.
// If another lesson of this student that day (leave excluded) overlaps the new time, nothing changes and the clash is reported.
export type MoveState = { error?: string; saved?: number }

export async function moveLesson(_prev: MoveState, formData: FormData): Promise<MoveState> {
  const supabase = await createClient()
  const locale = await getTeacherLocale()
  const t = app[locale].move
  const r = await resolve(supabase, String(formData.get('key') ?? ''))
  const { data: row, error: e0 } = r.lessonId
    ? await supabase.from('lessons').select('status, moved_from, moved_from_start, moved_from_end').eq('id', r.lessonId).single()
    : { data: null, error: null }
  if (e0) throw e0
  if (row && row.status !== 'scheduled') return { error: t.recorded }
  const current = {
    date: r.date,
    start: r.start,
    end: r.end,
    movedFrom: row?.moved_from ?? null,
    movedFromStart: hhmm(row?.moved_from_start ?? null),
    movedFromEnd: hhmm(row?.moved_from_end ?? null),
    fromRule: r.scheduleId !== null,
  }

  let next: { date: string; start: string; end: string }
  if (formData.get('restore') === '1') {
    if (!current.movedFrom || !current.movedFromStart || !current.movedFromEnd) return { error: t.notMoved }
    next = { date: current.movedFrom, start: current.movedFromStart, end: current.movedFromEnd }
  } else {
    const date = dateOrNull(formData, 'date')
    const start = String(formData.get('start') ?? '')
    const end = r.trial && TIME.test(start) ? addMinutes(start, TRIAL.minutes) : String(formData.get('end') ?? '')
    if (!date) return { error: t.pickDate }
    if (!TIME.test(start) || !TIME.test(end)) return { error: t.needTimes }
    if (end <= start) return { error: t.timeOrder }
    next = { date, start, end }
  }

  const plan = planMove(current, next)
  if (plan === 'same') return { saved: Date.now() }

  const { open, recorded } = await lessonsOn(supabase, r.studentId, next.date)
  const self = [`L:${r.lessonId}`, `S:${r.scheduleId}:${r.date}`]
  const hit = [...open, ...recorded].find(
    (o) => !self.includes(o.key) && o.status !== 'leave' && o.start !== null && o.end !== null && timesOverlap({ start: o.start, end: o.end }, next)
  )
  if (hit) return { error: t.clash(formatMonthDay(next.date, locale), hit.start!, hit.end!) }

  const { error } =
    plan === 'delete'
      ? await supabase.from('lessons').delete().eq('id', r.lessonId!).eq('status', 'scheduled')
      : r.lessonId
        ? await supabase.from('lessons').update(plan).eq('id', r.lessonId).eq('status', 'scheduled')
        : await supabase
            .from('lessons')
            .insert({ student_id: r.studentId, schedule_id: r.scheduleId, proctor: r.proctor, status: 'scheduled', ...plan })
  // 23505 = the lesson was recorded in the meantime (e.g. the parent requested leave at the same moment)
  if (error?.code === '23505') return { error: t.justRecorded }
  if (error) throw error
  await clearBlockedUnderLessons(supabase) // clear any 'unavailable' marks under the new time
  revalidate(r.studentId)
  return { saved: Date.now() }
}

// Undo (after a mis-click): a rule-generated lesson's row is deleted, so it is generated from the rule again;
// extra and moved lessons go back to scheduled (a moved lesson keeps its new time). If the row points to a lesson created
// by a reschedule (older data) that hasn't happened yet, that lesson is removed too.
// Leave requested on the parent page is undone the same way (its leave request is deleted too).
export async function resetOccurrence(formData: FormData) {
  const supabase = await createClient()
  const id = String(formData.get('lessonId') ?? '')
  const { data: l, error } = await supabase
    .from('lessons')
    .select('id, student_id, schedule_id, rescheduled_to, status, date, start_time, moved_from')
    .eq('id', id)
    .single()
  if (error) throw error

  // Undoing leave requested on the parent page: delete that leave request too (the parent page stops showing it and the dashboard alert goes away)
  if (l.status === 'leave' && l.start_time) {
    const { error: e } = await supabase
      .from('lesson_requests')
      .delete()
      .eq('student_id', l.student_id)
      .eq('kind', 'leave')
      .eq('date', l.date)
      .eq('start_time', l.start_time)
    if (e) throw e
  }

  if (l.rescheduled_to) {
    const { error: e } = await supabase
      .from('lessons')
      .delete()
      .eq('id', l.rescheduled_to)
      .eq('status', 'scheduled')
    if (e) throw e
  }
  const { error: e2 } = l.schedule_id && !l.moved_from
    ? await supabase.from('lessons').delete().eq('id', l.id)
    : await supabase
        .from('lessons')
        .update({
          status: 'scheduled',
          billable: true,
          duration_min: null,
          rate_per_hour: null,
          proctor_fee: null,
          cancel_reason: null,
          rescheduled_to: null,
        })
        .eq('id', l.id)
  if (e2) throw e2
  await clearBlockedUnderLessons(supabase) // undoing leave: the lesson is back, so that slot is no longer unavailable
  revalidate(l.student_id)
}

// Use the typed start/end times if given (even if the dropdown wasn't switched to "Other time"); otherwise use the selected slot
function timesFrom(formData: FormData): { start: string; end: string } {
  const start = String(formData.get('start') ?? '')
  const end = String(formData.get('end') ?? '')
  const band = String(formData.get('band') ?? '')
  if (start === '' && end === '' && band !== 'custom') {
    const b = BANDS[Number(band)]
    if (!b) throw new Error('Invalid time slot')
    return { start: b.start, end: b.end }
  }
  if (!TIME.test(start) || !TIME.test(end)) backTo(formData, { code: 'time-missing' })
  if (end <= start) backTo(formData, { code: 'time-order' })
  return { start, end }
}

// Proctoring (proctor=1) needs a proctoring fee set for the student; without one, return to the form with the reason
async function checkProctor(supabase: Awaited<ReturnType<typeof createClient>>, formData: FormData, studentId: string): Promise<boolean> {
  if (formData.get('proctor') !== '1') return false
  const { proctorFee } = await studentRates(supabase, studentId)
  if (proctorFee === null) backTo(formData, { code: 'no-proctor-fee' })
  return true
}

// Add a one-off lesson. Skipped if the student already has a lesson at that time on that day (prevents duplicates)
export async function addExtraLesson(formData: FormData) {
  const studentId = String(formData.get('studentId') ?? '')
  const date = dateOrNull(formData, 'date')
  if (!date) throw new Error('Pick a date')
  const { start, end } = timesFrom(formData)
  const supabase = await createClient()
  const proctor = await checkProctor(supabase, formData, studentId)
  const { conflict } = await scheduleExtraLesson(supabase, { studentId, date, start, end, proctor })
  if (conflict) backTo(formData, { code: 'overlap', at: `${date.slice(5).replace('-', '/')} ${conflict.start}–${conflict.end}` })
  await clearBlockedUnderLessons(supabase)
  revalidate(studentId)
  backTo(formData)
}

// Schedule or change the trial lesson (from the alert at the top of the student page). Fixed 1 hour; only the start time is entered
export async function setTrial(formData: FormData) {
  const studentId = String(formData.get('studentId') ?? '')
  const date = dateOrNull(formData, 'date')
  const start = String(formData.get('start') ?? '')
  if (!date || !TIME.test(start)) backTo(formData, { code: 'time-missing' })
  const supabase = await createClient()
  const { done, conflict } = await setTrialLesson(supabase, { studentId, date, start })
  if (done) backTo(formData, { code: 'trial-done' })
  if (conflict) backTo(formData, { code: 'overlap', at: `${date.slice(5).replace('-', '/')} ${conflict.start}–${conflict.end}` })
  await clearBlockedUnderLessons(supabase)
  revalidate(studentId)
  backTo(formData)
}

// ── Weekly times ─────────────────────────────────────────

export async function addRule(formData: FormData) {
  const studentId = String(formData.get('studentId') ?? '')
  const weekday = Number(formData.get('weekday'))
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error('Invalid weekday')
  const { start, end } = timesFrom(formData)
  const startsOn = dateOrNull(formData, 'starts_on') ?? toTokyoDate(new Date())
  const supabase = await createClient()
  const proctor = await checkProctor(supabase, formData, studentId)
  const { data: rules, error: e0 } = await supabase
    .from('schedules')
    .select('id, weekday, start_time, end_time, starts_on, ends_on')
    .eq('student_id', studentId)
  if (e0) throw e0
  const hit = conflictingRule(
    rules.map((r) => ({ id: r.id, studentId, weekday: r.weekday, start: hhmm(r.start_time)!, end: hhmm(r.end_time)!, startsOn: r.starts_on, endsOn: r.ends_on })),
    { weekday, start, end, startsOn }
  )
  if (hit) {
    const locale = await getTeacherLocale()
    backTo(formData, { code: 'rule-overlap', at: app[locale].weeklyAt(weekdayName(hit.weekday, locale), hit.start, hit.end) })
  }
  const { error } = await supabase
    .from('schedules')
    .insert({ student_id: studentId, weekday, start_time: start, end_time: end, starts_on: startsOn, proctor })
  if (error) throw error
  await clearBlockedUnderLessons(supabase)
  revalidate(studentId)
  backTo(formData)
}

// Stop: no lessons from tomorrow on (today's lesson stays) and past records are unaffected. A rule that hasn't started yet is deleted
export async function stopRule(formData: FormData) {
  const id = String(formData.get('ruleId') ?? '')
  const supabase = await createClient()
  const today = toTokyoDate(new Date())
  const { data: rule, error: e0 } = await supabase.from('schedules').select('student_id, starts_on').eq('id', id).single()
  if (e0) throw e0
  const { error } =
    rule.starts_on > today
      ? await supabase.from('schedules').delete().eq('id', id)
      : await supabase.from('schedules').update({ ends_on: today }).eq('id', id)
  if (error) throw error
  revalidate(rule.student_id)
}

// Delete (for a rule added by mistake): recorded lessons stay but are no longer linked to the rule
export async function deleteRule(formData: FormData) {
  const id = String(formData.get('ruleId') ?? '')
  const supabase = await createClient()
  const { data, error } = await supabase.from('schedules').delete().eq('id', id).select('student_id')
  if (error) throw error
  if (data.length === 0) throw new Error('Rule not found or not allowed to delete')
  revalidate(data[0].student_id)
}
