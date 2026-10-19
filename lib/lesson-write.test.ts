import { describe, expect, it } from 'vitest'
import { lessonTimes, mergeLog, pickLesson, type LessonRow } from './lesson-write'

const slot = (key: string, start: string | null = null) => ({ key, start, end: null })

describe('pickLesson', () => {
  it('an unlogged lesson on that day: the log goes on it', () => {
    expect(pickLesson([slot('S:rule:2026-09-27', '17:30')], [], null)).toBe('S:rule:2026-09-27')
  })

  it('already marked held and nothing unlogged: the log goes on the existing record instead of a new one', () => {
    expect(pickLesson([], [slot('L:done', '17:30')], null)).toBe('L:done')
  })

  it('unlogged lessons take priority over logged ones', () => {
    expect(pickLesson([slot('S:b:d', '19:00')], [slot('L:a', '17:30')], null)).toBe('S:b:d')
  })

  it('no lesson that day: null (create a new record)', () => {
    expect(pickLesson([], [], null)).toBeNull()
  })

  it('several matches: ambiguous; a start time picks one', () => {
    const open = [slot('S:a:d', '13:00'), slot('S:b:d', '19:00')]
    expect(pickLesson(open, [], null)).toBe('ambiguous')
    expect(pickLesson(open, [], '19:00')).toBe('S:b:d')
    expect(pickLesson([], [slot('L:a', '13:00'), slot('L:b', '19:00')], '13:00')).toBe('L:a')
  })

  it('the given start time matches nothing: null', () => {
    expect(pickLesson([slot('S:a:d', '13:00')], [slot('L:b', '19:00')], '10:00')).toBeNull()
  })
})

describe('pickLesson: existing record without a time', () => {
  it('a start time with no exact match uses the untimed record and fills in its time, instead of creating another', () => {
    expect(pickLesson([], [slot('L:untimed', null)], '13:00')).toBe('L:untimed')
  })

  it('an exact time match wins', () => {
    expect(pickLesson([], [slot('L:untimed', null), slot('L:exact', '13:00')], '13:00')).toBe('L:exact')
  })

  it('no time match and no untimed record: create a new one', () => {
    expect(pickLesson([], [slot('L:other', '19:00')], '13:00')).toBeNull()
  })
})

describe('lessonTimes', () => {
  it('new record (no existing lesson): writes the start; end = start + duration', () => {
    expect(lessonTimes(null, { start: '13:00' }, 120)).toEqual({ start_time: '13:00', end_time: '15:00' })
  })

  it('uses the end time when given', () => {
    expect(lessonTimes(null, { start: '11:00', end: '12:30' }, 120)).toEqual({ start_time: '11:00', end_time: '12:30' })
  })

  it('no duration (e.g. leave): assumes 120 minutes', () => {
    expect(lessonTimes(null, { start: '11:00' }, null)).toEqual({ start_time: '11:00', end_time: '13:00' })
  })

  it('a record without a time gets one', () => {
    expect(lessonTimes({ start: null }, { start: '13:00' }, 120)).toEqual({ start_time: '13:00', end_time: '15:00' })
  })

  it('a record that already has a time, or no start given: unchanged', () => {
    expect(lessonTimes({ start: '17:30' }, { start: '13:00' }, 120)).toEqual({})
    expect(lessonTimes(null, {}, 120)).toEqual({})
  })
})

const doneByDashboard: LessonRow = {
  status: 'done',
  billable: true,
  rate_per_hour: 2500,
  duration_min: 120,
  mood: null,
  note: null,
  parent_summary: null,
  cancel_reason: null,
}

