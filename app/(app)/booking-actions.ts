'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LEAVE, clearBlockedUnderLessons, lessonsOn, resolve, scheduleExtraLesson, write } from '@/lib/lesson-write'
import { expandOccurrences, hhmm, timesOverlap } from '@/lib/schedule'
import { addDays } from '@/lib/analytics'
import { cellStarts, planWeekly } from '@/lib/booking'
import { toTokyoDate } from '@/lib/progress'
import { loadScheduleWindow } from '@/lib/schedule-data'

// The teacher's side of parent requests (extra lessons / leave): handle the dashboard alerts, mark unavailable times,
// and open or close extra-lesson requests on the parent page. Everything goes through RLS.
// Extra lesson → "Accept" adds a lesson, unless any student already has one at that time (the teacher can't be in two
// places); "Decline" dismisses it.
// Leave → already recorded as leave on the parent's side, so the teacher only acknowledges and dismisses the alert
// (accepting a pending leave request is still supported for older requests).
// If a request can't be handled (a clash, or the lesson is gone), the alert stays and the dashboard shows why.

function back(anchor: string, error?: { code: string; at?: string }): never {
  revalidatePath('/dashboard')
  if (!error) redirect(`/dashboard#${anchor}`)
  const at = error.at ? `&at=${encodeURIComponent(error.at)}` : ''
  redirect(`/dashboard?bookingError=${error.code}${at}#${anchor}`)
}

async function pendingRequest(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lesson_requests')
    .select('id, student_id, kind, date, start_time, end_time, status')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data?.status === 'pending' ? data : null
}

