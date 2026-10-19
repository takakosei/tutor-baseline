'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { text } from '@/lib/form'
import { NO_PROCTOR_FEE, logLesson, studentRates } from '@/lib/lesson-write'

// Tick / untick a checkpoint. A Server Action is a public endpoint that anyone can call with any id;
// RLS decides which rows can be changed, and the update returns 0 rows when none can.
export async function toggleCheckpoint(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const studentId = String(formData.get('studentId') ?? '')
  const done = formData.get('done') === '1'

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('checkpoints')
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Checkpoint not found or not allowed to update')

  revalidatePath(`/students/${studentId}`)
  revalidatePath('/dashboard')
}

const LESSON_STATUSES = ['done', 'leave'] as const

// Log a lesson afterwards. The form submits both the "held" and the "leave" field groups (CSS only hides one),
// so only the group matching status is used and the other is dropped.
// If a rule-generated lesson exists that day (or a key comes from clicking a lesson), the log goes on that lesson
// instead of a new row; otherwise the timetable would keep showing it as unlogged. A lesson already marked done
// gets the details added to it (see lib/lesson-write.ts)
export async function addLesson(formData: FormData) {
  const studentId = String(formData.get('studentId') ?? '')
  const date = String(formData.get('date') ?? '')
  const status = String(formData.get('status') ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date format')
  if (!LESSON_STATUSES.includes(status as (typeof LESSON_STATUSES)[number])) {
    throw new Error('Invalid status')
  }

  const held = status === 'done'
  const mood = Number(formData.get('mood'))
  const duration = Number(formData.get('duration_min'))

  const supabase = await createClient()
  const done = await logLesson(supabase, {
    studentId,
    date,
    status: status as 'done' | 'leave',
    // Duration defaults to the scheduled time (not passed): a lesson already marked done keeps its own, a scheduled one uses its time, otherwise 120
    durationMin: Number.isInteger(duration) && duration > 0 ? duration : null,
    defaultMinutes: 120,
    mood: [1, 2, 3].includes(mood) ? mood : null,
    billable: held && formData.has('billable_done'),
    online: held && formData.has('online'),
    // Proctoring ticked: log against that day's proctoring session (so Sunday-morning proctoring and an afternoon lesson
    // stay apart), or create one if there is none. Not ticked = any lesson that day
    proctor: formData.has('proctor') ? true : undefined,
    note: text(formData, 'note'),
    parentSummary: text(formData, 'parent_summary'),
    reason: text(formData, 'cancel_reason'),
    key: text(formData, 'key'),
  })
  if (done.mode === 'ambiguous') {
    // comma-separated; lesson-form.tsx joins them with the locale's list separator for display
    redirect(`/students/${studentId}?logError=${encodeURIComponent(done.times.join(','))}#log`)
  }

  revalidatePath(`/students/${studentId}`)
  revalidatePath('/dashboard')
  redirect(`/students/${studentId}#log`) // clears the previous error
}

// Edit a recorded lesson's details (the status isn't changed here: after a mis-click, undo and log it again).
// When a done lesson switches between online and in person, or goes from non-billable to billable, the hourly rate is
// snapshotted again from the current rate (the online rate for online lessons); otherwise the original snapshot stays
// (later rate changes don't affect past lessons). A billable proctoring session without a fee snapshot takes the current fee
export async function updateLesson(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const studentId = String(formData.get('studentId') ?? '')
  const mood = Number(formData.get('mood'))
  const duration = Number(formData.get('duration_min'))

  const supabase = await createClient()
  const { data: prev, error: e0 } = await supabase
    .from('lessons')
    .select('student_id, status, trial, online, billable, rate_per_hour, proctor, proctor_fee')
    .eq('id', id)
    .single()
  if (e0) throw e0
  const billable = formData.has('billable')
  // Trial lessons have a fixed price, proctoring is per session and leave has no online variant: the form has no such checkbox, so keep the value
  const online = prev.status === 'done' && !prev.trial && !prev.proctor ? formData.has('online') : prev.online
  const resnap =
    prev.status === 'done' && !prev.trial && !prev.proctor && billable && (online !== prev.online || !prev.billable || prev.rate_per_hour === null)
  const proctorSnap = prev.proctor && billable && prev.proctor_fee === null
  const rates = resnap || proctorSnap ? await studentRates(supabase, prev.student_id) : null
  if (proctorSnap && rates!.proctorFee === null) throw new Error(NO_PROCTOR_FEE)

  const { data, error } = await supabase
    .from('lessons')
    .update({
      note: text(formData, 'note'),
      parent_summary: text(formData, 'parent_summary'),
      cancel_reason: text(formData, 'cancel_reason'),
      mood: [1, 2, 3].includes(mood) ? mood : null,
      // the trial lesson form has no duration (fixed 1 hour), so leave it unchanged
      ...(formData.has('duration_min') ? { duration_min: Number.isInteger(duration) && duration > 0 ? duration : null } : {}),
      billable,
      online,
      ...(rates && resnap ? { rate_per_hour: online ? rates.onlineRate : rates.rate } : {}),
      ...(rates && proctorSnap ? { proctor_fee: rates.proctorFee } : {}),
    })
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Record not found or not allowed to update')

  revalidatePath(`/students/${studentId}`)
  revalidatePath('/dashboard')
}

export async function deleteLesson(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const studentId = String(formData.get('studentId') ?? '')

  const supabase = await createClient()
  const { data, error } = await supabase.from('lessons').delete().eq('id', id).select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Record not found or not allowed to delete')

  revalidatePath(`/students/${studentId}`)
  revalidatePath('/dashboard')
}

// ── Parent link ──────────────────────────────────────────
// The teacher's own actions, via the authenticated role + RLS (not service_role).

// 32 random bytes → 43 base64url characters. The chance of guessing one is negligible
function newParentToken() {
  return randomBytes(32).toString('base64url')
}

async function updateParentLink(
  studentId: string,
  change: { parent_enabled?: boolean; parent_token?: string }
) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('students')
    .update(change)
    .eq('id', studentId)
    .select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Student not found or not allowed to update')
  revalidatePath(`/students/${studentId}`)
}

// Enable. An existing token is reused, so after turning the link off and on, the parent's original link works again
export async function enableParentLink(formData: FormData) {
  const studentId = String(formData.get('studentId') ?? '')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('students')
    .select('parent_token')
    .eq('id', studentId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Student not found or not allowed to update')
  await updateParentLink(studentId, {
    parent_enabled: true,
    parent_token: data.parent_token ?? newParentToken(),
  })
}

// Disable: the link returns 404 at once. The token is kept, so re-enabling restores the original link
export async function disableParentLink(formData: FormData) {
  await updateParentLink(String(formData.get('studentId') ?? ''), { parent_enabled: false })
}

// New link: the old one stops working at once (e.g. if it was forwarded to someone who shouldn't see it)
export async function rotateParentLink(formData: FormData) {
  await updateParentLink(String(formData.get('studentId') ?? ''), { parent_token: newParentToken() })
}
