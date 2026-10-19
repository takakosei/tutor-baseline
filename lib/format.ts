import { common } from './i18n/messages/common'
import type { Locale } from './i18n/locale'

// '2026-10-15' → '10/15'; with a locale it adds the weekday → '10/15（木）' / '10/15 (Thu)'
export function formatMonthDay(date: string, weekday?: Locale): string {
  const [y, m, d] = date.split('-').map(Number)
  const md = `${m}/${d}`
  if (!weekday) return md
  const t = common[weekday]
  return t.withWeekday(md, t.weekdays[new Date(Date.UTC(y, m - 1, d)).getUTCDay()])
}

// Short weekday name. Index 0 = Monday (matches the database's weekday and the schedule columns)
export function weekdayName(mondayIndex: number, locale: Locale): string {
  return common[locale].weekdays[(mondayIndex + 1) % 7]
}

// Hours rounded to the half hour: 2.857 → '3h', 0.571 → '0.5h'
export function formatHours(hours: number): string {
  return `${Math.round(hours * 2) / 2}h`
}
