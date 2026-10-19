import { formatMonthDay } from '@/lib/format'
import { formatValue, gapTo, stageFor, type TargetStage } from '@/lib/metrics'
import type { Locale } from '@/lib/i18n/locale'
import { common } from '@/lib/i18n/messages/common'
import { goal } from '@/lib/i18n/messages/goal'

// Trend chart for a goal card: actual mock-exam scores (one line, one dot per exam) and the stage targets
// (the pass line and the best-case line, drawn as steps: each step = "reach this much by this date"), up to exam day.
// The band between the two lines is lightly filled. The x axis uses real dates.
// Dots have a title (hover for date, score and the gap to the next stage target); the full numbers are in the stage-target table below.
// Coordinates are viewBox units; the chart is at most md wide (full width on a phone, not oversized on a desktop).
// Each side leaves room for its text (ticks, "today", dates) so nothing is clipped
const W = 360
const H = 128
const L = 30 // left: ticks
const R = 12
const T = 18 // top: "today"
const B = 18 // bottom: dates

export function GoalChart({
  records,
  stages,
  unit,
  maxValue,
  direction,
  examDate,
  today,
  locale,
}: {
  records: { date: string; value: number }[]
  stages: TargetStage[]
  unit: string
  maxValue: number | null
  direction: 1 | -1
  examDate: string | null
  today: string
  locale: Locale
}) {
  const t = goal[locale]
  const sorted = [...stages].sort((a, b) => a.date.localeCompare(b.date))
  const dates = [...records.map((r) => r.date), ...sorted.map((s) => s.date), today, ...(examDate ? [examDate] : [])].sort()
  const start = dates[0]
  const end = dates.at(-1)!
  const day = (d: string) => Date.parse(d) / 86_400_000
  const span = Math.max(day(end) - day(start), 1)
  const x = (d: string) => L + ((day(d) - day(start)) / span) * (W - L - R)
  const lines = sorted.flatMap((s) => [s.pass, s.best]).filter((v): v is number => v !== null)
  const top = maxValue ?? niceCeil(Math.max(1, ...records.map((r) => r.value), ...lines))
  const y = (v: number) => T + (1 - Math.min(v, top) / top) * (H - T - B)

  // Steps: segment i runs from the previous stage's date (the first from the chart's start) to this stage's date at this stage's value; missing values leave a gap
  const segments = sorted.map((s, i) => ({ from: i === 0 ? start : sorted[i - 1].date, to: s.date, pass: s.pass, best: s.best }))
  const step = (key: 'pass' | 'best') =>
    segments
      .filter((g) => g[key] !== null)
      .map((g) => `M${x(g.from).toFixed(1)},${y(g[key]!).toFixed(1)}H${x(g.to).toFixed(1)}`)
      .join('')
  const path = records.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(r.date).toFixed(1)},${y(r.value).toFixed(1)}`).join('')

  const tip = (r: { date: string; value: number }) => {
    const s = stageFor(sorted, r.date)
    const gap = (line: number | null) => (line === null ? '—' : signed(gapTo(r.value, line, direction), unit))
    return `${formatMonthDay(r.date)} · ${formatValue(r.value, unit)}${
      s && (s.pass !== null || s.best !== null) ? t.gapToStage(formatMonthDay(s.date), gap(s.pass), gap(s.best)) : ''
    }`
  }

  const todayX = Math.min(Math.max(x(today), L + 14), W - R - 14) // keep the "today" label inside the chart

  return (
    <figure className="max-w-md space-y-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={t.chartLabel}>
        {/* Ticks: 0, half, top (full marks) */}
        {[0, top / 2, top].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--viz-track)" strokeWidth={1} />
            <text x={L - 5} y={y(v) + 3.5} textAnchor="end" className="fill-foreground/50 text-[10px] tabular-nums">
              {formatValue(v, '')}
            </text>
          </g>
        ))}
        {/* Band between the lines */}
        {segments
          .filter((g) => g.pass !== null && g.best !== null)
          .map((g, i) => (
            <rect
              key={i}
              x={x(g.from)}
              width={Math.max(x(g.to) - x(g.from), 0)}
              y={Math.min(y(g.pass!), y(g.best!))}
              height={Math.abs(y(g.pass!) - y(g.best!))}
              className="fill-foreground/[0.06]"
            />
          ))}
        <path d={step('best')} fill="none" stroke="currentColor" strokeWidth={2} className="text-foreground/30" />
        <path d={step('pass')} fill="none" stroke="currentColor" strokeWidth={2} className="text-foreground/60" />
        {/* Today and exam day */}
        <line x1={x(today)} x2={x(today)} y1={T - 3} y2={H - B} stroke="currentColor" strokeWidth={1} className="text-foreground/25" />
        <text x={todayX} y={T - 6} textAnchor="middle" className="fill-foreground/50 text-[10px]">
          {common[locale].today}
        </text>
        {/* Actual scores */}
        {records.length > 1 && (
          <path d={path} fill="none" stroke="var(--viz-bar)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {records.map((r, i) => (
          <circle key={i} cx={x(r.date)} cy={y(r.value)} r={4} fill="var(--viz-bar)" stroke="var(--background)" strokeWidth={2}>
            <title>{tip(r)}</title>
          </circle>
        ))}
        <text x={L} y={H - 4} className="fill-foreground/50 text-[10px] tabular-nums">
          {formatMonthDay(start)}
        </text>
        <text x={W - R} y={H - 4} textAnchor="end" className="fill-foreground/50 text-[10px] tabular-nums">
          {examDate === end ? t.exam(formatMonthDay(end)) : formatMonthDay(end)}
        </text>
      </svg>
      <figcaption className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-foreground/60">
        <Key className="bg-[var(--viz-bar)]" round label={t.actual} />
        <Key className="bg-foreground/60" label={t.passLine} />
        <Key className="bg-foreground/30" label={t.bestLine} />
      </figcaption>
    </figure>
  )
}

function Key({ className, label, round = false }: { className: string; label: string; round?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block ${round ? 'size-2 rounded-full' : 'h-0.5 w-3'} ${className}`} />
      {label}
    </span>
  )
}

export function signed(n: number, unit: string): string {
  const v = Math.round(n * 10) / 10
  return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${formatValue(Math.abs(v), unit)}`
}

// Top tick: rounded up to 1 / 2 / 5 × 10ⁿ
function niceCeil(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v))
  return [1, 2, 5, 10].map((m) => m * p).find((c) => c >= v)!
}
