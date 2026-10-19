import { describe, expect, it } from 'vitest'
import { LOCALES } from './i18n/locale'
import { METRIC_TEMPLATES, SUBJECT_LABELS, SUBJECTS, byDate, formatValue, parseValue, summarize, valuePattern, type MetricRecord, autoTotals, groupMetrics, partLabel, targetCheck, stageFor, gapTo, stageRows, reportScore, subjectGrade, subjectKanten, tekiseiNeeded, tekiseiPct, totalPctFor, toritsuMaxPct, toritsuStages, yearGrades } from './metrics'

function rec(date: string, value: number, id = date): MetricRecord {
  return { id, metricId: 'm', date, value }
}

describe('parseValue', () => {
  it('reads plain numbers; decimals and a trailing % are allowed', () => {
    expect(parseValue('85', '分')).toBe(85)
    expect(parseValue(' 52.5 ', '')).toBe(52.5)
    expect(parseValue('90%', '%')).toBe(90)
    expect(parseValue('90％', '%')).toBe(90)
  })

  it('percentage metrics accept "correct / total"', () => {
    expect(parseValue('18/20', '%')).toBe(90)
    expect(parseValue('2 / 3', '%')).toBe(66.7)
    expect(parseValue('18／20', '%')).toBe(90) // full-width slash
  })

  it('metrics with a max score accept "score / max" and keep the score', () => {
    expect(parseValue('250/300', '', 300)).toBe(250)
    expect(parseValue('18／20', '分', 20)).toBe(18)
  })

  it('unreadable input returns null: denominator not the max, more correct than total, division by 0, text', () => {
    expect(parseValue('18/20', '分')).toBeNull() // no max score
    expect(parseValue('18/20', '分', 100)).toBeNull() // denominator does not match the max
    expect(parseValue('21/20', '%')).toBeNull()
    expect(parseValue('1/0', '%')).toBeNull()
    expect(parseValue('abc', '分')).toBeNull()
    expect(parseValue('', '分')).toBeNull()
  })

  it('a value above the max score returns null', () => {
    expect(parseValue('310', '', 300)).toBeNull()
    expect(parseValue('300', '', 300)).toBe(300)
    expect(parseValue('120', '%', 100)).toBeNull()
  })
})

describe('valuePattern', () => {
  // browsers match the pattern attribute against the whole value and compile it with the v flag
  const ok = (unit: string, max: number | null, s: string) => new RegExp(`^(?:${valuePattern(unit, max)})$`, 'v').test(s)

  it('compiles with the v flag and accepts plain numbers', () => {
    expect(ok('分', null, '85')).toBe(true)
    expect(ok('分钟', null, '12.5')).toBe(true)
    expect(ok('%', 100, '90％')).toBe(true)
  })

  it('only percentage metrics and metrics with a max allow the fraction form', () => {
    expect(ok('%', 100, '18/20')).toBe(true)
    expect(ok('', 300, '250／300')).toBe(true)
    expect(ok('分钟', null, '18/20')).toBe(false)
    expect(ok('分', null, 'abc')).toBe(false)
  })

  it('agrees with parseValue: anything the pattern accepts, parseValue can read (within the max)', () => {
    for (const [unit, max, s] of [['%', 100, '18/20'], ['', 300, '250/300'], ['分', null, '85'], ['%', null, '90%']] as const) {
      expect(ok(unit, max, s)).toBe(true)
      expect(parseValue(s, unit, max)).not.toBeNull()
    }
  })
})

describe('byDate', () => {
  it('several records on one day are ordered by entry time; the latest is the last one entered', () => {
    const recs = [
      { id: 'z', metricId: 'm', date: '2026-09-20', value: 62.5, createdAt: '2026-09-27T13:47:52Z' },
      { id: 'a', metricId: 'm', date: '2026-09-20', value: 75, createdAt: '2026-09-27T13:48:01Z' },
      { id: 'b', metricId: 'm', date: '2026-09-27', value: 81.3, createdAt: '2026-09-27T14:00:25Z' },
    ]
    expect(byDate(recs).map((r) => r.value)).toEqual([62.5, 75, 81.3])
    expect(summarize(recs, 1)).toMatchObject({ change: 6.3, improved: true })
  })
})

