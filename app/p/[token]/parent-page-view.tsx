import { Fragment } from 'react'
import Link from 'next/link'
import { formatMonthDay } from '@/lib/format'
import { daysBetween } from '@/lib/progress'
import type { ParentGrade, ParentView } from '@/lib/parent-view'
import { cancelRequest } from './actions'
import { RequestGrid } from './request-grid'
import { BaselineTimeline } from '@/components/baseline-timeline'
import { Sparkline } from '@/components/sparkline'
import { MovedTag } from '@/components/trial-tag'
import { formatValue, partLabel } from '@/lib/metrics'
import type { Locale } from '@/lib/i18n/locale'
import { common } from '@/lib/i18n/messages/common'
import { parent } from '@/lib/i18n/messages/parent'
import { statement } from '@/lib/i18n/messages/statement'

// The parent page's view: only receives the whitelisted, mapped ParentView and never touches the database.
// Used by the real parent page (page.tsx) and by the local demo.
// The tone stays neutral (the students are minors): it only says how many items are done and on schedule / slightly ahead /
// slightly behind, never how many days behind, and makes no judgements (text in lib/i18n/messages/parent.ts)

const card = 'rounded-xl border border-foreground/10 bg-background p-4'

// The result shown when returning to this page after a request (?request=…)
export type RequestNotice = keyof (typeof parent)['zh']['notice']
export function isRequestNotice(value: string | undefined): value is RequestNotice {
  return value !== undefined && Object.hasOwn(parent.zh.notice, value)
}

