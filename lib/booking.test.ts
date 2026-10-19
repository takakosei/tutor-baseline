import { describe, expect, it } from 'vitest'
import { OPEN_WINDOWS, blockedBusy, blockedOn, busyTimes, canAdd, cellStarts, clearUnderLessons, freeBlocks, freeDays, freeStarts, leaveable, mergeWindows, planWeekly, requestMail, usualMinutes } from './booking'
import type { Occurrence } from './schedule'

// 2026-10-03 is a Saturday (weekday 5), 10-04 a Sunday (6)
const SAT = 5
const SUN = 6

function occ(date: string, start: string | null, end: string | null, status = 'scheduled', studentId = 'a'): Occurrence {
  return { key: `S:r:${date}`, studentId, date, start, end, status, lessonId: null, scheduleId: 'r', trial: false }
}

describe('mergeWindows', () => {
  it('merges overlapping or touching windows; separate ones stay separate', () => {
    expect(
      mergeWindows([
        { start: '14:00', end: '18:00' },
        { start: '10:00', end: '14:00' },
        { start: '19:00', end: '21:00' },
        { start: '15:00', end: '16:00' },
      ])
    ).toEqual([
      { start: '10:00', end: '18:00' },
      { start: '19:00', end: '21:00' },
    ])
  })
})

describe('freeStarts', () => {
  const windows = [{ weekday: SAT, start: '10:00', end: '14:00' }]

  it('the whole lesson fits inside an open window; one start every 30 minutes', () => {
    expect(freeStarts(windows, [], '2026-10-03', 120)).toEqual(['10:00', '10:30', '11:00', '11:30', '12:00'])
    expect(freeStarts(windows, [], '2026-10-04', 120)).toEqual([]) // nothing set for Sunday
  })

  it('a start that overlaps a busy time is out (touching ends is fine)', () => {
    const busy = [{ date: '2026-10-03', start: '12:00', end: '13:00' }]
    expect(freeStarts(windows, busy, '2026-10-03', 60)).toEqual(['10:00', '10:30', '11:00', '13:00'])
    // busy times on other days don't matter
    expect(freeStarts(windows, [{ date: '2026-10-10', start: '10:00', end: '14:00' }], '2026-10-03', 240)).toEqual(['10:00'])
  })

  it('a lesson can span two adjoining windows', () => {
    const two = [
      { weekday: SAT, start: '10:00', end: '12:00' },
      { weekday: SAT, start: '12:00', end: '13:00' },
    ]
    expect(freeStarts(two, [], '2026-10-03', 180)).toEqual(['10:00'])
  })

  it('starts count from the window start even when it is not on the hour', () => {
    expect(freeStarts([{ weekday: SAT, start: '17:30', end: '20:00' }], [], '2026-10-03', 120)).toEqual(['17:30', '18:00'])
  })
})

describe('freeDays / canAdd', () => {
  const windows = [
    { weekday: SAT, start: '10:00', end: '12:00' },
    { weekday: SUN, start: '10:00', end: '12:00' },
  ]

  it('covers two weeks from tomorrow and leaves out days with no free start', () => {
    const busy = [{ date: '2026-10-04', start: '11:00', end: '12:00' }]
    const days = freeDays(windows, busy, '2026-10-02', 120)
    expect(days.map((d) => d.date)).toEqual(['2026-10-03', '2026-10-10', '2026-10-11'])
    expect(days[0].starts).toEqual(['10:00'])
  })

  it('today, more than two weeks ahead, or outside the free time cannot be requested', () => {
    expect(canAdd(windows, [], '2026-10-02', '2026-10-03', '10:00', 120)).toBe(true)
    expect(canAdd(windows, [], '2026-10-03', '2026-10-03', '10:00', 120)).toBe(false) // same day
    expect(canAdd(windows, [], '2026-10-02', '2026-10-17', '10:00', 120)).toBe(false) // 15 days ahead
    expect(canAdd(windows, [], '2026-10-02', '2026-10-03', '10:30', 120)).toBe(false) // runs past the window
    expect(canAdd(windows, [{ date: '2026-10-03', start: '11:30', end: '12:30' }], '2026-10-02', '2026-10-03', '10:00', 120)).toBe(false)
  })
})

