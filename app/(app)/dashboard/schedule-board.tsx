'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CELL, blockedOn, cellStarts } from '@/lib/booking'
import { addMinutes, timesOverlap, weekdayOf, type Occurrence } from '@/lib/schedule'
import { WeekGrid } from '@/components/week-grid'
import { useLocale } from '@/components/locale-provider'
import { SubmitButton } from '@/components/submit-button'
import { dashboard } from '@/lib/i18n/messages/dashboard'
import { saveBlockedTimes, setBookingOpen } from '../booking-actions'

// The dashboard timetable, with unavailable times marked directly on it (for extra-lesson requests on the parent page).
// Normally: the timetable as usual, with unavailable times shown as a faint hatch (parents can't book them).
// "Set bookable times" enters edit mode: cells get taller, one cell = 1 hour, a click toggles bookable / unavailable,
// and clicking a weekday toggles the whole day. "Weekly" (e.g. weekday mornings) / "This day only" (e.g. a one-off
// appointment); changes are saved together with "Save" (no waiting on each click over a slow connection).
// Weekly changes take effect from today: past days keep showing how they were and can't be edited
// (validity periods: see planWeekly in lib/booking.ts).
// A cell is either a lesson or unavailable: cells with lessons can't be clicked, and in "Weekly" mode neither can the times
// of weekly lessons (even if this week's lesson is on leave: that time belongs to the student). Unavailable marks under
// lessons are cleared automatically on save / when a lesson is added (clearUnderLessons in lib/booking.ts).
// "Done" returns to the current week.
// Storage still uses 30-minute cells (blocked_times); one click changes both cells of the hour.
// What parents can book = 10:00–21:00 daily − unavailable times marked here − all students' lessons − other parents' pending requests

type Mode = 'weekly' | 'dated'
type State = 'weekly' | 'dated' | null
export type WeeklyRow = { weekday: number; start: string; from: string; to: string | null }

const CELLS = cellStarts()
const HOURS = CELLS.filter((t) => t.endsWith(':00'))
const EDIT_HOUR_PX = 52

// Cell styles: bookable = faint blue; weekly unavailable = grey hatch; this day only = amber hatch
const FREE = 'bg-[color-mix(in_oklab,var(--viz-bar)_15%,var(--background))]'
const LOOK: Record<'weekly' | 'dated', { soft: string; strong: string }> = {
  weekly: { soft: 'bg-hatch', strong: 'bg-foreground/[0.07] bg-hatch' },
  dated: { soft: 'bg-hatch-amber', strong: 'bg-amber-500/15 bg-hatch-amber' },
}