// Request status as a small tag (waiting = amber, confirmed = green ✓, couldn't be scheduled = red ✕; color and icon only
// support the text, which says it on its own)
const REQUEST_STATUS = {
  pending: { icon: null, className: 'bg-amber-500/15 text-amber-800 dark:text-amber-200' },
  accepted: { icon: 'check', className: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' },
  declined: { icon: 'cross', className: 'bg-red-500/12 text-red-700 dark:text-red-300' },
} as const
const accent = 'var(--viz-bar)' // the same blue as the analytics page (checked in both light and dark themes)

export function ParentPageView({
  view,
  today,
  token,
  notice,
  locale,
}: {
  view: ParentView
  today: string
  token: string // for the tuition statement link and the request forms
  notice?: RequestNotice
  locale: Locale
}) {
  const base = `/p/${token}`
  const dated = view.checkpoints.filter((c): c is typeof c & { dueDate: string } => c.dueDate !== null)
  const ongoing = view.checkpoints.filter((c) => c.dueDate === null)
  const current = dated.findIndex((c) => !c.done) // in progress: the first one not yet done, in order
  const todayAt = dated.filter((c) => c.dueDate <= today).length // how many items come before the "today" divider
  const daysLeft = view.endDate ? daysBetween(today, view.endDate) : null
  const [next, ...later] = view.upcoming
  const showRequests = view.booking !== null || view.upcoming.length > 0 || view.requests.length > 0
  const pendingCount = view.requests.filter((r) => r.status === 'pending').length
  // Lesson log: the most recent entry goes above "Extra lesson · Leave", earlier ones are folded below it
  const [latest, ...older] = view.lessons
  const t = parent[locale]
  const c = common[locale]

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-8 sm:py-12">
      <header className="space-y-2">
        <p className="text-xs text-foreground/50">{t.title}</p>
        <h1 className="text-2xl font-semibold">{view.displayName ?? t.title}</h1>
        {view.goal && <p className="text-sm text-foreground/80">{view.goal}</p>}
        {(view.endLabel || (daysLeft !== null && daysLeft >= 0)) && (
          <p className="inline-flex items-center gap-2 rounded-full bg-foreground/[0.05] px-3 py-1 text-sm">
            <span className="size-1.5 rounded-full" style={{ background: accent }} />
            {view.endLabel ?? (view.endDate && formatMonthDay(view.endDate, locale))}
            {daysLeft !== null && daysLeft > 0 && <span className="text-foreground/60">{t.daysLeft(daysLeft)}</span>}
            {daysLeft === 0 && <span className="text-foreground/60">{t.endsToday}</span>}
          </p>
        )}
      </header>

      {view.summary && (
        <section className={`${card} space-y-4`}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium text-foreground/60">{t.progress}</h2>
            <span className="rounded-full bg-foreground/[0.06] px-2.5 py-0.5 text-xs">{t.state[view.summary.state]}</span>
          </div>
          <p>
            <span className="text-3xl font-semibold tabular-nums">{view.summary.done}</span>
            <span className="ml-1 text-sm text-foreground/60">{t.doneOf(view.summary.total)}</span>
          </p>
          <BaselineTimeline locale={locale} checkpoints={dated} startDate={view.startDate} endDate={view.endDate} endLabel={view.endLabel} today={today} />
        </section>
      )}

      {next && (
        <section className={card}>
          <h2 className="text-sm font-medium text-foreground/60">{t.nextLesson}</h2>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {next.date === today ? `${c.today} ` : ''}
            {formatMonthDay(next.date, locale)}
            {next.start && next.end && <span className="ml-2">{next.start}–{next.end}</span>}
            {next.proctor && <span className="ml-2 align-middle text-sm font-normal text-foreground/70">{c.proctorParent}</span>}
            {next.moved && <MovedTag locale={locale} className="ml-2 align-middle text-sm" />}
          </p>
          {later.length > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-foreground/60 tabular-nums">
              {t.later}
              {later.map((u, i) => (
                <Fragment key={i}>
                  {/* The separator sits outside the no-wrap part: on a phone the line breaks here when it doesn't fit */}
                  {i > 0 && ' · '}
                  <span className="whitespace-nowrap">
                    {formatMonthDay(u.date, locale)} {u.start && u.end ? `${u.start}–${u.end}` : ''}
                    {u.proctor && t.paren(c.proctorParent)}
                    {u.moved && <MovedTag locale={locale} className="ml-1" />}
                  </span>
                </Fragment>
              ))}
            </p>
          )}
        </section>
      )}

      {latest && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground/60">{t.latestLesson}</h2>
          <LessonCards lessons={[latest]} locale={locale} />
          {older.length > 0 && (
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-foreground/60 [&::-webkit-details-marker]:hidden">
                {t.olderLessons(older.length)}
                <span aria-hidden className="text-foreground/40 transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <div className="pt-3">
                <LessonCards lessons={older} locale={locale} />
              </div>
            </details>
          )}
        </section>
      )}

      {showRequests && (
        // Collapsed by default (the timetable is tall); open when returning right after a request / withdrawal, so the result is visible
        <details id="requests" open={notice !== undefined} className={`${card} group scroll-mt-4`}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="text-sm font-medium text-foreground/60">{t.requests}</span>
              <span className="mt-0.5 block text-xs text-foreground/50">
                {pendingCount > 0 ? t.pendingCount(pendingCount) : ''}
                {t.requestsHint}
              </span>
            </span>
            <span aria-hidden className="text-foreground/40 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="mt-4 space-y-4">
            {notice && (
              <p className="rounded-lg border-l-2 border-[var(--viz-bar)] bg-[color-mix(in_oklab,var(--viz-bar)_8%,var(--background))] px-3 py-2 text-sm">
                {t.notice[notice]}
              </p>
            )}
            <RequestGrid token={token} today={today} upcoming={view.upcoming} booking={view.booking} requests={view.requests} />

            {view.requests.length > 0 && (
              <ul className="space-y-1.5 text-sm">
                <li className="text-xs text-foreground/50">{t.myRequests}</li>
                {view.requests.map((r) => (
                  <li
                    key={`${r.kind} ${r.date} ${r.start}`}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-lg border border-foreground/10 px-3 py-2"
                  >
                    <span className="tabular-nums">
                      <span className="mr-2 text-xs font-medium text-foreground/60">{t.kind[r.kind]}</span>
                      {formatMonthDay(r.date, locale)} {r.start}–{r.end}
                    </span>
                    <span className="flex items-center gap-3 text-xs text-foreground/60">
                      <span className={`inline-flex items-center gap-1 rounded-full py-0.5 pr-2 pl-1.5 ${REQUEST_STATUS[r.status].className}`}>
                        {REQUEST_STATUS[r.status].icon && <StatusIcon kind={REQUEST_STATUS[r.status].icon!} />}
                        {r.kind === 'leave' && r.status === 'accepted' ? t.leaveTaken : t.requestStatus[r.status]}
                      </span>
                      {r.status === 'pending' && (
                        <form action={cancelRequest}>
                          <input type="hidden" name="token" value={token} />
                          <input type="hidden" name="kind" value={r.kind} />
                          <input type="hidden" name="date" value={r.date} />
                          <input type="hidden" name="start" value={r.start} />
                          <button type="submit" className="underline hover:text-foreground">
                            {t.withdraw}
                          </button>
                        </form>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-xs text-foreground/50">{t.requestsFootnote}</p>
          </div>
        </details>
      )}

      {view.checkpoints.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground/60">{t.plan}</h2>
          {dated.length > 0 && (
            <ol>
              {dated.map((cp, i) => (
                <Fragment key={i}>
                  {i === todayAt && <TodayDivider today={today} locale={locale} />}
                  <li className="relative flex gap-3 pb-5 last:pb-0">
                    {i < dated.length - 1 && (
                      <span aria-hidden className="absolute top-6 bottom-0 left-[9px] w-px bg-foreground/15" />
                    )}
                    <Step state={cp.done ? 'done' : i === current ? 'current' : 'todo'} locale={locale} />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="flex flex-wrap items-center gap-2 text-xs text-foreground/50 tabular-nums">
                        {formatMonthDay(cp.dueDate, locale)}
                        {i === current && (
                          <span className="rounded-full px-2 py-px text-[11px] text-background" style={{ background: accent }}>
                            {t.step.current}
                          </span>
                        )}
                      </p>
                      <p className={`text-sm ${cp.done ? 'text-foreground/55' : i === current ? 'font-medium' : ''}`}>{cp.title}</p>
                      {cp.criterion && <p className="text-xs leading-relaxed text-foreground/50">{cp.criterion}</p>}
                    </div>
                  </li>
                </Fragment>
              ))}
              {todayAt === dated.length && <TodayDivider today={today} last locale={locale} />}
            </ol>
          )}
          {ongoing.length > 0 && (
            <div className={`${card} space-y-1.5`}>
              <p className="text-xs text-foreground/50">{t.ongoing}</p>
              <ul className="space-y-1 text-sm">
                {ongoing.map((cp, i) => (
                  <li key={i}>{cp.title}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {view.grades.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground/60">{t.grades}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {view.grades.map((g, i) => (
              <GradeCard key={i} g={g} locale={locale} />
            ))}
          </div>
        </section>
      )}

      {view.statements.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground/60">{t.tuition}</h2>
          <ul className="divide-y divide-foreground/10 rounded-xl border border-foreground/10 bg-background">
            {view.statements.map((st) => {
              const [y, m] = st.month.split('-').map(Number)
              return (
                <li key={st.month}>
                  <Link
                    href={`${base}/statement/${st.month}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.03]"
                  >
                    <span>
                      {statement[locale].month(y, m)}
                      <span className="ml-2 text-xs text-foreground/50">{statement[locale].title}</span>
                    </span>
                    <span className="tabular-nums">
                      ¥{st.fee.toLocaleString('ja-JP')}
                      <span aria-hidden className="ml-2 text-foreground/40">→</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <footer className="space-y-1 border-t border-foreground/10 pt-4 text-xs text-foreground/50">
        <p>{t.updated(formatMonthDay(today, locale))}</p>
        <p>{t.privacy}</p>
      </footer>
    </main>
  )
}

function Step({ state, locale }: { state: 'done' | 'current' | 'todo'; locale: Locale }) {
  const label = parent[locale].step[state]
  if (state === 'done') {
    return (
      <span
        aria-label={label}
        className="relative flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] text-background"
        style={{ background: 'var(--viz-bar)' }}
      >
        ✓
      </span>
    )
  }
  if (state === 'current') {
    return (
      <span
        aria-label={label}
        className="relative flex size-5 shrink-0 items-center justify-center rounded-full border-2 bg-background"
        style={{ borderColor: 'var(--viz-bar)' }}
      >
        <span className="size-2 rounded-full" style={{ background: 'var(--viz-bar)' }} />
      </span>
    )
  }
  return <span aria-label={label} className="relative size-5 shrink-0 rounded-full border-2 border-foreground/20 bg-background" />
}

function TodayDivider({ today, last = false, locale }: { today: string; last?: boolean; locale: Locale }) {
  return (
    <li aria-label={`${common[locale].today} ${formatMonthDay(today)}`} className={`flex items-center gap-2 text-xs text-foreground/60 ${last ? 'pt-5' : 'pb-5'}`}>
      <span className="h-px flex-1 bg-foreground/20" />
      {common[locale].today} {formatMonthDay(today, locale)}
      <span className="h-px flex-1 bg-foreground/20" />
    </li>
  )
}

function LessonCards({ lessons, locale }: { lessons: ParentView['lessons']; locale: Locale }) {
  return (
    <ul className="space-y-2">
      {lessons.map((l, i) => (
        <li key={i} className={card}>
          <p className="flex items-center gap-2 text-xs text-foreground/50 tabular-nums">
            {formatMonthDay(l.date, locale)}
            {l.trial && <span className="rounded bg-foreground/[0.06] px-1.5 py-px text-[11px] text-foreground/70">{parent[locale].trialLesson}</span>}
            {l.proctor && <span className="rounded bg-foreground/[0.06] px-1.5 py-px text-[11px] text-foreground/70">{common[locale].proctorParent}</span>}
          </p>
          <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">{l.summary}</p>
        </li>
      ))}
    </ul>
  )
}

// One metric: latest value, change since last time (numbers only: no better/worse wording or red/green, since judgements
// are left to the teacher's own words), trend line, all records
function GradeCard({ g, locale }: { g: ParentView['grades'][number]; locale: Locale }) {
  const t = parent[locale]
  return (
    <div className={`${card} min-w-0 space-y-2`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 text-sm font-medium wrap-anywhere">{g.name}</span>
        <span className="shrink-0 text-xs text-foreground/50">{g.lowerIsBetter ? t.lowerIsBetter : t.higherIsBetter}</span>
      </div>
      {g.records.length > 0 ? <GradeBody g={g} locale={locale} /> : <p className="text-xs text-foreground/50">{t.partsBelow}</p>}
      {g.parts.length > 0 && (
        // expand to see the parts (I, II, III). Like the total: numbers and "vs last time" only, no judgement
        <details className="group/parts rounded-lg bg-foreground/[0.03]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium [&::-webkit-details-marker]:hidden">
            <span>{t.parts(g.parts.map((p) => partLabel(p, g)).join('・'))}</span>
            <span aria-hidden className="text-foreground/40 transition-transform group-open/parts:rotate-90">
              ›
            </span>
          </summary>
          <div className="divide-y divide-foreground/10 px-3 pb-2">
            {g.parts.map((p) => (
              <div key={p.name} className="space-y-1.5 py-2.5">
                <p className="text-xs font-medium text-foreground/70">{partLabel(p, g)}</p>
                <GradeBody g={p} compact locale={locale} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// One grade's numbers and trend: latest value (/ maximum), change since last time, trend line, all records.
// compact = a part inside the total's card
function GradeBody({ g, compact = false, locale }: { g: ParentGrade; compact?: boolean; locale: Locale }) {
  const latest = g.records.at(-1)!
  const prev = g.records.at(-2)
  const change = prev ? Math.round((latest.value - prev.value) * 10) / 10 : null
  const t = parent[locale]
  return (
    <>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className={`${compact ? 'text-lg' : 'text-2xl'} font-semibold tabular-nums`}>{formatValue(latest.value, g.unit)}</span>
        {g.maxValue !== null && g.unit !== '%' && <span className="text-sm text-foreground/50">/ {g.maxValue}</span>}
        {change !== null && (
          <span className="text-sm text-foreground/60 tabular-nums">
            {change === 0 ? t.sameAsLast : t.changeFromLast(`${change > 0 ? '+' : '−'}${formatValue(Math.abs(change), g.unit)}`)}
          </span>
        )}
      </p>
      <Sparkline locale={locale} points={g.records} unit={g.unit} />
      <details className="text-xs">
        <summary className="cursor-pointer text-foreground/50">{t.allRecords(g.records.length)}</summary>
        <ul className="mt-1 space-y-0.5 tabular-nums">
          {[...g.records].reverse().map((r, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-20 text-foreground/60">{formatMonthDay(r.date, locale)}</span>
              <span>{formatValue(r.value, g.unit)}</span>
            </li>
          ))}
        </ul>
      </details>
    </>
  )
}


// Small icon before a status tag: ✓ (confirmed / on leave), ✕ (couldn't be scheduled). Follows the text color
function StatusIcon({ kind }: { kind: 'check' | 'cross' }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      {kind === 'check' ? <path d="M3.5 8.5l3 3 6-7" /> : <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />}
    </svg>
  )
}