describe('busyTimes', () => {
  it('scheduled and held lessons of any student are busy, leave and untimed ones are not; pending requests are added', () => {
    const busy = busyTimes(
      [
        occ('2026-10-03', '10:00', '12:00', 'scheduled', 'a'),
        occ('2026-10-03', '13:00', '15:00', 'done', 'b'),
        occ('2026-10-03', '16:00', '18:00', 'leave', 'a'),
        occ('2026-10-03', null, null, 'done', 'b'),
      ],
      [{ date: '2026-10-04', start: '10:00', end: '12:00' }]
    )
    expect(busy).toEqual([
      { date: '2026-10-03', start: '10:00', end: '12:00' },
      { date: '2026-10-03', start: '13:00', end: '15:00' },
      { date: '2026-10-04', start: '10:00', end: '12:00' },
    ])
    // the output does not say which student is busy
    expect(JSON.stringify(busy)).not.toMatch(/student|key/)
  })
})

describe('usualMinutes', () => {
  it('length of the most recently started rule; 2 hours when there is none', () => {
    expect(
      usualMinutes([
        { start: '19:00', end: '21:00', startsOn: '2026-09-01' },
        { start: '17:30', end: '19:00', startsOn: '2026-09-20' },
      ])
    ).toBe(90)
    expect(usualMinutes([])).toBe(120)
  })

  it('ignores proctoring rules (parents request regular lessons)', () => {
    expect(
      usualMinutes([
        { start: '19:00', end: '21:00', startsOn: '2026-09-01' },
        { start: '09:30', end: '12:00', startsOn: '2026-10-17', proctor: true },
      ])
    ).toBe(120)
  })
})

describe('leaveable', () => {
  it("only this student's scheduled, timed lessons from today through the next two weeks", () => {
    const list = leaveable(
      [
        occ('2026-10-01', '19:00', '21:00'),
        occ('2026-10-02', '19:00', '21:00', 'done'),
        occ('2026-10-03', '19:00', '21:00', 'scheduled', 'b'),
        occ('2026-10-04', '19:00', '21:00'),
        occ('2026-10-05', null, null),
        occ('2026-10-30', '19:00', '21:00'),
      ],
      'a',
      '2026-10-02'
    )
    expect(list.map((o) => o.date)).toEqual(['2026-10-04'])
  })
})

describe('requestMail', () => {
  it('extra lesson: the subject names the student, day and time; the message is only in the body, which says how to accept', () => {
    const m = requestMail({
      studentLabel: 'B',
      kind: 'add',
      date: '2026-10-03',
      start: '10:00',
      end: '12:00',
      message: '想做过去问\n谢谢',
      dashboardUrl: 'https://example.test/dashboard', teacherLocale: 'zh',
    })
    expect(m.subject).toBe('【家教管理】B 想加课 10/3（土） 10:00–12:00')
    expect(m.text).toBe(
      'B 的家长想加一节课：\n10/3（土） 10:00–12:00\n\n留言：想做过去问\n谢谢\n\n可以的话在 dashboard 上点「可以」就加到课表：https://example.test/dashboard'
    )
  })

  it('leave: says it already took effect; no line breaks in the subject; works without a message or URL', () => {
    const m = requestMail({ studentLabel: 'B\r\nBcc: x@y', kind: 'leave', date: '2026-10-04', start: '17:30', end: '19:30', message: null, dashboardUrl: null, teacherLocale: 'zh' })
    expect(m.subject).not.toMatch(/[\r\n]/)
    expect(m.subject).toContain('请假')
    expect(m.text).toContain('已经记成请假')
    expect(m.text).not.toContain('留言')
  })

  it("is written in the tutor's language: English and Japanese", () => {
    const r = { studentLabel: 'B', kind: 'add' as const, date: '2026-10-03', start: '10:00', end: '12:00', message: null, dashboardUrl: null }
    const en = requestMail({ ...r, teacherLocale: 'en' })
    expect(en.subject).toBe('[Tutor Baseline] B wants an extra lesson 10/3 (Sat) 10:00–12:00')
    expect(en.fromName).toBe('Tutor Baseline')
    expect(requestMail({ ...r, teacherLocale: 'ja' }).subject).toBe('【家庭教師管理】B 追加授業の希望 10/3（土） 10:00–12:00')
  })
})

