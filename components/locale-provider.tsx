'use client'

import { createContext, useContext } from 'react'
import { DEFAULT_LOCALE, HTML_LANG, type Locale } from '@/lib/i18n/locale'

// Client components read the current language with useLocale(); server components take a locale prop.
// Wraps the children in a div with lang: the parent page's language can differ from <html lang>, and the browser
// uses it to pick the right font for CJK characters
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

export function LocaleProvider({
  locale,
  className,
  children,
}: {
  locale: Locale
  className?: string
  children: React.ReactNode
}) {
  return (
    <LocaleContext value={locale}>
      <div lang={HTML_LANG[locale]} className={className}>
        {children}
      </div>
    </LocaleContext>
  )
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}
