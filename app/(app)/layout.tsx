import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from './actions'
import { LocaleProvider } from '@/components/locale-provider'
import { getTeacherLocale } from '@/lib/i18n/server'
import { common } from '@/lib/i18n/messages/common'
import { app } from '@/lib/i18n/messages/app'

// Shared by all signed-in pages. proxy.ts has already checked once; check again here, because sign-in checks
// shouldn't rely on the proxy alone (as the Next docs advise). The data itself is protected by RLS.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect('/login')
  const locale = await getTeacherLocale()
  const t = app[locale].nav

  return (
    <LocaleProvider locale={locale} className="flex flex-1 flex-col">
      <header className="border-b border-foreground/10 print:hidden">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="font-semibold">
            {common[locale].appName}
          </Link>
          <nav className="flex items-center gap-4 text-sm text-foreground/60">
            <Link href="/analytics" className="hover:text-foreground">
              {t.analytics}
            </Link>
            <Link href="/account" className="hover:text-foreground">
              {t.account}
            </Link>
            {/* Two-step sign-out: the first click only reveals the confirm button, to prevent accidental taps */}
            <details className="relative">
              <summary className="cursor-pointer list-none hover:text-foreground">{t.signOut}</summary>
              <form
                action={signOut}
                className="absolute right-0 top-full z-10 mt-2 rounded-md border border-foreground/10 bg-background p-2 shadow-sm"
              >
                <button
                  type="submit"
                  className="whitespace-nowrap rounded px-3 py-1 text-red-600 hover:bg-red-500/10"
                >
                  {t.confirmSignOut}
                </button>
              </form>
            </details>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </LocaleProvider>
  )
}