describe('freeBlocks', () => {
  it('places one lesson at each start, merges connected lessons into blocks, and lists the starts in each block', () => {
    expect(freeBlocks(['10:00', '10:30', '11:00', '15:00', '15:30', '16:00'], 120)).toEqual([
      { start: '10:00', end: '13:00', starts: ['10:00', '10:30', '11:00'] },
      { start: '15:00', end: '18:00', starts: ['15:00', '15:30', '16:00'] },
    ])
    expect(freeBlocks([], 120)).toEqual([])
  })
})

describe('unavailable cells', () => {
  it('markable cells run from 10:00 to 20:30, one every 30 minutes', () => {
    const cells = cellStarts()
    expect(cells[0]).toBe('10:00')
    expect(cells.at(-1)).toBe('20:30')
    expect(cells).toHaveLength(22)
  })

  it('weekly cells expand to every matching weekday; one-day cells apply to that day only', () => {
    const busy = blockedBusy(
      [
        { weekday: SAT, date: null, start: '10:00' },
        { weekday: null, date: '2026-10-04', start: '13:30' },
      ],
      '2026-10-02',
      '2026-10-11'
    )
    expect(busy).toEqual([
      { date: '2026-10-03', start: '10:00', end: '10:30' },
      { date: '2026-10-04', start: '13:30', end: '14:00' },
      { date: '2026-10-10', start: '10:00', end: '10:30' },
    ])
  })

  it('by default every day is open 10:00–21:00, minus unavailable cells and lessons', () => {
    const busy = [
      ...blockedBusy(
        ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30'].map((start) => ({ weekday: SAT, date: null, start })),
        '2026-10-02',
        '2026-10-16'
      ),
      { date: '2026-10-03', start: '17:30', end: '19:30' },
    ]
    // 10/3 (Sat): open from 13:00, lesson at 17:30–19:30 → 2-hour lessons can start 13:00–15:30; 19:30 is too late (only 1.5 hours left before 21:00)
    expect(freeStarts(OPEN_WINDOWS, busy, '2026-10-03', 120)).toEqual(['13:00', '13:30', '14:00', '14:30', '15:00', '15:30'])
    // 10/5 (Mon) has nothing marked: any start from 10:00 to 19:00
    expect(freeStarts(OPEN_WINDOWS, busy, '2026-10-05', 120)).toHaveLength(19)
  })
})