export function ScheduleBoard({
  weekStart,
  week,
  today,
  occurrences,
  labels,
  weeklyRows,
  dated: savedDated,
  bookingOpen,
  defaultEditing,
}: {
  weekStart: string
  week: string | null // ?week= in the URL (current week = null)
  today: string
  occurrences: Occurrence[] // this week's lessons (all students)
  labels: Record<string, string> // student id → name shown on the timetable
  weeklyRows: WeeklyRow[] // weekly unavailable cells (with validity; ended ones included, to draw past days)
  dated: string[] // one-day unavailable cells (this week): 'YYYY-MM-DD HH:MM'
  bookingOpen: boolean
  defaultEditing: boolean // after saving / changing week while editing (?edit=1): keep editing
}) {
  // weekly cells in effect now: these are what gets edited ('<weekday> HH:MM')
  const savedWeekly = weeklyRows.filter((r) => r.to === null).map((r) => `${r.weekday} ${r.start}`)
  const router = useRouter()
  const locale = useLocale()
  const t = dashboard[locale].board
  const [editing, setEditing] = useState(defaultEditing)
  const [mode, setMode] = useState<Mode>('weekly')
  const [weekly, setWeekly] = useState(() => new Set(savedWeekly))
  const [dated, setDated] = useState(() => new Set(savedDated))

  const dirty =
    weekly.size !== savedWeekly.length ||
    dated.size !== savedDated.length ||
    savedWeekly.some((k) => !weekly.has(k)) ||
    savedDated.some((k) => !dated.has(k))

  const weeklyKey = (d: string, t: string) => `${weekdayOf(d)} ${t}`
  const datedKey = (d: string, t: string) => `${d} ${t}`
  // whether a saved weekly cell applies on that day (its validity may exclude a stretch that has lessons)
  const savedOn = (d: string, t: string) =>
    weeklyRows.some((r) => r.start === t && blockedOn({ weekday: r.weekday, date: null, start: t, validFrom: r.from, validTo: r.to }, d))
  const savedKeys = new Set(savedWeekly)
  // Past days: drawn from the weekly cells in effect then (unaffected by current edits); today onward: drawn as being edited
  // (newly added cells count from today; untouched ones follow their saved validity; removed ones don't count)
  const stateOf = (d: string, t: string): State => {
    const key = weeklyKey(d, t)
    const w = d >= today ? weekly.has(key) && (!savedKeys.has(key) || savedOn(d, t)) : savedOn(d, t)
    return w ? 'weekly' : dated.has(datedKey(d, t)) ? 'dated' : null
  }
  // this week's lessons (leave excluded): half-hours with a lesson can't be clicked
  const lessons = occurrences.filter(
    (o): o is Occurrence & { start: string; end: string } => o.status !== 'leave' && o.start !== null && o.end !== null
  )
  const hasLesson = (d: string, t: string) =>
    lessons.some((o) => o.date === d && timesOverlap(o, { start: t, end: addMinutes(t, CELL) }))
  // weekly lesson times (even if on leave this week): not clickable in "Weekly" mode
  const ruleSlot = (d: string, t: string) =>
    occurrences.some(
      (o) => o.scheduleId !== null && o.date === d && o.start !== null && o.end !== null && timesOverlap({ start: o.start, end: o.end }, { start: t, end: addMinutes(t, CELL) })
    )
  // Past days can't be edited; lesson times needn't be marked; in "Weekly" mode weekly lesson times can't be marked;
  // in "This day only" mode cells already unavailable weekly needn't be marked again
  const editable = (d: string, t: string) =>
    d >= today && !hasLesson(d, t) && (mode === 'weekly' ? !ruleSlot(d, t) : stateOf(d, t) !== 'weekly')

  // An hour / a whole day: if any cell is still bookable, mark them all unavailable; if all are unavailable, make them all bookable
  function toggle(d: string, times: string[]) {
    const targets = times.filter((t) => editable(d, t))
    if (targets.length === 0) return
    const [set, keyOf, setter] = mode === 'weekly' ? [weekly, weeklyKey, setWeekly] : [dated, datedKey, setDated]
    const block = targets.some((t) => !set.has(keyOf(d, t)))
    const next = new Set(set)
    for (const t of targets) {
      if (block) next.add(keyOf(d, t))
      else next.delete(keyOf(d, t))
    }
    setter(next)
  }

  function reset() {
    setWeekly(new Set(savedWeekly))
    setDated(new Set(savedDated))
  }

  // changing week while editing stays in edit mode (?edit=1)
  function navHref(w: string): string {
    const q = new URLSearchParams()
    if (w) q.set('week', w)
    if (editing) q.set('edit', '1')
    const qs = q.toString()
    return `/dashboard${qs ? `?${qs}` : ''}${editing ? '#schedule' : ''}`
  }

  const topButton =
    editing && dirty ? (
      // unsaved changes: save from the top right (no scrolling to below the timetable)
      <button type="submit" form="blocked-save" className="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background">
        {t.save}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => {
          // Done: leave edit mode; if viewing another week (or the URL still has ?edit=1), go back to the current week
          if (editing && window.location.search) router.replace('/dashboard#schedule', { scroll: false })
          setEditing(!editing)
        }}
        className="shrink-0 rounded-md border border-foreground/20 bg-background px-3 py-1.5 text-xs font-medium hover:bg-foreground/[0.04]"
      >
        {editing ? t.done : t.edit}
      </button>
    )

  return (
    <div className="space-y-3">
      {editing ? (
        <div className="space-y-3 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{t.edit}</p>
              <p className="text-xs leading-relaxed text-foreground/60">{t.editHint}</p>
            </div>
            {topButton}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex rounded-lg bg-foreground/[0.06] p-0.5 text-xs" role="tablist" aria-label={t.modeLabel}>
              {(
                [
                  ['weekly', t.weekly],
                  ['dated', t.dated],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-md px-3 py-1 transition-colors ${mode === m ? 'bg-background font-medium shadow-sm' : 'text-foreground/60'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-foreground/60">
              <Swatch className={FREE} label={t.free} />
              <Swatch className={LOOK.weekly.strong} label={t.weeklyBlocked} />
              <Swatch className={LOOK.dated.strong} label={t.datedBlocked} />
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-xs text-foreground/60">
            <span aria-hidden className={`size-1.5 rounded-full ${bookingOpen ? 'bg-emerald-500' : 'bg-foreground/25'}`} />
            {t.bookingStatus(bookingOpen)}
          </span>
          {topButton}
        </div>
      )}

      <WeekGrid
        locale={locale}
        weekStart={weekStart}
        occurrences={occurrences}
        labelOf={(id) => labels[id] ?? '?'}
        today={today}
        navHref={navHref}
        onNavigate={(e) => {
          if (editing && dirty && !window.confirm(t.confirmSwitchWeek)) e.preventDefault()
        }}
        passive={editing}
        hourPx={editing ? EDIT_HOUR_PX : undefined}
        renderHeader={
          editing
            ? (d, label) =>
                d >= today ? (
                  <button
                    type="button"
                    onClick={() => toggle(d, CELLS)}
                    title={t.dayTitle}
                    className="block w-full px-1 py-1.5 transition-colors hover:bg-foreground/[0.06]"
                  >
                    {label}
                  </button>
                ) : (
                  <div className="px-1 py-1.5 opacity-50">{label}</div>
                )
            : undefined
        }
        underlay={(d, pos) =>
          editing
            ? HOURS.map((h) => {
                const halves = [h, addMinutes(h, CELL)]
                const states = halves.map((t) => stateOf(d, t))
                const can = halves.some((t) => editable(d, t))
                const past = d < today
                return (
                  <button
                    key={h}
                    type="button"
                    disabled={!can}
                    onClick={() => toggle(d, halves)}
                    aria-label={t.cell(d, h, states.every((x) => x))}
                    aria-pressed={states.every((x) => x)}
                    className={`group absolute inset-x-0 p-[2px] disabled:cursor-not-allowed ${past ? 'opacity-40' : ''}`}
                    style={pos(h, addMinutes(h, 60))}
                  >
                    <span className="flex h-full flex-col overflow-hidden rounded-[5px] ring-foreground/30 transition-shadow group-enabled:group-hover:ring-1">
                      {/* Draw both halves as one block when they match (so the hatch lines up); split them only when they differ (half an hour marked) */}
                      {(states[0] === states[1] && !halves.some((t) => hasLesson(d, t)) ? [states[0]] : states).map((st, i) => (
                        <span
                          key={i}
                          className={`w-full flex-1 ${
                            // lesson / past / weekly lesson time in "Weekly" mode (on leave this week): no bookable color (not clickable)
                            hasLesson(d, halves[i]) || (!st && (past || (mode === 'weekly' && ruleSlot(d, halves[i])))) ? '' : st ? LOOK[st].strong : FREE
                          }`}
                        />
                      ))}
                    </span>
                  </button>
                )
              })
            : CELLS.map((t) => {
                const st = stateOf(d, t)
                return st ? <span key={t} aria-hidden className={`absolute inset-x-0 ${LOOK[st].soft}`} style={pos(t, addMinutes(t, CELL))} /> : null
              })
        }
      />

      {editing && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <form id="blocked-save" action={saveBlockedTimes} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="weekStart" value={weekStart} />
            <input type="hidden" name="weekly" value={JSON.stringify([...weekly])} />
            <input type="hidden" name="dated" value={JSON.stringify([...dated])} />
            <SubmitButton small pendingText={t.saving}>
              {t.save}
            </SubmitButton>
            {dirty && (
              <>
                <button type="button" onClick={reset} className="text-xs text-foreground/60 underline hover:text-foreground">
                  {t.revert}
                </button>
                <span className="text-xs text-amber-700 dark:text-amber-300">{t.unsaved}</span>
              </>
            )}
          </form>
          <form action={setBookingOpen} className="flex items-center gap-2">
            <input type="hidden" name="weekStart" value={week ?? ''} />
            <input type="hidden" name="open" value={bookingOpen ? '0' : '1'} />
            <span className="text-xs text-foreground/70">{t.openToParents}</span>
            <button
              type="submit"
              role="switch"
              aria-checked={bookingOpen}
              aria-label={t.switchLabel}
              className={`relative h-6 w-10 rounded-full transition-colors ${bookingOpen ? 'bg-emerald-500' : 'bg-foreground/20'}`}
            >
              <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${bookingOpen ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block size-3 rounded-[3px] border border-foreground/10 ${className}`} />
      {label}
    </span>
  )
}
