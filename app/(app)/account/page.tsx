import { createClient } from '@/lib/supabase/server'
import { toTokyoDate } from '@/lib/progress'
import { formatMonthDay } from '@/lib/format'
import { AddPasskey } from '@/components/add-passkey'
import { LOCALES, LOCALE_NAMES } from '@/lib/i18n/locale'
import { settings } from '@/lib/i18n/messages/settings'
import { app } from '@/lib/i18n/messages/app'
import { getTeacherLocale } from '@/lib/i18n/server'
import { SubmitButton } from '@/components/submit-button'
import { deletePasskey, setLocale } from './actions'

const input = 'rounded-md border border-foreground/20 bg-transparent px-2 py-1 text-sm'

function day(iso: string) {
  return formatMonthDay(toTokyoDate(new Date(iso)))
}

export default async function AccountPage() {
  const supabase = await createClient()
  const [{ data: claims }, { data: passkeys, error }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.auth.passkey.list(),
  ])
  const locale = await getTeacherLocale()
  const t = settings[locale]
  const a = app[locale].account

  return (
    <div className="space-y-8">
      <section className="space-y-1">
        <h1 className="text-lg font-semibold">{a.title}</h1>
        <p className="text-sm text-foreground/60">{claims?.claims.email as string | undefined}</p>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-medium">{t.language}</h2>
          <p className="text-xs text-foreground/50">{t.languageHint}</p>
        </div>
        <form action={setLocale} className="flex items-center gap-2">
          <select name="locale" defaultValue={locale} aria-label={t.language} className={input}>
            {LOCALES.map((l) => (
              <option key={l} value={l} lang={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </select>
          <SubmitButton small pendingText="…">
            {t.save}
          </SubmitButton>
        </form>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-medium">{a.passkey}</h2>
          <p className="text-xs text-foreground/50">{a.passkeyHint}</p>
        </div>

        {error ? (
          <p className="text-sm text-red-600">{a.listError(error.code ?? error.message)}</p>
        ) : passkeys.length === 0 ? (
          <p className="text-sm text-foreground/60">{a.none}</p>
        ) : (
          <ul className="divide-y divide-foreground/10 rounded-md border border-foreground/10">
            {passkeys.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  {p.friendly_name ?? a.unnamed}
                  <span className="ml-2 text-xs text-foreground/50">
                    {a.added(day(p.created_at))}
                    {p.last_used_at && a.lastUsed(day(p.last_used_at))}
                  </span>
                </span>
                <details className="text-xs text-foreground/40">
                  <summary className="cursor-pointer list-none hover:text-foreground">{a.delete}</summary>
                  <form action={deletePasskey} className="mt-1">
                    <input type="hidden" name="passkeyId" value={p.id} />
                    <button type="submit" className="text-red-600 hover:underline">
                      {a.confirmDelete}
                    </button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}

        <AddPasskey />
      </section>
    </div>
  )
}
