import { describe, expect, it } from 'vitest'
import { missedStreak, nextStep, prepNote } from './lessons'

describe('missedStreak', () => {
  it('counts back from the latest lesson and stops at a held one; future lessons are ignored', () => {
    const at = (status: string, date: string) => ({ status, date })
    const today = '2026-10-04'
    expect(
      missedStreak([at('scheduled', '2026-10-08'), at('cancelled', '2026-10-03'), at('leave', '2026-10-01'), at('done', '2026-09-27'), at('cancelled', '2026-09-24')], today)
    ).toBe(2)
    expect(missedStreak([at('done', '2026-10-01')], today)).toBe(0)
    expect(missedStreak([at('cancelled', '2026-10-01')], today)).toBe(1)
  })

  it('leave taken in advance (date not reached) does not count; leave today does', () => {
    const at = (status: string, date: string) => ({ status, date })
    const lessons = [at('leave', '2026-10-18'), at('leave', '2026-10-18'), at('done', '2026-10-04')]
    expect(missedStreak(lessons, '2026-10-05')).toBe(0)
    expect(missedStreak(lessons, '2026-10-18')).toBe(2) // counts once the day arrives
  })
})

describe('nextStep', () => {
  it('takes the text after the 【下次】 ("next time") marker, up to the next 【', () => {
    expect(nextStep('【做】割合复测　\n【卡】公式没背下来　\n【下次】出割合练习题')).toBe('出割合练习题')
    expect(nextStep('【下次】作文 25 分钟　\n【备注】带过去问')).toBe('作文 25 分钟')
  })
  it('also recognizes the Japanese 【次回】 and English 【Next】 markers', () => {
    expect(nextStep('【やった】割合\n【次回】作文 25 分')).toBe('作文 25 分')
    expect(nextStep('【Done】ratios\n【Next】essay, 25 min')).toBe('essay, 25 min')
  })

  it('no 【下次】 marker, or nothing after it → null', () => {
    expect(nextStep('今天做了割合')).toBeNull()
    expect(nextStep('【做】割合\n【下次】　\n')).toBeNull()
  })
})

describe('prepNote', () => {
  const lessons = [
    { date: '2026-10-04', status: 'scheduled', note: null },
    { date: '2026-10-01', status: 'done', note: '【做】图表\n【下次】作文' },
    { date: '2026-09-27', status: 'done', note: '【下次】出割合练习题' },
    { date: '2026-09-24', status: 'leave', note: '发烧' },
    { date: '2026-09-20', status: 'done', note: '教割合' },
  ]

  it('takes the most recent held lesson before this one (leave, the same day and later are ignored)', () => {
    expect(prepNote(lessons, '2026-10-01')).toEqual({ date: '2026-09-27', next: '出割合练习题', note: '【下次】出割合练习题' })
    expect(prepNote(lessons, '2026-10-04')).toEqual({ date: '2026-10-01', next: '作文', note: '【做】图表\n【下次】作文' })
    expect(prepNote(lessons, '2026-09-27')).toEqual({ date: '2026-09-20', next: null, note: '教割合' })
  })

  it('no note on the most recent lesson → no hint; it does not look further back', () => {
    const blank = [{ date: '2026-09-30', status: 'done', note: '  ' }, ...lessons.slice(1)]
    expect(prepNote(blank, '2026-10-02')).toBeNull()
    expect(prepNote([{ date: '2026-09-30', status: 'done', note: null }], '2026-10-02')).toBeNull()
  })

  it('no earlier lessons → null', () => {
    expect(prepNote(lessons, '2026-09-20')).toBeNull()
    expect(prepNote([], '2026-10-01')).toBeNull()
  })
})