describe('mergeLog', () => {
  it("logging onto a lesson already marked held on the dashboard keeps its duration and rate snapshot and adds the note and the parents' summary", () => {
    const f = mergeLog(
      { studentId: 's', date: '2026-09-27', status: 'done', note: '资料读取还是超时', parentSummary: '做了过去问。' },
      doneByDashboard,
      120,
      3000 // the snapshot is kept even though the current rate has changed
    )
    expect(f).toEqual({
      status: 'done',
      billable: true,
      online: false,
      rate_per_hour: 2500,
      proctor_fee: null,
      note: '资料读取还是超时',
      duration_min: 120,
      mood: null,
      parent_summary: '做了过去问。',
      cancel_reason: null,
    })
  })

  it('fields not given keep their old values; given ones overwrite', () => {
    const prev = { ...doneByDashboard, note: '旧备注', mood: 2, parent_summary: '旧的一句' }
    const f = mergeLog({ studentId: 's', date: 'd', status: 'done', mood: 1 }, prev, 120, 2500)
    expect(f).toMatchObject({ note: '旧备注', mood: 1, parent_summary: '旧的一句' })
  })

  it('new lesson (no existing record): duration from the scheduled time, at the current rate', () => {
    expect(mergeLog({ studentId: 's', date: 'd', status: 'done' }, null, 120, 3000)).toMatchObject({
      billable: true,
      rate_per_hour: 3000,
      duration_min: 120,
    })
  })

  it("changed to leave: not billable; duration, mood and parents' summary are cleared; the internal note stays", () => {
    const prev = { ...doneByDashboard, note: '备注', mood: 1, parent_summary: '一句' }
    expect(mergeLog({ studentId: 's', date: 'd', status: 'leave', reason: '发烧' }, prev, 120, 2500)).toEqual({
      status: 'leave',
      billable: false,
      online: false,
      rate_per_hour: null,
      proctor_fee: null,
      note: '备注',
      duration_min: null,
      mood: null,
      parent_summary: null,
      cancel_reason: '发烧',
    })
  })

  it('leave changed to held: billable by default, at the current rate', () => {
    const prev: LessonRow = { ...doneByDashboard, status: 'leave', billable: false, rate_per_hour: null, duration_min: null, cancel_reason: '发烧' }
    expect(mergeLog({ studentId: 's', date: 'd', status: 'done' }, prev, 120, 2500)).toMatchObject({
      billable: true,
      rate_per_hour: 2500,
      duration_min: 120,
      cancel_reason: null,
    })
  })

  it('an explicit non-billable flag is respected', () => {
    expect(mergeLog({ studentId: 's', date: 'd', status: 'done', billable: false }, doneByDashboard, 120, 2500)).toMatchObject({
      billable: false,
      rate_per_hour: null,
    })
  })

  it("trial lesson: always logged as 1 hour for ¥1,000, whatever length is entered (not the student's rate)", () => {
    const f = mergeLog({ studentId: 's', date: 'd', status: 'done', durationMin: 120 }, null, 60, null, true)
    expect(f).toMatchObject({ billable: true, duration_min: 60, rate_per_hour: 1000 })
  })

  it('leave on a trial lesson: not billable, like a regular lesson', () => {
    expect(mergeLog({ studentId: 's', date: 'd', status: 'leave' }, null, 60, null, true)).toMatchObject({
      billable: false,
      duration_min: null,
      rate_per_hour: null,
    })
  })

  it('web log form with no duration chosen: a lesson already marked held keeps its duration (90 minutes is not reset to 120)', () => {
    const prev = { ...doneByDashboard, duration_min: 90 }
    expect(mergeLog({ studentId: 's', date: 'd', status: 'done', defaultMinutes: 120 }, prev, 90, 2500)).toMatchObject({ duration_min: 90 })
  })

  it('no duration and nothing scheduled that day: the default 120 minutes; otherwise the scheduled length', () => {
    expect(mergeLog({ studentId: 's', date: 'd', status: 'done', defaultMinutes: 120 }, null, null, 2500)).toMatchObject({ duration_min: 120 })
    expect(mergeLog({ studentId: 's', date: 'd', status: 'done', defaultMinutes: 120 }, null, 90, 2500)).toMatchObject({ duration_min: 90 })
  })
})


