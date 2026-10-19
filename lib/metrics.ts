// Calculations for grade data (unified metrics). Pure functions, no IO, covered by tests.
// Every record is (student, metric, date, value); a metric has a unit and a direction (higher or lower is better).

import { defineMessages, type Locale } from './i18n/locale'

export type MetricDef = {
  id: string
  name: string
  unit: string
  direction: 1 | -1 // 1 = higher is better, -1 = lower is better
  maxValue: number | null
  parentVisible?: boolean // shown on the parent page (off by default; the teacher turns it on per metric)
  parentId?: string | null // the metric this is a part of (e.g. an aptitude-test total → parts I, II, III); one level only
}

export type MetricRecord = {
  id: string
  metricId: string
  date: string
  value: number
  createdAt?: string // orders several records on the same date by when they were entered
}

// ── Templates: add a set of common metrics at once (names that already exist are skipped) ──
// Names and units are written to the database in the teacher's UI language. Once written they are data and are
// not translated when the language changes. Existence is checked by name, so adding the same template after
// switching languages adds a second set in the other language

export type MetricSpec = Omit<MetricDef, 'id'>
export type MetricTemplate = { id: string; label: string; metrics: MetricSpec[] }

const TEMPLATE_TEXT = defineMessages({
  zh: {
    calc: { label: '计算练习（用时 + 正答率）', time: '计算练习·用时', minutes: '分钟', accuracy: '计算练习·正答率' },
    term: { label: '定期考试（五科）', subjects: ['数学', '英语', '国语', '理科', '社会'], name: (s: string) => `定期考试·${s}`, points: '分' },
    mock: { label: '模拟考（偏差值）', name: '模拟考·偏差值' },
    past: { label: '过去问（得分率）', name: '过去问·得分率' },
    vocab: { label: '单词测试（正答率）', name: '单词测试·正答率' },
  },
  en: {
    calc: { label: 'Calculation drills (time + accuracy)', time: 'Calculation drill · time', minutes: 'min', accuracy: 'Calculation drill · accuracy' },
    term: {
      label: 'Term tests (5 subjects)',
      subjects: ['Math', 'English', 'Japanese', 'Science', 'Social studies'],
      name: (s: string) => `Term test · ${s}`,
      points: 'pts',
    },
    mock: { label: 'Mock exams (deviation score, 偏差値)', name: 'Mock exam · deviation score' },
    past: { label: 'Past papers (score %)', name: 'Past papers · score %' },
    vocab: { label: 'Vocabulary quizzes (accuracy)', name: 'Vocabulary quiz · accuracy' },
  },
  ja: {
    calc: { label: '計算練習（時間 + 正答率）', time: '計算練習・時間', minutes: '分', accuracy: '計算練習・正答率' },
    term: { label: '定期テスト（5 教科）', subjects: ['数学', '英語', '国語', '理科', '社会'], name: (s: string) => `定期テスト・${s}`, points: '点' },
    mock: { label: '模試（偏差値）', name: '模試・偏差値' },
    past: { label: '過去問（得点率）', name: '過去問・得点率' },
    vocab: { label: '単語テスト（正答率）', name: '単語テスト・正答率' },
  },
})

function templates(t: (typeof TEMPLATE_TEXT)[Locale]): MetricTemplate[] {
  return [
    {
      id: 'calc',
      label: t.calc.label,
      metrics: [
        { name: t.calc.time, unit: t.calc.minutes, direction: -1, maxValue: null },
        { name: t.calc.accuracy, unit: '%', direction: 1, maxValue: 100 },
      ],
    },
    {
      id: 'term',
      label: t.term.label,
      metrics: t.term.subjects.map((s) => ({
        name: t.term.name(s),
        unit: t.term.points,
        direction: 1 as const,
        maxValue: 100,
      })),
    },
    {
      id: 'mock',
      label: t.mock.label,
      metrics: [{ name: t.mock.name, unit: '', direction: 1, maxValue: null }],
    },
    {
      id: 'past',
      label: t.past.label,
      metrics: [{ name: t.past.name, unit: '%', direction: 1, maxValue: 100 }],
    },
    {
      id: 'vocab',
      label: t.vocab.label,
      metrics: [{ name: t.vocab.name, unit: '%', direction: 1, maxValue: 100 }],
    },
  ]
}

export const METRIC_TEMPLATES: Record<Locale, MetricTemplate[]> = {
  zh: templates(TEMPLATE_TEXT.zh),
  en: templates(TEMPLATE_TEXT.en),
  ja: templates(TEMPLATE_TEXT.ja),
}

