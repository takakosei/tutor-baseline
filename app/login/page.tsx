import Link from 'next/link'
import { SubmitButton } from '@/components/submit-button'
import { PasskeyLogin } from '@/components/passkey-login'
import { sendMagicLink } from './actions'
import { LocaleProvider } from '@/components/locale-provider'
import { getVisitorLocale } from '@/lib/i18n/server'
import { common } from '@/lib/i18n/messages/common'
import { app } from '@/lib/i18n/messages/app'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>
}) {
  const { sent, error } = await searchParams
  const locale = await getVisitorLocale()
  const t = app[locale].login

  return (
    <LocaleProvider locale={locale} className="flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
        <h1 className="text-xl font-semibold">{t.title(common[locale].appName)}</h1>

        {sent ? (
          <div className="space-y-3 text-sm">
            <p>{t.sent}</p>
            <p className="text-foreground/60">{t.sentHint}</p>
            <Link href="/login" className="inline-block text-foreground/60 underline">
              {t.resend}
            </Link>
          </div>
        ) : (
          <>
          <PasskeyLogin />

          {/* Email sign-in stays available for new devices, a lost passkey and local development (passkeys are bound to the production domain) */}
          <form action={sendMagicLink} className="space-y-3 border-t border-foreground/10 pt-6">
            <p className="text-xs text-foreground/50">{t.orEmail}</p>
            <label className="block space-y-1 text-sm">
              <span>{t.email}</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-md border border-foreground/20 bg-transparent px-3 py-2"
              />
            </label>
            <SubmitButton pendingText={t.sending} secondary className="w-full">
              {t.send}
            </SubmitButton>
            {error && (
              <p className="text-sm text-red-600">
                {Object.hasOwn(t.errors, error) ? t.errors[error] : t.otherError(error)}
              </p>
            )}
          </form>
          </>
        )}
      </main>
    </LocaleProvider>
  )
}