describe('summarize', () => {
  it('higher is better: latest value, improvement over the previous one, best, average of the last 3', () => {
    const s = summarize([rec('2026-10-01', 70), rec('2026-10-15', 82), rec('2026-10-08', 75), rec('2026-09-20', 90)], 1)
    expect(s).toMatchObject({ count: 4, change: 7, improved: true, best: 90, recentAvg: 75.7 })
    expect(s.latest?.date).toBe('2026-10-15')
  })

  it('lower is better (time taken): a smaller value is an improvement, best is the minimum', () => {
    const s = summarize([rec('2026-10-01', 12), rec('2026-10-08', 10)], -1)
    expect(s).toMatchObject({ change: -2, improved: true, best: 10 })
    expect(summarize([rec('2026-10-01', 10), rec('2026-10-08', 12)], -1).improved).toBe(false)
  })

  it('a single record, or no change → no better / worse verdict', () => {
    expect(summarize([rec('2026-10-01', 80)], 1)).toMatchObject({ count: 1, change: null, improved: null, best: 80, recentAvg: 80 })
    expect(summarize([rec('2026-10-01', 80), rec('2026-10-02', 80)], 1).improved).toBeNull()
  })

  it('no records', () => {
    expect(summarize([], 1)).toEqual({ count: 0, latest: null, change: null, improved: null, best: null, recentAvg: null })
  })
})

