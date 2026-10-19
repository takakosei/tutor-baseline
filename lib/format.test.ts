import { describe, expect, it } from 'vitest'
import { formatHours, formatMonthDay, weekdayName } from './format'

describe('formatMonthDay', () => {
  it('without a weekday → 10/15; with one, written in the given language', () => {
    expect(formatMonthDay('2026-10-15')).toBe('10/15')
    expect(formatMonthDay('2026-10-15', 'zh')).toBe('10/15（木）')
    expect(formatMonthDay('2026-10-15', 'ja')).toBe('10/15（木）')
    expect(formatMonthDay('2026-10-15', 'en')).toBe('10/15 (Thu)')
    expect(formatMonthDay('2026-10-18', 'en')).toBe('10/18 (Sun)')
  })
})

describe('weekdayName', () => {
  it('0 = Monday (matches the database and the schedule columns)', () => {
    expect(weekdayName(0, 'zh')).toBe('月')
    expect(weekdayName(6, 'zh')).toBe('日')
    expect(weekdayName(0, 'en')).toBe('Mon')
    expect(weekdayName(6, 'en')).toBe('Sun')
  })
})

describe('formatHours', () => {
  it('rounds to the half hour', () => {
    expect(formatHours(2.857)).toBe('3h')
    expect(formatHours(0.571)).toBe('0.5h')
  })
})
