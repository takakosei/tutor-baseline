// UI language. The teacher picks theirs on the Account page (profiles.locale); the parent page uses a per-student
// setting (students.parent_locale). The two are independent. Pages without login (login, demo) follow the cookie /
// browser language. Pure functions, covered by tests.
//
// Text lives in dictionaries (lib/i18n/messages/*.ts), with all three languages side by side in one file:
// zh defines the keys and function parameters, and if en / ja miss a key or differ in parameters, it's a type
// error and the build fails

export const LOCALES = ['zh', 'en', 'ja'] as const
export type Locale = (typeof LOCALES)[number]

// Used when nothing is set and the browser's language isn't supported
export const DEFAULT_LOCALE: Locale = 'en'

// Names shown in the language picker: each written in its own language, never translated
export const LOCALE_NAMES: Record<Locale, string> = { zh: '中文', en: 'English', ja: '日本語' }

// <html lang> / <div lang>: Chinese and Japanese draw the same characters differently, and browsers pick fonts by this
export const HTML_LANG: Record<Locale, string> = { zh: 'zh-CN', en: 'en', ja: 'ja' }

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

export function toLocale(value: unknown, fallback: Locale = DEFAULT_LOCALE): Locale {
  return isLocale(value) ? value : fallback
}

// Accept-Language: 'ja,en-US;q=0.9,zh-CN;q=0.8' → 'ja'. Sorted by q, the first supported one wins; none → null
export function fromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null
  const ranked = header
    .split(',')
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
      return { lang: tag.trim().toLowerCase().split('-')[0], q: q ? Number(q.slice(2)) : 1, i }
    })
    .filter((r) => r.lang && r.q > 0 && !Number.isNaN(r.q))
    .sort((a, b) => b.q - a.q || a.i - b.i)
  return ranked.map((r) => r.lang).find(isLocale) ?? null
}

// Parent page: this student's setting; if unset, the viewer's browser language. Independent of the teacher's own UI language
export function parentLocale(studentLocale: string | null | undefined, browserLocale: Locale): Locale {
  return isLocale(studentLocale) ? studentLocale : browserLocale
}

// Dictionary: zh sets the shape and en / ja must match it exactly (NoInfer: the type is inferred from zh only)
export function defineMessages<T>(messages: { zh: T; en: NoInfer<T>; ja: NoInfer<T> }): Record<Locale, T> {
  return messages
}
