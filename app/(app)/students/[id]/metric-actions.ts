'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { dateOrNull, numberOrNull, requiredText, text } from '@/lib/form'
import { METRIC_TEMPLATES, autoTotals, parseValue, type MetricDef } from '@/lib/metrics'
import { getTeacherLocale } from '@/lib/i18n/server'

// Writes for grade data. Each student has their own metrics, and records belong to the student; everything goes through RLS
// (a record's metric must belong to the same student).
// A metric can have parts (e.g. an aptitude-test total → parts I, II, III), one level deep only; a part's visible-to-parents
// setting follows the metric it belongs to

function back(studentId: string, error?: string): never {
  revalidatePath(`/students/${studentId}`)
  redirect(`/students/${studentId}${error ? `?gradeError=${error}` : ''}#grades`)
}

async function ownerId() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const id = data?.claims.sub
  if (!id) redirect('/login')
  return { supabase, id }
}

// Record several metrics at once: one input per metric (name = v:<metric id>); blank ones are skipped.
// Everything is checked first: if any value can't be parsed, nothing is written and the teacher is told which one
export async function addMetricRecords(formData: FormData) {
  const studentId = String(formData.get('studentId') ?? '')
  const date = dateOrNull(formData, 'date')
  if (!date) back(studentId, 'date')

  const entered = [...formData.entries()]
    .filter(([k, v]) => k.startsWith('v:') && String(v).trim() !== '')
    .map(([k, v]) => ({ metricId: k.slice(2), input: String(v) }))
  if (entered.length === 0) back(studentId, 'empty')

  const supabase = await createClient()
  const { data: metrics, error: e0 } = await supabase
    .from('metrics')
    .select('id, name, unit, direction, max_value, parent_id')
    .eq('student_id', studentId)
  if (e0) throw e0
  const note = text(formData, 'note')
  const rows = entered.map((e) => {
    const m = metrics.find((x) => x.id === e.metricId)
    if (!m) throw new Error('Metric not found')
    const value = parseValue(e.input, m.unit, m.max_value)
    if (value === null) back(studentId, `value:${m.id}`)
    return { student_id: studentId, metric_id: m.id, date, value, note }
  })
  // All parts filled in and the total left blank: add it up automatically (skipped if above the maximum, to avoid a wrong record)
  const defs: MetricDef[] = metrics.map((m) => ({
    id: m.id,
    name: m.name,
    unit: m.unit,
    direction: m.direction === -1 ? -1 : 1,
    maxValue: m.max_value,
    parentId: m.parent_id,
  }))
  // If the total is already recorded that day (e.g. the parts are added later), don't add another, so a day never has two totals
  const totals = autoTotals(defs, new Map(rows.map((r) => [r.metric_id, r.value])))
  const { data: existing, error: e1 } =
    totals.size === 0
      ? { data: [], error: null }
      : await supabase.from('metric_records').select('metric_id').eq('date', date).in('metric_id', [...totals.keys()])
  if (e1) throw e1
  for (const [metricId, value] of totals) {
    if (existing.some((r) => r.metric_id === metricId)) continue
    const max = metrics.find((m) => m.id === metricId)?.max_value ?? null
    if (max === null || value <= max) rows.push({ student_id: studentId, metric_id: metricId, date, value, note })
  }

  const { error } = await supabase.from('metric_records').insert(rows)
  if (error) throw error
  back(studentId)
}

export async function deleteMetricRecord(formData: FormData) {
  const studentId = String(formData.get('studentId') ?? '')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('metric_records')
    .delete()
    .eq('id', String(formData.get('id') ?? ''))
    .select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Record not found or not allowed to delete')
  back(studentId)
}

// Add a set of metrics from a template, skipping names that already exist. Names and units use the teacher's UI language
// (once written, they are data)
export async function addTemplateMetrics(formData: FormData) {
  const studentId = String(formData.get('studentId') ?? '')
  const template = METRIC_TEMPLATES[await getTeacherLocale()].find((t) => t.id === formData.get('template'))
  if (!template) back(studentId, 'template')
  const { supabase, id } = await ownerId()
  const { error } = await supabase.from('metrics').upsert(
    template.metrics.map((m) => ({
      owner_id: id,
      student_id: studentId,
      name: m.name,
      unit: m.unit,
      direction: m.direction,
      max_value: m.maxValue,
    })),
    { onConflict: 'student_id,name', ignoreDuplicates: true }
  )
  if (error) throw error
  back(studentId)
}

