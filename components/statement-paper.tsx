import { formatMonthDay } from '@/lib/format'
import { formatDuration, type StatementRow, type StatementTag } from '@/lib/schedule'
import type { Locale } from '@/lib/i18n/locale'
import { common } from '@/lib/i18n/messages/common'
import { statement } from '@/lib/i18n/messages/statement'

// The tuition statement "paper": the tutor view (can add / remove items) and the parent page (read-only) share it,
// and it is also what gets printed. Takes computed data only; never touches the database

export type StatementPaperData = {
  rows: StatementRow[]
  lessons: number
  minutes: number
  lessonFee: number
  items: { date: string | null; label: string; amount: number }[]
  fee: number
}

export function yen(n: number): string {
  return `${n < 0 ? '−' : ''}¥${Math.abs(n).toLocaleString('ja-JP')}`
}

function signed(n: number): string {
  return n > 0 ? `+${yen(n)}` : yen(n)
}

// The tag on a statement line. Proctored sessions use the parents' term here (parents see this statement too)
export function statementTagLabel(tag: StatementTag, locale: Locale): string {
  const t = statement[locale].tags
  const proctor = common[locale].proctorParent
  switch (tag) {
    case 'trial':
      return t.trial
    case 'proctor':
      return proctor
    case 'proctor-cancelled':
      return `${proctor} · ${t.cancelled}`
    case 'cancelled':
      return t.cancelled
    case 'online':
      return t.online
  }
}

