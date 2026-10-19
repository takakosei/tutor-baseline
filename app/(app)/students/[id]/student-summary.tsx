import Link from 'next/link'
import type { Progress } from '@/lib/progress'
import { formatHours, formatMonthDay } from '@/lib/format'
import { RiskStripe, statusLabel } from '@/components/progress-summary'
import { BaselineTimeline } from '@/components/baseline-timeline'
import type { Locale } from '@/lib/i18n/locale'
import { common } from '@/lib/i18n/messages/common'
import { student } from '@/lib/i18n/messages/student'

// Top of the student page: name, goal, countdown and the baseline (expected vs actual, days behind or ahead, timeline).
// Only receives computed data and never touches the database (so it can be previewed locally with sample data).
// This is the teacher's view: days behind, hours to make up and risk notes are all shown (the parent page shows none of these)

export function StudentSummary({
  s,
  facts,
  daysLeft,
  progress,
  timeline,
  today,
  locale,
}: {
  s: {
    id: string
    name: string
    status: string
    goal: string | null
    start_date: string | null
    end_date: string | null
    end_label: string | null
    risk_level: string | null
    risk_note: string | null
  }
  facts: string[]
  daysLeft: number | null
  progress: Progress
  timeline: { title: string; dueDate: string; done: boolean }[]
  today: string
  locale: Locale
}) {
  const t = student[locale]
  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-foreground/50">{statusLabel(s.status, locale) ?? s.status}</p>
            <h1 className="text-2xl font-semibold">{s.name}</h1>
          </div>
          <Link
            href={`/students/${s.id}/edit`}
            className="shrink-0 rounded-md border border-foreground/20 px-3 py-1 text-sm hover:bg-foreground/[0.04]"
          >
            {t.edit}
          </Link>
        </div>
        {s.goal && <p className="text-sm text-foreground/80">{s.goal}</p>}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(s.end_label || daysLeft !== null) && (
            <span className="inline-flex items-center gap-2 rounded-full bg-foreground/[0.05] px-3 py-1">
              <span className="size-1.5 rounded-full bg-[var(--viz-bar)]" />
              {s.end_label ?? (s.end_date && formatMonthDay(s.end_date, locale))}
              {daysLeft !== null && (
                <span className="text-foreground/60 tabular-nums">{daysLeft >= 0 ? `D-${daysLeft}` : t.summary.pastEnd}</span>
              )}
            </span>
          )}
          {facts.length > 0 && <span className="text-xs text-foreground/50">{facts.join(' · ')}</span>}
        </div>
        {s.risk_note && (
          <p className="relative overflow-hidden rounded-xl bg-foreground/[0.04] py-2.5 pr-3 pl-4 text-sm text-foreground/80">
            <RiskStripe level={s.risk_level} />
            {s.risk_note}
          </p>
        )}
      </header>

      {progress.state !== 'none' && (
        <div className="space-y-3 rounded-xl border border-foreground/10 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium text-foreground/60">{t.summary.baseline}</h2>
            <span className="text-xs text-foreground/50 tabular-nums">
              {t.summary.counts(progress.done, progress.should, progress.total)}
            </span>
          </div>
          <StateHeadline progress={progress} locale={locale} />
          <BaselineTimeline
            locale={locale}
            checkpoints={timeline}
            startDate={s.start_date}
            endDate={s.end_date}
            endLabel={s.end_label}
            today={today}
            markOverdue
          />
        </div>
      )}
    </section>
  )
}

// Status in large type: on track / N days ahead / N days behind (+ roughly how many hours to make up). Always text, not color alone
function StateHeadline({ progress: p, locale }: { progress: Progress; locale: Locale }) {
  const c = common[locale].progress
  if (p.state === 'behind') {
    return (
      <p className="text-red-600">
        <span className="text-xl font-semibold">{c.behind(p.offsetDays)}</span>
        {p.catchUpHours !== undefined && (
          <span className="ml-2 text-sm">{student[locale].summary.catchUp(formatHours(p.catchUpHours))}</span>
        )}
      </p>
    )
  }
  if (p.state === 'ahead') {
    return <p className="text-xl font-semibold text-green-700 dark:text-green-500">{c.ahead(p.offsetDays)}</p>
  }
  return <p className="text-xl font-semibold">{c.ontrack}</p>
}