// "Part of…" (which metric this one belongs to): empty = top level. The parent must be a top-level metric of this student
// and not the metric itself; a metric that already has parts can't go inside another (one level only).
// If valid, return the parent's id and its visible-to-parents setting (parts follow it)
async function parentOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
  formData: FormData,
  selfId: string | null
): Promise<{ id: string; visible: boolean } | null> {
  const parentId = text(formData, 'parent_id')
  if (!parentId) return null
  if (parentId === selfId) back(studentId, 'parent')
  const { data: parent, error } = await supabase
    .from('metrics')
    .select('id, parent_id, parent_visible')
    .eq('id', parentId)
    .eq('student_id', studentId)
    .maybeSingle()
  if (error) throw error
  if (!parent || parent.parent_id !== null) back(studentId, 'parent')
  if (selfId) {
    const { count, error: e } = await supabase.from('metrics').select('id', { count: 'exact', head: true }).eq('parent_id', selfId)
    if (e) throw e
    if (count) back(studentId, 'parent')
  }
  return { id: parent.id, visible: parent.parent_visible }
}

export async function createMetric(formData: FormData) {
  const studentId = String(formData.get('studentId') ?? '')
  const { supabase, id } = await ownerId()
  const parent = await parentOf(supabase, studentId, formData, null)
  const { error } = await supabase.from('metrics').insert({
    owner_id: id,
    student_id: studentId,
    name: requiredText(formData, 'name'),
    unit: text(formData, 'unit') ?? '',
    direction: formData.get('direction') === '-1' ? -1 : 1,
    max_value: numberOrNull(formData, 'max_value'),
    parent_id: parent?.id ?? null,
    parent_visible: parent ? parent.visible : formData.has('parent_visible'),
  })
  if (error?.code === '23505') back(studentId, 'duplicate')
  if (error) throw error
  back(studentId)
}

// Visible-to-parents toggle (one click on the grades card). For a metric with parts, the parts change too
export async function setMetricParentVisible(formData: FormData) {
  const studentId = String(formData.get('studentId') ?? '')
  const metricId = String(formData.get('id') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(metricId)) throw new Error('Invalid metric') // it goes into the or() filter below, so make sure it's an id
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('metrics')
    .update({ parent_visible: formData.get('visible') === '1' })
    .or(`id.eq.${metricId},parent_id.eq.${metricId}`)
    .eq('student_id', studentId)
    .select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Metric not found or not allowed to update')
  back(studentId)
}

export async function updateMetric(formData: FormData) {
  const studentId = String(formData.get('studentId') ?? '')
  const metricId = String(formData.get('id') ?? '')
  const supabase = await createClient()
  const parent = await parentOf(supabase, studentId, formData, metricId)
  const visible = parent ? parent.visible : formData.has('parent_visible')
  const { data, error } = await supabase
    .from('metrics')
    .update({
      name: requiredText(formData, 'name'),
      unit: text(formData, 'unit') ?? '',
      direction: formData.get('direction') === '-1' ? -1 : 1,
      max_value: numberOrNull(formData, 'max_value'),
      parent_id: parent?.id ?? null,
      parent_visible: visible,
    })
    .eq('id', metricId)
    .eq('student_id', studentId)
    .select('id')
  if (error?.code === '23505') back(studentId, 'duplicate')
  if (error) throw error
  if (data.length === 0) throw new Error('Metric not found or not allowed to update')
  // if it has parts, their visible-to-parents setting follows
  const { error: e2 } = await supabase.from('metrics').update({ parent_visible: visible }).eq('parent_id', metricId)
  if (e2) throw e2
  back(studentId)
}

// Deleting a metric also deletes its records, so only metrics without records can be deleted (delete the records first);
// a metric that still has parts can't be deleted either (delete the parts or move them out first)
export async function deleteMetric(formData: FormData) {
  const studentId = String(formData.get('studentId') ?? '')
  const metricId = String(formData.get('id') ?? '')
  const supabase = await createClient()
  const [records, parts] = await Promise.all([
    supabase.from('metric_records').select('id', { count: 'exact', head: true }).eq('metric_id', metricId),
    supabase.from('metrics').select('id', { count: 'exact', head: true }).eq('parent_id', metricId),
  ])
  if (records.error) throw records.error
  if (parts.error) throw parts.error
  if (records.count !== 0) back(studentId, 'inuse')
  if (parts.count !== 0) back(studentId, 'hasparts')
  const { data, error } = await supabase.from('metrics').delete().eq('id', metricId).select('id')
  if (error) throw error
  if (data.length === 0) throw new Error('Metric not found or not allowed to delete')
  back(studentId)
}