export function StatementPaper({
  studentLabel,
  month,
  issuedOn,
  st,
  itemActions,
  locale,
}: {
  studentLabel: string | null
  month: string
  issuedOn: string // issue date
  st: StatementPaperData
  itemActions?: React.ReactNode[] // tutor view: a delete button for each "other" item, one per st.items entry; hidden when printing
  locale: Locale
}) {
  const t = statement[locale]
  const [y, mm] = month.split('-').map(Number)
  const hasItems = st.items.length > 0
  const itemsTotal = st.fee - st.lessonFee
  const th = 'py-2 font-normal whitespace-nowrap'
  const td = 'py-2.5'
  const num = 'pl-3 text-right whitespace-nowrap' // amounts and durations: right-aligned, no wrapping
  const wide = 'hidden sm:table-cell print:table-cell' // columns hidden on a phone (the time moves under the date)

  return (
    <>
      {/* Print margins of 0 leave the browser no room for headers and footers (page title, URL); the paper below keeps its own margins */}
      <style>{'@media print { @page { size: A4; margin: 0; } }'}</style>

      <article className="mx-auto max-w-2xl space-y-8 rounded-xl border border-foreground/10 bg-background px-4 py-6 sm:px-10 sm:py-10 print:max-w-none print:rounded-none print:border-0 print:px-[18mm] print:py-[16mm]">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide">{t.title}</h1>
            <p className="mt-1 text-sm text-foreground/60">{t.month(y, mm)}</p>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm">
            {studentLabel && (
              <>
                <dt className="text-foreground/50">{t.student}</dt>
                <dd className="font-medium">{studentLabel}</dd>
              </>
            )}
            <dt className="text-foreground/50">{t.issued}</dt>
            <dd className="tabular-nums">{issuedOn.replaceAll('-', '/')}</dd>
          </dl>
        </header>

        <section className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-foreground/15 px-5 py-4">
          <div>
            <p className="text-xs text-foreground/60">{t.total}</p>
            <p className="text-3xl font-semibold tabular-nums">{yen(st.fee)}</p>
          </div>
          <p className="text-xs leading-relaxed text-foreground/60 tabular-nums sm:text-right">
            {t.lessonFeeLine(yen(st.lessonFee), st.lessons, formatDuration(st.minutes))}
            {hasItems && (
              <>
                <br />
                {t.otherLine(itemsTotal >= 0 ? `+${yen(itemsTotal)}` : yen(itemsTotal))}
              </>
            )}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t.lessonFees}</h2>
          {st.rows.length === 0 ? (
            <p className="text-sm text-foreground/60">{t.noLessons}</p>
          ) : (
            <table className="w-full text-sm tabular-nums">
              <thead className="border-b border-foreground/30 text-left text-xs text-foreground/50">
                <tr>
                  <th className={th}>{t.date}</th>
                  <th className={`${th} ${wide} pl-3`}>{t.time}</th>
                  <th className={`${th} ${num}`}>{t.duration}</th>
                  <th className={`${th} ${num}`}>
                    {t.rate}
                    <span className="hidden sm:inline print:inline">{t.perHourLong}</span>
                    <span className="sm:hidden print:hidden">/h</span>
                  </th>
                  <th className={`${th} ${num}`}>{t.amount}</th>
                </tr>
              </thead>
              <tbody>
                {st.rows.map((r, i) => (
                  <tr key={i} className="border-b border-foreground/10 break-inside-avoid">
                    <td className={td}>
                      <span className="whitespace-nowrap">{formatMonthDay(r.date, locale)}</span>
                      {r.tag && (
                        <span className="ml-2 inline-block rounded bg-foreground/[0.06] px-1.5 py-px text-xs whitespace-nowrap text-foreground/70">
                          {statementTagLabel(r.tag, locale)}
                        </span>
                      )}
                      {r.start && r.end && (
                        <span className="block text-xs text-foreground/60 sm:hidden print:hidden">
                          {r.start}–{r.end}
                        </span>
                      )}
                    </td>
                    <td className={`${td} ${wide} pl-3 whitespace-nowrap text-foreground/70`}>{r.start && r.end ? `${r.start}–${r.end}` : '—'}</td>
                    <td className={`${td} ${num}`}>{r.minutes === null ? '—' : formatDuration(r.minutes)}</td>
                    <td className={`${td} ${num} text-foreground/70`}>
                      {yen(r.rate)}
                      {r.perSession && t.perSession}
                    </td>
                    <td className={`${td} ${num}`}>{yen(r.fee)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td className="pt-3 whitespace-nowrap">{t.subtotalLessons(st.lessons)}</td>
                  <td className={wide} />
                  <td className={`pt-3 ${num}`}>{formatDuration(st.minutes)}</td>
                  <td />
                  <td className={`pt-3 ${num}`}>{yen(st.lessonFee)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>

        {hasItems && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">{t.other}</h2>
            <table className="w-full text-sm tabular-nums">
              <thead className="border-b border-foreground/30 text-left text-xs text-foreground/50">
                <tr>
                  <th className={`${th} w-24 sm:w-28`}>{t.date}</th>
                  <th className={`${th} pl-3`}>{t.item}</th>
                  <th className={`${th} ${num}`}>{t.amount}</th>
                  {itemActions && <th className="w-10 print:hidden" />}
                </tr>
              </thead>
              <tbody>
                {st.items.map((e, i) => (
                  <tr key={i} className="border-b border-foreground/10 break-inside-avoid">
                    <td className={`${td} whitespace-nowrap`}>{e.date ? formatMonthDay(e.date, locale) : '—'}</td>
                    <td className={`${td} pl-3 wrap-anywhere`}>{e.label}</td>
                    <td className={`${td} ${num}`}>{signed(e.amount)}</td>
                    {itemActions && <td className={`${td} text-right print:hidden`}>{itemActions[i]}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td className="pt-3" colSpan={2}>
                    {t.subtotal}
                  </td>
                  <td className={`pt-3 ${num}`}>{itemsTotal >= 0 ? `+${yen(itemsTotal)}` : yen(itemsTotal)}</td>
                  {itemActions && <td className="print:hidden" />}
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        <footer className="border-t border-foreground/10 pt-4 text-xs text-foreground/50">
          {t.footer(st.rows.some((r) => r.perSession) ? common[locale].proctorParent : null)}
        </footer>
      </article>
    </>
  )
}
