import { createClient } from '@/lib/supabase/server'
import { formatMonthDay } from '@/lib/format'
import {
  METRIC_TEMPLATES,
  byDate,
  formatValue,
  gapTo,
  groupMetrics,
  partLabel,
  reportScore,
  stageFor,
  summarize,
  toritsuStages,
  valuePattern,
  yearGrades,
  type MetricDef,
  type MetricRecord,
  type TargetStage,
} from '@/lib/metrics'
import { Sparkline } from '@/components/sparkline'
import { signed } from '@/components/goal-chart'
import { SubmitButton } from '@/components/submit-button'
import {
  addMetricRecords,
  addTemplateMetrics,
  createMetric,
  deleteMetric,
  deleteMetricRecord,
  setMetricParentVisible,
  updateMetric,
} from './metric-actions'
import type { Locale } from '@/lib/i18n/locale'
import { getTeacherLocale } from '@/lib/i18n/server'
import { common } from '@/lib/i18n/messages/common'
import { goalCard, grades } from '@/lib/i18n/messages/grades'

const input = 'rounded-md border border-foreground/20 bg-transparent px-2 py-1 text-sm'

function Hint({ unit, max }: { unit: string; max: number | null }) {
  if (unit === '%') return <>%</>
  if (max !== null) return <>/ {max}{unit ? ` ${unit}` : ''}</>
  return <>{unit}</>
}

// The Grades section on the student page: one card per metric with records (latest value, change since last time,
// trend line, all records), followed by the record form and adding metrics. Teacher only; the parent page doesn't show it
export async function GradesSection({
  studentId,
  today,
  error,
}: {
  studentId: string
  today: string
  error?: string
}) {
  const supabase = await createClient()
  const [metricsRes, recordsRes, studentRes, stagesRes] = await Promise.all([
    supabase.from('metrics').select('id, name, unit, direction, max_value, parent_visible, parent_id').eq('student_id', studentId).order('name'),
    supabase.from('metric_records').select('id, metric_id, date, value, note, created_at').eq('student_id', studentId),
    // the metric chosen in the Goal card ("which metric to compare"): its card shows the gap to the stage targets
    supabase
      .from('students')
      .select('target_metric_id, toritsu_conversion, report5, report6')
      .eq('id', studentId)
      .single(),
    supabase.from('target_stages').select('date, label, target_pass, target_best, pass_pct, best_pct').eq('student_id', studentId),
  ])
  if (metricsRes.error) throw metricsRes.error
  if (recordsRes.error) throw recordsRes.error
  if (studentRes.error) throw studentRes.error
  if (stagesRes.error) throw stagesRes.error

  const st = studentRes.data
  const metrics: MetricDef[] = metricsRes.data.map((m) => ({
    id: m.id,
    name: m.name,
    unit: m.unit,
    direction: m.direction === -1 ? -1 : 1,
    maxValue: m.max_value,
    parentVisible: m.parent_visible,
    parentId: m.parent_id,
  }))
  return (
    <GradesView
      locale={await getTeacherLocale()}
      studentId={studentId}
      today={today}
      error={error}
      metrics={metrics}
      totalRecords={recordsRes.data.reduce((n, r) => n.set(r.metric_id, (n.get(r.metric_id) ?? 0) + 1), new Map<string, number>())}
      records={recordsRes.data.map((r) => ({ id: r.id, metricId: r.metric_id, date: r.date, value: r.value, createdAt: r.created_at }))}
      notes={new Map(recordsRes.data.map((r) => [r.id, r.note]))}
      target={
        st.target_metric_id
          ? {
              metricId: st.target_metric_id,
              // with the Toritsu conversion on, the two lines are total-score percentages converted to raw aptitude-test scores
              // via the report-card grades (same as the Goal card)
              stages: toritsuStages(
                stagesRes.data.map((x) => ({ date: x.date, label: x.label, pass: x.target_pass, best: x.target_best, passPct: x.pass_pct, bestPct: x.best_pct })),
                st.toritsu_conversion
                  ? { report: reportScore(yearGrades(st.report5), yearGrades(st.report6))?.score ?? null }
                  : null
              ),
            }
          : undefined
      }
    />
  )
}

