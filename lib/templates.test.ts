import { describe, expect, it } from 'vitest'
import { TEMPLATE_OPTIONS, templateCheckpoints } from './templates'

describe('templateCheckpoints', () => {
  it('exam templates count back from the exam day, and the last checkpoint is the exam itself', () => {
    const cps = templateCheckpoints('exam', { startDate: '2026-09-01', endDate: '2027-02-03', locale: 'zh' })
    expect(cps[0]).toMatchObject({ seq: 1, due_date: '2026-10-06', title: '过去问 1 周目跑完' })
    expect(cps.at(-1)).toMatchObject({ due_date: '2027-02-03', title: '本番' })
  })

  it('checkpoints before the start date are skipped and seq stays consecutive from 1', () => {
    const cps = templateCheckpoints('eiken', { startDate: '2026-12-01', endDate: '2027-01-25', locale: 'zh' })
    // 90 and 60 days before the exam both fall before the start date
    expect(cps.map((c) => [c.seq, c.title])).toEqual([
      [1, '过去问 3 回目'],
      [2, '弱点两块专项'],
      [3, '本番'],
    ])
  })

  it('ongoing templates count forward from the start date; the ongoing item has no date', () => {
    const cps = templateCheckpoints('ongoing', { startDate: '2026-10-01', endDate: null, locale: 'zh' })
    expect(cps.map((c) => c.due_date)).toEqual(['2026-10-29', '2026-12-24', null])
  })

  it('checkpoints are hidden from parents by default', () => {
    const cps = templateCheckpoints('exam', { startDate: '2026-01-01', endDate: '2027-02-03', locale: 'zh' })
    expect(cps.every((c) => c.parent_visible === false)).toBe(true)
  })

  it('exam template without an end date → throws; no template → empty', () => {
    expect(() => templateCheckpoints('exam', { startDate: '2026-10-01', endDate: null, locale: 'zh' })).toThrow()
    expect(templateCheckpoints('none', { startDate: '2026-10-01', endDate: null, locale: 'zh' })).toEqual([])
  })

  it("text follows the tutor's language; dates and order are the same in all three", () => {
    const opts = { startDate: '2026-09-01', endDate: '2027-02-03' }
    const zh = templateCheckpoints('exam', { ...opts, locale: 'zh' })
    const en = templateCheckpoints('exam', { ...opts, locale: 'en' })
    const ja = templateCheckpoints('exam', { ...opts, locale: 'ja' })
    expect(en[0]).toMatchObject({ seq: 1, due_date: '2026-10-06', title: 'First pass through past papers' })
    expect(ja[0]).toMatchObject({ seq: 1, due_date: '2026-10-06', title: '過去問 1 周目完了' })
    expect(en.at(-1)).toMatchObject({ title: 'Exam day', criterion: null })
    expect(en.map((c) => c.due_date)).toEqual(zh.map((c) => c.due_date))
    expect(ja.map((c) => c.due_date)).toEqual(zh.map((c) => c.due_date))
  })

  it('the ongoing item of the ongoing template has a criterion in every language', () => {
    for (const locale of ['zh', 'en', 'ja'] as const) {
      const last = templateCheckpoints('ongoing', { startDate: '2026-10-01', endDate: null, locale }).at(-1)
      expect(last?.due_date).toBeNull()
      expect(last?.criterion).toBeTruthy()
    }
  })

  it('the option list marks which templates need an end date', () => {
    expect(TEMPLATE_OPTIONS.find((o) => o.id === 'exam')?.needsEnd).toBe(true)
    expect(TEMPLATE_OPTIONS.find((o) => o.id === 'ongoing')?.needsEnd).toBe(false)
  })
})
