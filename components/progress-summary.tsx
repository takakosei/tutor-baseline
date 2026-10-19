import type { Progress } from '@/lib/progress'
import { formatHours } from '@/lib/format'
import type { Locale } from '@/lib/i18n/locale'
import { common } from '@/lib/i18n/messages/common'

export function StateText({ progress: p, locale }: { progress: Progress; locale: Locale }) {
  const t = common[locale].progress
  const counts = <span className="text-foreground/50">{t.counts(p.done, p.should, p.total)}</span>
  switch (p.state) {
    case 'none':
      return <span className="text-foreground/50">{t.none}</span>
    case 'ontrack':
      return (
        <span>
          {t.ontrack}
          {counts}
        </span>
      )
    case 'ahead':
      return (
        <span className="text-green-700 dark:text-green-500">
          {t.ahead(p.offsetDays)}
          {counts}
        </span>
      )
    case 'behind':
      return (
        <span className="text-red-600">
          {t.behind(p.offsetDays)}
          {p.catchUpHours !== undefined && t.catchUp(formatHours(p.catchUpHours))}
          {counts}
        </span>
      )
  }
}

// The student's status (students.status)
export function statusLabel(status: string, locale: Locale): string {
  return common[locale].studentStatus[status] ?? status
}

// Risk level: a colour stripe on the card's left edge. It sits inside the card instead of changing the border, so every card keeps the same outline
export function RiskStripe({ level }: { level: string | null }) {
  const color = level === 'risk' ? 'bg-red-500' : level === 'warn' ? 'bg-amber-500' : null
  if (!color) return null
  return <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${color}`} />
}
