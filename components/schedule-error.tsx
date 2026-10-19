import type { Locale } from '@/lib/i18n/locale'
import { schedule } from '@/lib/i18n/messages/schedule'

// Explains why adding a lesson or a weekly slot was rejected (returned by fail() in schedule-actions.ts).
// code is "form.reason", e.g. rule.time-order. With only set, it shows errors for that form only
export function ScheduleError({
  code,
  at,
  only,
  locale,
}: {
  code?: string
  at?: string
  only?: 'rule' | 'extra' | 'trial'
  locale: Locale
}) {
  const [form, reason] = (code ?? '').split('.')
  if (only && form !== only) return null
  const messages = schedule[locale].errors
  const message = reason && Object.hasOwn(messages, reason) ? messages[reason] : undefined
  if (!message) return null
  return <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{message(at ?? '')}</p>
}