export function GradesView({
  studentId,
  today,
  error,
  metrics,
  totalRecords,
  records,
  notes,
  target,
  locale,
}: {
  studentId: string
  today: string
  error?: string
  metrics: MetricDef[]
  totalRecords: Map<string, number> // record count per metric (metrics with records can't be deleted)
  records: MetricRecord[] // this student's
  notes: Map<string, string | null>
  target?: { metricId: string; stages: TargetStage[] } // the metric and stage targets the Goal card compares against
  locale: Locale
}) {
  const t = grades[locale]
  const stagesOf = (id: string) => (target?.metricId === id && target.stages.length > 0 ? target.stages : undefined)
  const [errorKey, errorMetricId] = (error ?? '').split(':')
  const errorMetric = metrics.find((m) => m.id === errorMetricId)
  const groups = groupMetrics(metrics)
  const recordsOf = (id: string) => byDate(records.filter((r) => r.metricId === id))
  // only metrics with records get a card; a part with records counts too (before the total is recorded)
  const used = groups.filter((g) => [g.metric, ...g.parts].some((m) => records.some((r) => r.metricId === m.id)))
  const topLevel = groups.map((g) => g.metric)

  return (
    <section id="grades" className="space-y-4">
      <h2 className="text-sm font-medium text-foreground/60">{t.title}</h2>

      {used.length === 0 ? (
        <p className="text-sm text-foreground/50">{t.noRecords}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {used.map(({ metric: m, parts }) => (
            <li key={m.id} className="min-w-0 space-y-2 rounded-xl border border-foreground/10 px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 wrap-anywhere text-sm font-medium">{m.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-foreground/50">
                  <ParentToggle locale={locale} metric={m} studentId={studentId} />
                  {m.direction === 1 ? t.higherBetter : t.lowerBetter}
                </span>
              </div>
              <MetricBody locale={locale} m={m} mine={recordsOf(m.id)} studentId={studentId} notes={notes} stages={stagesOf(m.id)} />
              {parts.length > 0 && (
                // expand to see each part's (I, II, III) score and change
                <details className="group/parts rounded-lg bg-foreground/[0.03]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium [&::-webkit-details-marker]:hidden">
                    <span>{t.parts(parts.map((p) => partLabel(p, m)).join('・'))}</span>
                    <span aria-hidden className="text-foreground/40 transition-transform group-open/parts:rotate-90">›</span>
                  </summary>
                  <div className="divide-y divide-foreground/10 px-3 pb-2">
                    {parts.map((p) => (
                      <div key={p.id} className="space-y-1.5 py-2.5">
                        <p className="text-xs font-medium text-foreground/70">{partLabel(p, m)}</p>
                        <MetricBody locale={locale} m={p} mine={recordsOf(p.id)} studentId={studentId} notes={notes} stages={stagesOf(p.id)} compact />
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      {metrics.length > 0 && (
        <form action={addMetricRecords} className="space-y-3 rounded-xl border border-foreground/10 px-3 py-3">
          <input type="hidden" name="studentId" value={studentId} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{t.record}</span>
            <input type="date" name="date" required defaultValue={today} aria-label={t.date} className={input} />
            <input name="note" placeholder={t.notePlaceholder} aria-label={t.note} className={`${input} min-w-0 flex-1`} />
          </div>
          <ul className="divide-y divide-foreground/5">
            {groups.flatMap(({ metric, parts }) => [metric, ...parts]).map((m) => (
              <li key={m.id}>
                <label className="flex items-center gap-2 py-1.5 text-sm">
                  <span className={`min-w-0 flex-1 truncate ${m.parentId ? 'pl-4 text-foreground/70' : ''}`}>
                    {m.parentId ? `└ ${m.name}` : m.name}
                  </span>
                  <input
                    name={`v:${m.id}`}
                    pattern={valuePattern(m.unit, m.maxValue)}
                    title={m.unit === '%' ? t.valueTitlePct : m.maxValue !== null ? t.valueTitleMax(m.maxValue) : t.valueTitle}
                    inputMode={m.unit === '%' || m.maxValue !== null ? 'text' : 'decimal'}
                    placeholder={m.unit === '%' ? t.pctPlaceholder : groups.some((g) => g.metric.id === m.id && g.parts.length > 0) ? t.autoSum : ''}
                    autoComplete="off"
                    aria-label={m.name}
                    className={`${input} w-28 text-right tabular-nums`}
                  />
                  <span className="w-16 shrink-0 text-xs text-foreground/50">
                    <Hint unit={m.unit} max={m.maxValue} />
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <SubmitButton small pendingText="…">{t.submit}</SubmitButton>
            <span className="text-xs text-foreground/50">{t.severalHint}</span>
          </div>
        </form>
      )}
      {errorKey && Object.hasOwn(t.errors, errorKey) && (
        <p className="text-sm text-red-600">
          {errorMetric && t.errorFor(errorMetric.name)}
          {t.errors[errorKey]}
        </p>
      )}

      <details className="rounded-xl border border-dashed border-foreground/25 text-sm">
        <summary className="cursor-pointer px-3 py-2">
          {t.metricsTitle(metrics.length)}
        </summary>
        <div className="space-y-4 border-t border-foreground/10 px-3 py-3">
          <form action={addTemplateMetrics} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="studentId" value={studentId} />
            <span className="text-xs text-foreground/60">{t.fromTemplate}</span>
            <select name="template" aria-label={t.template} className={input}>
              {METRIC_TEMPLATES[locale].map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{tpl.label}</option>
              ))}
            </select>
            <SubmitButton small secondary pendingText="…">{t.add}</SubmitButton>
          </form>
          <form action={createMetric} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="studentId" value={studentId} />
            <span className="basis-full text-xs text-foreground/60 sm:basis-auto">{t.createOwn}</span>
            <MetricFields locale={locale} parents={topLevel} />
            <SubmitButton small secondary pendingText="…">{t.create}</SubmitButton>
          </form>
          <datalist id="metric-units">
            {t.units.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>

          {metrics.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-foreground/60">{t.existing}</p>
              <ul className="divide-y divide-foreground/5">
                {groups.flatMap(({ metric, parts }) => [metric, ...parts]).map((m) => {
                  const n = totalRecords.get(m.id) ?? 0
                  return (
                    <li key={m.id}>
                      <details>
                        <summary className="flex cursor-pointer items-baseline gap-2 py-1.5">
                          <span className={`min-w-0 flex-1 truncate ${m.parentId ? 'pl-4' : ''}`}>{m.parentId ? `└ ${m.name}` : m.name}</span>
                          <span className="text-right text-xs text-foreground/50">
                            {[m.unit, m.direction === 1 ? t.higherBetter : t.lowerBetter, m.maxValue !== null ? t.maxLabel(m.maxValue) : null, m.parentVisible ? t.parentVisible : null]
                              .filter(Boolean)
                              .join(' · ')}
                            {' · '}
                            {t.recordCount(n)}
                          </span>
                        </summary>
                        <div className="space-y-2 pb-3">
                          <form action={updateMetric} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="studentId" value={studentId} />
                            <input type="hidden" name="id" value={m.id} />
                            <MetricFields locale={locale} metric={m} parents={topLevel} />
                            <SubmitButton small secondary pendingText="…">{common[locale].save}</SubmitButton>
                          </form>
                          {n === 0 && (
                            <form action={deleteMetric}>
                              <input type="hidden" name="studentId" value={studentId} />
                              <input type="hidden" name="id" value={m.id} />
                              <button type="submit" className="text-xs text-foreground/50 hover:text-red-600">{t.deleteMetric}</button>
                            </form>
                          )}
                        </div>
                      </details>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          <p className="text-xs text-foreground/50">{t.footnote}</p>
        </div>
      </details>
    </section>
  )
}

// Fields shared by create and edit (name, unit, direction, maximum, part of…, visible to parents)
function MetricFields({ metric, parents, locale }: { metric?: MetricDef; parents: MetricDef[]; locale: Locale }) {
  const t = grades[locale]
  // possible parents: other top-level metrics (a metric that already has parts can't go inside another; the server checks this too)
  const options = parents.filter((p) => p.id !== metric?.id)
  return (
    <>
      <input
        name="name"
        required
        defaultValue={metric?.name}
        placeholder={t.namePlaceholder}
        aria-label={t.name}
        className={`${input} min-w-0 basis-full sm:basis-auto sm:flex-1`}
      />
      <input name="unit" list="metric-units" defaultValue={metric?.unit} placeholder={t.unit} aria-label={t.unit} className={`${input} w-20`} />
      <select name="direction" defaultValue={String(metric?.direction ?? 1)} aria-label={t.direction} className={input}>
        <option value="1">{t.higherBetter}</option>
        <option value="-1">{t.lowerBetter}</option>
      </select>
      <input
        type="number"
        name="max_value"
        min={0}
        step="any"
        defaultValue={metric?.maxValue ?? undefined}
        placeholder={t.maxPlaceholder}
        aria-label={t.max}
        className={`${input} w-28`}
      />
      {options.length > 0 && (
        <select name="parent_id" defaultValue={metric?.parentId ?? ''} aria-label={t.parentSelect} className={`${input} max-w-full`}>
          <option value="">{t.noParent}</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {t.inside(p.name)}
            </option>
          ))}
        </select>
      )}
      {!metric?.parentId && (
        <label className="flex items-center gap-1 text-xs text-foreground/70">
          <input type="checkbox" name="parent_visible" defaultChecked={metric?.parentVisible ?? false} />
          {t.parentVisible}
        </label>
      )}
    </>
  )
}

// One metric's numbers and trend: latest value, change since last time, best / last 3, trend line, all records (deletable).
// compact = a part shown inside its parent's card (smaller text).
// stages = this is the metric the Goal card compares against: the latest value and each record show the gap to the stage
// target that was next at the time (pass line / best case)
function MetricBody({
  m,
  mine,
  studentId,
  notes,
  stages,
  compact = false,
  locale,
}: {
  m: MetricDef
  mine: MetricRecord[]
  studentId: string
  notes: Map<string, string | null>
  stages?: TargetStage[]
  compact?: boolean
  locale: Locale
}) {
  const t = grades[locale]
  if (mine.length === 0) return <p className="text-xs text-foreground/50">{t.noRecordsYet(compact)}</p>
  const s = summarize(mine, m.direction)
  // short = inside a row of the full record list (no "target" label or unit, to save space)
  const gapText = (r: { date: string; value: number }, short = false) => {
    const st = stages && stageFor(stages, r.date)
    if (!st || (st.pass === null && st.best === null)) return null
    const g = (line: number | null) => (line === null ? '—' : signed(gapTo(r.value, line, m.direction), short ? '' : m.unit))
    return t.gapTo(formatMonthDay(st.date), short, g(st.pass), g(st.best))
  }
  const latestGap = gapText(s.latest!)
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className={`${compact ? 'text-base' : 'text-xl'} font-semibold`}>
          {formatValue(s.latest!.value, m.unit)}
          {compact && m.maxValue !== null && <span className="ml-1 text-xs font-normal text-foreground/50">/ {m.maxValue}</span>}
        </span>
        {s.change !== null && (
          <span
            className={`text-sm ${
              s.improved === true ? 'text-green-700 dark:text-green-500' : s.improved === false ? 'text-red-600' : 'text-foreground/60'
            }`}
          >
            {s.change > 0 ? '▲' : s.change < 0 ? '▼' : '—'} {formatValue(Math.abs(s.change), m.unit)}
            {s.improved === true ? t.better : s.improved === false ? t.worse : t.same}
          </span>
        )}
        <span className="ml-auto text-xs text-foreground/50">
          {t.bestRecent(formatValue(s.best!, m.unit), formatValue(s.recentAvg!, m.unit))}
        </span>
      </div>
      {latestGap && (
        <p className="text-xs text-foreground/70 tabular-nums">
          {latestGap} <span className="text-foreground/40">{goalCard[locale].linesHint}</span>
        </p>
      )}
      <Sparkline locale={locale} points={mine} unit={m.unit} />
      <details className="text-xs">
        <summary className="cursor-pointer text-foreground/50">{t.allRecords(s.count)}</summary>
        <ul className="mt-1 space-y-0.5">
          {[...mine].reverse().map((r) => (
            <li key={r.id} className="flex items-baseline gap-2">
              <span className="w-20 shrink-0 text-foreground/60">{formatMonthDay(r.date, locale)}</span>
              <span className="shrink-0 tabular-nums">{formatValue(r.value, m.unit)}</span>
              <span className="min-w-0 flex-1 wrap-anywhere text-foreground/50">
                {gapText(r, true) && <span className="mr-2 whitespace-nowrap tabular-nums text-foreground/60">{gapText(r, true)}</span>}
                {notes.get(r.id)}
              </span>
              <form action={deleteMetricRecord} className="shrink-0">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="studentId" value={studentId} />
                <button type="submit" className="text-foreground/40 hover:text-red-600">{t.delete}</button>
              </form>
            </li>
          ))}
        </ul>
      </details>
    </>
  )
}

function ParentToggle({ metric, studentId, locale }: { metric: MetricDef; studentId: string; locale: Locale }) {
  const t = grades[locale]
  const on = metric.parentVisible === true
  return (
    <form action={setMetricParentVisible}>
      <input type="hidden" name="id" value={metric.id} />
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="visible" value={on ? '0' : '1'} />
      <button
        type="submit"
        title={on ? t.toggleOn : t.toggleOff}
        className={`rounded-full px-2 py-px ${
          on ? 'bg-[var(--viz-bar)] text-background' : 'border border-foreground/20 text-foreground/60 hover:text-foreground'
        }`}
      >
        {on ? t.parentVisible : t.onlyYou}
      </button>
    </form>
  )
}
