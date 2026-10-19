import { describe, expect, it } from 'vitest'
import {
  byBaselineOrder,
  computeProgress,
  daysBetween,
  toTokyoDate,
  type Checkpoint,
} from './progress'

// Fixtures: three sample plans (dates only)
function plan(prefix: string, dates: (string | null)[]): Checkpoint[] {
  return dates.map((dueDate, i) => ({
    id: `${prefix}${i + 1}`,
    seq: i + 1,
    dueDate,
    title: `${prefix}${i + 1}`,
    doneAt: null,
  }))
}

function tick(cps: Checkpoint[], ...seqs: number[]): Checkpoint[] {
  return cps.map((c) => (seqs.includes(c.seq) ? { ...c, doneAt: '2026-09-01T10:00:00+09:00' } : c))
}

// Student A: aptitude-test prep, 4 h a week
const A = plan('A', [
  '2026-10-15', '2026-11-05', '2026-11-30', '2026-12-25',
  '2027-01-20', '2027-01-31', '2027-02-03',
])
// Student B: two checkpoints due on 10/10; seq 11 is ongoing (no date)
const B = plan('B', [
  '2026-09-26', '2026-10-05', '2026-10-10', '2026-10-10', '2026-11-15',
  '2026-11-30', '2026-12-20', '2027-01-10', '2027-01-25', '2027-02-28', null,
])
// Student C: no weekly hours set
const C = plan('C', ['2026-12-20', '2027-01-15', '2027-03-01', '2027-03-10'])

