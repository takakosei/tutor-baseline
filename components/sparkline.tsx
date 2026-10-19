import { formatMonthDay } from '@/lib/format'
import { formatValue } from '@/lib/metrics'
import type { Locale } from '@/lib/i18n/locale'
import { common } from '@/lib/i18n/messages/common'

// Trend of one metric: a single line, one dot per record, evenly spaced in record order (several records on the same day
// stay apart instead of stacking into a vertical line). The y axis spans this data; the first and last dates are shown below.
// Each dot has a title (hover for date and value); the full numbers are in "All records"
export function Sparkline({ points, unit, locale }: { points: { date: string; value: number }[]; unit: string; locale: Locale }) {
  if (points.length === 0) return null
  const W = 240
  const H = 56
  const PAD = 6
  const values = points.map((p) => p.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const range = hi - lo || 1
  const x = (i: number) => (points.length === 1 ? W / 2 : PAD + (i / (points.length - 1)) * (W - 2 * PAD))
  const y = (v: number) => (hi === lo ? H / 2 : H - PAD - ((v - lo) / range) * (H - 2 * PAD))
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')

  const first = points[0].date
  const last = points.at(-1)!.date

  return (
    <div className="space-y-0.5">
      <div className="flex items-stretch gap-2">
        <div className="flex w-14 shrink-0 flex-col justify-between whitespace-nowrap text-right text-[10px] tabular-nums text-foreground/50">
          <span>{formatValue(hi, unit)}</span>
          {hi !== lo && <span>{formatValue(lo, unit)}</span>}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-14 min-w-0 flex-1" role="img" aria-label={common[locale].trend}>
          <line x1={0} x2={W} y1={H - PAD} y2={H - PAD} stroke="var(--viz-track)" strokeWidth={1} />
          {points.length > 1 && (
            <path d={path} fill="none" stroke="var(--viz-bar)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          )}
          {points.map((p, i) => (
            <circle key={i} cx={x(i)} cy={y(p.value)} r={4} fill="var(--viz-bar)" stroke="var(--background)" strokeWidth={2}>
              <title>{`${formatMonthDay(p.date)} · ${formatValue(p.value, unit)}`}</title>
            </circle>
          ))}
        </svg>
      </div>
      {points.length > 1 && (
        <div className="flex justify-between pl-16 text-[10px] tabular-nums text-foreground/50">
          <span>{formatMonthDay(first)}</span>
          <span>{formatMonthDay(last)}</span>
        </div>
      )}
    </div>
  )
}
