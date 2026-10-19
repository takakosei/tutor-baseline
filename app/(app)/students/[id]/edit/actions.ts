'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { dateOrNull, numberOrNull, oneOf, requiredText, text } from '@/lib/form'
import { toTokyoDate } from '@/lib/progress'
import { LOCALES } from '@/lib/i18n/locale'

const STATUSES = ['active', 'at_risk', 'ending', 'cold', 'archived'] as const
const RISK_LEVELS = ['', 'warn', 'risk'] as const
const PARENT_LOCALES = ['', ...LOCALES] as const // '' = not set (the parent page follows the viewer's browser)

// All writes are scoped by RLS; an update / delete that touches no rows is treated as an error, not a silent success
function revalidateStudent(studentId: string) {
  revalidatePath(`/students/${studentId}`)
  revalidatePath(`/students/${studentId}/edit`)
  revalidatePath('/dashboard')
}

// Archive = no more lessons: weekly times stop from tomorrow (ones not started yet are deleted) and future one-off lessons
// are deleted; past records (done / leave) are all kept. Otherwise an archived student would keep appearing in the
// timetable, today's lessons and the to-dos. The parent link is turned off too (the parent page won't open and no more
// extra-lesson / leave requests can be made), and pending extra-lesson requests are declined (the parent sees they
// couldn't be scheduled). Restoring doesn't reschedule anything: add the weekly times again, and re-enable the parent
// link on the student page if needed
async function stopSchedules(supabase: Awaited<ReturnType<typeof createClient>>, studentId: string) {
  const today = toTokyoDate(new Date())
  const results = await Promise.all([
    supabase.from('students').update({ parent_enabled: false }).eq('id', studentId),
    supabase
      .from('lesson_requests')
      .update({ status: 'declined', decided_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .eq('status', 'pending'),
    supabase.from('schedules').delete().eq('student_id', studentId).gt('starts_on', today),
    supabase
      .from('schedules')
      .update({ ends_on: today })
      .eq('student_id', studentId)
      .lte('starts_on', today)
      .or(`ends_on.is.null,ends_on.gt.${today}`),
    supabase.from('lessons').delete().eq('student_id', studentId).eq('status', 'scheduled').gt('date', today),
  ])
  for (const r of results) if (r.error) throw r.error
}

export async function updateStudent(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const riskLevel = oneOf(formData, 'risk_level', RISK_LEVELS)
  const status = oneOf(formData, 'status', STATUSES)
  const parentLocale = oneOf(formData, 'parent_locale', PARENT_LOCALES)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('students')
    .update({
      name: requiredText(formData, 'name'),
      display_name: text(formData, 'display_name'),
      grade: text(formData, 'grade'),
      goal: text(formData, 'goal'),
      status,
      start_date: dateOrNull(formData, 'start_date'),
      end_date: dateOrNull(formData, 'end_date'),
      end_label: text(formData, 'end_label'),
      hours_per_week: numberOrNull(formData, 'hours_per_week'),
      rate_per_hour: numberOrNull(formData, 'rate_per_hour', { integer: true }),
      // Online hourly rate: empty (or 0) = same as in person. Changes only affect lessons logged afterwards (each lesson stores the rate at logging time)
      online_rate_per_hour: numberOrNull(formData, 'online_rate_per_hour', { integer: true }) || null,
      // Fee per proctoring session: empty (or 0) = not set (proctoring can't be chosen). Changes only affect sessions logged
      // afterwards (each one stores the amount at logging time)
      proctor_fee: numberOrNull(formData, 'proctor_fee', { integer: true }) || null,
      place: text(formData, 'place'),
      risk_level: riskLevel === '' ? null : riskLevel,
      risk_note: text(formData, 'risk_note'),
      assistant_notes: text(formData, 'assistant_notes'),
      parent_locale: parentLocale === '' ? null : parentLocale,
    })
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Student not found or not allowed to update')
  if (status === 'archived') await stopSchedules(supabase, id)

  revalidateStudent(id)
  redirect(`/students/${id}`)
}

function checkpointFields(formData: FormData) {
  return {
    title: requiredText(formData, 'title'),
    criterion: text(formData, 'criterion'),
    // empty = ongoing item, not counted in progress
    due_date: dateOrNull(formData, 'due_date'),
    date_tbd: formData.has('date_tbd'),
    parent_visible: formData.has('parent_visible'),
  }
}

export async function saveCheckpoint(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const studentId = String(formData.get('studentId') ?? '')

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('checkpoints')
    .update(checkpointFields(formData))
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Checkpoint not found or not allowed to update')

  revalidateStudent(studentId)
}

export async function addCheckpoint(formData: FormData) {
  const studentId = String(formData.get('studentId') ?? '')

  const supabase = await createClient()
  // New checkpoints go last: checkpoints due on the same day are ordered by seq
  const { data: last, error: seqError } = await supabase
    .from('checkpoints')
    .select('seq')
    .eq('student_id', studentId)
    .order('seq', { ascending: false })
    .limit(1)
  if (seqError) throw seqError

  const { error } = await supabase.from('checkpoints').insert({
    student_id: studentId,
    seq: (last[0]?.seq ?? 0) + 1,
    ...checkpointFields(formData),
  })
  if (error) throw error

  revalidateStudent(studentId)
}

export async function deleteCheckpoint(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const studentId = String(formData.get('studentId') ?? '')

  const supabase = await createClient()
  const { data, error } = await supabase.from('checkpoints').delete().eq('id', id).select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Checkpoint not found or not allowed to delete')

  revalidateStudent(studentId)
}

// Archive / restore: archived students don't appear on the home page; all records are kept
export async function setArchived(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const archived = formData.get('archived') === '1'
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('students')
    .update({ status: archived ? 'archived' : 'active' })
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Student not found or not allowed to update')
  if (archived) await stopSchedules(supabase, id)
  revalidateStudent(id)
  redirect(archived ? '/dashboard' : `/students/${id}`)
}

// Delete: checkpoints, lessons, homework and weekly times go with the student (foreign keys on delete cascade); it can't be undone.
// The student's internal name must be typed to confirm, to prevent mis-clicks
export async function deleteStudent(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const confirm = String(formData.get('confirm_name') ?? '').trim()
  const supabase = await createClient()
  const { data: s, error: e0 } = await supabase.from('students').select('name').eq('id', id).single()
  if (e0) throw e0
  if (confirm !== s.name) redirect(`/students/${id}/edit?error=confirm`)

  const { data, error } = await supabase.from('students').delete().eq('id', id).select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Student not found or not allowed to delete')
  revalidatePath('/dashboard')
  redirect('/dashboard')
}
