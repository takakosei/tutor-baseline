import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { loadParentStatement } from '@/lib/parent-data'
import { PrintButton } from '@/components/print-button'
import { StatementPaper } from '@/components/statement-paper'
import { LocaleProvider } from '@/components/locale-provider'
import { getVisitorLocale } from '@/lib/i18n/server'
import { parentLocale } from '@/lib/i18n/locale'
import { parent } from '@/lib/i18n/messages/parent'

// A month's tuition statement opened from the parent page: only months the teacher marked "Show to parent" exist;
// everything else is a 404 (with no reason given, as on the parent page).
// It is the same sheet the teacher prints; parents can print it or save it as PDF themselves

const load = cache(loadParentStatement) // generateMetadata and the page share a single read

type Params = Promise<{ token: string; month: string }>

// The page title is the default "Save as PDF" file name. When not found, in the visitor's language (it's a 404 anyway)
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token, month } = await params
  const data = await load(token, month)
  const [y, mm] = month.split('-').map(Number)
  return {
    title: data
      ? parent[parentLocale(data.locale, await getVisitorLocale())].statementTitle(y, mm, data.displayName)
      : parent[await getVisitorLocale()].statementFallback,
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  }
}

export default async function ParentStatementPage({ params }: { params: Params }) {
  const { token, month } = await params
  const data = await load(token, month)
  if (!data) notFound()
  const locale = parentLocale(data.locale, await getVisitorLocale())

  return (
    <LocaleProvider locale={locale}>
      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8 sm:py-12 print:max-w-none print:p-0">
        <div className="flex items-center justify-between gap-3 print:hidden">
          <Link href={`/p/${token}`} className="text-sm text-foreground/60 hover:text-foreground">
            {parent[locale].back}
          </Link>
          <PrintButton />
        </div>
        <StatementPaper
          locale={locale}
          studentLabel={data.displayName}
          month={data.statement.month}
          issuedOn={data.statement.issuedOn}
          st={data.statement}
        />
      </main>
    </LocaleProvider>
  )
}
