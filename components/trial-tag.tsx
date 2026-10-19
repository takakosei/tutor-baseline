import type { Locale } from '@/lib/i18n/locale'
import { common } from '@/lib/i18n/messages/common'

// Small tags for trial lessons and proctored sessions (shared by the timetable, today's lessons, to-dos and lesson logs)
export function TrialTag({ locale, className = '' }: { locale: Locale; className?: string }) {
  return (
    <span className={`rounded bg-amber-500/15 px-1 text-[0.85em] text-amber-800 dark:text-amber-300 ${className}`}>
      {common[locale].trialTag}
    </span>
  )
}

// Proctored past-paper practice: the tutor's term
export function ProctorTag({ locale, className = '' }: { locale: Locale; className?: string }) {
  return (
    <span className={`rounded bg-sky-500/15 px-1 text-[0.85em] text-sky-800 dark:text-sky-300 ${className}`}>
      {common[locale].proctorTag}
    </span>
  )
}

// Parent page: a lesson moved for one week (the tutor used "reschedule" on the dashboard / student page)
export function MovedTag({ locale, className = '' }: { locale: Locale; className?: string }) {
  return (
    <span className={`rounded bg-orange-500/15 px-1 text-[0.85em] font-normal whitespace-nowrap text-orange-800 dark:text-orange-300 ${className}`}>
      {common[locale].movedTag}
    </span>
  )
}
