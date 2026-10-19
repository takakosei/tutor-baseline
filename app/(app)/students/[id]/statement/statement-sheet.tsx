import { formatMonthDay } from '@/lib/format'
import { monthRange, type buildStatement } from '@/lib/schedule'
import { SubmitButton } from '@/components/submit-button'
import { OptionalDateInput } from '@/components/optional-date-input'
import { StatementPaper } from '@/components/statement-paper'
import { addStatementItem, deleteStatementItem, publishStatement, unpublishStatement } from './actions'
import type { Locale } from '@/lib/i18n/locale'
import { statement } from '@/lib/i18n/messages/statement'
import { statementPage } from '@/lib/i18n/messages/statement-page'

// The teacher's tuition statement: the "Show to parent" switch + the statement (the same sheet as on the parent page)
// + adding / deleting "Other" items. The switch, add form and delete buttons are screen-only and don't print.
// Only receives computed data and never touches the database

const input = 'rounded-md border border-foreground/20 bg-transparent px-2 py-1 text-sm'

export function StatementSheet({
  studentId,
  studentLabel,
  month,
  today,
  st,
  publishedOn,
  parentEnabled,
  locale,
}: {
  studentId: string
  studentLabel: string
  month: string
  today: string
  st: ReturnType<typeof buildStatement>
  publishedOn: string | null // the day it was shown to the parent; not shown yet = null
  parentEnabled: boolean // whether the parent link is on
  locale: Locale
}) {
  const t = statementPage[locale]
  const paper = statement[locale]
  const { from, to } = monthRange(month)
  const hidden = (
    <>
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="month" value={month} />
    </>
  )

  return (
    <>
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-foreground/[0.04] px-4 py-3 text-sm print:hidden">
        {publishedOn ? (
          <>
            <p>
              <span aria-hidden className="mr-2 inline-block size-2 rounded-full bg-emerald-500" />
              {t.published(formatMonthDay(publishedOn))}
            </p>
            <form action={unpublishStatement}>
              {hidden}
              <SubmitButton small secondary pendingText="…">
                {t.unpublish}
              </SubmitButton>
            </form>
          </>
        ) : parentEnabled ? (
          <>
            <p className="text-foreground/70">{t.notPublished}</p>
            <form action={publishStatement}>
              {hidden}
              <SubmitButton small pendingText="…">
                {t.publish}
              </SubmitButton>
            </form>
          </>
        ) : (
          <p className="text-foreground/60">{t.linkOff}</p>
        )}
      </div>

      <StatementPaper
        locale={locale}
        studentLabel={studentLabel}
        month={month}
        issuedOn={today}
        st={st}
        itemActions={st.items.map((e) => (
          <form key={e.id} action={deleteStatementItem}>
            <input type="hidden" name="id" value={e.id} />
            {hidden}
            <button type="submit" className="text-xs text-foreground/40 hover:text-red-600">
              {t.delete}
            </button>
          </form>
        ))}
      />

      <details className="mx-auto max-w-2xl rounded-xl border border-dashed border-foreground/25 text-sm print:hidden">
        <summary className="cursor-pointer px-4 py-2.5">{t.addItem}</summary>
        <form action={addStatementItem} className="flex flex-wrap items-center gap-2 border-t border-foreground/10 px-4 py-3">
          {hidden}
          <OptionalDateInput name="date" min={from} max={to} className={input} />
          <input name="label" required placeholder={t.itemPlaceholder} aria-label={paper.item} className={`${input} min-w-0 flex-1 basis-48`} />
          <select name="sign" defaultValue="+" aria-label={t.sign} className={input}>
            <option value="+">{t.plus}</option>
            <option value="-">{t.minus}</option>
          </select>
          <span className="flex items-center gap-1">
            ¥
            <input type="number" name="amount" required min={1} step={1} placeholder={paper.amount} aria-label={paper.amount} className={`${input} w-28`} />
          </span>
          <SubmitButton small pendingText="…">{t.add}</SubmitButton>
        </form>
      </details>
    </>
  )
}