describe('computeProgress', () => {
  it('1. empty list → none, no throw', () => {
    expect(computeProgress([], '2026-09-24')).toEqual({
      total: 0, should: 0, done: 0, state: 'none', offsetDays: 0, nextId: null,
    })
  })

  it('2. nothing done and nothing due yet → ontrack, should = 0', () => {
    const p = computeProgress(A, '2026-09-24', 4)
    expect(p).toMatchObject({ total: 7, should: 0, done: 0, state: 'ontrack', offsetDays: 0, nextId: 'A1' })
    expect(p).not.toHaveProperty('catchUpHours')
  })

  describe('3. all done → nextId = null', () => {
    const all = tick(A, 1, 2, 3, 4, 5, 6, 7)

    it('last checkpoint not due yet → ahead, counted up to the last checkpoint', () => {
      expect(computeProgress(all, '2026-09-24', 4)).toMatchObject({
        should: 0, done: 7, state: 'ahead', offsetDays: 132, nextId: null,
      })
    })

    it('all due → ontrack', () => {
      expect(computeProgress(all, '2027-03-01', 4)).toMatchObject({
        should: 7, done: 7, state: 'ontrack', offsetDays: 0, nextId: null,
      })
    })
  })

  describe('4. past an overdue checkpoint → behind', () => {
    it('days behind and catch-up hours: 14 days = 2 weeks × 4 h = 8 h', () => {
      expect(computeProgress(A, '2026-10-29', 4)).toMatchObject({
        should: 1, done: 0, state: 'behind', offsetDays: 14, catchUpHours: 8, nextId: 'A1',
      })
    })

    it('counts from the first overdue, unfinished checkpoint, not the earliest one', () => {
      // A1 done, A2 (11/05) overdue → 5 days behind on 11/10
      expect(computeProgress(tick(A, 1), '2026-11-10', 4)).toMatchObject({
        should: 2, done: 1, state: 'behind', offsetDays: 5, nextId: 'A2',
      })
    })
  })

  it('5. only ongoing items → total = 0, none', () => {
    const ongoing = plan('X', [null, null])
    expect(computeProgress(ongoing, '2026-09-24', 4)).toMatchObject({
      total: 0, state: 'none', nextId: null,
    })
  })

  it('6. two checkpoints due the same day → should counts both; ongoing items are not in total', () => {
    const p = computeProgress(tick(B, 1, 2), '2026-10-11', 4)
    expect(p).toMatchObject({ total: 10, should: 4, done: 2, state: 'behind', offsetDays: 1, nextId: 'B3' })
  })

  it('7. hoursPerWeek null / omitted → no catchUpHours, no crash', () => {
    for (const hours of [null, undefined]) {
      const p = computeProgress(C, '2027-01-01', hours)
      expect(p).toMatchObject({ should: 1, done: 0, state: 'behind', offsetDays: 12 })
      expect(p).not.toHaveProperty('catchUpHours')
    }
  })

  it('8. checkpoint due today and not ticked → ontrack, not "0 days behind"', () => {
    // Student B on 10/10 before the lesson: B3 and B4 are due today
    expect(computeProgress(tick(B, 1, 2), '2026-10-10', 4)).toMatchObject({
      should: 4, done: 2, state: 'ontrack', offsetDays: 0, nextId: 'B3',
    })
  })

  it('9. done = checkpoints finished in a row from the start: a later tick does not count while an earlier one is open', () => {
    // A2 ticked, A1 not: done is 0, behind counted from A1 (10/15)
    expect(computeProgress(tick(A, 2), '2026-11-10', 4)).toMatchObject({
      should: 2, done: 0, state: 'behind', offsetDays: 26, nextId: 'A1',
    })
    // A1 and A2 ticked: done is 2
    expect(computeProgress(tick(A, 1, 2), '2026-11-10', 4)).toMatchObject({ should: 2, done: 2, state: 'ontrack', nextId: 'A3' })
  })

  it('9b. finishing out of order never shows as ahead (ticking only a later checkpoint must not count the earlier ones)', () => {
    // Student D on 9/28: the 12/20 checkpoint is done early, the 10/10–12/15 ones are not
    const D = plan('D', ['2026-10-10', '2026-11-15', '2026-11-15', '2026-12-15', '2026-12-20', '2027-01-31', '2027-03-01', '2027-03-10'])
    expect(computeProgress(tick(D, 5), '2026-09-28', 3)).toMatchObject({
      should: 0, done: 0, state: 'ontrack', offsetDays: 0, nextId: 'D1',
    })
    // On 11/20 the 10/10 and 11/15 ones are still open: behind from 10/10; the early 12/20 does not offset it
    expect(computeProgress(tick(D, 5), '2026-11-20', 3)).toMatchObject({
      should: 3, done: 0, state: 'behind', offsetDays: 41, nextId: 'D1',
    })
    // Once the earlier ones are done, the early one counts too: done is 5, ahead up to 12/20
    expect(computeProgress(tick(D, 1, 2, 3, 4, 5), '2026-12-16', 3)).toMatchObject({
      should: 4, done: 5, state: 'ahead', offsetDays: 4, nextId: 'D6',
    })
  })

  it('10. seq order differs from date order → sorted by date, never negative days behind', () => {
    const swapped: Checkpoint[] = [
      { id: 'late', seq: 1, dueDate: '2026-10-20', title: 'late', doneAt: null },
      { id: 'early', seq: 2, dueDate: '2026-10-10', title: 'early', doneAt: null },
    ]
    expect(computeProgress(swapped, '2026-10-15', 4)).toMatchObject({
      should: 1, done: 0, state: 'behind', offsetDays: 5, nextId: 'early',
    })
  })
})

describe('byBaselineOrder', () => {
  it('by date first, then by seq on the same day', () => {
    const sorted = [
      { id: 'b', dueDate: '2026-10-10', seq: 4 },
      { id: 'c', dueDate: '2026-11-15', seq: 1 },
      { id: 'a', dueDate: '2026-10-10', seq: 3 },
    ].sort(byBaselineOrder)
    expect(sorted.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('daysBetween', () => {
  it('counts calendar days across months and years; negative when to is earlier', () => {
    expect(daysBetween('2026-09-24', '2026-10-15')).toBe(21)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2026-10-15', '2026-09-24')).toBe(-21)
    expect(daysBetween('2026-09-24', '2026-09-24')).toBe(0)
  })
})

describe('toTokyoDate', () => {
  it('15:00 UTC is already the next day in Tokyo', () => {
    expect(toTokyoDate(new Date('2026-09-24T14:59:59Z'))).toBe('2026-09-24')
    expect(toTokyoDate(new Date('2026-09-24T15:00:00Z'))).toBe('2026-09-25')
  })
})
