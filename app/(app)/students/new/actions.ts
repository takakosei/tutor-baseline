'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { toTokyoDate } from '@/lib/progress'
import { dateOrNull, numberOrNull, oneOf, requiredText, text } from '@/lib/form'
import { TEMPLATE_OPTIONS, templateCheckpoints, type TemplateId } from '@/lib/templates'
import { setTrialLesson } from '@/lib/lesson-write'
import { getTeacherLocale } from '@/lib/i18n/server'

// Add a student: create the student, then a set of checkpoints from the template (text in the teacher's language);
// a trial lesson, if given, is scheduled too. Then go straight to the student page
export async function createStudent(formData: FormData) {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const ownerId = claims?.claims.sub
  if (!ownerId) redirect('/login')

  const template = oneOf(formData, 'template', TEMPLATE_OPTIONS.map((o) => o.id) as TemplateId[])
  const startDate = dateOrNull(formData, 'start_date') ?? toTokyoDate(new Date())
  const endDate = dateOrNull(formData, 'end_date')
  if (TEMPLATE_OPTIONS.find((o) => o.id === template)?.needsEnd && !endDate) {
    redirect('/students/new?error=need_end')
  }
  const checkpoints = templateCheckpoints(template, { startDate, endDate, locale: await getTeacherLocale() })
  const trialDate = dateOrNull(formData, 'trial_date')
  const trialStart = text(formData, 'trial_start')
  if ((trialDate === null) !== (trialStart === null) || (trialStart !== null && !/^\d{2}:\d{2}$/.test(trialStart))) {
    redirect('/students/new?error=trial')
  }

  const { data: student, error } = await supabase
    .from('students')
    .insert({
      owner_id: ownerId,
      name: requiredText(formData, 'name'),
      display_name: text(formData, 'display_name'),
      grade: text(formData, 'grade'),
      goal: text(formData, 'goal'),
      start_date: startDate,
      end_date: endDate,
      end_label: text(formData, 'end_label'),
      hours_per_week: numberOrNull(formData, 'hours_per_week'),
      rate_per_hour: numberOrNull(formData, 'rate_per_hour', { integer: true }),
      place: text(formData, 'place'),
      assistant_notes: text(formData, 'assistant_notes'),
      // Parent page language: stored as the teacher's current language and changeable on the edit page. If the teacher later
      // changes their own language, the parent page doesn't follow
      parent_locale: await getTeacherLocale(),
    })
    .select('id')
    .single()
  if (error) throw error

  if (checkpoints.length > 0) {
    const { error: e } = await supabase
      .from('checkpoints')
      .insert(checkpoints.map((c) => ({ ...c, student_id: student.id })))
    if (e) throw e
  }
  if (trialDate && trialStart) {
    // a new student has no other lessons yet, so nothing can clash
    await setTrialLesson(supabase, { studentId: student.id, date: trialDate, start: trialStart })
  }

  revalidatePath('/dashboard')
  redirect(`/students/${student.id}`)
}