describe('templates and display', () => {
  it('metric names in the templates are unique in every language (the database allows one metric per name)', () => {
    for (const locale of LOCALES) {
      const names = METRIC_TEMPLATES[locale].flatMap((t) => t.metrics.map((m) => m.name))
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('the three languages differ only in names and units: same templates, same metrics, same direction and max, and % stays %', () => {
    const shape = (locale: (typeof LOCALES)[number]) =>
      METRIC_TEMPLATES[locale].map((t) => [t.id, t.metrics.map((m) => [m.unit === '%', m.unit === '', m.direction, m.maxValue])])
    expect(shape('en')).toEqual(shape('zh'))
    expect(shape('ja')).toEqual(shape('zh'))
  })

  it('Chinese template names stay fixed (metrics that already exist are matched by name and skipped)', () => {
    expect(METRIC_TEMPLATES.zh.flatMap((t) => t.metrics.map((m) => `${m.name}|${m.unit}`))).toEqual([
      '计算练习·用时|分钟',
      '计算练习·正答率|%',
      '定期考试·数学|分',
      '定期考试·英语|分',
      '定期考试·国语|分',
      '定期考试·理科|分',
      '定期考试·社会|分',
      '模拟考·偏差值|',
      '过去问·得分率|%',
      '单词测试·正答率|%',
    ])
  })

  it('every subject has a label in every language; the Chinese and Japanese UIs use the Japanese subject names', () => {
    for (const locale of LOCALES) {
      for (const s of SUBJECTS) expect(SUBJECT_LABELS[locale][s]).toBeTruthy()
    }
    expect(SUBJECTS.map((s) => SUBJECT_LABELS.zh[s])).toEqual([...SUBJECTS])
    expect(SUBJECTS.map((s) => SUBJECT_LABELS.ja[s])).toEqual([...SUBJECTS])
  })

  it('formatValue', () => {
    expect(formatValue(90, '%')).toBe('90%')
    expect(formatValue(66.66, '%')).toBe('66.7%')
    expect(formatValue(12, '分钟')).toBe('12 分钟')
    expect(formatValue(55, '')).toBe('55')
  })
})

describe('sub-metrics', () => {
  const total = { id: 't', name: '適性検査　合計', unit: '', direction: 1 as const, maxValue: 300 }
  const part = (id: string, name: string) => ({ id, name, unit: '', direction: 1 as const, maxValue: 100, parentId: 't' })
  const metrics = [part('p3', '適性検査Ⅲ'), total, part('p1', '適性検査Ⅰ'), part('p2', '適性検査Ⅱ'), { id: 'x', name: '作文', unit: '', direction: 1 as const, maxValue: null }]

  it('parts are grouped under their parent and sorted by name; metrics without parts are unchanged', () => {
    const g = groupMetrics(metrics)
    expect(g.map((x) => [x.metric.id, x.parts.map((p) => p.name)])).toEqual([
      ['t', ['適性検査Ⅰ', '適性検査Ⅱ', '適性検査Ⅲ']],
      ['x', []],
    ])
    // a part whose parent is not in the list becomes top-level
    expect(groupMetrics([part('p1', '適性検査Ⅰ')]).map((x) => x.metric.id)).toEqual(['p1'])
  })

  it('all parts filled and the total empty: the total is summed', () => {
    expect(autoTotals(metrics, new Map([['p1', 20], ['p2', 12.5], ['p3', 30]]))).toEqual(new Map([['t', 62.5]]))
  })

  it('total entered by hand, or a part missing: no sum', () => {
    expect(autoTotals(metrics, new Map([['p1', 20], ['p2', 12], ['p3', 30], ['t', 70]])).size).toBe(0)
    expect(autoTotals(metrics, new Map([['p1', 20], ['p2', 12]])).size).toBe(0)
  })
})

describe('partLabel', () => {
  it("strips the prefix shared with the parent's name", () => {
    expect(partLabel({ name: '適性検査Ⅰ' }, { name: '適性検査　合計' })).toBe('Ⅰ')
    expect(partLabel({ name: '過去問·国語' }, { name: '過去問·合計' })).toBe('国語')
    expect(partLabel({ name: '数学' }, { name: '模拟考' })).toBe('数学')
    expect(partLabel({ name: '合計' }, { name: '合計' })).toBe('合計')
  })
})

describe('targetCheck (target score at a checkpoint)', () => {
  const recs = [
    { date: '2026-09-23', value: 38 },
    { date: '2026-10-25', value: 85 },
    { date: '2026-11-22', value: 125 },
  ]

  it('takes the record closest to the checkpoint date: 10/31 → 85 on 10/25, between the two lines', () => {
    expect(targetCheck('2026-10-31', { pass: 80, best: 90 }, recs, 1)).toEqual({ actual: { date: '2026-10-25', value: 85 }, near: true, state: 'pass' })
  })

  it('below the pass line / at or above the best line', () => {
    expect(targetCheck('2026-11-30', { pass: 130, best: 140 }, recs, 1).state).toBe('below')
    expect(targetCheck('2026-11-30', { pass: 110, best: 120 }, recs, 1)).toEqual({ actual: { date: '2026-11-22', value: 125 }, near: true, state: 'best' })
  })

  it('looks on or before the date first, and at the two weeks after only when the two weeks before are empty (results come out late)', () => {
    expect(targetCheck('2026-10-31', { pass: 80, best: 90 }, [{ date: '2026-10-25', value: 85 }, { date: '2026-11-01', value: 98 }], 1).actual?.value).toBe(85)
    expect(targetCheck('2026-10-31', { pass: 80, best: 90 }, [{ date: '2026-10-31', value: 70 }, { date: '2026-11-01', value: 98 }], 1).actual?.value).toBe(70)
    expect(targetCheck('2026-10-31', { pass: 80, best: 90 }, [{ date: '2026-09-01', value: 30 }, { date: '2026-11-03', value: 88 }], 1)).toEqual({
      actual: { date: '2026-11-03', value: 88 },
      near: true,
      state: 'pass',
    })
  })

  it('a record more than 14 days from the date is only the current score, with no band', () => {
    expect(targetCheck('2027-02-03', { pass: 160, best: 185 }, recs, 1)).toEqual({ actual: { date: '2026-11-22', value: 125 }, near: false, state: null })
    expect(targetCheck('2026-10-31', { pass: 80, best: 90 }, [{ date: '2026-09-23', value: 38 }], 1)).toEqual({ actual: { date: '2026-09-23', value: 38 }, near: false, state: null })
  })

  it('lower-is-better metrics compare the other way round', () => {
    expect(targetCheck('2026-10-31', { pass: 30, best: 25 }, [{ date: '2026-10-30', value: 27 }], -1).state).toBe('pass')
    expect(targetCheck('2026-10-31', { pass: 30, best: 25 }, [{ date: '2026-10-30', value: 24 }], -1).state).toBe('best')
  })

  it('no records / no lines: only the actual score, or nothing', () => {
    expect(targetCheck('2026-10-31', { pass: 80, best: 90 }, [], 1)).toEqual({ actual: null, near: false, state: null })
    expect(targetCheck('2026-10-31', { pass: null, best: null }, recs, 1)).toEqual({ actual: { date: '2026-10-25', value: 85 }, near: true, state: null })
  })
})

describe('target card', () => {
  const stages = [
    { date: '2026-10-31', label: '套路打底', pass: 80, best: 90 },
    { date: '2026-11-30', label: null, pass: 110, best: 120 },
    { date: '2027-02-03', label: '本番', pass: null, best: null },
  ]

  it('stageFor: the nearest stage on or after the date; the last one once all have passed', () => {
    expect(stageFor(stages, '2026-09-23')?.date).toBe('2026-10-31')
    expect(stageFor(stages, '2026-10-31')?.date).toBe('2026-10-31')
    expect(stageFor(stages, '2026-11-01')?.date).toBe('2026-11-30')
    expect(stageFor(stages, '2027-03-01')?.date).toBe('2027-02-03')
    expect(stageFor([], '2026-10-01')).toBeNull()
  })

  it('gapTo: positive = better than the line; reversed for lower-is-better', () => {
    expect(gapTo(85, 80, 1)).toBe(5)
    expect(gapTo(38, 80, 1)).toBe(-42)
    expect(gapTo(27, 30, -1)).toBe(3)
  })

  it('stageRows: actual score and gaps per row; later stages use the current score, with gaps but no band', () => {
    const rows = stageRows(stages, [{ date: '2026-09-23', value: 38 }, { date: '2026-10-25', value: 85 }], 1)
    expect(rows.map((r) => [r.date, r.actual?.value, r.near, r.state, r.gapPass, r.gapBest])).toEqual([
      ['2026-10-31', 85, true, 'pass', 5, -5],
      ['2026-11-30', 85, false, null, -25, -35],
      ['2027-02-03', 85, false, null, null, null],
    ])
  })
})

describe('Toritsu conversion (Tokyo public secondary school admission)', () => {
  const year = (g3: number, g2: number, g1: number) => ({ g3, g2, g1 })

  it('subjectGrade: the median of the 3 criterion marks — 223 → 2, 332 → 3, 123 → 2', () => {
    expect(subjectGrade('223')).toBe(2)
    expect(subjectGrade('332')).toBe(3)
    expect(subjectGrade('323')).toBe(3)
    expect(subjectGrade('123')).toBe(2)
    expect(subjectGrade('311')).toBe(1)
    expect(subjectGrade('333')).toBe(3)
  })

  it('yearGrades: splits 27 digits into 9 subjects, grades each and counts the grades; empty = not out yet', () => {
    const y = '223' + '332' + '222' + '112' + '333' + '222' + '123' + '222' + '232'
    expect(subjectKanten(y)).toEqual(['223', '332', '222', '112', '333', '222', '123', '222', '232'])
    expect(yearGrades(y)).toEqual(year(2, 6, 1))
    expect(yearGrades(null)).toBeNull()
  })

  it('reportScore: all 18 grades 3 → 250; nine 3s + nine 2s → 270 → 187.5; all 1 → 62.5', () => {
    expect(reportScore(year(9, 0, 0), year(9, 0, 0))).toEqual({ score: 250, estimated: false })
    expect(reportScore(year(5, 4, 0), year(4, 5, 0))?.score).toBe(187.5)
    expect(reportScore(year(9, 0, 0), year(0, 9, 0))?.score).toBe(187.5)
    expect(reportScore(year(0, 0, 9), year(0, 0, 9))?.score).toBe(62.5)
  })

  it('reportScore: only one school year out → the other is estimated from it; neither → null', () => {
    expect(reportScore(year(5, 4, 0), null)).toEqual({ score: reportScore(year(5, 4, 0), year(5, 4, 0))!.score, estimated: true })
    expect(reportScore(null, year(9, 0, 0))).toEqual({ score: 250, estimated: true })
    expect(reportScore(null, null)).toBeNull()
  })

  it('tekiseiNeeded: 60% / 80% of the total with a school report of 187.5 → aptitude raw 165 / 245', () => {
    expect(tekiseiNeeded(60, 187.5)).toBe(165)
    expect(tekiseiNeeded(80, 187.5)).toBe(245)
    expect(tekiseiNeeded(60, 250)).toBe(140)
  })

  it('toritsuMaxPct: the best total with a perfect aptitude score — report 145.8 → 89.6%; 90% needs 301.7 > 300, out of reach', () => {
    const report = reportScore(null, yearGrades('332222232122223112222323212'))!.score // Japanese and PE 3, arts and crafts 1, the rest 2; year 5 estimated from year 6
    expect(report).toBeCloseTo(145.83, 2)
    expect(toritsuMaxPct(report)).toBeCloseTo(89.58, 2)
    expect(tekiseiNeeded(90, report)).toBeCloseTo(301.67, 2)
    expect(toritsuMaxPct(250)).toBe(100)
    expect(toritsuMaxPct(125)).toBe(87.5)
  })

  it('total % ↔ aptitude %: with a report of 145.8, total 50% = aptitude 47.2%; aptitude 100% = total 89.6%; converting back and forth is stable', () => {
    const report = 145.8333
    expect(tekiseiPct(50, report)).toBeCloseTo(47.22, 2)
    expect(tekiseiPct(90, report)).toBeCloseTo(100.56, 2) // above 100 = out of reach
    expect(totalPctFor(100, report)).toBeCloseTo(toritsuMaxPct(report), 6)
    expect(totalPctFor(tekiseiPct(64.3, report), report)).toBeCloseTo(64.3, 6)
    expect(tekiseiPct(totalPctFor(70, report), report)).toBeCloseTo(70, 6)
    expect(tekiseiNeeded(50, report) / 3).toBeCloseTo(tekiseiPct(50, report), 6) // aptitude % = raw ÷ 300
    expect(totalPctFor(100, 250)).toBe(100)
  })

  it('one subject dropping from 3 to 2 → report −6.94, aptitude needs 2.78 more', () => {
    const all3 = reportScore(year(9, 0, 0), year(9, 0, 0))!.score
    const one2 = reportScore(year(8, 1, 0), year(9, 0, 0))!.score
    expect(all3 - one2).toBeCloseTo(6.944, 3)
    expect(tekiseiNeeded(60, one2) - tekiseiNeeded(60, all3)).toBeCloseTo(2.78, 2)
  })

  it('toritsuStages: percentages become aptitude raw scores; no grades → null; conversion off → the scores entered directly', () => {
    const stages = [
      { date: '2026-10-31', label: null, pass: 80, best: 90, passPct: 60, bestPct: 80 },
      { date: '2027-02-03', label: '本番', pass: null, best: null, passPct: 60, bestPct: null },
    ]
    const report = reportScore(year(6, 3, 0), year(7, 2, 0))!.score // 150 + 160 = 310 → 215.3
    expect(toritsuStages(stages, { report }).map((s) => [s.pass, s.best])).toEqual([
      [153.9, 233.9],
      [153.9, null],
    ])
    expect(toritsuStages(stages, { report: null }).map((s) => [s.pass, s.best])).toEqual([
      [null, null],
      [null, null],
    ])
    expect(toritsuStages(stages, null)).toBe(stages)
  })
})