// ── Input ────────────────────────────────────────────────
// Plain numbers are used as is. Percentage metrics also accept "correct / total" (18/20 → 90);
// metrics with a maximum accept "score / maximum" (maximum 300: 250/300 → 250).
// Returns null when the input can't be parsed or exceeds the maximum
export function parseValue(input: string, unit: string, maxValue: number | null = null): number | null {
  const s = input.trim().replace(/[％%]$/, '').replace('／', '/')
  const frac = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/)
  if (frac) {
    const [a, b] = [Number(frac[1]), Number(frac[2])]
    if (b === 0 || a > b) return null
    if (unit === '%') return Math.round((a / b) * 1000) / 10 // one decimal place
    return maxValue !== null && b === maxValue ? a : null
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return maxValue !== null && n > maxValue ? null : n
}

// The form input's pattern (the browser rejects obvious typos without clearing other values already entered).
// The server still checks with parseValue
export function valuePattern(unit: string, maxValue: number | null): string {
  const num = '\\d+(\\.\\d+)?'
  const plain = `\\s*-?${num}\\s*[%％]?\\s*`
  return unit === '%' || maxValue !== null ? `${plain}|\\s*${num}\\s*(/|／)\\s*${num}\\s*` : plain
}

// ── Summary ──────────────────────────────────────────────

export type MetricSummary = {
  count: number
  latest: MetricRecord | null
  change: number | null // latest − previous
  improved: boolean | null // better or worse given the direction; no change / a single record = null
  best: number | null // the maximum when higher is better, the minimum when lower is better
  recentAvg: number | null // average of the last 3 records
}

export function byDate(records: MetricRecord[]): MetricRecord[] {
  return [...records].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id)
  )
}

export function summarize(records: MetricRecord[], direction: 1 | -1): MetricSummary {
  const sorted = byDate(records)
  const n = sorted.length
  if (n === 0) return { count: 0, latest: null, change: null, improved: null, best: null, recentAvg: null }
  const latest = sorted[n - 1]
  const change = n >= 2 ? round(latest.value - sorted[n - 2].value) : null
  const values = sorted.map((r) => r.value)
  const recent = values.slice(-3)
  return {
    count: n,
    latest,
    change,
    improved: change === null || change === 0 ? null : change * direction > 0,
    best: direction === 1 ? Math.max(...values) : Math.min(...values),
    recentAvg: round(recent.reduce((a, b) => a + b, 0) / recent.length),
  }
}

function round(x: number): number {
  return Math.round(x * 10) / 10
}

export function formatValue(value: number, unit: string): string {
  const v = Number.isInteger(value) ? String(value) : value.toFixed(1)
  return unit === '%' ? `${v}%` : unit ? `${v} ${unit}` : v
}

// ── Parts (a metric split into several parts) ────────────

// Top-level metrics with their parts (sorted by name: I, II, III). A part whose parent isn't in the list is treated
// as top-level, so incomplete data isn't lost
export function groupMetrics<M extends MetricDef>(metrics: M[]): { metric: M; parts: M[] }[] {
  const ids = new Set(metrics.map((m) => m.id))
  const isPart = (m: M) => !!m.parentId && ids.has(m.parentId)
  return metrics
    .filter((m) => !isPart(m))
    .map((metric) => ({
      metric,
      parts: metrics.filter((p) => isPart(p) && p.parentId === metric.id).sort((a, b) => a.name.localeCompare(b.name)),
    }))
}

// Automatic totals when entering grades: if every part of a metric is filled in and the metric itself is empty,
// it's recorded as the sum of its parts. values = what was entered (metric id → value). Returns the totals to add
// (parent id → sum)
export function autoTotals(metrics: MetricDef[], values: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>()
  for (const { metric, parts } of groupMetrics(metrics)) {
    if (parts.length === 0 || values.has(metric.id)) continue
    if (!parts.every((p) => values.has(p.id))) continue
    const sum = parts.reduce((acc, p) => acc + values.get(p.id)!, 0)
    out.set(metric.id, Math.round(sum * 10) / 10)
  }
  return out
}

