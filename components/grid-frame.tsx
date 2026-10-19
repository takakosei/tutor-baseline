import { BANDS, toMinutes } from '@/lib/schedule'
import { formatMonthDay, weekdayName } from '@/lib/format'
import type { Locale } from '@/lib/i18n/locale'

// The frame of a weekly timetable: header (weekday + date), hour ticks on the left, one column per day
// (a light background for the four standard slots, a line on each hour).
// The tutor's timetable (WeekGrid), the "unavailable" editor and the parent page all use it, so all three look the same.
// renderDay decides what goes in each column; pos(start, end) gives the position (real time, as percentages).
// No hooks, so it works in both server and client components

// Today's column: an opaque light tint (a translucent one would let the grey grid lines behind it show through)
export const TODAY_BG = 'bg-[color-mix(in_oklab,var(--background)_95%,var(--foreground))]'
export const HOUR_PX = 34

export type Pos = (start: string, end: string) => { top: string; height: string }

export function GridFrame({
  days,
  today,
  from,
  to,
  renderDay,
  renderHeader,
  dayClassName,
  hourPx = HOUR_PX,
  locale,
}: {
  days: string[] // 7 days, starting on Monday
  today: string
  from: number // timeline range in minutes, see timelineRange
  to: number
  renderDay: (date: string, pos: Pos) => React.ReactNode
  renderHeader?: (date: string, label: React.ReactNode) => React.ReactNode // the header can be swapped for a button etc. (editor: clicking a weekday = the whole day)
  dayClassName?: (date: string) => string | undefined // the column background (e.g. greyed-out past days); by default today is tinted and other days are plain
  hourPx?: number
  locale: Locale
}) {
  const span = to - from
  const pct = (minutes: number) => `${((minutes - from) / span) * 100}%`
  const pos: Pos = (start, end) => ({ top: pct(toMinutes(start)), height: `${((toMinutes(end) - toMinutes(start)) / span) * 100}%` })
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => from + i * 60)
  const bg = (d: string) => dayClassName?.(d) ?? (d === today ? TODAY_BG : 'bg-background')

  return (
    <div className="grid grid-cols-[2.75rem_repeat(7,minmax(0,1fr))] gap-px overflow-hidden rounded-md border border-foreground/10 bg-foreground/10 text-xs">
      <div className="bg-background" />
      {days.map((d, i) => {
        const label = (
          <>
            {weekdayName(i, locale)}
            <span className="block text-[10px] tabular-nums">{formatMonthDay(d)}</span>
          </>
        )
        return (
          <div key={d} className={`text-center ${d === today ? `${TODAY_BG} font-semibold` : 'bg-background text-foreground/60'}`}>
            {renderHeader ? renderHeader(d, label) : <div className="px-1 py-1.5">{label}</div>}
          </div>
        )
      })}

      {/* Time ticks: every full hour */}
      <div className="relative bg-background" style={{ height: (span / 60) * hourPx }}>
        {hours.slice(0, -1).map((h) => (
          <span key={h} className="absolute right-1 text-[10px] leading-none text-foreground/50" style={{ top: `calc(${pct(h)} + 2px)` }}>
            {String(h / 60).padStart(2, '0')}:00
          </span>
        ))}
      </div>

      {days.map((d) => (
        <div key={d} className={`relative ${bg(d)}`}>
          {/* The four standard slots: a light background */}
          {BANDS.map((b) => (
            <div key={b.start} aria-hidden className="absolute inset-x-0 bg-foreground/[0.035]" style={pos(b.start, b.end)} />
          ))}
          {/* Hour lines */}
          {hours.slice(1, -1).map((h) => (
            <div key={h} aria-hidden className="absolute inset-x-0 border-t border-foreground/[0.07]" style={{ top: pct(h) }} />
          ))}
          {renderDay(d, pos)}
        </div>
      ))}
    </div>
  )
}
