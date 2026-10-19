import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { toTokyoDate } from '@/lib/progress'
import { addDays } from '@/lib/analytics'
import { formatMonthDay } from '@/lib/format'
import { buildStatement, expandOccurrences, monthRange, unlogged } from '@/lib/schedule'
import { loadBillingLessons, loadScheduleWindow } from '@/lib/schedule-data'
import { PrintButton } from '@/components/print-button'
import { StatementSheet } from './statement-sheet'
import { getTeacherLocale } from '@/lib/i18n/server'
import { statementPage } from '@/lib/i18n/messages/statement-page'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The page title may be printed in the browser's header and is the default "Save as PDF" file name, so it is the statement's own name
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ month?: string }>
}): Promise<Metadata> {
  const { id } = await params
  const { month: m } = await searchParams
  const month = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : toTokyoDate(new Date()).slice(0, 7)
  const [y, mm] = month.split('-').map(Number)
  const title = statementPage[await getTeacherLocale()].title(y, mm)
  if (!UUID.test(id)) return { title }
  const supabase = await createClient()
  const { data } = await supabase.from('students').select('name, display_name').eq('id', id).maybeSingle()
  return { title: `${title}${data ? ` · ${data.display_name ?? data.name}` : ''}` }
}

// Monthly tuition statement: the fee breakdown for parents, in the teacher's UI language. The browser's Print →
// "Save as PDF" produces a PDF; "Show to parent" lets the parent view it on the parent page (the same statement).
// Lists only recorded, billable lessons plus the teacher's own "Other" items (textbooks bought for the student, discounts);
// unlogged lessons this month trigger an on-screen reminder (not printed)
export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ month?: string }>
}) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const today = toTokyoDate(new Date())
  const { month: m } = await searchParams
  const month = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : today.slice(0, 7)
  const { from, to } = monthRange(month)

  const supabase = await createClient()
  const locale = await getTeacherLocale()
  const t = statementPage[locale]
  const [studentRes, billing, window, itemsRes, publishedRes] = await Promise.all([
    supabase.from('students').select('id, name, display_name, rate_per_hour, parent_enabled').eq('id', id).maybeSingle(),
    loadBillingLessons(id),
    loadScheduleWindow(from, to, id),
    supabase.from('statement_items').select('id, month, date, label, amount').eq('student_id', id).eq('month', month),
    supabase.from('statement_months').select('published_at').eq('student_id', id).eq('month', month).maybeSingle(),
  ])
  if (studentRes.error) throw studentRes.error
  if (itemsRes.error) throw itemsRes.error
  if (publishedRes.error) throw publishedRes.error
  const s = studentRes.data
  if (!s) notFound()

  const st = buildStatement(billing, s.rate_per_hour, month, itemsRes.data)
  const missing = unlogged(expandOccurrences(window.rules, window.lessons, from, to), today)
  const prev = addDays(from, -1).slice(0, 7)
  const next = addDays(to, 1).slice(0, 7)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/students/${s.id}`} className="text-sm text-foreground/60 hover:text-foreground">
          {t.back(s.name)}
        </Link>
        <div className="flex items-center gap-4 text-sm text-foreground/60">
          <Link href={`?month=${prev}`} className="hover:text-foreground">{t.prevMonth}</Link>
          <Link href={`?month=${next}`} className="hover:text-foreground">{t.nextMonth}</Link>
          <PrintButton />
        </div>
      </div>
      {missing.length > 0 && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300 print:hidden">
          {t.unlogged(missing.map((o) => formatMonthDay(o.date)))}
        </p>
      )}

      <StatementSheet
        locale={locale}
        studentId={s.id}
        studentLabel={s.display_name ?? s.name}
        month={month}
        today={today}
        st={st}
        publishedOn={publishedRes.data ? toTokyoDate(new Date(publishedRes.data.published_at)) : null}
        parentEnabled={s.parent_enabled}
      />
    </div>
  )
}