async function decide(id: string, status: 'accepted' | 'declined') {
  const supabase = await createClient()
  const { error } = await supabase
    .from('lesson_requests')
    .update({ status, decided_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
  if (error) throw error
  await cleanup()
}

// Keep requests from piling up: delete those dated more than 30 days ago (handled ones are already hidden, just still stored).
// Runs whenever the teacher handles an alert.
async function cleanup() {
  const supabase = await createClient()
  const { error } = await supabase.from('lesson_requests').delete().lt('date', addDays(toTokyoDate(new Date()), -30))
  if (error) throw error
}

export async function acceptRequest(formData: FormData) {
  const r = await pendingRequest(String(formData.get('id') ?? ''))
  if (!r) back('requests', { code: 'gone' }) // withdrawn by the parent, or already handled
  const supabase = await createClient()
  const start = hhmm(r.start_time)!
  const end = hhmm(r.end_time)!

  if (r.kind === 'add') {
    const day = await loadScheduleWindow(r.date, r.date)
    const hit = expandOccurrences(day.rules, day.lessons, r.date, r.date).find(
      (o) => o.status !== 'leave' && o.start !== null && o.end !== null && timesOverlap({ start: o.start, end: o.end }, { start, end })
    )
    if (hit) back('requests', { code: 'overlap', at: `${hit.start}–${hit.end}` })
    const { conflict } = await scheduleExtraLesson(supabase, { studentId: r.student_id, date: r.date, start, end })
    if (conflict) back('requests', { code: 'overlap', at: `${conflict.start}–${conflict.end}` })
    await clearBlockedUnderLessons(supabase)
  } else {
    const { open, recorded } = await lessonsOn(supabase, r.student_id, r.date)
    const target = open.find((o) => o.start === start)
    if (target) {
      await write(supabase, await resolve(supabase, target.key), LEAVE)
    } else if (!recorded.some((o) => o.start === start && o.status === 'leave')) {
      back('requests', { code: 'lesson-gone' }) // the lesson has already happened or been moved
    }
  }
  await decide(r.id, 'accepted')
  revalidatePath(`/students/${r.student_id}`)
  back('requests')
}

export async function declineRequest(formData: FormData) {
  const r = await pendingRequest(String(formData.get('id') ?? ''))
  if (r) await decide(r.id, 'declined')
  back('requests')
}

// Leave alerts: the leave is already in effect, so acknowledging just dismisses it
export async function dismissRequest(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('lesson_requests')
    .update({ seen_at: new Date().toISOString() })
    .eq('id', String(formData.get('id') ?? ''))
  if (error) throw error
  await cleanup()
  back('requests')
}

// ============ Bookable times (for extra-lesson requests on the parent page) ============
// By default every day 10:00–21:00 is bookable; the teacher marks cells on the timetable as unavailable (weekly or one day only).
// The editor submits a whole week at once: all weekly cells + this week's one-day cells from today on. Compared with the database:
// weekly changes take effect from today (removed cells end yesterday, so past days stay as they were; see planWeekly);
// one-day cells are added or deleted to match.

const DATE = /^\d{4}-\d{2}-\d{2}$/

async function ownerId(): Promise<string> {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const id = claims?.claims.sub
  if (!id) redirect('/login')
  return id
}

function backToWeek(week: string): never {
  revalidatePath('/dashboard')
  redirect(`/dashboard?${DATE.test(week) ? `week=${week}&` : ''}edit=1#schedule`)
}

function parseList(formData: FormData, key: string): string[] {
  const value: unknown = JSON.parse(String(formData.get(key) ?? '[]'))
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) throw new Error('Invalid format')
  return value
}

export async function saveBlockedTimes(formData: FormData) {
  const weekStart = String(formData.get('weekStart') ?? '')
  if (!DATE.test(weekStart)) throw new Error('Invalid week')
  const today = toTokyoDate(new Date())
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const cells = new Set(cellStarts())
  // Weekly: '<weekday> HH:MM' (the current state; changes take effect from today)
  // One day only: 'YYYY-MM-DD HH:MM' (only days of this week from today on: the past isn't changed)
  const weekly = new Set(
    parseList(formData, 'weekly').filter((k) => {
      const [wd, t] = k.split(' ')
      return /^[0-6]$/.test(wd) && cells.has(t)
    })
  )
  const future = weekDays.filter((d) => d >= today)
  const dated = new Set(
    parseList(formData, 'dated').filter((k) => {
      const [d, t] = k.split(' ')
      return future.includes(d) && cells.has(t)
    })
  )

  const owner = await ownerId()
  const supabase = await createClient()
  const [currentRes, datedRes] = await Promise.all([
    // weekly: the ones in effect now (ended ones are history and left alone)
    supabase.from('blocked_times').select('id, weekday, start_time, valid_from').not('weekday', 'is', null).is('valid_to', null),
    future.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('blocked_times').select('id, date, start_time').in('date', future),
  ])
  if (currentRes.error) throw currentRes.error
  if (datedRes.error) throw datedRes.error

  const plan = planWeekly(
    currentRes.data.map((r) => ({ id: r.id, key: `${r.weekday} ${hhmm(r.start_time)}`, validFrom: r.valid_from! })),
    weekly,
    today
  )
  const datedHave = new Map(datedRes.data.map((r) => [`${r.date} ${hhmm(r.start_time)}`, r.id]))
  const datedRemove = [...datedHave].filter(([k]) => !dated.has(k)).map(([, id]) => id)
  const datedAdd = [...dated].filter((k) => !datedHave.has(k))

  const remove = [...plan.remove, ...datedRemove]
  if (plan.end.length > 0) {
    const { error } = await supabase.from('blocked_times').update({ valid_to: addDays(today, -1) }).in('id', plan.end)
    if (error) throw error
  }
  if (remove.length > 0) {
    const { error } = await supabase.from('blocked_times').delete().in('id', remove)
    if (error) throw error
  }
  const add = [
    ...plan.add.map((k) => {
      const [wd, start] = k.split(' ')
      return { owner_id: owner, weekday: Number(wd), date: null, start_time: start, valid_from: today }
    }),
    ...datedAdd.map((k) => {
      const [date, start] = k.split(' ')
      return { owner_id: owner, weekday: null, date, start_time: start }
    }),
  ]
  if (add.length > 0) {
    const { error } = await supabase.from('blocked_times').insert(add)
    if (error) throw error
  }
  // Weekly unavailable cells extend into future weeks that have lessons: clear them under those lessons (a cell is either a lesson or unavailable)
  await clearBlockedUnderLessons(supabase)
  backToWeek(weekStart)
}

// Whether the parent page accepts extra-lesson requests (off by default: mark unavailable times first, then open it)
export async function setBookingOpen(formData: FormData) {
  const owner = await ownerId()
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ booking_open: formData.get('open') === '1' })
    .eq('id', owner)
  if (error) throw error
  backToWeek(String(formData.get('weekStart') ?? ''))
}
