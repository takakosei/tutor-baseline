import { describe, expect, it } from 'vitest'
import {
  addMinutes,
  buildStatement,
  conflictingRule,
  dayLanes,
  timelineRange,
  expandOccurrences,
  hhmm,
  lessonFee,
  lessonMinutes,
  lessonsWindow,
  mondayOf,
  monthRange,
  monthlyIncome,
  monthsBetween,
  planMove,
  scheduledMinutes,
  totals,
  timesOverlap,
  unlogged,
  weekdayOf,
  type BillingLesson,
  type ScheduleRule,
  type StoredLesson,
} from './schedule'

// 2026-10-07 is a Wednesday (weekday 2)
const wedRule: ScheduleRule = {
  id: 'r1', studentId: 'b', weekday: 2, start: '19:00', end: '21:00', startsOn: '2026-10-01', endsOn: null,
}

function stored(p: Partial<StoredLesson> & { id: string; date: string }): StoredLesson {
  return { studentId: 'b', status: 'done', start: null, end: null, scheduleId: null, ...p }
}

describe('dates and times', () => {
  it('weekdayOf: 0 = Monday … 6 = Sunday', () => {
    expect(weekdayOf('2026-10-05')).toBe(0) // Mon
    expect(weekdayOf('2026-10-07')).toBe(2) // Wed
    expect(weekdayOf('2026-10-11')).toBe(6) // Sun
  })

  it('mondayOf: a Sunday belongs to the week that began on the Monday before', () => {
    expect(mondayOf('2026-10-07')).toBe('2026-10-05')
    expect(mondayOf('2026-10-11')).toBe('2026-10-05')
    expect(mondayOf('2026-10-05')).toBe('2026-10-05')
  })

  it('hhmm: turns HH:MM:SS from the database into HH:MM', () => {
    expect(hhmm('19:00:00')).toBe('19:00')
    expect(hhmm(null)).toBeNull()
  })

  it('monthRange: handles month ends and year ends', () => {
    expect(monthRange('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(monthRange('2027-02')).toEqual({ from: '2027-02-01', to: '2027-02-28' })
  })
})

describe('expandOccurrences', () => {
  it('generates one lesson a week from a rule, none before its start date', () => {
    const occ = expandOccurrences([wedRule], [], '2026-09-28', '2026-10-18')
    // 9/30 is a Wednesday but before starts_on
    expect(occ.map((o) => o.date)).toEqual(['2026-10-07', '2026-10-14'])
    expect(occ[0]).toMatchObject({ status: 'scheduled', lessonId: null, start: '19:00', key: 'S:r1:2026-10-07' })
  })

  it('generates nothing after ends_on', () => {
    const occ = expandOccurrences([{ ...wedRule, endsOn: '2026-10-10' }], [], '2026-10-01', '2026-10-31')
    expect(occ.map((o) => o.date)).toEqual(['2026-10-07'])
  })

  it('a day that already has a record (held / canceled) uses it instead of generating a duplicate', () => {
    const occ = expandOccurrences(
      [wedRule],
      [stored({ id: 'l1', date: '2026-10-07', status: 'canceled', scheduleId: 'r1', start: '19:00', end: '21:00' })],
      '2026-10-05',
      '2026-10-18'
    )
    expect(occ.map((o) => [o.date, o.status, o.lessonId])).toEqual([
      ['2026-10-07', 'canceled', 'l1'],
      ['2026-10-14', 'scheduled', null],
    ])
  })

  it('rescheduled: the original day shows as rescheduled; the new date is a recorded scheduled lesson', () => {
    const occ = expandOccurrences(
      [wedRule],
      [
        stored({ id: 'old', date: '2026-10-07', status: 'rescheduled', scheduleId: 'r1', start: '19:00', end: '21:00' }),
        stored({ id: 'new', date: '2026-10-09', status: 'scheduled', start: '16:00', end: '18:00' }),
      ],
      '2026-10-05',
      '2026-10-11'
    )
    expect(occ.map((o) => [o.date, o.status])).toEqual([
      ['2026-10-07', 'rescheduled'],
      ['2026-10-09', 'scheduled'],
    ])
  })

  it('one-time move to another day: the rule no longer produces the original day; the new day shows the moved lesson', () => {
    const moved = stored({ id: 'm', date: '2026-10-09', status: 'scheduled', scheduleId: 'r1', start: '16:00', end: '18:00', movedFrom: '2026-10-07', movedFromStart: '19:00', movedFromEnd: '21:00' })
    const occ = expandOccurrences([wedRule], [moved], '2026-10-05', '2026-10-18')
    expect(occ.map((o) => [o.date, o.start, o.key])).toEqual([
      ['2026-10-09', '16:00', 'L:m'],
      ['2026-10-14', '19:00', 'S:r1:2026-10-14'],
    ])
    expect(occ[0]).toMatchObject({ movedFrom: '2026-10-07', movedFromStart: '19:00', movedFromEnd: '21:00', scheduleId: 'r1' })
  })

  it('one-time move out of the range: the original day in the range does not appear either (the moved lesson is outside the range, so it is not shown)', () => {
    const moved = stored({ id: 'm', date: '2026-10-13', status: 'scheduled', scheduleId: 'r1', start: '19:00', end: '21:00', movedFrom: '2026-10-07' })
    expect(expandOccurrences([wedRule], [moved], '2026-10-05', '2026-10-11')).toEqual([])
  })

  it('one-time move: same day, new time', () => {
    const moved = stored({ id: 'm', date: '2026-10-07', status: 'scheduled', scheduleId: 'r1', start: '18:00', end: '20:00', movedFrom: '2026-10-07' })
    const occ = expandOccurrences([wedRule], [moved], '2026-10-07', '2026-10-07')
    expect(occ.map((o) => [o.key, o.start, o.end])).toEqual([['L:m', '18:00', '20:00']])
  })

  it("one-time move into another week of the same rule: that week's own lesson still appears", () => {
    const moved = stored({ id: 'm', date: '2026-10-14', status: 'scheduled', scheduleId: 'r1', start: '16:00', end: '18:00', movedFrom: '2026-10-07' })
    const occ = expandOccurrences([wedRule], [moved], '2026-10-05', '2026-10-18')
    expect(occ.map((o) => [o.date, o.start, o.key])).toEqual([
      ['2026-10-14', '16:00', 'L:m'],
      ['2026-10-14', '19:00', 'S:r1:2026-10-14'],
    ])
  })

  it('lessonsWindow: lessons dated in the range, plus lessons whose original date is in the range', () => {
    expect(lessonsWindow('2026-10-05', '2026-10-11')).toBe(
      'and(date.gte.2026-10-05,date.lte.2026-10-11),and(moved_from.gte.2026-10-05,moved_from.lte.2026-10-11)'
    )
    expect(lessonsWindow('2026-10-05')).toBe('date.gte.2026-10-05,moved_from.gte.2026-10-05')
  })

  it('sorts each day by start time; records without a time go last', () => {
    const occ = expandOccurrences(
      [{ ...wedRule, id: 'r2', studentId: 'a', start: '10:00', end: '12:00' }, wedRule],
      [stored({ id: 'legacy', date: '2026-10-07' })],
      '2026-10-07',
      '2026-10-07'
    )
    expect(occ.map((o) => o.start)).toEqual(['10:00', '19:00', null])
  })

  it('unlogged: past lessons still marked scheduled', () => {
    const occ = expandOccurrences([wedRule], [], '2026-10-01', '2026-10-31')
    expect(unlogged(occ, '2026-10-15').map((o) => o.date)).toEqual(['2026-10-07', '2026-10-14'])
    expect(unlogged(occ, '2026-10-14').map((o) => o.date)).toEqual(['2026-10-07']) // a lesson today does not count as unlogged yet
  })
})

describe('planMove (one-time move)', () => {
  const ruleLesson = { date: '2026-10-07', start: '19:00', end: '21:00', movedFrom: null, movedFromStart: null, movedFromEnd: null, fromRule: true }

  it('first move: records the original date, start and end', () => {
    expect(planMove(ruleLesson, { date: '2026-10-09', start: '16:00', end: '18:00' })).toEqual({
      date: '2026-10-09',
      start_time: '16:00',
      end_time: '18:00',
      moved_from: '2026-10-07',
      moved_from_start: '19:00',
      moved_from_end: '21:00',
    })
  })

  it('a same-day time change also records the original', () => {
    expect(planMove(ruleLesson, { date: '2026-10-07', start: '19:30', end: '21:00' })).toMatchObject({
      date: '2026-10-07',
      start_time: '19:30',
      moved_from: '2026-10-07',
      moved_from_start: '19:00',
    })
  })

  it('same as now: nothing to change', () => {
    expect(planMove(ruleLesson, { date: '2026-10-07', start: '19:00', end: '21:00' })).toBe('same')
  })

  it('moving again keeps the very first original', () => {
    const moved = { ...ruleLesson, date: '2026-10-09', start: '16:00', end: '18:00', movedFrom: '2026-10-07', movedFromStart: '19:00', movedFromEnd: '21:00' }
    expect(planMove(moved, { date: '2026-10-10', start: '10:00', end: '12:00' })).toMatchObject({
      date: '2026-10-10',
      moved_from: '2026-10-07',
      moved_from_start: '19:00',
      moved_from_end: '21:00',
    })
  })

  it('a rule lesson moved back to its original time: the record is deleted and the rule lesson returns', () => {
    const moved = { ...ruleLesson, date: '2026-10-09', start: '16:00', end: '18:00', movedFrom: '2026-10-07', movedFromStart: '19:00', movedFromEnd: '21:00' }
    expect(planMove(moved, { date: '2026-10-07', start: '19:00', end: '21:00' })).toBe('delete')
  })

  it('a one-off lesson moved back to its original time: restored and no longer marked as moved', () => {
    const moved = { date: '2026-10-09', start: '16:00', end: '18:00', movedFrom: '2026-10-08', movedFromStart: '10:00', movedFromEnd: '12:00', fromRule: false }
    expect(planMove(moved, { date: '2026-10-08', start: '10:00', end: '12:00' })).toEqual({
      date: '2026-10-08',
      start_time: '10:00',
      end_time: '12:00',
      moved_from: null,
      moved_from_start: null,
      moved_from_end: null,
    })
  })

  it('a lesson recorded without a time: adding one counts as a move', () => {
    const legacy = { date: '2026-10-08', start: null, end: null, movedFrom: null, movedFromStart: null, movedFromEnd: null, fromRule: false }
    expect(planMove(legacy, { date: '2026-10-08', start: '10:00', end: '12:00' })).toMatchObject({ moved_from: '2026-10-08', moved_from_start: null })
  })
})

describe('time and fees', () => {
  function bl(p: Partial<BillingLesson>): BillingLesson {
    return { studentId: 'b', date: '2026-10-07', status: 'done', durationMin: null, start: '19:00', end: '21:00', billable: true, ratePerHour: null, ...p }
  }

  it('lessonMinutes: the actual duration when recorded, otherwise start to end', () => {
    expect(lessonMinutes(bl({ durationMin: 90 }))).toBe(90)
    expect(lessonMinutes(bl({}))).toBe(120)
    expect(lessonMinutes(bl({ start: null, end: null }))).toBeNull()
  })

  it('lessonFee: prefers the rate snapshot; non-billable and not-yet-held lessons are 0', () => {
    expect(lessonFee(bl({}), 2000)).toBe(4000)
    expect(lessonFee(bl({ ratePerHour: 1800 }), 2000)).toBe(3600) // a later rate increase does not affect lessons already held
    expect(lessonFee(bl({ durationMin: 90 }), 2000)).toBe(3000)
    expect(lessonFee(bl({ billable: false }), 2000)).toBe(0)
    expect(lessonFee(bl({ status: 'scheduled' }), 2000)).toBe(0)
    expect(lessonFee(bl({ status: 'canceled', billable: true }), 2000)).toBe(4000) // a late cancellation is still billed
    expect(lessonFee(bl({}), null)).toBe(0)
  })

  it('lessonFee: amounts are whole yen', () => {
    expect(lessonFee(bl({ durationMin: 50 }), 2000)).toBe(1667)
  })

  it('totals: working time counts held lessons only, fees include billable cancellations; optional date range', () => {
    const lessons = [
      bl({ date: '2026-09-30' }),
      bl({ date: '2026-10-07' }),
      bl({ date: '2026-10-14', status: 'canceled', billable: true }),
      bl({ date: '2026-10-21', status: 'canceled', billable: false }),
      bl({ date: '2026-10-28', status: 'scheduled' }),
    ]
    expect(totals(lessons, () => 2000)).toEqual({ minutes: 240, fee: 12000, lessons: 2 })
    expect(totals(lessons, () => 2000, { from: '2026-10-01', to: '2026-10-31' })).toEqual({ minutes: 120, fee: 8000, lessons: 1 })
  })
})

describe('buildStatement', () => {
  const base: BillingLesson = { studentId: 'b', date: '2026-10-07', status: 'done', durationMin: null, start: '19:00', end: '21:00', billable: true, ratePerHour: 2000 }

  it("lists only this month's billable lessons, by date; totals lessons, time and fee", () => {
    const s = buildStatement(
      [
        { ...base, date: '2026-10-14', durationMin: 90 },
        { ...base, date: '2026-10-07' },
        { ...base, date: '2026-10-21', status: 'canceled', durationMin: null }, // late cancellation, still billed
        { ...base, date: '2026-10-28', status: 'canceled', billable: false }, // not billable → not listed
        { ...base, date: '2026-09-30' }, // last month
        { ...base, date: '2026-10-30', status: 'scheduled' }, // not held yet
      ],
      2000,
      '2026-10'
    )
    expect(s.rows.map((r) => [r.date, r.minutes, r.fee, r.tag])).toEqual([
      ['2026-10-07', 120, 4000, null],
      ['2026-10-14', 90, 3000, null],
      ['2026-10-21', 120, 4000, 'cancelled'],
    ])
    expect(s).toMatchObject({ lessons: 3, minutes: 330, fee: 11000 })
  })

  it("each row uses the lesson's rate snapshot; the current rate only when a record has none", () => {
    const s = buildStatement([{ ...base, ratePerHour: null }, { ...base, date: '2026-10-08', ratePerHour: 1800 }], 2200, '2026-10')
    expect(s.rows.map((r) => r.rate)).toEqual([2200, 1800])
  })

  it("other items: only this month's count, charges and credits both go into the total; the lesson-fee subtotal is given separately", () => {
    const s = buildStatement([base], 2000, '2026-10', [
      { id: 'd', month: '2026-10', date: null, label: '文具（没填日期）', amount: 300 },
      { id: 'b', month: '2026-10', date: '2026-10-20', label: '优惠', amount: -1000 },
      { id: 'a', month: '2026-10', date: '2026-10-05', label: '代买教材', amount: 1650 },
      { id: 'c', month: '2026-11', date: '2026-11-02', label: '下个月的', amount: 500 },
    ])
    expect(s.items.map((e) => e.label)).toEqual(['代买教材', '优惠', '文具（没填日期）']) // undated items go last
    expect(s).toMatchObject({ lessons: 1, lessonFee: 4000, fee: 4950 })
  })

  it('no lessons this month, only other items: the total is the items', () => {
    expect(buildStatement([], 2000, '2026-10', [{ id: 'a', month: '2026-10', date: null, label: '代买教材', amount: 1650 }])).toMatchObject({
      rows: [],
      lessonFee: 0,
      fee: 1650,
    })
  })
})

describe('time clashes', () => {
  it('timesOverlap: touching ends do not count', () => {
    expect(timesOverlap({ start: '13:00', end: '15:00' }, { start: '14:00', end: '16:00' })).toBe(true)
    expect(timesOverlap({ start: '13:00', end: '15:00' }, { start: '15:00', end: '17:00' })).toBe(false)
    expect(timesOverlap({ start: '17:30', end: '19:30' }, { start: '17:30', end: '19:30' })).toBe(true)
  })

  it('same weekday, overlapping times, neither has an end date: clash', () => {
    expect(conflictingRule([wedRule], { weekday: 2, start: '20:00', end: '21:30', startsOn: '2026-11-01' })).toBe(wedRule)
  })

  it('different weekday or no overlap: no clash', () => {
    expect(conflictingRule([wedRule], { weekday: 3, start: '19:00', end: '21:00', startsOn: '2026-10-01' })).toBeNull()
    expect(conflictingRule([wedRule], { weekday: 2, start: '17:00', end: '19:00', startsOn: '2026-10-01' })).toBeNull()
  })

  it('old rule already ended: a clash only if that weekday still falls before its end', () => {
    // old rule ends 10/7 (Wed), new rule starts 10/7: both apply on 10/7 → clash
    const stoppedWed = { ...wedRule, endsOn: '2026-10-07' }
    expect(conflictingRule([stoppedWed], { weekday: 2, start: '19:00', end: '21:00', startsOn: '2026-10-07' })).toBe(stoppedWed)
    // old rule ends 10/9 (Fri), new rule starts 10/9: the next Wednesday comes later → no clash
    const stoppedFri = { ...wedRule, endsOn: '2026-10-09' }
    expect(conflictingRule([stoppedFri], { weekday: 2, start: '19:00', end: '21:00', startsOn: '2026-10-09' })).toBeNull()
    // new rule starts earlier: overlaps Wednesdays while the old rule was valid → clash
    expect(conflictingRule([stoppedFri], { weekday: 2, start: '19:00', end: '21:00', startsOn: '2026-09-01' })).toBe(stoppedFri)
  })
})

describe('trial lessons', () => {
  it('addMinutes: adds minutes across the hour', () => {
    expect(addMinutes('17:30', 60)).toBe('18:30')
    expect(addMinutes('09:45', 30)).toBe('10:15')
  })

  it('tuition statement: the trial lesson is tagged and billed from its snapshot, 1 hour for ¥1,000', () => {
    const trial: BillingLesson = {
      studentId: 'b', date: '2026-09-13', status: 'done', durationMin: 60, start: '17:30', end: '18:30',
      billable: true, ratePerHour: 1000, trial: true,
    }
    const st = buildStatement([trial], 2000, '2026-09')
    expect(st.rows[0]).toMatchObject({ tag: 'trial', minutes: 60, rate: 1000, fee: 1000 })
    expect(st.fee).toBe(1000)
  })

  it('schedule: trial lessons carry the flag; lessons from a rule are never trials', () => {
    const occ = expandOccurrences(
      [wedRule],
      [stored({ id: 't', date: '2026-10-05', status: 'scheduled', start: '17:30', end: '18:30', trial: true })],
      '2026-10-05',
      '2026-10-07'
    )
    expect(occ.map((o) => [o.date, o.trial])).toEqual([
      ['2026-10-05', true],
      ['2026-10-07', false],
    ])
  })
})

describe('schedule timeline', () => {
  it('spans at least 10:00–21:00, widened to the hour for earlier / later lessons', () => {
    expect(timelineRange([])).toEqual({ from: 600, to: 1260 })
    expect(timelineRange([{ start: '12:00', end: '13:00' }])).toEqual({ from: 600, to: 1260 })
    expect(timelineRange([{ start: '09:30', end: '10:30' }, { start: '20:30', end: '21:30' }])).toEqual({ from: 540, to: 1320 })
    expect(timelineRange([{ start: null, end: null }])).toEqual({ from: 600, to: 1260 })
  })

  it('no overlap (including back-to-back lessons): each takes the full width', () => {
    const l = dayLanes([
      { key: 'a', start: '15:30', end: '17:30' },
      { key: 'b', start: '17:30', end: '19:30' },
    ])
    expect(l.get('a')).toEqual({ lane: 0, of: 1 })
    expect(l.get('b')).toEqual({ lane: 0, of: 1 })
  })

  it('overlapping lessons sit side by side; a freed lane is reused; an unrelated group is unaffected', () => {
    const l = dayLanes([
      { key: 'a', start: '13:00', end: '15:00' },
      { key: 'b', start: '14:00', end: '16:00' },
      { key: 'c', start: '15:00', end: '17:00' }, // a has ended, so lane 0 is reused
      { key: 'd', start: '19:00', end: '21:00' },
    ])
    expect(l.get('a')).toEqual({ lane: 0, of: 2 })
    expect(l.get('b')).toEqual({ lane: 1, of: 2 })
    expect(l.get('c')).toEqual({ lane: 0, of: 2 })
    expect(l.get('d')).toEqual({ lane: 0, of: 1 })
  })
})

describe('buildStatement: online lessons', () => {
  it('online rows carry the online tag; fees use the rate snapshot taken when the lesson was logged', () => {
    const base = { studentId: 's', status: 'done', start: '13:00', end: '15:00', billable: true, trial: false }
    const st = buildStatement(
      [
        { ...base, date: '2026-10-01', durationMin: 120, ratePerHour: 1650, online: false },
        { ...base, date: '2026-10-06', durationMin: 120, ratePerHour: 1500, online: true },
      ],
      1650,
      '2026-10'
    )
    expect(st.rows.map((r) => [r.date, r.tag, r.fee])).toEqual([
      ['2026-10-01', null, 3300],
      ['2026-10-06', 'online', 3000],
    ])
    expect(st.lessonFee).toBe(6300)
  })
})

describe('proctoring (flat fee per session)', () => {
  const base = { studentId: 's', status: 'done', billable: true, trial: false, ratePerHour: 2000 }

  it('lessons from a proctoring rule are proctoring sessions', () => {
    const occ = expandOccurrences([{ id: 'p', studentId: 's', weekday: 6, start: '09:00', end: '12:15', startsOn: '2026-10-11', endsOn: null, proctor: true }], [], '2026-10-11', '2026-10-11')
    expect(occ[0]).toMatchObject({ proctor: true, start: '09:00', end: '12:15' })
  })

  it("fee = that session's proctoring-fee snapshot, whatever the length; the statement row is tagged proctor and priced per session", () => {
    const st = buildStatement(
      [
        { ...base, date: '2026-10-11', start: '09:00', end: '12:15', durationMin: 195, ratePerHour: null, proctor: true, proctorFee: 2000 },
        { ...base, date: '2026-10-11', start: '14:00', end: '16:00', durationMin: 120 },
      ],
      2000,
      '2026-10'
    )
    expect(st.rows.map((r) => [r.start, r.tag, r.rate, r.perSession, r.fee])).toEqual([
      ['09:00', 'proctor', 2000, true, 2000],
      ['14:00', null, 2000, false, 4000],
    ])
    expect(st.lessonFee).toBe(6000)
    expect(st.minutes).toBe(315) // the duration still counts
  })

  it('non-billable or not-yet-held sessions are 0; a billed cancellation carries both tags', () => {
    const p = { ...base, date: '2026-10-11', start: '09:00', end: '12:15', durationMin: null, ratePerHour: null, proctor: true, proctorFee: 2000 }
    expect(lessonFee({ ...p, billable: false }, 2000)).toBe(0)
    expect(lessonFee({ ...p, status: 'scheduled' }, 2000)).toBe(0)
    expect(buildStatement([{ ...p, status: 'canceled' }], 2000, '2026-10').rows[0]).toMatchObject({ tag: 'proctor-cancelled', fee: 2000 })
  })
})

describe('scheduledMinutes (remaining teaching time)', () => {
  it('counts only teaching still scheduled: leave, held lessons and proctoring are excluded', () => {
    const rules = [
      { id: 'thu', studentId: 's', weekday: 3, start: '19:00', end: '21:00', startsOn: '2026-09-01', endsOn: null },
      { id: 'sunp', studentId: 's', weekday: 6, start: '09:00', end: '12:15', startsOn: '2026-10-18', endsOn: null, proctor: true },
      { id: 'sun', studentId: 's', weekday: 6, start: '14:00', end: '16:00', startsOn: '2026-10-18', endsOn: null },
    ]
    const lessons = [
      { id: 'a', studentId: 's', date: '2026-10-15', status: 'leave', start: '19:00', end: '21:00', scheduleId: 'thu' },
      { id: 'b', studentId: 's', date: '2026-10-08', status: 'done', start: '19:00', end: '21:00', scheduleId: 'thu' },
    ]
    // 10/8–10/25: Thursdays 10/8 (held), 10/15 (leave), 10/22 → 2h; Sundays 10/18, 10/25 → 4h
    expect(scheduledMinutes(expandOccurrences(rules, lessons, '2026-10-08', '2026-10-25'))).toBe(360)
  })
})


describe('income page (earnings per month)', () => {
  const base: BillingLesson = { studentId: 'a', date: '2026-09-10', status: 'done', durationMin: null, start: '19:00', end: '21:00', billable: true, ratePerHour: 2000 }

  it('monthsBetween: inclusive at both ends, works across years; empty when reversed', () => {
    expect(monthsBetween('2026-09', '2026-09')).toEqual(['2026-09'])
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
    expect(monthsBetween('2026-10', '2026-09')).toEqual([])
  })

  it('monthly sums match totals; split by student, highest earner first; months without lessons still get a row', () => {
    const lessons = [
      { ...base },
      { ...base, studentId: 'b', date: '2026-10-01', ratePerHour: 1650 },
      { ...base, date: '2026-10-08', durationMin: 90 },
      { ...base, date: '2026-10-15', status: 'canceled', billable: true }, // late cancellation (billed): counts toward the fee, not toward lessons or time
      { ...base, date: '2026-10-22', status: 'canceled', billable: false }, // not billable
      { ...base, studentId: 'c', date: '2026-10-29', status: 'leave', billable: false }, // a student with only leave is not listed
    ]
    const [sep, oct, nov] = monthlyIncome(lessons, () => 2000, ['2026-09', '2026-10', '2026-11'])
    expect(sep).toMatchObject({ month: '2026-09', lessons: 1, minutes: 120, fee: 4000, extras: 0 })
    expect(oct).toMatchObject({ lessons: 2, minutes: 210, fee: 3000 + 4000 + 3300 })
    expect(oct.byStudent).toEqual([
      { studentId: 'a', lessons: 1, minutes: 90, fee: 7000, extras: 0 },
      { studentId: 'b', lessons: 1, minutes: 120, fee: 3300, extras: 0 },
    ])
    expect(nov).toEqual({ month: '2026-11', lessons: 0, minutes: 0, fee: 0, extras: 0, byStudent: [] })
    // the months add up to the all-time total
    expect([sep, oct, nov].reduce((sum, m) => sum + m.fee, 0)).toBe(totals(lessons, () => 2000).fee)
  })

  it('other statement items are counted apart from lesson fees; a student with only other items is still listed', () => {
    const [oct] = monthlyIncome([{ ...base, date: '2026-10-07' }], () => 2000, ['2026-10'], [
      { studentId: 'a', month: '2026-10', amount: 1650 },
      { studentId: 'a', month: '2026-10', amount: -500 },
      { studentId: 'b', month: '2026-10', amount: 800 },
      { studentId: 'a', month: '2026-11', amount: 300 },
    ])
    expect(oct).toMatchObject({ fee: 4000, extras: 1950 })
    expect(oct.byStudent).toEqual([
      { studentId: 'a', lessons: 1, minutes: 120, fee: 4000, extras: 1150 },
      { studentId: 'b', lessons: 0, minutes: 0, fee: 0, extras: 800 },
    ])
  })
})
