import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { loadParentView } from '@/lib/parent-data'
import { toTokyoDate } from '@/lib/progress'
import { getVisitorLocale } from '@/lib/i18n/server'
import { parentLocale } from '@/lib/i18n/locale'
import { parent } from '@/lib/i18n/messages/parent'
import { ParentPageView, isRequestNotice } from './parent-page-view'
import { LocaleProvider } from '@/components/locale-provider'

// Parent page: no login, server-rendered. Data comes only from loadParentView (whitelisted); nothing here touches the database.
// Not found / disabled / wrong token → the same 404, revealing nothing about whether the link ever existed.

const load = cache(loadParentView) // generateMetadata and the page share a single read

type Params = Promise<{ token: string }>

// Page title in the parent page's language; when not found, in the visitor's language (it's a 404 anyway)
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token } = await params
  const data = await load(token, toTokyoDate(new Date()))
  return {
    title: parent[parentLocale(data?.locale, await getVisitorLocale())].title,
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  }
}

export default async function ParentPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: Promise<{ request?: string }>
}) {
  const { token } = await params
  const { request } = await searchParams
  const today = toTokyoDate(new Date())
  const data = await load(token, today)
  if (!data) notFound()

  const notice = isRequestNotice(request) ? request : undefined
  // The student's parent-page language; if not set, the viewer's browser language. It never follows the teacher's UI language
  const locale = parentLocale(data.locale, await getVisitorLocale())
  return (
    <LocaleProvider locale={locale}>
      <ParentPageView view={data.view} locale={locale} today={today} token={token} notice={notice} />
    </LocaleProvider>
  )
}
