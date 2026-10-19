import { createClient } from '@/lib/supabase/server'
import { formatMonthDay } from '@/lib/format'
import { daysBetween } from '@/lib/progress'
import {
  byDate,
  formatValue,
  gapTo,
  reportScore,
  stageFor,
  stageRows,
  SUBJECT_LABELS,
  SUBJECTS,
  TEKISEI_MAX,
  tekiseiPct,
  toritsuMaxPct,
  subjectGrade,
  subjectKanten,
  toritsuStages,
  yearGrades,
  type TargetStage,
  type TargetState,
  type YearGrades,
} from '@/lib/metrics'
import { GoalChart, signed } from '@/components/goal-chart'
import { StagePctFields } from './stage-pct-fields'
import { SubmitButton } from '@/components/submit-button'
import {
  addReportItem,
  addStage,
  deleteReportItem,
  deleteStage,
  saveGrades,
  saveReportItem,
  saveStage,
  setTargetMetric,
  setToritsu,
} from './goal-actions'
import type { Locale } from '@/lib/i18n/locale'
import { getTeacherLocale } from '@/lib/i18n/server'
import { common } from '@/lib/i18n/messages/common'
import { goal } from '@/lib/i18n/messages/goal'
import { goalCard } from '@/lib/i18n/messages/grades'

// The Goal card on the student page (teacher only; the parent page doesn't read these tables).
// The most important exam is the end point in the student's profile. One metric's mock-exam scores are compared with
// stage targets (a pass line and a best-case line).
// Always visible: a one-line summary (current score, the next stage's target, the gap), a trend chart and one row per stage;
// clicking a row edits it in place (collapsed), and the school-report items and "which metric to compare" each fold into one row.
// With the Toritsu conversion on: stage targets are percentages of the total score (1000), converted to raw aptitude-test
// scores using the school-report points from the report-card grades, then shown and compared

const input = 'rounded-md border border-foreground/20 bg-transparent px-2 py-1 text-sm'
const num = `${input} w-20 text-right tabular-nums`
const fold = 'flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden'
const chevron = 'shrink-0 text-foreground/40 transition-transform group-open:rotate-90'

// color for the band the actual score falls in (text in goalCard.state)
const STATE: Record<TargetState, string> = {
  below: 'bg-red-500/10 text-red-700 dark:text-red-400',
  pass: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  best: 'bg-green-500/15 text-green-800 dark:text-green-300',
}

export async function GoalSection({ studentId, today, error }: { studentId: string; today: string; error?: string }) {
  const supabase = await createClient()
  const locale = await getTeacherLocale()
  const [student, metrics, stages, reports] = await Promise.all([
    supabase
      .from('students')
      .select('end_label, end_date, target_metric_id, toritsu_conversion, report5, report6')
      .eq('id', studentId)
      .single(),
    supabase.from('metrics').select('id, name, unit, direction, max_value, parent_id, metric_records(date, value, created_at)').eq('student_id', studentId).order('name'),
    supabase.from('target_stages').select('id, date, label, target_pass, target_best, pass_pct, best_pct').eq('student_id', studentId).order('date'),
    supabase.from('report_items').select('id, label, value, max_value').eq('student_id', studentId).order('created_at'),
  ])
  for (const r of [student, metrics, stages, reports]) if (r.error) throw r.error

  const st = student.data!
  const m = metrics.data!.find((x) => x.id === st.target_metric_id) ?? null
  const y5 = yearGrades(st.report5)
  const y6 = yearGrades(st.report6)
  const toritsu = st.toritsu_conversion ? { k5: st.report5, k6: st.report6, y5, y6, report: reportScore(y5, y6) } : null
  return (
    <GoalView
      locale={locale}
      studentId={studentId}
      today={today}
      error={error}
      exam={{ label: st.end_label, date: st.end_date }}
      metricOptions={metrics.data!.map((x) => ({ id: x.id, name: x.parent_id ? `└ ${x.name}` : x.name }))}
      metric={
        m && {
          id: m.id,
          name: m.name,
          unit: m.unit,
          maxValue: m.max_value,
          direction: m.direction === -1 ? -1 : 1,
          records: byDate(m.metric_records.map((r, i) => ({ id: String(i), metricId: m.id, date: r.date, value: r.value, createdAt: r.created_at }))).map(
            (r) => ({ date: r.date, value: r.value })
          ),
        }
      }
      toritsu={toritsu}
      stages={toritsuStages(
        stages.data!.map((s) => ({ id: s.id, date: s.date, label: s.label, pass: s.target_pass, best: s.target_best, passPct: s.pass_pct, bestPct: s.best_pct })),
        toritsu && { report: toritsu.report?.score ?? null }
      )}
      reports={reports.data!.map((r) => ({ id: r.id, label: r.label, value: r.value, max: r.max_value }))}
    />
  )
}

