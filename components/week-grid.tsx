import Link from 'next/link'
import { addDays } from '@/lib/analytics'
import { dayLanes, timelineRange, type Occurrence } from '@/lib/schedule'
import { GridFrame, type Pos } from '@/components/grid-frame'
import { formatMonthDay } from '@/lib/format'
import { ProctorTag, TrialTag } from '@/components/trial-tag'
import type { Locale } from '@/lib/i18n/locale'
import { common } from '@/lib/i18n/messages/common'
import { schedule } from '@/lib/i18n/messages/schedule'

// A weekly timetable drawn to real time: each lesson's position and height are its start and end (17:30–19:30 is drawn from 17:30 to 19:30),
// and overlapping lessons sit side by side. The four standard slots are a light background for reference. Lessons without a time are listed below.
// Lessons on leave are hidden (the record stays; it just takes no space on the timetable).
// highlight (student page): this student's lessons use the accent colour and other students' are greyed out (shows what is free and what is taken)
// underlay / passive / hourPx / renderHeader: used by the dashboard to mark unavailable time directly on the timetable (dashboard/schedule-board.tsx)
export function WeekGrid({
  weekStart,
  occurrences,
  labelOf,
  today,
  highlight,
  navHref,
  linked = true,
  underlay,
  passive = false,
  hourPx,
  renderHeader,
  onNavigate,
  locale,
}: {
  weekStart: string
  occurrences: Occurrence[]
  labelOf: (studentId: string) => string
  today: string
  highlight?: string
  navHref: (weekStart: string) => string
  linked?: boolean // no links to student pages on the public demo
  underlay?: (date: string, pos: Pos) => React.ReactNode // a layer drawn beneath the lessons (marked unavailable time, editor cells)
  passive?: boolean // while editing unavailable time: lessons are not clickable (no jump to the student page)
  hourPx?: number
  renderHeader?: (date: string, label: React.ReactNode) => React.ReactNode
  onNavigate?: (e: { preventDefault: () => void }) => void // before changing week (while editing unavailable time: ask first if there are unsaved changes)
  locale: Locale
}) {
  const t = schedule[locale]
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const shown = occurrences.filter((o) => o.status !== 'leave' && days.includes(o.date))
  const timed = shown.filter((o): o is Occurrence & { start: string; end: string } => o.start !== null && o.end !== null)
  const untimed = shown.filter((o) => o.start === null || o.end === null)
  const { from, to } = timelineRange(timed)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground/60">
          {formatMonthDay(days[0])} – {formatMonthDay(days[6])}
        </span>
        <nav className="flex gap-3 text-foreground/60">
          <Link href={navHref(addDays(weekStart, -7))} onNavigate={onNavigate} className="hover:text-foreground">{t.prevWeek}</Link>
          <Link href={navHref('')} onNavigate={onNavigate} className="hover:text-foreground">{t.thisWeek}</Link>
          <Link href={navHref(addDays(weekStart, 7))} onNavigate={onNavigate} className="hover:text-foreground">{t.nextWeek}</Link>
        </nav>
      </div>

      <GridFrame
        days={days}
        today={today}
        from={from}
        to={to}
        hourPx={hourPx}
        renderHeader={renderHeader}
        locale={locale}
        renderDay={(d, pos) => {
          const mine = timed.filter((o) => o.date === d)
          const lanes = dayLanes(mine)
          return (
            <>
              {underlay?.(d, pos)}
              {mine.map((o) => {
                const lane = lanes.get(o.key) ?? { lane: 0, of: 1 }
                return (
                  <div
                    key={o.key}
                    className={`absolute p-px ${passive ? 'pointer-events-none' : ''}`}
                    style={{ ...pos(o.start, o.end), left: `${(lane.lane / lane.of) * 100}%`, width: `${100 / lane.of}%` }}
                  >
                    <Chip o={o} label={labelOf(o.studentId)} highlight={highlight} linked={linked && !passive} locale={locale} />
                  </div>
                )
              })}
            </>
          )
        }}
      />

      {untimed.length > 0 && (
        <div className="space-y-1 text-xs">
          <p className="text-foreground/50">{t.untimed}</p>
          <ul className="flex flex-wrap gap-1.5">
            {untimed.map((o) => (
              <li key={o.key} className="flex items-center gap-1">
                <span className="text-foreground/50">
                  {formatMonthDay(o.date, locale)}
                </span>
                <Chip o={o} label={labelOf(o.studentId)} highlight={highlight} linked={linked} inline locale={locale} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Chip({
  o,
  label,
  highlight,
  linked,
  inline = false,
  locale,
}: {
  o: Occurrence
  label: string
  highlight?: string
  linked: boolean
  inline?: boolean // in the list under the timetable: does not fill a cell
  locale: Locale
}) {
  const missed = o.status === 'canceled' || o.status === 'rescheduled'
  const dimmed = highlight !== undefined && o.studentId !== highlight
  const style = dimmed
    ? 'bg-foreground/[0.06] text-foreground/40'
    : highlight !== undefined
      ? o.status === 'scheduled'
        ? 'border border-[var(--viz-bar)] bg-background text-[var(--viz-bar)]'
        : 'bg-[var(--viz-bar)] text-white'
      : o.status === 'scheduled'
        ? 'border border-foreground/30 bg-background'
        : o.status === 'done'
          ? 'bg-[color-mix(in_oklab,var(--background)_85%,var(--foreground))]'
          : 'bg-background'
  const props = {
    title: `${label} ${o.start ?? ''}–${o.end ?? ''} ${common[locale].lessonStatus[o.status] ?? o.status}${o.movedFrom ? schedule[locale].movedSuffix : ''}`,
    className: `${inline ? 'inline-block' : '@container block h-full'} overflow-hidden rounded px-1 py-px leading-tight ${style} ${missed ? 'line-through opacity-60' : ''}`,
  }
  // when narrow (phones) only the start time is shown; when wide, start and end
  const content = (
    <>
      <span className="block truncate">
        {label}
        {o.trial && <TrialTag locale={locale} className="ml-0.5" />}
        {o.proctor && <ProctorTag locale={locale} className="ml-0.5" />}
      </span>
      {!inline && o.start && o.end && (
        <span className="block text-[10px] tabular-nums opacity-80">
          {o.start}
          <span className="hidden @min-[4.75rem]:inline">–{o.end}</span>
        </span>
      )}
    </>
  )
  return linked ? (
    <Link href={`/students/${o.studentId}`} {...props}>
      {content}
    </Link>
  ) : (
    <span {...props}>{content}</span>
  )
}
