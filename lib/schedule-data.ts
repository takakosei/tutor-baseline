// Schedule reads (server side, with the teacher's session, through RLS). The calculations are in lib/schedule.ts.

import { createClient } from './supabase/server'
import { hhmm, lessonsWindow, toBillingLesson, type BillingLesson, type ScheduleRule, type StoredLesson } from './schedule'

export async function loadScheduleWindow(from: string, to: string, studentId?: string) {
  const supabase = await createClient()
  let rulesQ = supabase
    .from('schedules')
    .select('id, student_id, weekday, start_time, end_time, starts_on, ends_on, proctor')
    .lte('starts_on', to)
    .or(`ends_on.is.null,ends_on.gte.${from}`)
  let lessonsQ = supabase
    .from('lessons')
    .select('id, student_id, date, status, start_time, end_time, schedule_id, trial, online, proctor, moved_from, moved_from_start, moved_from_end')
    .or(lessonsWindow(from, to)) // include lessons moved out of the range too (so the original day doesn't reappear from the rule)
  if (studentId) {
    rulesQ = rulesQ.eq('student_id', studentId)
    lessonsQ = lessonsQ.eq('student_id', studentId)
  }
  const [rules, lessons] = await Promise.all([rulesQ, lessonsQ])
  if (rules.error) throw rules.error
  if (lessons.error) throw lessons.error

  return {
    rules: rules.data.map(
      (r): ScheduleRule => ({
        id: r.id,
        studentId: r.student_id,
        weekday: r.weekday,
        start: hhmm(r.start_time)!,
        end: hhmm(r.end_time)!,
        startsOn: r.starts_on,
        endsOn: r.ends_on,
        proctor: r.proctor,
      })
    ),
    lessons: lessons.data.map(
      (l): StoredLesson => ({
        id: l.id,
        studentId: l.student_id,
        date: l.date,
        status: l.status,
        start: hhmm(l.start_time),
        end: hhmm(l.end_time),
        scheduleId: l.schedule_id,
        trial: l.trial,
        online: l.online,
        proctor: l.proctor,
        movedFrom: l.moved_from,
        movedFromStart: hhmm(l.moved_from_start),
        movedFromEnd: hhmm(l.moved_from_end),
      })
    ),
  }
}

// For hours and amounts: every lesson that has happened (scheduled ones haven't, so they're left out)
export async function loadBillingLessons(studentId?: string): Promise<BillingLesson[]> {
  const supabase = await createClient()
  let q = supabase
    .from('lessons')
    .select('student_id, date, status, duration_min, start_time, end_time, billable, rate_per_hour, trial, online, proctor, proctor_fee')
    .neq('status', 'scheduled')
  if (studentId) q = q.eq('student_id', studentId)
  const { data, error } = await q
  if (error) throw error
  return data.map((l) => toBillingLesson(l, l.student_id))
}