export function GoalView({
  studentId,
  today,
  error,
  exam,
  metricOptions,
  metric,
  toritsu,
  stages,
  reports,
  locale,
}: {
  studentId: string
  today: string
  error?: string
  exam: { label: string | null; date: string | null }
  metricOptions: { id: string; name: string }[]
  metric: {
    id: string
    name: string
    unit: string
    maxValue: number | null
    direction: 1 | -1
    records: { date: string; value: number }[]
  } | null
  // With the Toritsu conversion on: both years' assessment criteria (27 digits), the combined grades and the school-report points;
  // the two stage lines are already converted to raw aptitude-test scores
  toritsu: {
    k5: string | null
    k6: string | null
    y5: YearGrades | null
    y6: YearGrades | null
    report: { score: number; estimated: boolean } | null
  } | null
  stages: (TargetStage & { id: string; passPct: number | null; bestPct: number | null })[]
  reports: { id: string; label: string; value: number | null; max: number | null }[]
  locale: Locale
}) {
  const t = goalCard[locale]
  const direction = metric?.direction ?? 1
  const unit = metric?.unit ?? ''
  const rows = stageRows(stages, metric?.records ?? [], direction)
  const daysLeft = exam.date ? daysBetween(today, exam.date) : null
  const latest = metric?.records.at(-1) ?? null
  const next = stageFor(stages, today) // the next stage to reach (the last one if all are past)
  const hidden = (id?: string) => (
    <>
      <input type="hidden" name="studentId" value={studentId} />
      {id && <input type="hidden" name="id" value={id} />}
    </>
  )
  const lines = (pass: number | null, best: number | null) =>
    pass === null && best === null ? t.notSet : `${pass === null ? '—' : formatValue(pass, '')} / ${best === null ? '—' : formatValue(best, '')}`
  const pcts = (pass: number | null, best: number | null) => `${pass === null ? '—' : `${formatValue(pass, '')}%`} / ${best === null ? '—' : `${formatValue(best, '')}%`}`
  const report = toritsu?.report?.score ?? null
  const tekisei = (total: number | null) => (total === null || report === null ? null : Math.round(tekiseiPct(total, report) * 10) / 10)
  const noReport = toritsu !== null && toritsu.report === null
  // with the current school report, the highest total-score % reachable with a perfect aptitude test; stages above it are
  // out of reach (converted aptitude score > 300)
  const maxPct = toritsu?.report ? toritsuMaxPct(toritsu.report.score) : null
  const over = (v: number | null) => maxPct !== null && v !== null && v > TEKISEI_MAX
  const unreachable = maxPct !== null && rows.some((r) => over(r.pass) || over(r.best))

  return (
    <section id="goal" className="scroll-mt-4 space-y-4 rounded-xl border border-foreground/10 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-medium">
          {t.title}
          {(exam.label || exam.date) && (
            <span className="ml-2 font-normal text-foreground/60">
              {exam.label}
              {exam.date && ` · ${formatMonthDay(exam.date, locale)}`}
              {daysLeft !== null && daysLeft > 0 && t.daysLeft(daysLeft)}
            </span>
          )}
        </h2>
        <span className="text-xs text-foreground/40">{t.onlyYou}</span>
      </header>

      {/* One line: current score → the next stage's target and the gap */}
      {metric && latest && next && (next.pass !== null || next.best !== null) && (
        <Headline locale={locale} latest={latest} next={next} unit={unit} direction={direction} />
      )}

      {metric && (metric.records.length > 0 || stages.length > 0) && (
        <GoalChart
          locale={locale}
          records={metric.records}
          stages={stages}
          unit={metric.unit}
          maxValue={metric.maxValue}
          direction={metric.direction}
          examDate={exam.date}
          today={today}
        />
      )}

      {/* Stage targets: one row each, click to edit in place */}
      <div className="space-y-1.5">
        <p className="flex items-baseline justify-between gap-3 text-xs text-foreground/60">
          <span className="shrink-0">{t.stages}</span>
          <span className="text-right text-[11px] text-foreground/40">
            {t.stagesHint}
            {toritsu && t.toritsuHint}
          </span>
        </p>
        {noReport && <p className="text-xs text-amber-700 dark:text-amber-300">{t.noReport}</p>}
        {unreachable && (
          <p className="text-xs text-red-700 dark:text-red-400">
            {t.unreachable(
              formatValue(Math.round(toritsu!.report!.score * 10) / 10, ''),
              TEKISEI_MAX,
              formatValue(Math.floor(maxPct! * 10) / 10, '')
            )}
          </p>
        )}
        {error && Object.hasOwn(t.errors, error) && <p className="text-sm text-red-600">{t.errors[error]}</p>}
        <ul className="divide-y divide-foreground/10 rounded-lg border border-foreground/10">
          {rows.map((r) => (
            <li key={`${r.id}:${r.date}:${r.label}:${r.pass}:${r.best}:${r.passPct}:${r.bestPct}`}>
              <details className="group">
                <summary className={`${fold} px-3 py-2.5`}>
                  <span className={`w-11 shrink-0 text-sm tabular-nums ${r.date < today ? 'text-foreground/50' : ''}`}>{formatMonthDay(r.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${r.date < today ? 'text-foreground/50' : ''}`}>{r.label ?? '—'}</span>
                    {metric && r.actual && (
                      <span className="flex flex-wrap gap-x-2 text-xs text-foreground/60 tabular-nums">
                        <span className="whitespace-nowrap">{t.scoreAt(r.near, formatValue(r.actual.value, ''), formatMonthDay(r.actual.date))}</span>
                        {(r.gapPass !== null || r.gapBest !== null) && (
                          <span className="whitespace-nowrap">
                            {t.gap} <Gap n={r.gapPass} unit="" /> / <Gap n={r.gapBest} unit="" />
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    {noReport ? (
                      <span className="text-sm tabular-nums text-foreground/60">{pcts(r.passPct, r.bestPct)}</span>
                    ) : (
                      <span className={`text-sm tabular-nums ${r.pass === null && r.best === null ? 'text-foreground/40' : ''}`}>{lines(r.pass, r.best)}</span>
                    )}
                    {(over(r.pass) || over(r.best)) && (
                      <span className="rounded bg-red-500/10 px-1.5 text-[11px] text-red-700 dark:text-red-400">
                        {over(r.pass) && over(r.best) ? t.over.both : over(r.pass) ? t.over.pass : t.over.best}
                      </span>
                    )}
                    {toritsu && !noReport && (r.passPct !== null || r.bestPct !== null) && (
                      <span className="text-right text-[11px] tabular-nums text-foreground/40">
                        {t.total} {pcts(r.passPct, r.bestPct)}
                        <br />
                        {t.tekisei} {pcts(tekisei(r.passPct), tekisei(r.bestPct))}
                      </span>
                    )}
                    {r.state && (
                      <span className={`rounded px-1.5 text-[11px] ${STATE[r.state]}`}>
                        {r.pass !== null && r.best === null && r.state === 'pass' ? t.reachedPass : t.state[r.state]}
                      </span>
                    )}
                  </span>
                  <span aria-hidden className={chevron}>
                    ›
                  </span>
                </summary>
                <div className="flex flex-wrap items-center gap-2 border-t border-foreground/10 bg-foreground/[0.02] px-3 py-2.5">
                  <form action={saveStage} className="flex flex-1 flex-wrap items-center gap-2">
                    {hidden(r.id)}
                    <StageFields
                      locale={locale}
                      date={r.date}
                      label={r.label}
                      pass={toritsu ? r.passPct : r.pass}
                      best={toritsu ? r.bestPct : r.best}
                      pct={toritsu !== null}
                      report={report}
                    />
                    <SubmitButton small pendingText="…">
                      {common[locale].save}
                    </SubmitButton>
                  </form>
                  <form action={deleteStage}>
                    {hidden(r.id)}
                    <button type="submit" className="text-xs text-foreground/40 hover:text-red-600">
                      {t.deleteRow}
                    </button>
                  </form>
                </div>
              </details>
            </li>
          ))}
          <li>
            <details className="group" open={rows.length === 0 || error === 'stage-dup' || error === 'date' || error === 'pct'}>
              <summary className={`${fold} px-3 py-2 text-sm text-foreground/60`}>{t.addStage}</summary>
              <form action={addStage} className="flex flex-wrap items-center gap-2 border-t border-foreground/10 bg-foreground/[0.02] px-3 py-2.5">
                {hidden()}
                <StageFields locale={locale} pct={toritsu !== null} pass={toritsu ? 60 : null} best={toritsu ? 80 : null} report={report} />
                <SubmitButton small pendingText="…">
                  {t.addStageSubmit}
                </SubmitButton>
              </form>
            </details>
          </li>
        </ul>
      </div>

      {/* School report items: folded into one row, click to edit */}
      <details className="group rounded-lg border border-foreground/10" open={error === 'grades'}>
        <summary className={`${fold} px-3 py-2.5`}>
          <span className="shrink-0 text-xs text-foreground/60">{t.reports}</span>
          <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-0.5 text-sm tabular-nums">
            {toritsu && (
              <span className="whitespace-nowrap">
                <span className="text-foreground/60">{t.reportScore}</span>{' '}
                {toritsu.report === null ? (
                  <span className="text-foreground/40">{t.noGrades}</span>
                ) : (
                  <>
                    {formatValue(Math.round(toritsu.report.score * 10) / 10, '')}
                    <span className="text-foreground/50"> / 250</span>
                    {toritsu.report.estimated && (
                      <span className="text-xs text-foreground/50">{toritsu.y5 ? t.estimated(6, 5) : t.estimated(5, 6)}</span>
                    )}
                  </>
                )}
              </span>
            )}
            {toritsu && reports.length === 0 ? null : reports.length === 0 ? (
              <span className="text-foreground/40">{t.noReports}</span>
            ) : (
              reports.map((r) => (
                <span key={r.id} className="whitespace-nowrap">
                  <span className="text-foreground/60">{r.label}</span>{' '}
                  {r.value === null ? <span className="text-foreground/40">—</span> : formatValue(r.value, '')}
                  {r.max !== null && <span className="text-foreground/50"> / {formatValue(r.max, '')}</span>}
                </span>
              ))
            )}
          </span>
          <span aria-hidden className={chevron}>
            ›
          </span>
        </summary>
        <ul className="divide-y divide-foreground/10 border-t border-foreground/10 bg-foreground/[0.02]">
          {toritsu && (
            <li className="px-3 py-2.5">
              <GradesForm locale={locale} studentId={studentId} k5={toritsu.k5} k6={toritsu.k6} />
            </li>
          )}
          {reports.map((r) => (
            <li key={`${r.id}:${r.label}:${r.value}:${r.max}`} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <form action={saveReportItem} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                {hidden(r.id)}
                <ReportFields locale={locale} label={r.label} value={r.value} max={r.max} />
                <SubmitButton small pendingText="…">
                  {common[locale].save}
                </SubmitButton>
              </form>
              <form action={deleteReportItem}>
                {hidden(r.id)}
                <button type="submit" className="text-xs text-foreground/40 hover:text-red-600">
                  {t.delete}
                </button>
              </form>
            </li>
          ))}
          <li className="px-3 py-2.5">
            <form action={addReportItem} className="flex flex-wrap items-center gap-2">
              {hidden()}
              <ReportFields locale={locale} />
              <SubmitButton small secondary pendingText="…">
                {t.addItem}
              </SubmitButton>
            </form>
          </li>
        </ul>
      </details>

      {/* Which metric to compare: folded into one row */}
      <details className="group text-xs" open={metric === null}>
        <summary className={`${fold} text-foreground/50`}>
          <span>
            {t.compareWith}
            <span className="text-foreground/70">{metric?.name ?? t.notChosen}</span>
          </span>
          <span className="underline-offset-2 group-open:hidden hover:underline">{t.change}</span>
        </summary>
        <form action={setTargetMetric} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {hidden()}
          <select name="metric" defaultValue={metric?.id ?? ''} aria-label={t.compareLabel} className={input}>
            <option value="">{t.noCompare}</option>
            {metricOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <SubmitButton small secondary pendingText="…">
            {common[locale].save}
          </SubmitButton>
          {metricOptions.length === 0 && <span className="text-xs text-foreground/50">{t.noMetrics}</span>}
        </form>
        <form action={setToritsu} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {hidden()}
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="on" defaultChecked={toritsu !== null} />
            {t.toritsu}
          </label>
          <SubmitButton small secondary pendingText="…">
            {common[locale].save}
          </SubmitButton>
          <span className="basis-full text-xs text-foreground/50">{t.toritsuNote}</span>
        </form>
      </details>
    </section>
  )
}

// current score → the next stage's target and the gap
function Headline({
  latest,
  next,
  unit,
  direction,
  locale,
}: {
  latest: { date: string; value: number }
  next: TargetStage
  unit: string
  direction: 1 | -1
  locale: Locale
}) {
  const t = goalCard[locale]
  const gp = next.pass === null ? null : gapTo(latest.value, next.pass, direction)
  const gb = next.best === null ? null : gapTo(latest.value, next.best, direction)
  const state: TargetState = gb !== null && gb >= 0 ? 'best' : gp !== null && gp >= 0 ? 'pass' : 'below'
  return (
    <div className="space-y-1 rounded-lg bg-foreground/[0.03] px-3 py-2.5">
      <p className="text-xs text-foreground/50">{t.now(formatMonthDay(latest.date))}</p>
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-2xl font-semibold tabular-nums">{formatValue(latest.value, unit)}</span>
        <span className="whitespace-nowrap text-sm tabular-nums">
          {t.gap} <Gap n={gp} unit="" /> / <Gap n={gb} unit="" />
        </span>
        <span className={`rounded px-1.5 text-[11px] ${STATE[state]}`}>{t.state[state]}</span>
      </p>
      <p className="text-xs text-foreground/60 tabular-nums">
        {t.need(
          formatMonthDay(next.date),
          next.pass === null ? '—' : formatValue(next.pass, unit),
          next.best === null ? '—' : formatValue(next.best, unit)
        )}
        <span className="text-foreground/40">{t.linesHint}</span>
      </p>
    </div>
  )
}

// pct = Toritsu conversion: each line can be entered as a total-score % or as the aptitude-test % needed, kept in sync
// (the form sends unit=pct and the total-score % is stored)
function StageFields({
  date,
  label,
  pass,
  best,
  pct = false,
  report = null,
  locale,
}: {
  date?: string
  label?: string | null
  pass?: number | null
  best?: number | null
  pct?: boolean
  report?: number | null
  locale: Locale
}) {
  const t = goalCard[locale]
  return (
    <>
      {pct && <input type="hidden" name="unit" value="pct" />}
      <input type="date" name="date" required defaultValue={date ?? ''} aria-label={t.date} className={input} />
      <input
        name="label"
        defaultValue={label ?? ''}
        placeholder={t.labelPlaceholder}
        maxLength={60}
        aria-label={t.label}
        className={`${input} min-w-0 flex-1 basis-32`}
      />
      {pct ? (
        <StagePctFields report={report} pass={pass ?? null} best={best ?? null} />
      ) : (
        <span className="flex items-center gap-1">
          <input type="number" name="pass" defaultValue={pass ?? ''} min={0} step="any" placeholder={t.passShort} aria-label={goal[locale].passLine} className={num} />
          <span className="text-foreground/40">/</span>
          <input type="number" name="best" defaultValue={best ?? ''} min={0} step="any" placeholder={t.bestShort} aria-label={goal[locale].bestLine} className={num} />
        </span>
      )}
    </>
  )
}

// Toritsu conversion: years 5 and 6 each have 9 subjects with 3 assessment criteria per subject (e.g. 223), saved together.
// Each subject shows its combined grade (the middle value). A year that isn't out yet stays blank
function GradesForm({ studentId, k5, k6, locale }: { studentId: string; k5: string | null; k6: string | null; locale: Locale }) {
  const t = goalCard[locale]
  const year = (y: 5 | 6, k: string | null) => {
    const subjects = subjectKanten(k)
    const g = yearGrades(k)
    return (
      <fieldset className="space-y-1">
        <legend className="text-xs text-foreground/60">
          {t.year(y)}
          {g && <span className="ml-2 tabular-nums text-foreground/50">{t.gradeCounts(g.g3, g.g2, g.g1)}</span>}
        </legend>
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-9">
          {SUBJECTS.map((subject, i) => (
            // English subject names are long: names may wrap and inputs align to the bottom
            <label key={subject} className="flex min-w-0 flex-col justify-between gap-0.5 text-[11px] text-foreground/60">
              <span className="flex justify-between gap-1">
                <span className="min-w-0 break-words">{SUBJECT_LABELS[locale][subject]}</span>
                {subjects && <span className="whitespace-nowrap tabular-nums text-foreground">→{subjectGrade(subjects[i])}</span>}
              </span>
              <input
                name={`y${y}_${i}`}
                defaultValue={subjects?.[i] ?? ''}
                inputMode="numeric"
                maxLength={3}
                pattern="[1-3]{3}"
                placeholder="—"
                aria-label={t.kantenLabel(y, SUBJECT_LABELS[locale][subject])}
                className={`${input} w-full px-1 text-center tabular-nums tracking-wider`}
              />
            </label>
          ))}
        </div>
      </fieldset>
    )
  }
  return (
    <form action={saveGrades} className="space-y-2.5">
      <input type="hidden" name="studentId" value={studentId} />
      <p className="text-xs text-foreground/50">{t.gradesHint}</p>
      {year(5, k5)}
      {year(6, k6)}
      <SubmitButton small pendingText="…">
        {common[locale].save}
      </SubmitButton>
    </form>
  )
}

function ReportFields({ label, value, max, locale }: { label?: string; value?: number | null; max?: number | null; locale: Locale }) {
  const t = goalCard[locale]
  return (
    <>
      <input
        name="label"
        required
        defaultValue={label ?? ''}
        placeholder={t.itemPlaceholder}
        maxLength={60}
        aria-label={t.item}
        className={`${input} min-w-0 flex-1 basis-40`}
      />
      <span className="flex items-center gap-1">
        <input type="number" name="value" defaultValue={value ?? ''} min={0} step="any" placeholder="—" aria-label={t.value} className={num} />
        <span className="text-foreground/40">/</span>
        <input type="number" name="max" defaultValue={max ?? ''} min={0} step="any" placeholder={t.max} aria-label={t.max} className={num} />
      </span>
    </>
  )
}

// Gap: positive (above the line) green, negative (short) red, 0 grey. Always with a +/− sign, not color alone
function Gap({ n, unit }: { n: number | null; unit: string }) {
  if (n === null) return <span className="text-foreground/40">—</span>
  return (
    <span className={n > 0 ? 'text-green-700 dark:text-green-400' : n < 0 ? 'text-red-700 dark:text-red-400' : ''}>{signed(n, unit)}</span>
  )
}
