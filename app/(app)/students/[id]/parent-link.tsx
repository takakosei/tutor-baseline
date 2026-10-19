import Link from 'next/link'
import { headers } from 'next/headers'
import { CopyField } from '@/components/copy-field'
import { SubmitButton } from '@/components/submit-button'
import { disableParentLink, enableParentLink, rotateParentLink } from './actions'
import { getTeacherLocale } from '@/lib/i18n/server'
import { student } from '@/lib/i18n/messages/student'

// The Parent link section on the student page. Before and after enabling, it lays out what the parent will see,
// so the teacher can check before sending the link
export async function ParentLinkSection({
  studentId,
  enabled,
  token,
  visibleCheckpoints,
  lessonsWithSummary,
}: {
  studentId: string
  enabled: boolean
  token: string | null
  visibleCheckpoints: number
  lessonsWithSummary: number
}) {
  const h = await headers()
  const t = student[await getTeacherLocale()].parentLink
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
  const url = token ? `${origin}/p/${token}` : null

  const exposure = (
    <p className="text-xs text-foreground/50">
      {t.exposureBefore(visibleCheckpoints, lessonsWithSummary)}
      <Link href={`/students/${studentId}/edit`} className="mx-0.5 underline">{t.editPage}</Link>
      {t.exposureAfter}
    </p>
  )

  return (
    <section className="space-y-3 rounded-xl border border-foreground/10 px-4 py-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">{t.title}</h2>
        <span className={`text-xs ${enabled ? 'text-green-700 dark:text-green-500' : 'text-foreground/50'}`}>
          {enabled ? t.on : t.off}
        </span>
      </div>

      {enabled && url ? (
        <>
          <CopyField value={url} label={t.title} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <a href={url} target="_blank" rel="noreferrer" className="underline">
              {t.preview}
            </a>
            <details className="text-foreground/60">
              <summary className="cursor-pointer list-none hover:text-foreground">{t.rotate}</summary>
              <form action={rotateParentLink} className="mt-1 space-y-1">
                <input type="hidden" name="studentId" value={studentId} />
                <p className="text-xs">{t.rotateNote}</p>
                <button type="submit" className="text-red-600 hover:underline">{t.rotateConfirm}</button>
              </form>
            </details>
            <form action={disableParentLink} className="ml-auto">
              <input type="hidden" name="studentId" value={studentId} />
              <button type="submit" className="text-foreground/60 hover:text-foreground">
                {t.close}
              </button>
            </form>
          </div>
          {exposure}
        </>
      ) : (
        <>
          {exposure}
          <form action={enableParentLink}>
            <input type="hidden" name="studentId" value={studentId} />
            <SubmitButton small pendingText={t.enabling}>
              {token ? t.reopen : t.create}
            </SubmitButton>
          </form>
        </>
      )}
    </section>
  )
}
