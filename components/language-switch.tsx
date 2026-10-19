import Link from 'next/link'
import { HTML_LANG, LOCALES, LOCALE_NAMES, type Locale } from '@/lib/i18n/locale'

// Language switch on the public demo: one link per language (?lang=; href keeps the other parameters).
// Each language name is written in that language, not translated
export function LanguageSwitch({ locale, href }: { locale: Locale; href: (lang: Locale) => string }) {
  return (
    <nav aria-label="Language" className="flex gap-1 text-xs">
      {LOCALES.map((l) => (
        <Link
          key={l}
          href={href(l)}
          lang={HTML_LANG[l]}
          aria-current={l === locale ? 'true' : undefined}
          className={`rounded px-2 py-0.5 ${l === locale ? 'bg-foreground text-background' : 'text-foreground/60 hover:bg-foreground/[0.05]'}`}
        >
          {LOCALE_NAMES[l]}
        </Link>
      ))}
    </nav>
  )
}
