'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { dateOrNull, numberOrNull, requiredText, text } from '@/lib/form'
import { SUBJECTS } from '@/lib/metrics'

// Writes for the Goal card on the student page: the compared metric, the Toritsu conversion and report-card grades,
// stage targets, and school-report items. Everything goes through RLS (only the teacher's own students);
// the compared metric must belong to the same student (a composite foreign key enforces it).
// Only the teacher sees these; the parent page doesn't read these tables

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Return to the card afterwards; on bad input pass the reason along (shown on the card)
function back(studentId: string, error?: string): never {
  revalidatePath(`/students/${studentId}`)
  redirect(`/students/${studentId}${error ? `?goalError=${error}` : ''}#goal`)
}

function ids(formData: FormData): { id: string; studentId: string } {
  const id = String(formData.get('id') ?? '')
  const studentId = String(formData.get('studentId') ?? '')
  if (!UUID.test(studentId) || (id !== '' && !UUID.test(id))) throw new Error('Invalid parameters')
  return { id, studentId }
}

export async function setTargetMetric(formData: FormData) {
  const { studentId } = ids(formData)
  const metric = text(formData, 'metric')
  if (metric !== null && !UUID.test(metric)) throw new Error('Invalid compared metric')
  const supabase = await createClient()
  const { data, error } = await supabase.from('students').update({ target_metric_id: metric }).eq('id', studentId).select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Student not found or not allowed to update')
  back(studentId)
}

// Toritsu conversion (Tokyo public combined junior-high admissions): when on, stage targets are percentages of the total
// score and report-card grades are converted to school-report points
export async function setToritsu(formData: FormData) {
  const { studentId } = ids(formData)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('students')
    .update({ toritsu_conversion: formData.get('on') === 'on' })
    .eq('id', studentId)
    .select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Student not found or not allowed to update')
  back(studentId)
}

// Years 5 and 6 each have 9 subjects with 3 assessment criteria per subject (e.g. 223). A year is either all blank
// (not out yet) or has all 9 subjects filled in. Stored as a string of 27 digits (in SUBJECTS order);
// the grade itself is computed when needed (subjectGrade in lib/metrics.ts)
export async function saveGrades(formData: FormData) {
  const { studentId } = ids(formData)
  const year = (y: 5 | 6) => {
    const raw = SUBJECTS.map((_, i) => (text(formData, `y${y}_${i}`) ?? '').replace(/\D/g, ''))
    if (raw.every((v) => v === '')) return null
    if (raw.some((v) => !/^[123]{3}$/.test(v))) back(studentId, 'grades')
    return raw.join('')
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('students')
    .update({ report5: year(5), report6: year(6) })
    .eq('id', studentId)
    .select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Student not found or not allowed to update')
  back(studentId)
}

// ── Stage targets ──

// With the Toritsu conversion on (unit=pct in the form) the two lines are percentages of the total score, stored in
// pass_pct / best_pct; otherwise they are scores entered directly
function stageFields(formData: FormData, studentId: string) {
  const date = dateOrNull(formData, 'date')
  if (!date) back(studentId, 'date')
  const label = text(formData, 'label')?.slice(0, 60) ?? null
  const pass = numberOrNull(formData, 'pass')
  const best = numberOrNull(formData, 'best')
  if (formData.get('unit') !== 'pct') return { date, label, target_pass: pass, target_best: best }
  if ((pass ?? 0) > 100 || (best ?? 0) > 100) back(studentId, 'pct')
  return { date, label, pass_pct: pass, best_pct: best }
}

export async function addStage(formData: FormData) {
  const { studentId } = ids(formData)
  const fields = stageFields(formData, studentId)
  const supabase = await createClient()
  const { error } = await supabase.from('target_stages').insert({ student_id: studentId, ...fields })
  if (error?.code === '23505') back(studentId, 'stage-dup') // a row already exists for that date
  if (error) throw error
  back(studentId)
}

export async function saveStage(formData: FormData) {
  const { id, studentId } = ids(formData)
  const fields = stageFields(formData, studentId)
  const supabase = await createClient()
  const { data, error } = await supabase.from('target_stages').update(fields).eq('id', id).select('id')
  if (error?.code === '23505') back(studentId, 'stage-dup')
  if (error) throw error
  if (data.length === 0) throw new Error('Row not found or not allowed to update')
  back(studentId)
}

export async function deleteStage(formData: FormData) {
  const { id, studentId } = ids(formData)
  const supabase = await createClient()
  const { error } = await supabase.from('target_stages').delete().eq('id', id)
  if (error) throw error
  back(studentId)
}

// ── School report items ──

function reportFields(formData: FormData) {
  return {
    label: requiredText(formData, 'label').slice(0, 60),
    value: numberOrNull(formData, 'value'), // empty = not out yet
    max_value: numberOrNull(formData, 'max') || null,
  }
}

export async function addReportItem(formData: FormData) {
  const { studentId } = ids(formData)
  const supabase = await createClient()
  const { error } = await supabase.from('report_items').insert({ student_id: studentId, ...reportFields(formData) })
  if (error) throw error
  back(studentId)
}

export async function saveReportItem(formData: FormData) {
  const { id, studentId } = ids(formData)
  const supabase = await createClient()
  const { data, error } = await supabase.from('report_items').update(reportFields(formData)).eq('id', id).select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Item not found or not allowed to update')
  back(studentId)
}

export async function deleteReportItem(formData: FormData) {
  const { id, studentId } = ids(formData)
  const supabase = await createClient()
  const { error } = await supabase.from('report_items').delete().eq('id', id)
  if (error) throw error
  back(studentId)
}
