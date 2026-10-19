// Baseline calculation: given a student's checkpoints and today, how many should be done vs. how many are done.
// Pure functions, no IO. progress.test.ts pins the rules, so change both together.

export type Checkpoint = {
  id: string
  seq: number
  dueDate: string | null // 'YYYY-MM-DD'; null = an ongoing item, left out of the calculation
  title: string
  doneAt: string | null
}

export type Progress = {
  total: number // number of checkpoints with a date
  should: number // how many should be done by today
  done: number // how many are done: the run of completed checkpoints from the start, up to the first one not done
  state: 'ahead' | 'ontrack' | 'behind' | 'none'
  offsetDays: number // behind: days behind; ahead: days ahead; otherwise 0
  catchUpHours?: number // when behind and weekly hours are known: offsetDays / 7 * hoursPerWeek
  nextId: string | null // the next checkpoint to complete
}

const DAY_MS = 86_400_000

function toUtcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

// Days from `from` to `to` ('YYYY-MM-DD'); negative when `to` is earlier
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS)
}

// Baseline order: by date, then by seq on the same date. should counts checkpoints that are due, so it can only be
// compared with done (the run completed from the start) when they are in date order. Sorting by seq would give a
// negative number of days behind whenever seq and date order disagree (e.g. after a placeholder Eiken date is
// replaced with the real one). Exported because the page draws its "you should be here today" divider in the same order.
export function byBaselineOrder(
  a: { dueDate: string; seq: number },
  b: { dueDate: string; seq: number }
): number {
  return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.seq - b.seq
}

export function computeProgress(
  checkpoints: Checkpoint[],
  today: string,
  hoursPerWeek?: number | null
): Progress {
  const dated = checkpoints
    .filter((c): c is Checkpoint & { dueDate: string } => c.dueDate !== null)
    .sort(byBaselineOrder)

  const total = dated.length
  if (total === 0) {
    return { total: 0, should: 0, done: 0, state: 'none', offsetDays: 0, nextId: null }
  }

  const should = dated.filter((c) => c.dueDate <= today).length
  // Count the run completed from the start, stopping at the first one not done.
  // Taking the position of the last completed checkpoint instead would skip every unfinished one before it when a
  // later checkpoint is ticked early, and report the student as far ahead
  let done = 0
  while (done < total && dated[done].doneAt !== null) done++
  const nextId = done < total ? dated[done].id : null
  const base = { total, should, done, nextId }

  if (done < should) {
    // the first checkpoint that is due and not done = dated[done]
    const offsetDays = daysBetween(dated[done].dueDate, today)
    // 0 days behind = the missing checkpoints are all due today, which isn't late yet
    if (offsetDays === 0) return { ...base, state: 'ontrack', offsetDays: 0 }
    return {
      ...base,
      state: 'behind',
      offsetDays,
      ...(hoursPerWeek != null && { catchUpHours: (offsetDays / 7) * hoursPerWeek }),
    }
  }

  if (done > should) {
    return { ...base, state: 'ahead', offsetDays: daysBetween(today, dated[done - 1].dueDate) }
  }

  return { ...base, state: 'ontrack', offsetDays: 0 }
}

// The business time zone is always Asia/Tokyo. The server runs in UTC, where toISOString().slice(0, 10) returns
// yesterday between 0:00 and 9:00 Japan time. Callers: computeProgress(cps, toTokyoDate(new Date()), ...)
export function toTokyoDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
