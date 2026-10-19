'use client'

import { useEffect, useRef, useState } from 'react'
import { addDays } from '@/lib/analytics'
import { formatMonthDay } from '@/lib/format'
import { addMinutes, mondayOf, timelineRange } from '@/lib/schedule'
import { DAYS_AHEAD, freeBlocks } from '@/lib/booking'
import type { ParentView } from '@/lib/parent-view'
import { GridFrame } from '@/components/grid-frame'
import { SubmitButton } from '@/components/submit-button'
import { MovedTag } from '@/components/trial-tag'
import { useLocale } from '@/components/locale-provider'
import { common } from '@/lib/i18n/messages/common'
import { parent } from '@/lib/i18n/messages/parent'
import { cancelRequest, sendRequest } from './actions'

// The parent page's timetable (for extra-lesson and leave requests). Same look as the teacher's dashboard timetable
// (components/grid-frame.tsx), one week at a time, up to two weeks ahead.
//   Bookable (light blue, one cell per hour) = click: a lesson starting there is highlighted; pick the start time below,
//                                              write a message, send
//   Own child's lesson (blue)                = click to request leave (takes effect at once: the lesson leaves the
//                                              timetable and the teacher is notified); a lesson the teacher moved has
//                                              an orange dot in the corner that opens a "time changed" note
//   Requested (dashed)                       = an extra lesson this parent requested, not yet confirmed by the teacher
//   Cross-hatch                              = not bookable. It never says whether the teacher is unavailable or another
//                                              student has a lesson (parents never see other students)
// Only receives whitelisted, mapped data (ParentView) and never touches the database; writes go through actions.ts
// (checked again on the server)

const FREE = 'bg-[color-mix(in_oklab,var(--viz-bar)_15%,var(--background))]'
const field = 'w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm'
const MOVED_DOT = 'bg-orange-400'

type Slot = { date: string; start: string; end: string }
type Picked =
  | ({ kind: 'free'; starts: string[] } & Slot)
  | ({ kind: 'lesson'; leavePending: boolean; proctor: boolean; moved: boolean } & Slot) // proctor = past-paper practice; moved = time changed
  | ({ kind: 'pending-add' } & Slot)

// Split a free stretch into one-hour cells (17:30–21:00 → 17:30–18:00, 18–19, 19–20, 20–21) for drawing
function hourPieces(b: { start: string; end: string }): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = []
  for (let s = b.start; s < b.end; ) {
    const nextHour = addMinutes(`${s.slice(0, 2)}:00`, 60)
    const e = nextHour < b.end ? nextHour : b.end
    out.push({ start: s, end: e })
    s = e
  }
  return out
}