// A part's short name inside its parent's card: the prefix shared with the parent's name is dropped ('Aptitude I'
// under 'Aptitude total' → 'I'). If nothing is left, the full name is used
export function partLabel(part: { name: string }, parent: { name: string }): string {
  let i = 0
  while (i < part.name.length && i < parent.name.length && part.name[i] === parent.name[i]) i++
  const rest = part.name.slice(i).replace(/^[\s·・\-—_]+/, '')
  return rest || part.name
}

// ── Target vs. actual scores ──
// Compares the two lines for a date (the pass line and the best-case line) with the linked metric's actual score.
// A target is "reach this by that date", so the latest record in the windowDays up to the date (inclusive) is used
// first; failing that, the earliest record in the windowDays after it (results can arrive a few days late). Only
// those two count as this stage's score and get a band (near). With neither, the latest record is shown as the
// current score without a band. Without a date, the latest record is used.
// Teacher only (the goal card on the student page); never on the parent page
export type TargetState = 'below' | 'pass' | 'best' // below / between the lines (with only a pass line: reached it) / at or above the best line

const DAY_MS = 24 * 60 * 60 * 1000

export function targetCheck(
  dueDate: string | null,
  target: { pass: number | null; best: number | null },
  records: { date: string; value: number }[],
  direction: 1 | -1,
  windowDays = 14
): { actual: { date: string; value: number } | null; near: boolean; state: TargetState | null } {
  const byDateAsc = [...records].sort((a, b) => a.date.localeCompare(b.date))
  const latest = byDateAsc.at(-1)
  let found = latest
  let near = latest !== undefined && dueDate === null
  if (dueDate !== null) {
    const due = Date.parse(dueDate)
    const before = byDateAsc.filter((r) => r.date <= dueDate && due - Date.parse(r.date) <= windowDays * DAY_MS).at(-1)
    const after = byDateAsc.find((r) => r.date > dueDate && Date.parse(r.date) - due <= windowDays * DAY_MS)
    near = (before ?? after) !== undefined
    found = before ?? after ?? latest
  }
  const actual = found ? { date: found.date, value: found.value } : null
  if (!actual || !near || (target.pass === null && target.best === null)) return { actual, near, state: null }
  const reached = (line: number) => (direction === -1 ? actual.value <= line : actual.value >= line)
  const state: TargetState =
    target.best !== null && reached(target.best) ? 'best' : target.pass !== null && reached(target.pass) ? 'pass' : 'below'
  return { actual, near, state }
}

// ── Goal card (student page, teacher only) ──
// Stage targets: one row per date, with the pass line / best-case line to reach by then. The last row is usually
// the exam itself
export type TargetStage = { date: string; label: string | null; pass: number | null; best: number | null }

// Which stage a score on a given date is compared with: the nearest stage on or after it (the next target to reach);
// once all have passed, the last one
export function stageFor<T extends { date: string }>(stages: T[], date: string): T | null {
  const sorted = [...stages].sort((a, b) => a.date.localeCompare(b.date))
  return sorted.find((s) => s.date >= date) ?? sorted.at(-1) ?? null
}

// Gap to a line: positive = better than the line, negative = still short (reversed when lower is better)
export function gapTo(value: number, line: number, direction: 1 | -1): number {
  return direction === -1 ? line - value : value - line
}

// Each row of the stage-target table: the actual score nearest the date (only records within 14 days count as this
// stage's score and get a band; for future stages it's the current score) and the gap to each line
export function stageRows<T extends TargetStage>(
  stages: T[],
  records: { date: string; value: number }[],
  direction: 1 | -1
): (T & {
  actual: { date: string; value: number } | null
  near: boolean
  state: TargetState | null
  gapPass: number | null
  gapBest: number | null
})[] {
  return [...stages]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => {
      const { actual, near, state } = targetCheck(s.date, { pass: s.pass, best: s.best }, records, direction)
      return {
        ...s,
        actual,
        near,
        state,
        gapPass: actual && s.pass !== null ? gapTo(actual.value, s.pass, direction) : null,
        gapBest: actual && s.best !== null ? gapTo(actual.value, s.best, direction) : null,
      }
    })
}

// ── Tokyo public junior high (toritsu) conversion, used when it's turned on for a student ──
// Total 1000 = report card 250 (the 360-point school report scaled) + aptitude tests (tekisei) 750 (I, II, III,
// 100 each → 250 each). Report card: 9 subjects in each of years 5 and 6; each subject's 3 viewpoints (kanten) combine
// into one grade (the middle value: 223 → 2, 332 → 3, 123 → 2); 3 = 20, 2 = 10, 1 = 5, so 18 grades give at most 360,
// ×250/360. Tekisei raw is out of 300, ×2.5 = 750.
// Stage targets are entered as a percentage of the total, and the tekisei raw score needed = (1000 × % − report) ÷ 2.5.
// One subject grade dropping from 3 to 2 costs the report 6.94, which tekisei must make up with 2.78 more
export const SUBJECTS = ['国語', '社会', '算数', '理科', '音楽', '図工', '家庭', '体育', '外国語'] as const
export type Subject = (typeof SUBJECTS)[number]