describe('mergeLog: online lessons', () => {
  const held = { status: 'done', billable: true, rate_per_hour: 1650, duration_min: 120, mood: null, note: null, parent_summary: null, cancel_reason: null }

  it('new online lessons use the online rate, in-person ones the regular rate; without an online rate, the regular rate', () => {
    expect(mergeLog({ studentId: 's', date: 'd', status: 'done', online: true }, null, 120, 1650, false, 1500)).toMatchObject({ online: true, rate_per_hour: 1500 })
    expect(mergeLog({ studentId: 's', date: 'd', status: 'done' }, null, 120, 1650, false, 1500)).toMatchObject({ online: false, rate_per_hour: 1650 })
    expect(mergeLog({ studentId: 's', date: 'd', status: 'done', online: true }, null, 120, 1650)).toMatchObject({ online: true, rate_per_hour: 1650 })
  })

  it('already logged: online / in-person stays as it was unless given, and so does the rate snapshot (later rate changes do not apply)', () => {
    expect(mergeLog({ studentId: 's', date: 'd', status: 'done', mood: 1 }, { ...held, online: true, rate_per_hour: 1400 }, 120, 1650, false, 1500)).toMatchObject({
      online: true,
      rate_per_hour: 1400,
    })
  })

  it('switching between in-person and online takes a new snapshot of the current rate', () => {
    expect(mergeLog({ studentId: 's', date: 'd', status: 'done', online: true }, { ...held, online: false }, 120, 1650, false, 1500)).toMatchObject({
      online: true,
      rate_per_hour: 1500,
    })
    expect(mergeLog({ studentId: 's', date: 'd', status: 'done', online: false }, { ...held, online: true, rate_per_hour: 1500 }, 120, 1650, false, 1500)).toMatchObject({
      online: false,
      rate_per_hour: 1650,
    })
  })

  it('leave and trial lessons are never online', () => {
    expect(mergeLog({ studentId: 's', date: 'd', status: 'leave', online: true }, null, 120, 1650, false, 1500)).toMatchObject({ online: false, rate_per_hour: null })
    expect(mergeLog({ studentId: 's', date: 'd', status: 'done', online: true }, null, 60, null, true, null)).toMatchObject({ rate_per_hour: 1000 })
  })
})

describe('proctoring', () => {
  const held = { status: 'done', billable: true, rate_per_hour: null, duration_min: 195, mood: null, note: null, parent_summary: null, cancel_reason: null }

  it('held: snapshots the per-session proctoring fee instead of a rate and is never online; the duration is still recorded', () => {
    expect(mergeLog({ studentId: 's', date: 'd', status: 'done', online: true }, null, 195, 2000, false, 1500, true, 2000)).toMatchObject({
      online: false,
      rate_per_hour: null,
      proctor_fee: 2000,
      duration_min: 195,
    })
  })

  it('already logged: keeps its proctoring-fee snapshot (later price changes do not apply)', () => {
    expect(mergeLog({ studentId: 's', date: 'd', status: 'done', mood: 1 }, { ...held, proctor_fee: 1800 }, 195, 2000, false, 2000, true, 2500)).toMatchObject({
      proctor_fee: 1800,
    })
  })

  it('leave or non-billable: no snapshot', () => {
    expect(mergeLog({ studentId: 's', date: 'd', status: 'leave' }, null, 195, 2000, false, 2000, true, 2000)).toMatchObject({ billable: false, proctor_fee: null })
    expect(mergeLog({ studentId: 's', date: 'd', status: 'done', billable: false }, null, 195, 2000, false, 2000, true, 2000)).toMatchObject({ proctor_fee: null })
  })

  it('regular lessons have no proctoring-fee snapshot', () => {
    expect(mergeLog({ studentId: 's', date: 'd', status: 'done' }, null, 120, 2000, false, 2000, false, 2000)).toMatchObject({ rate_per_hour: 2000, proctor_fee: null })
  })

  it('pickLesson: when proctoring / teaching is specified, only that kind is considered (e.g. a proctored mock exam in the morning, a review lesson in the afternoon)', () => {
    const open = [
      { key: 'S:p:d', start: '09:00', proctor: true },
      { key: 'S:l:d', start: '14:00', proctor: false },
    ]
    expect(pickLesson(open, [], null)).toBe('ambiguous')
    expect(pickLesson(open, [], null, true)).toBe('S:p:d')
    expect(pickLesson(open, [], null, false)).toBe('S:l:d')
    // no proctoring session that day: a new one is created instead of logging onto the teaching lesson
    expect(pickLesson([open[1]], [], null, true)).toBeNull()
  })
})