describe('validity of weekly unavailable cells', () => {
  it('apply only while valid: the same weekday before the start or after the end is free', () => {
    const c = { weekday: SAT, date: null, start: '10:00', validFrom: '2026-10-01', validTo: '2026-10-10' }
    expect(blockedOn(c, '2026-09-26')).toBe(false) // a Saturday before the start
    expect(blockedOn(c, '2026-10-03')).toBe(true)
    expect(blockedOn(c, '2026-10-10')).toBe(true) // the last day counts
    expect(blockedOn(c, '2026-10-17')).toBe(false) // after the end
    expect(blockedOn({ ...c, validTo: null }, '2027-01-02')).toBe(true) // no end = open-ended
    expect(blockedOn({ weekday: null, date: '2026-10-04', start: '10:00' }, '2026-10-04')).toBe(true)
  })

  it('saving: removed old cells end yesterday, cells added today are deleted outright, new cells start today', () => {
    const plan = planWeekly(
      [
        { id: 'old-keep', key: '5 10:00', validFrom: '2026-09-20' },
        { id: 'old-gone', key: '5 10:30', validFrom: '2026-09-20' },
        { id: 'new-gone', key: '6 10:00', validFrom: '2026-10-01' },
      ],
      new Set(['5 10:00', '0 13:00', '0 13:30']),
      '2026-10-01'
    )
    expect(plan).toEqual({ end: ['old-gone'], remove: ['new-gone'], add: ['0 13:00', '0 13:30'] })
  })

  it('nothing changed → nothing to do', () => {
    expect(planWeekly([{ id: 'a', key: '5 10:00', validFrom: '2026-09-20' }], new Set(['5 10:00']), '2026-10-01')).toEqual({
      end: [],
      remove: [],
      add: [],
    })
  })
})

describe('clearUnderLessons (a cell is either a lesson or unavailable, not both)', () => {
  const today = '2026-10-04' // Sunday
  // weekly lesson on Tuesday (weekday 1), 11:00–13:00
  const tueRule = { weekday: 1, start: '11:00', end: '13:00', startsOn: '2026-09-01', endsOn: null }
  const row = (start: string, validFrom = '2026-10-01', validTo: string | null = null) => ({ id: `w${start}`, weekday: 1, start, validFrom, validTo })

  it('weekly cells under a weekly lesson are cleared from today on; the past and cells outside the lesson stay', () => {
    const plan = clearUnderLessons([row('11:00'), row('12:30'), row('13:00')], [], [tueRule], [], today)
    expect(plan).toEqual({
      end: [
        { id: 'w11:00', validTo: '2026-10-03' },
        { id: 'w12:30', validTo: '2026-10-03' },
      ],
      remove: [],
      add: [],
    })
  })

  it('a cell marked today is deleted outright', () => {
    expect(clearUnderLessons([row('11:00', today)], [], [tueRule], [], today)).toEqual({ end: [], remove: ['w11:00'], add: [] })
  })

  it('rule with an end date: the cell is unavailable again after it ends (as a new row)', () => {
    const plan = clearUnderLessons([row('11:00')], [], [{ ...tueRule, startsOn: '2026-10-10', endsOn: '2027-01-31' }], [], today)
    expect(plan).toEqual({
      end: [{ id: 'w11:00', validTo: '2026-10-09' }],
      remove: [],
      add: [{ weekday: 1, start: '11:00', validFrom: '2027-02-01', validTo: null }],
    })
  })

  it('one-off lesson: only that day is cut out', () => {
    const plan = clearUnderLessons([row('11:00')], [], [], [{ date: '2026-10-13', start: '11:00', end: '12:00', fromRule: false }], today)
    expect(plan).toEqual({
      end: [{ id: 'w11:00', validTo: '2026-10-12' }],
      remove: [],
      add: [{ weekday: 1, start: '11:00', validFrom: '2026-10-14', validTo: null }],
    })
  })

  it('one-day cells are deleted when a lesson covers them; leave (not in occupied), other times and past days stay', () => {
    const dated = [
      { id: 'd1', date: '2026-10-13', start: '11:30' },
      { id: 'd2', date: '2026-10-13', start: '13:00' },
      { id: 'd3', date: '2026-10-20', start: '11:00' },
    ]
    const occupied = [{ date: '2026-10-13', start: '11:00', end: '13:00', fromRule: true }]
    expect(clearUnderLessons([], dated, [tueRule], occupied, today).remove).toEqual(['d1'])
  })

  it('no overlap: nothing changes', () => {
    expect(clearUnderLessons([row('09:00'), { ...row('11:00'), weekday: 2 }], [], [tueRule], [], today)).toEqual({ end: [], remove: [], add: [] })
  })
})