// Subject names for display, by UI language. The Chinese UI also uses the Japanese subject names (they are Japanese
// school subjects); the assistant (mcp/) shows the English ones
export const SUBJECT_LABELS: Record<Locale, Record<Subject, string>> = {
  zh: { 国語: '国語', 社会: '社会', 算数: '算数', 理科: '理科', 音楽: '音楽', 図工: '図工', 家庭: '家庭', 体育: '体育', 外国語: '外国語' },
  en: {
    国語: 'Japanese',
    社会: 'Social studies',
    算数: 'Math',
    理科: 'Science',
    音楽: 'Music',
    図工: 'Arts & crafts',
    家庭: 'Home economics',
    体育: 'PE',
    外国語: 'Foreign language',
  },
  ja: { 国語: '国語', 社会: '社会', 算数: '算数', 理科: '理科', 音楽: '音楽', 図工: '図工', 家庭: '家庭', 体育: '体育', 外国語: '外国語' },
}

// A subject's 3 viewpoints (kanten) → its grade: the middle value once sorted (if two are equal, that value)
export function subjectGrade(kanten: string): 1 | 2 | 3 {
  return Number([...kanten].sort()[1]) as 1 | 2 | 3
}

// A school year is stored as 27 digits (9 subjects × 3 viewpoints, in SUBJECTS order); null = not out yet
export function subjectKanten(year: string | null): string[] | null {
  return year === null ? null : SUBJECTS.map((_, i) => year.slice(i * 3, i * 3 + 3))
}

export type YearGrades = { g3: number; g2: number; g1: number } // how many of a year's 9 subject grades are 3, 2 and 1

export function yearGrades(year: string | null): YearGrades | null {
  const subjects = subjectKanten(year)
  if (!subjects) return null
  const grades = subjects.map(subjectGrade)
  return { g3: grades.filter((g) => g === 3).length, g2: grades.filter((g) => g === 2).length, g1: grades.filter((g) => g === 1).length }
}

// Report-card score (out of 250). If only one year is out, the other is estimated from it (estimated); neither = null
export function reportScore(y5: YearGrades | null, y6: YearGrades | null): { score: number; estimated: boolean } | null {
  if (!y5 && !y6) return null
  const points = (y: YearGrades) => 20 * y.g3 + 10 * y.g2 + 5 * y.g1
  return { score: ((points(y5 ?? y6!) + points(y6 ?? y5!)) * 250) / 360, estimated: !y5 || !y6 }
}

// The tekisei raw score needed for pct% of the total (above the maximum of 300 = out of reach)
export function tekiseiNeeded(pct: number, report: number): number {
  return (10 * pct - report) / 2.5
}

export const TEKISEI_MAX = 300 // tekisei raw maximum

// With this report-card score, the total percentage reached with a perfect tekisei score; targets above it are out of reach
export function toritsuMaxPct(report: number): number {
  return (report + TEKISEI_MAX * 2.5) / 10
}

// Total % ↔ the tekisei % needed (of the 750 tekisei points): stage targets can be entered either way and are
// converted with the current report-card score. Above 100 = out of reach
export function tekiseiPct(totalPct: number, report: number): number {
  return (10 * totalPct - report) / 7.5
}

export function totalPctFor(tekisei: number, report: number): number {
  return (report + 7.5 * tekisei) / 10
}

// With the conversion on, a stage's two lines are its percentages converted to tekisei raw scores (null without report
// grades); with toritsu = null (conversion off) the lines are the scores entered directly
export function toritsuStages<T extends TargetStage & { passPct: number | null; bestPct: number | null }>(
  stages: T[],
  toritsu: { report: number | null } | null
): T[] {
  if (!toritsu) return stages
  const line = (pct: number | null) => (pct === null || toritsu.report === null ? null : round(tekiseiNeeded(pct, toritsu.report)))
  return stages.map((s) => ({ ...s, pass: line(s.passPct), best: line(s.bestPct) }))
}
