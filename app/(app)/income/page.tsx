import { createClient } from '@/lib/supabase/server'
import { toTokyoDate } from '@/lib/progress'
import { expandOccurrences, monthlyIncome, monthsBetween, unlogged } from '@/lib/schedule'
import { loadBillingLessons, loadScheduleWindow } from '@/lib/schedule-data'
import { getTeacherLocale } from '@/lib/i18n/server'
import { IncomeView } from './income-view'

// Months are listed from here (or from the earliest record's month if there is one, so the months add up to the start-to-date total)
const FIRST_MONTH = '2026-09'

// Income: opened from the dashboard's "Start to date". Earnings per month and per student (read-only, via RLS)
export default async function IncomePage() {
  const today = toTokyoDate(new Date())
  const billing = await loadBillingLessons()
  const first = [FIRST_MONTH, ...billing.map((l) => l.date.slice(0, 7))].sort()[0]

  const supabase = await createClient()
  const [studentsRes, itemsRes, window] = await Promise.all([
    supabase.from('students').select('id, name, rate_per_hour'),
    supabase.from('statement_items').select('student_id, month, amount'),
    // for "lessons not logged yet this month"
    loadScheduleWindow(`${first}-01`, today),
  ])
  if (studentsRes.error) throw studentsRes.error
  if (itemsRes.error) throw itemsRes.error

  const byId = new Map(studentsRes.data.map((s) => [s.id, s]))
  const months = monthlyIncome(
    billing,
    (id) => byId.get(id)?.rate_per_hour ?? null,
    monthsBetween(first, today.slice(0, 7)),
    itemsRes.data.map((e) => ({ studentId: e.student_id, month: e.month, amount: e.amount }))
  )
  const missing: Record<string, number> = {}
  for (const o of unlogged(expandOccurrences(window.rules, window.lessons, `${first}-01`, today), today)) {
    const m = o.date.slice(0, 7)
    missing[m] = (missing[m] ?? 0) + 1
  }

  return (
    <IncomeView
      locale={await getTeacherLocale()}
      today={today}
      months={months}
      unlogged={missing}
      nameOf={(id) => byId.get(id)?.name ?? '?'}
    />
  )
}