export function RequestGrid({
  token,
  today,
  upcoming,
  booking,
  requests,
}: {
  token: string
  today: string
  upcoming: ParentView['upcoming']
  booking: ParentView['booking']
  requests: ParentView['requests']
}) {
  const [week, setWeek] = useState(0)
  const locale = useLocale()
  const t = parent[locale].grid
  const proctorParent = common[locale].proctorParent
  const [picked, setPicked] = useState<Picked | null>(null)
  const [chosen, setChosen] = useState<string | null>(null) // extra-lesson request: the chosen start time (highlighted on the timetable)
  const panel = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (picked) panel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [picked])
  // When the outer "Extra lesson · Leave" section collapses, go back to this week and clear the selection (it reopens on this week)
  useEffect(() => {
    const details = root.current?.closest('details')
    if (!details) return
    const onToggle = () => {
      if (details.open) return
      setWeek(0)
      setPicked(null)
      setChosen(null)
    }
    details.addEventListener('toggle', onToggle)
    return () => details.removeEventListener('toggle', onToggle)
  }, [])

  const last = addDays(today, DAYS_AHEAD)
  const minutes = booking?.minutes ?? 120
  const pending = requests.filter((r) => r.status === 'pending')
  const pendingLeave = new Set(pending.filter((r) => r.kind === 'leave').map((r) => `${r.date} ${r.start}`))
  const lessons = upcoming.filter((u): u is (typeof upcoming)[number] & Slot => u.start !== null && u.end !== null)
  // Keep only the date and time: the request carries its own kind ('add'), and spreading it into Picked would overwrite Picked's kind
  const pendingAdds: Slot[] = pending.filter((r) => r.kind === 'add').map((r) => ({ date: r.date, start: r.start, end: r.end }))
  const free = new Map((booking?.days ?? []).map((d) => [d.date, freeBlocks(d.starts, minutes)]))

  // all three weeks share one time range, so cells don't jump when switching
  const { from, to } = timelineRange([...lessons, ...pendingAdds, ...[...free.values()].flat()])

  const monday = addDays(mondayOf(today), week * 7)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const isPicked = (kind: Picked['kind'], s: { date: string; start: string }) =>
    picked?.kind === kind && picked.date === s.date && picked.start === s.start

  // Clicked a bookable cell: start there; if a full lesson doesn't fit from that cell, use the latest possible start in that stretch
  function pickFree(date: string, block: { start: string; end: string; starts: string[] }, at: string) {
    setPicked({ date, ...block, kind: 'free' })
    setChosen(block.starts.find((s) => s >= at) ?? block.starts[block.starts.length - 1])
  }
  function pick(p: Picked) {
    setPicked((cur) => (cur && cur.kind === p.kind && cur.date === p.date && cur.start === p.start ? null : p))
    setChosen(null)
  }

  return (
    <div ref={root} className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground/60 tabular-nums">
          {formatMonthDay(days[0])} – {formatMonthDay(days[6])}
        </span>
        <nav className="flex gap-3 text-foreground/60">
          {(
            [
              ['prev', t.prevWeek, week - 1],
              ['this', t.thisWeek, 0],
              ['next', t.nextWeek, week + 1],
            ] as const
          ).map(([key, label, w]) => (
            <button
              key={key}
              type="button"
              disabled={w < 0 || w > 2 || (key === 'this' && week === 0)}
              onClick={() => {
                setWeek(w)
                setPicked(null)
              }}
              className="hover:text-foreground disabled:opacity-30 disabled:hover:text-foreground/60"
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <GridFrame
        locale={locale}
        days={days}
        today={today}
        from={from}
        to={to}
        hourPx={44}
        dayClassName={(d) => (d < today || d > last ? 'bg-foreground/[0.04]' : undefined)}
        renderDay={(d, pos) =>
          d < today || d > last ? null : (
            <>
              {/* Draw the whole day as not bookable first; bookable cells and lessons go on top (when a 9:00 past-paper practice
                  extends the timetable earlier, the time before 10:00 is not bookable either) */}
              <span aria-hidden className="absolute inset-x-0 bg-crosshatch" style={pos(addMinutes('00:00', from), addMinutes('00:00', to))} />

              {(free.get(d) ?? []).flatMap((b) =>
                hourPieces(b).map((piece, i) => (
                  <div key={piece.start} className="absolute inset-x-0 p-[2px]" style={pos(piece.start, piece.end)}>
                    <button
                      type="button"
                      onClick={() => pickFree(d, b, piece.start)}
                      aria-label={t.freeAria(formatMonthDay(d, locale), piece.start)}
                      className={`flex h-full w-full items-start justify-center rounded-[5px] pt-0.5 text-[10px] font-medium text-[var(--viz-bar)] transition-shadow hover:ring-1 hover:ring-[var(--viz-bar)]/50 ${FREE} ${
                        isPicked('free', { date: d, ...b }) ? 'ring-1 ring-[var(--viz-bar)]/50' : ''
                      }`}
                    >
                      {i === 0 ? t.free : ''}
                    </button>
                  </div>
                ))
              )}

              {/* The selected lesson: follows the start time picked below */}
              {picked?.kind === 'free' && picked.date === d && chosen && (
                <div className="pointer-events-none absolute inset-x-0 p-[2px]" style={pos(chosen, addMinutes(chosen, minutes))}>
                  <span className="flex h-full flex-col items-center justify-center rounded-[5px] bg-[var(--viz-bar)] text-[10px] leading-tight text-white shadow-md">
                    <span>{t.picked}</span>
                    <span className="tabular-nums opacity-90">{chosen}</span>
                  </span>
                </div>
              )}

              {pendingAdds
                .filter((r) => r.date === d)
                .map((r) => (
                  <div key={r.start} className="absolute inset-x-0 p-[2px]" style={pos(r.start, r.end)}>
                    <button
                      type="button"
                      onClick={() => pick({ ...r, kind: 'pending-add' })}
                      aria-label={t.pendingAddAria(`${formatMonthDay(d, locale)} ${r.start}–${r.end}`)}
                      className={`flex h-full w-full flex-col items-center justify-center rounded-[5px] border border-dashed border-[var(--viz-bar)] bg-background text-[10px] leading-tight text-[var(--viz-bar)] ${
                        isPicked('pending-add', r) ? 'ring-2 ring-[var(--viz-bar)]/40' : ''
                      }`}
                    >
                      <span>{t.pendingAdd}</span>
                      <span className="tabular-nums opacity-80">{r.start}</span>
                    </button>
                  </div>
                ))}

              {lessons
                .filter((l) => l.date === d)
                .map((l) => {
                  const leavePending = pendingLeave.has(`${l.date} ${l.start}`)
                  return (
                    <div key={l.start} className="absolute inset-x-0 p-[2px]" style={pos(l.start, l.end)}>
                      <button
                        type="button"
                        onClick={() => pick({ ...l, leavePending, kind: 'lesson' })}
                        aria-label={t.lessonAria(`${formatMonthDay(d, locale)} ${l.start}–${l.end}`, l.proctor ? proctorParent : null, l.moved, leavePending)}
                        className={`relative flex h-full w-full flex-col items-center justify-center rounded-[5px] text-[10px] leading-tight shadow-sm ${
                          leavePending
                            ? 'border border-dashed border-[var(--viz-bar)] bg-background text-[var(--viz-bar)]'
                            : 'bg-[var(--viz-bar)] text-white'
                        } ${isPicked('lesson', l) ? 'ring-2 ring-[var(--viz-bar)]/40 ring-offset-1 ring-offset-background' : ''}`}
                      >
                        <span className="wrap-anywhere">{leavePending ? t.cell.leavePending : l.proctor ? t.cell.proctor : t.cell.lesson}</span>
                        <span className="tabular-nums opacity-90">{l.start}</span>
                        {l.moved && <span aria-hidden className={`absolute right-[3px] top-[3px] size-1.5 rounded-full ${MOVED_DOT}`} />}
                      </button>
                    </div>
                  )
                })}
            </>
          )
        }
      />

      <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-foreground/60">
        <Swatch className={FREE} label={t.legendFree} />
        <Swatch className="bg-[var(--viz-bar)]" label={t.legendLesson} />
        <Swatch className="bg-crosshatch" label={t.legendBlocked} />
        {lessons.some((l) => l.moved) && (
          <span className="flex items-center gap-1">
            <span className={`inline-block size-1.5 rounded-full ${MOVED_DOT}`} />
            {common[locale].movedTag}
          </span>
        )}
      </p>
      {!booking && <p className="text-xs text-foreground/50">{t.noBooking}</p>}

      {picked && (
        <div ref={panel} className="scroll-mt-4 space-y-3 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium tabular-nums">
              {formatMonthDay(picked.date, locale)}{' '}
              {picked.kind === 'free'
                ? t.requestAdd
                : picked.kind === 'pending-add'
                  ? t.pendingAddTitle(`${picked.start}–${picked.end}`)
                  : t.lessonTitle(`${picked.start}–${picked.end}`, picked.proctor ? proctorParent : null)}
              {picked.kind === 'lesson' && picked.moved && <MovedTag locale={locale} className="ml-1.5" />}
            </p>
            <button type="button" onClick={() => setPicked(null)} aria-label={t.close} className="-mt-0.5 px-1 text-foreground/50 hover:text-foreground">
              ✕
            </button>
          </div>

          {picked.kind === 'free' && (
            <form action={sendRequest} className="space-y-3">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="kind" value="add" />
              <fieldset>
                <legend className="mb-1.5 text-xs text-foreground/60">{t.startAt(minutes / 60)}</legend>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {picked.starts.map((s) => (
                    <label
                      key={s}
                      className="flex cursor-pointer items-center justify-center rounded-lg border border-foreground/15 bg-background py-2 text-sm tabular-nums transition-colors has-[:checked]:border-[var(--viz-bar)] has-[:checked]:bg-[var(--viz-bar)] has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--viz-bar)]/40"
                    >
                      <input
                        type="radio"
                        name="slot"
                        value={`${picked.date} ${s}`}
                        checked={chosen === s}
                        onChange={() => setChosen(s)}
                        required
                        className="sr-only"
                      />
                      {s}
                    </label>
                  ))}
                </div>
                {chosen && (
                  <p className="mt-2 text-xs text-foreground/60 tabular-nums">
                    {formatMonthDay(picked.date, locale)} {chosen}–{addMinutes(chosen, minutes)}
                  </p>
                )}
              </fieldset>
              <textarea name="message" rows={2} maxLength={200} placeholder={t.messagePlaceholder} aria-label={t.message} className={field} />
              <SubmitButton pendingText={t.sending} className="w-full">
                {t.send}
              </SubmitButton>
            </form>
          )}

          {picked.kind === 'lesson' &&
            (picked.leavePending ? (
              <Withdraw token={token} kind="leave" slot={picked} text={t.leaveSent} />
            ) : (
              <form action={sendRequest} className="space-y-3">
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="kind" value="leave" />
                <input type="hidden" name="slot" value={`${picked.date} ${picked.start}`} />
                <p className="text-xs leading-relaxed text-foreground/60">{t.leaveHint}</p>
                <textarea name="message" rows={2} maxLength={200} placeholder={t.leavePlaceholder} aria-label={t.message} className={field} />
                <SubmitButton pendingText={t.processing} className="w-full">
                  {t.leave}
                </SubmitButton>
              </form>
            ))}

          {picked.kind === 'pending-add' && <Withdraw token={token} kind="add" slot={picked} text={t.addSent} />}
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

function Withdraw({ token, kind, slot, text }: { token: string; kind: 'add' | 'leave'; slot: Slot; text: string }) {
  const locale = useLocale()
  return (
    <form action={cancelRequest} className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-foreground/70">{text}</p>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="date" value={slot.date} />
      <input type="hidden" name="start" value={slot.start} />
      <SubmitButton secondary small pendingText="…">
        {parent[locale].withdraw}
      </SubmitButton>
    </form>
  )
}
