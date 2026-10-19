import type { Metadata } from 'next'
import { toTokyoDate } from '@/lib/progress'
import { addDays } from '@/lib/analytics'
import { demoWeek } from '@/lib/demo-data'
import { expandOccurrences, mondayOf } from '@/lib/schedule'
import { WeekGrid } from '@/components/week-grid'
import { LanguageSwitch } from '@/components/language-switch'
import { LocaleProvider } from '@/components/locale-provider'
import { isLocale } from '@/lib/i18n/locale'
import { getVisitorLocale } from '@/lib/i18n/server'
import { common } from '@/lib/i18n/messages/common'
import { demo as demoText } from '@/lib/i18n/messages/demo'

// Public timetable demo (for the portfolio): fictional students, in memory only, no database
type Props = { searchParams: Promise<{ week?: string; lang?: string }> }

// use ?lang= if given (the language switch links), otherwise the browser's language; the week links keep it
async function localeOf(lang: string | undefined) {
  return isLocale(lang) ? lang : getVisitorLocale()
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return { title: demoText[await localeOf((await searchParams).lang)].scheduleTitle }
}

export default async function DemoSchedulePage({ searchParams }: Props) {
  const { week, lang } = await searchParams
  const locale = await localeOf(lang)
  const t = demoText[locale]
  const query = (q: Record<string, string>) => {
    const s = new URLSearchParams({ ...q, ...(isLocale(lang) ? { lang } : {}) }).toString()
    return s ? `/demo/schedule?${s}` : '/demo/schedule'
  }
  const today = toTokyoDate(new Date())
  const weekStart = mondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today)
  const demo = demoWeek(today)
  const occ = expandOccurrences(demo.rules, demo.lessons, weekStart, addDays(weekStart, 6))
  const labelOf = (id: string) => demo.students.find((s) => s.id === id)?.name ?? '?'
  const navHref = (w: string) => query(w ? { week: w } : {})
  const langHref = (l: string) => `/demo/schedule?${new URLSearchParams({ ...(week ? { week } : {}), lang: l })}`

  return (
    <LocaleProvider locale={locale}>
      <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8">
        <LanguageSwitch locale={locale} href={langHref} />
        <header className="space-y-1">
          <p className="text-sm font-semibold">{t.header(common[locale].appName)}</p>
          <p className="text-xs text-foreground/50">{t.scheduleIntro}</p>
        </header>
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-foreground/60">{t.teacherSchedule}</h2>
          <WeekGrid locale={locale} weekStart={weekStart} occurrences={occ} labelOf={labelOf} today={today} navHref={navHref} linked={false} />
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-foreground/60">{t.studentPage(labelOf('demo-b'))}</h2>
          <WeekGrid locale={locale} weekStart={weekStart} occurrences={occ} labelOf={labelOf} today={today} highlight="demo-b" navHref={navHref} linked={false} />
        </section>
      </main>
    </LocaleProvider>
  )
}
