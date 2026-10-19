import type { Metadata } from 'next'
import { toTokyoDate } from '@/lib/progress'
import { demoData } from '@/lib/demo-data'
import { AnalyticsView } from '@/components/analytics-view'
import { LanguageSwitch } from '@/components/language-switch'
import { LocaleProvider } from '@/components/locale-provider'
import { isLocale } from '@/lib/i18n/locale'
import { getVisitorLocale } from '@/lib/i18n/server'
import { common } from '@/lib/i18n/messages/common'
import { demo } from '@/lib/i18n/messages/demo'

// Public demo page: shows the analytics page without signing in (for the portfolio / README).
// Uses only fictional data generated in memory and imports no Supabase client, so it can't reach real data.

type Props = { searchParams: Promise<{ range?: string; lang?: string }> }

// use ?lang= if given (the language switch links), otherwise the browser's language
async function localeOf(lang: string | undefined) {
  return isLocale(lang) ? lang : getVisitorLocale()
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return { title: demo[await localeOf((await searchParams).lang)].analyticsTitle }
}

export default async function DemoAnalyticsPage({ searchParams }: Props) {
  const { range, lang } = await searchParams
  const today = toTokyoDate(new Date())
  const locale = await localeOf(lang)
  const t = demo[locale]
  const keep: Record<string, string> = isLocale(lang) ? { lang } : {}
  const href = (l: string) => `/demo/analytics?${new URLSearchParams({ ...(range === '12w' ? { range } : {}), lang: l })}`

  return (
    <LocaleProvider locale={locale}>
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
        <LanguageSwitch locale={locale} href={href} />
        <header className="space-y-1">
          <p className="text-sm font-semibold">{t.header(common[locale].appName)}</p>
          <p className="text-xs text-foreground/50">{t.analyticsIntro}</p>
        </header>
        <AnalyticsView
          locale={locale}
          keep={keep}
          data={demoData(today, locale)}
          today={today}
          range={range === '12w' ? '12w' : 'all'}
          isDemo
          basePath="/demo/analytics"
          showSourceToggle={false}
        />
      </main>
    </LocaleProvider>
  )
}
