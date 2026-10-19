import Link from 'next/link'
import {
  addDays,
  lessonStats,
  missedVsOnTime,
  recentMoods,
  revisitShare,
  timeliness,
  type CheckpointRec,
  type LessonRec,
  type Timeliness,
} from '@/lib/analytics'
import type { Locale } from '@/lib/i18n/locale'
import { analytics } from '@/lib/i18n/messages/analytics'

// The analytics view. It does not fetch: the page passes the data in (database or demo data), and all calculations live in lib/analytics.ts.
// One colour rule for the whole page: a single hue, and more contrast with the background = needs more attention
// (darker in light mode, brighter in dark mode; see --viz-attn-* in globals.css).

const ATTN = ['bg-[var(--viz-attn-1)]', 'bg-[var(--viz-attn-2)]', 'bg-[var(--viz-attn-3)]'] as const

function pct(x: number | null) {
  return x === null ? '—' : `${Math.round(x * 100)}%`
}

export type AnalyticsData = {
  students: { id: string; name: string }[]
  lessons: LessonRec[]
  checkpoints: CheckpointRec[]
}

// basePath: the page the filter links point to. showSourceToggle: show the real / demo switch (hidden on the public demo).
// keep: query parameters every filter link carries along (lang on the public demo)
export function AnalyticsView({
  data,
  today,
  range,
  isDemo,
  basePath,
  showSourceToggle,
  locale,
  keep = {},
}: {
  data: AnalyticsData
  today: string
  range: 'all' | '12w'
  isDemo: boolean
  basePath: string
  showSourceToggle: boolean
  locale: Locale
  keep?: Record<string, string>
}) {
  const t = analytics[locale]
  const from = range === '12w' ? addDays(today, -84) : null
  const lessons = from ? data.lessons.filter((l) => l.date >= from) : data.lessons
  const checkpoints = from
    ? data.checkpoints.filter((c) => c.dueDate === null || c.dueDate >= from)
    : data.checkpoints

  const overall = { lessons: lessonStats(lessons), timeliness: timeliness(checkpoints, today) }
  const relation = missedVsOnTime(checkpoints, lessons, today)
  const rows = data.students.map((s) => {
    const L = lessons.filter((l) => l.studentId === s.id)
    return {
      ...s,
      lessons: lessonStats(L),
      timeliness: timeliness(checkpoints.filter((c) => c.studentId === s.id), today),
      moods: recentMoods(L),
      revisit: revisitShare(L, today),
    }
  })

  const href = (next: { demo?: boolean; range?: string }) => {
    const q = new URLSearchParams(keep)
    if (showSourceToggle && (next.demo ?? isDemo)) q.set('demo', '1')
    if ((next.range ?? range) === '12w') q.set('range', '12w')
    const s = q.toString()
    return s ? `${basePath}?${s}` : basePath
  }

  return (
    <div className="space-y-8">
      {/* Filters: one row above all the charts, applying to the whole page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">{t.title}</h1>
        <div className="flex flex-wrap gap-4 text-sm">
          <Segmented
            label={t.range}
            options={[
              { text: t.all, href: href({ range: 'all' }), active: range === 'all' },
              { text: t.last12w, href: href({ range: '12w' }), active: range === '12w' },
            ]}
          />
          {showSourceToggle && (
            <Segmented
              label={t.source}
              options={[
                { text: t.real, href: href({ demo: false }), active: !isDemo },
                { text: t.demo, href: href({ demo: true }), active: isDemo },
              ]}
            />
          )}
        </div>
      </div>

      {isDemo && (
        <p className="rounded-md bg-foreground/[0.04] px-4 py-2 text-sm text-foreground/70">
          {t.demoNote}
        </p>
      )}

      {/* KPIs: headline numbers */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t.held} value={String(overall.lessons.held)} note={t.missedNote(overall.lessons.missed)} />
        <Stat
          label={t.missRate}
          value={pct(overall.lessons.missRate)}
          note={t.lessonsOf(overall.lessons.missed, overall.lessons.held + overall.lessons.missed)}
        />
        <Stat
          label={t.onTimeRate}
          value={pct(overall.timeliness.onTimeRate)}
          note={t.resolvedOf(overall.timeliness.onTime, overall.timeliness.resolved)}
        />
        <Stat label={t.revisit4w} value={pct(revisitShare(lessons, today))} note={t.revisitNote} />
      </section>

      <Section title={t.moodTitle} note={t.moodNote}>
        <Legend items={t.moods} note={t.legendNote} />
        <ul className="space-y-2">
          {rows.map((r) => (
            // 12 cells do not fit on one phone row: name and ratio on one line, the cells on their own line, oldest to newest without wrapping
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:flex-nowrap">
              <span className="w-28 shrink-0 truncate">{r.name}</span>
              {r.moods.length === 0 ? (
                <span className="order-last basis-full text-xs text-foreground/50 sm:order-none sm:basis-auto sm:flex-1">{t.noMoods}</span>
              ) : (
                <ol className="order-last flex basis-full gap-0.5 sm:order-none sm:basis-auto sm:flex-1" aria-label={t.recentMoods(r.name)}>
                  {r.moods.map((m, i) => (
                    <li
                      key={i}
                      title={`${m.date} · ${t.moods[m.mood - 1]}`}
                      aria-label={`${m.date} ${t.moods[m.mood - 1]}`}
                      className={`size-3.5 rounded-sm ${ATTN[m.mood - 1]}`}
                    />
                  ))}
                </ol>
              )}
              <span className="ml-auto w-24 shrink-0 text-right text-xs text-foreground/60 tabular-nums">
                {t.revisitShare(pct(r.revisit))}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t.timelinessTitle} note={t.timelinessNote}>
        <Legend items={[t.onTime, t.late, t.overdue]} note={t.legendNote} />
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 truncate">{r.name}</span>
              <TimelinessBar t={r.timeliness} locale={locale} />
              <span className="w-24 shrink-0 text-right text-xs text-foreground/60 tabular-nums">
                {r.timeliness.resolved === 0
                  ? '—'
                  : t.onTimeOf(r.timeliness.onTime, r.timeliness.resolved)}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title={t.relationTitle}
        note={t.relationNote}
      >
        <ul className="space-y-3">
          {[
            { label: t.withMissed, g: relation.withMissed },
            { label: t.withoutMissed, g: relation.withoutMissed },
          ].map(({ label, g }) => (
            <li key={label} className="flex items-center gap-3 text-sm">
              <span className="w-36 shrink-0">{label}</span>
              <div className="h-4 flex-1 rounded-r-[4px] bg-[var(--viz-track)]" title={t.groupTitle(label, g.onTime, g.n)}>
                {g.onTimeRate !== null && (
                  <div
                    className="h-full rounded-r-[4px] bg-[var(--viz-bar)]"
                    style={{ width: `${g.onTimeRate * 100}%` }}
                  />
                )}
              </div>
              <span className="w-28 shrink-0 text-right text-xs text-foreground/60 tabular-nums">
                {pct(g.onTimeRate)} · {t.groupCount(g.n)}
              </span>
            </li>
          ))}
        </ul>
        {relation.withMissed.n + relation.withoutMissed.n < 10 && (
          <p className="text-xs text-foreground/50">{t.fewCheckpoints}</p>
        )}
      </Section>

      {/* Table: the numbers behind every chart above, readable without colour */}
      <Section title={t.tableTitle}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm tabular-nums">
            <thead className="text-left text-xs text-foreground/50">
              <tr className="border-b border-foreground/10">
                <th className="py-2 pr-3 font-normal">{t.th.student}</th>
                <th className="py-2 pr-3 text-right font-normal">{t.th.held}</th>
                <th className="py-2 pr-3 text-right font-normal">{t.th.missed}</th>
                <th className="py-2 pr-3 text-right font-normal">{t.th.missRate}</th>
                <th className="py-2 pr-3 text-right font-normal">{t.th.onTime}</th>
                <th className="py-2 pr-3 text-right font-normal">{t.th.late}</th>
                <th className="py-2 pr-3 text-right font-normal">{t.th.overdue}</th>
                <th className="py-2 pr-3 text-right font-normal">{t.th.onTimeRate}</th>
                <th className="py-2 pr-3 text-right font-normal">{t.th.avgLate}</th>
                <th className="py-2 text-right font-normal">{t.th.revisit}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-foreground/5">
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3 text-right">{r.lessons.held}</td>
                  <td className="py-2 pr-3 text-right">{r.lessons.missed}</td>
                  <td className="py-2 pr-3 text-right">{pct(r.lessons.missRate)}</td>
                  <td className="py-2 pr-3 text-right">{r.timeliness.onTime}</td>
                  <td className="py-2 pr-3 text-right">{r.timeliness.late}</td>
                  <td className="py-2 pr-3 text-right">{r.timeliness.overdue}</td>
                  <td className="py-2 pr-3 text-right">{pct(r.timeliness.onTimeRate)}</td>
                  <td className="py-2 pr-3 text-right">
                    {r.timeliness.avgDaysLate === null ? '—' : t.days(r.timeliness.avgDaysLate.toFixed(1))}
                  </td>
                  <td className="py-2 text-right">{pct(r.revisit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

function Segmented({
  label,
  options,
}: {
  label: string
  options: { text: string; href: string; active: boolean }[]
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-foreground/50">{label}</span>
      <div className="flex rounded-md border border-foreground/15 p-0.5">
        {options.map((o) => (
          <Link
            key={o.text}
            href={o.href}
            aria-current={o.active ? 'page' : undefined}
            className={`rounded px-2.5 py-0.5 ${
              o.active ? 'bg-foreground text-background' : 'text-foreground/70 hover:bg-foreground/[0.05]'
            }`}
          >
            {o.text}
          </Link>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="space-y-1 rounded-md border border-foreground/10 px-4 py-3">
      <p className="text-xs text-foreground/60">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-foreground/50">{note}</p>
    </div>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-medium">{title}</h2>
        {note && <p className="text-xs text-foreground/50">{note}</p>}
      </div>
      {children}
    </section>
  )
}

// Legend: swatch + text (the text uses the body colour, not the data colour)
function Legend({ items, note }: { items: [string, string, string]; note: string }) {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-foreground/70">
      {items.map((text, i) => (
        <li key={text} className="flex items-center gap-1.5">
          <span className={`size-3 rounded-sm ${ATTN[i]}`} />
          {text}
        </li>
      ))}
      <li className="text-foreground/40">{note}</li>
    </ul>
  )
}

// 100% stacked bar: on time / late / not done. 2px gaps between segments, rounded right end, square left end (the baseline)
function TimelinessBar({ t, locale }: { t: Timeliness; locale: Locale }) {
  const m = analytics[locale]
  if (t.resolved === 0) {
    return <span className="flex-1 text-xs text-foreground/50">{m.noResolved}</span>
  }
  const parts = [
    { n: t.onTime, label: m.onTime },
    { n: t.late, label: t.avgDaysLate !== null ? m.lateAvg(t.avgDaysLate.toFixed(1)) : m.late },
    { n: t.overdue, label: m.overdue },
  ]
  return (
    <div className="flex h-4 flex-1 gap-0.5 overflow-hidden rounded-r-[4px]" role="img" aria-label={parts.map((p) => `${p.label} ${p.n}`).join(', ')}>
      {parts.map((p, i) =>
        p.n === 0 ? null : (
          <div
            key={i}
            title={m.count(p.label, p.n)}
            className={`h-full ${ATTN[i]}`}
            style={{ flex: `${p.n} 1 0%` }}
          />
        )
      )}
    </div>
  )
}
