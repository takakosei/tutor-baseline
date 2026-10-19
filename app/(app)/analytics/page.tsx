import { createClient } from '@/lib/supabase/server'
import { toTokyoDate } from '@/lib/progress'
import { demoData } from '@/lib/demo-data'
import { AnalyticsView, type AnalyticsData } from '@/components/analytics-view'
import { getTeacherLocale } from '@/lib/i18n/server'

// Analytics page (signed in). Data comes from one of two sources: the database (via RLS) or demo data (generated in memory, never written).

async function loadReal(): Promise<AnalyticsData> {
  const supabase = await createClient()
  const [students, lessons, checkpoints] = await Promise.all([
    supabase.from('students').select('id, name').neq('status', 'archived').order('name'),
    supabase.from('lessons').select('student_id, date, status, mood'),
    supabase.from('checkpoints').select('student_id, seq, due_date, done_at, date_tbd'),
  ])
  if (students.error) throw students.error
  if (lessons.error) throw lessons.error
  if (checkpoints.error) throw checkpoints.error

  const active = new Set(students.data.map((s) => s.id))
  return {
    students: students.data,
    lessons: lessons.data
      .filter((l) => active.has(l.student_id))
      .map((l) => ({ studentId: l.student_id, date: l.date, status: l.status, mood: l.mood })),
    checkpoints: checkpoints.data
      .filter((c) => active.has(c.student_id))
      .map((c) => ({
        studentId: c.student_id,
        seq: c.seq,
        dueDate: c.due_date,
        doneOn: c.done_at ? toTokyoDate(new Date(c.done_at)) : null,
        dateTbd: c.date_tbd,
      })),
  }
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string; range?: string }>
}) {
  const params = await searchParams
  const isDemo = params.demo === '1'
  const today = toTokyoDate(new Date())
  const locale = await getTeacherLocale()
  return (
    <AnalyticsView
      locale={locale}
      data={isDemo ? demoData(today, locale) : await loadReal()}
      today={today}
      range={params.range === '12w' ? '12w' : 'all'}
      isDemo={isDemo}
      basePath="/analytics"
      showSourceToggle
    />
  )
}
