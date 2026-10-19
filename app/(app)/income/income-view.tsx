import Link from 'next/link'
import { formatDuration, type MonthIncome } from '@/lib/schedule'
import type { Locale } from '@/lib/i18n/locale'
import { income } from '@/lib/i18n/messages/income'
import { statement } from '@/lib/i18n/messages/statement'

// The income page's view: page.tsx loads and computes the data; nothing here touches the database (so it can be previewed
// with sample data). One row per month (amount + bar); expand it to see each student's earnings that month, and a
// student's row links to that month's tuition statement

const card = 'rounded-xl border border-foreground/10'
const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`
const signedYen = (n: number) => `${n > 0 ? '+' : '−'}${yen(Math.abs(n))}`

export function IncomeView({
  today,
  months,
  unlogged,
  nameOf,
  locale,
}: {
  today: string
  months: MonthIncome[] // in chronological order, from the first month to this month
  unlogged: Record<string, number> // 'YYYY-MM' → number of past lessons in that month not yet logged
  nameOf: (id: string) => string
  locale: Locale
}) {
  const t = income[locale]
  const thisMonth = today.slice(0, 7)
  const all = months.reduce(
    (t, m) => ({ fee: t.fee + m.fee, lessons: t.lessons + m.lessons, minutes: t.minutes + m.minutes }),
    { fee: 0, lessons: 0, minutes: 0 }
  )
  const max = Math.max(...months.map((m) => m.fee), 1)

  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="inline-block text-sm text-foreground/60 hover:text-foreground">
        {t.back}
      </Link>

      <header className="space-y-1">
        <p className="text-xs text-foreground/50">{t.allTime(monthLabel(months[0]?.month ?? thisMonth, '', locale))}</p>
        <h1 className="text-3xl font-semibold tabular-nums">{yen(all.fee)}</h1>
        <p className="text-sm text-foreground/60">{t.lessonsDuration(all.lessons, formatDuration(all.minutes))}</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground/60">{t.byMonth}</h2>
        <ul className={`${card} divide-y divide-foreground/10`}>
          {[...months].reverse().map((m) => (
            <li key={m.month}>
              <details open={m.month === thisMonth} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-foreground/[0.03] [&::-webkit-details-marker]:hidden">
                  <span className="w-[4.5rem] shrink-0 sm:w-24">
                    <span className="block font-medium">{monthLabel(m.month, today.slice(0, 4), locale)}</span>
                    {m.month === thisMonth && <span className="block text-xs text-foreground/50">{t.toDate}</span>}
                  </span>
                  {/* Bar: relative to the highest month. The amount is written on the right; the bar only helps compare at a glance */}
                  <span aria-hidden className="flex h-2 min-w-0 flex-1">
                    {m.fee > 0 && (
                      <span
                        className="h-full rounded-r-[4px] bg-[var(--viz-bar)]"
                        style={{ width: `${Math.max((m.fee / max) * 100, 2)}%` }}
                      />
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-medium tabular-nums">{yen(m.fee)}</span>
                    <span className="block text-xs text-foreground/50">{t.lessonsDuration(m.lessons, formatDuration(m.minutes))}</span>
                  </span>
                  <span aria-hidden className="shrink-0 text-foreground/40 transition-transform group-open:rotate-90">
                    ›
                  </span>
                </summary>
                <MonthDetail m={m} unlogged={unlogged[m.month] ?? 0} nameOf={nameOf} locale={locale} />
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function MonthDetail({
  m,
  unlogged,
  nameOf,
  locale,
}: {
  m: MonthIncome
  unlogged: number
  nameOf: (id: string) => string
  locale: Locale
}) {
  const t = income[locale]
  return (
    <div className="space-y-2 border-t border-foreground/10 bg-foreground/[0.02] px-4 py-3 text-sm">
      {unlogged > 0 && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          {t.unlogged(unlogged)}
        </p>
      )}
      {m.byStudent.length === 0 ? (
        <p className="text-foreground/50">{t.noBillable}</p>
      ) : (
        <ul className="-mx-2">
          {m.byStudent.map((s) => (
            <li key={s.studentId}>
              <Link
                href={`/students/${s.studentId}/statement?month=${m.month}`}
                className="flex items-baseline gap-3 rounded-md px-2 py-1.5 hover:bg-foreground/[0.05]"
              >
                <span className="min-w-0 flex-1">
                  {nameOf(s.studentId)}
                  {s.extras !== 0 && <span className="ml-2 text-xs text-foreground/50">{statement[locale].otherLine(signedYen(s.extras))}</span>}
                </span>
                <span className="shrink-0 text-xs text-foreground/50">{t.lessonsDuration(s.lessons, formatDuration(s.minutes))}</span>
                <span className="w-20 shrink-0 text-right tabular-nums">{yen(s.fee)}</span>
                <span aria-hidden className="shrink-0 text-foreground/40">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {m.extras !== 0 && (
        <p className="text-xs text-foreground/50">{t.extrasNote(yen(m.fee + m.extras))}</p>
      )}
    </div>
  )
}

// '2026-10' → the month alone for this year, month and year for other years (en: October / October 2026)
function monthLabel(month: string, thisYear: string, locale: Locale): string {
  const [y, m] = month.split('-')
  return income[locale].month(Number(y), Number(m), y === thisYear)
}
