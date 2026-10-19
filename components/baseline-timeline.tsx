import { formatMonthDay } from '@/lib/format'
import { daysBetween } from '@/lib/progress'
import type { Locale } from '@/lib/i18n/locale'
import { common } from '@/lib/i18n/messages/common'

// Baseline timeline: from the start date to the end date, one dot per dated checkpoint (filled = done), plus a "today" line.
// Shared by the parent page, the dashboard student cards and the student page.
// A single series, so no legend; the checkpoint list on the page is its text version.
// markOverdue (tutor views only): outlines past-due, unfinished dots in red. A "N days behind" label is always
// shown next to it, so colour is never the only signal. The parent page never sets it: parents are not shown delays.
export function BaselineTimeline({
  checkpoints,
  startDate,
  endDate,
  endLabel,
  today,
  markOverdue = false,
  compact = false,
  locale,
}: {
  checkpoints: { title: string; dueDate: string; done: boolean }[] // already in baseline order
  startDate: string | null
  endDate: string | null
  endLabel: string | null
  today: string
  markOverdue?: boolean
  compact?: boolean // for cards: shorter, and the "today" line has no label
  locale: Locale
}) {
  const m = common[locale]
  if (checkpoints.length === 0) return null
  const dates = checkpoints.map((c) => c.dueDate)
  const from = [startDate ?? dates[0], dates[0], today].sort()[0]
  const to = [endDate ?? dates.at(-1)!, dates.at(-1)!].sort().at(-1)!
  const span = daysBetween(from, to)
  if (span <= 0) return null
  const pos = (d: string) => Math.min(Math.max(daysBetween(from, d) / span, 0), 1) * 100
  const t = pos(today)
  const done = checkpoints.filter((c) => c.done).length

  return (
    <div role="img" aria-label={m.timeline.label(checkpoints.length, done, formatMonthDay(today))}>
      <div className={`relative mx-2 h-4 ${compact ? 'mt-1' : 'mt-7'}`}>
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--viz-track)]" />
        {/* today */}
        <div className={`absolute bottom-0 ${compact ? '-top-1' : '-top-5'}`} style={{ left: `${t}%` }}>
          {!compact && (
            <span
              className={`absolute top-0 text-[11px] whitespace-nowrap text-foreground/70 ${
                t < 10 ? 'left-0' : t > 90 ? 'right-0' : '-translate-x-1/2'
              }`}
            >
              {m.today}
            </span>
          )}
          <span className={`absolute bottom-0 w-px -translate-x-1/2 bg-foreground/60 ${compact ? 'top-0' : 'top-4'}`} />
        </div>
        {checkpoints.map((c, i) => {
          const overdue = markOverdue && !c.done && c.dueDate <= today
          return (
            <span
              key={i}
              title={`${formatMonthDay(c.dueDate, locale)} ${c.title} · ${c.done ? m.timeline.done : overdue ? m.timeline.overdue : m.timeline.notDone}`}
              className="absolute top-1/2 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ left: `${pos(c.dueDate)}%` }}
            >
              <span
                className={`block size-3 rounded-full ring-2 ring-background ${
                  c.done ? '' : overdue ? 'border-2 border-red-500 bg-background' : 'border-2 border-foreground/30 bg-background'
                }`}
                style={c.done ? { background: 'var(--viz-bar)' } : undefined}
              />
            </span>
          )
        })}
      </div>
      {!compact && (
        <div className="mt-2 flex justify-between text-xs text-foreground/50 tabular-nums">
          <span>{formatMonthDay(from)}</span>
          <span>{endLabel ?? formatMonthDay(to)}</span>
        </div>
      )}
    </div>
  )
}
