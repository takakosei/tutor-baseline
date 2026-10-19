import { describe, expect, it } from 'vitest'
import {
  addDays,
  lessonStats,
  missedVsOnTime,
  recentMoods,
  revisitShare,
  timeliness,
  type CheckpointRec,
  type LessonRec,
} from './analytics'

const TODAY = '2026-11-01'

function lesson(date: string, status = 'done', mood: number | null = null, studentId = 's1'): LessonRec {
  return { studentId, date, status, mood }
}

function cp(
  seq: number,
  dueDate: string | null,
  doneOn: string | null = null,
  opts: { dateTbd?: boolean; studentId?: string } = {}
): CheckpointRec {
  return { studentId: opts.studentId ?? 's1', seq, dueDate, doneOn, dateTbd: opts.dateTbd ?? false }
}

describe('lessonStats', () => {
  it('canceled and rescheduled both count as missed; the rate is missed / (held + missed)', () => {
    const s = lessonStats([
      lesson('2026-10-01'),
      lesson('2026-10-03', 'canceled'),
      lesson('2026-10-05', 'rescheduled'),
      lesson('2026-10-07'),
    ])
    expect(s).toEqual({ total: 4, held: 2, missed: 2, missRate: 0.5 })
  })

  it('leave also counts as missed', () => {
    expect(lessonStats([lesson('2026-10-01'), lesson('2026-10-08', 'leave')])).toMatchObject({ held: 1, missed: 1 })
  })

  it('lessons not yet held (scheduled) count toward nothing', () => {
    const s = lessonStats([lesson('2026-10-01'), lesson('2026-11-20', 'scheduled')])
    expect(s).toEqual({ total: 1, held: 1, missed: 0, missRate: 0 })
  })

  it('no records → the rate is null, not 0 or NaN', () => {
    expect(lessonStats([]).missRate).toBeNull()
  })
})

describe('timeliness', () => {
  it('on time / late / overdue; finishing early counts as on time', () => {
    const t = timeliness(
      [
        cp(1, '2026-10-01', '2026-09-30'), // on time
        cp(2, '2026-10-10', '2026-10-10'), // done on the due date = on time
        cp(3, '2026-10-15', '2026-10-19'), // 4 days late
        cp(4, '2026-10-20', '2026-10-30'), // 10 days late
        cp(5, '2026-10-25'), // overdue, not done
        cp(6, '2026-12-01', '2026-10-31'), // not due yet but already done = on time
      ],
      TODAY
    )
    expect(t).toEqual({ resolved: 6, onTime: 3, late: 2, overdue: 1, onTimeRate: 0.5, avgDaysLate: 7 })
  })

  it('due today and unticked, future, ongoing and date-TBD checkpoints are all ignored', () => {
    const t = timeliness(
      [
        cp(1, TODAY), // due today, not late yet
        cp(2, '2026-12-01'), // future
        cp(3, null), // ongoing
        cp(4, '2026-10-01', null, { dateTbd: true }), // placeholder date
      ],
      TODAY
    )
    expect(t).toEqual({ resolved: 0, onTime: 0, late: 0, overdue: 0, onTimeRate: null, avgDaysLate: null })
  })
})

describe('recentMoods', () => {
  it('only held lessons with a mood, oldest to newest, keeping the last n', () => {
    const moods = recentMoods(
      [
        lesson('2026-10-05', 'done', 2),
        lesson('2026-10-01', 'done', 1),
        lesson('2026-10-03', 'canceled', 3), // not held
        lesson('2026-10-07', 'done', null), // no mood recorded
        lesson('2026-10-09', 'done', 3),
      ],
      2
    )
    expect(moods).toEqual([
      { date: '2026-10-05', mood: 2 },
      { date: '2026-10-09', mood: 3 },
    ])
  })
})

describe('revisitShare', () => {
  it('share of "needs revisiting" in the last 28 days; anything outside the window is ignored', () => {
    const share = revisitShare(
      [
        lesson('2026-09-01', 'done', 3), // outside the window
        lesson('2026-10-10', 'done', 3),
        lesson('2026-10-20', 'done', 1),
        lesson('2026-10-25', 'done', 1),
        lesson('2026-10-30', 'done', 2),
      ],
      TODAY
    )
    expect(share).toBe(0.25)
  })

  it('no mood records in the window → null', () => {
    expect(revisitShare([lesson('2026-10-30', 'canceled')], TODAY)).toBeNull()
  })
})

describe('missedVsOnTime', () => {
  it('groups checkpoints by whether a cancellation fell between the previous due date (exclusive) and this one (inclusive)', () => {
    const r = missedVsOnTime(
      [
        cp(1, '2026-10-01', '2026-10-01'), // interval (-∞, 10/1]: no cancellation → on time
        cp(2, '2026-10-15', '2026-10-20'), // interval (10/1, 10/15]: canceled on 10/8 → late
        cp(3, '2026-10-25', '2026-10-24'), // interval (10/15, 10/25]: no cancellation → on time
        cp(4, '2026-11-20'), // not resolved yet, ignored
      ],
      [lesson('2026-10-08', 'canceled'), lesson('2026-10-01', 'done'), lesson('2026-11-05', 'rescheduled')],
      TODAY
    )
    expect(r.withoutMissed).toEqual({ n: 2, onTime: 2, onTimeRate: 1 })
    expect(r.withMissed).toEqual({ n: 1, onTime: 0, onTimeRate: 0 })
  })

  it("one student's cancellations never land in another student's interval", () => {
    const r = missedVsOnTime(
      [cp(1, '2026-10-15', '2026-10-15', { studentId: 'a' })],
      [lesson('2026-10-10', 'canceled', null, 'b')],
      TODAY
    )
    expect(r.withoutMissed.n).toBe(1)
    expect(r.withMissed.n).toBe(0)
  })

  it('interval edges: a cancellation on the previous due date belongs to the previous interval, one on this due date to this one', () => {
    const r = missedVsOnTime(
      [cp(1, '2026-10-01', '2026-10-01'), cp(2, '2026-10-15', '2026-10-15')],
      [lesson('2026-10-01', 'canceled')],
      TODAY
    )
    // the 10/1 cancellation falls in the first checkpoint's interval (-∞, 10/1]
    expect(r.withMissed).toEqual({ n: 1, onTime: 1, onTimeRate: 1 })
    expect(r.withoutMissed).toEqual({ n: 1, onTime: 1, onTimeRate: 1 })
  })
})

describe('addDays', () => {
  it('across months, across years, negative', () => {
    expect(addDays('2026-09-25', 7)).toBe('2026-10-02')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-10-01', -84)).toBe('2026-07-09')
  })
})
