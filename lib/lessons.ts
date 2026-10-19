// How many of the latest lessons in a row were missed (canceled, rescheduled, leave). lessons come newest first.
// Lessons that haven't happened (scheduled) don't count: they are neither held nor missed.
// Leave booked for a future date doesn't count either: it becomes a miss only once that day comes (otherwise it
// would look like a missed streak already). Two cancellations in a row with no new date signal a student drifting
// from regular lessons toward on-demand ones
export function missedStreak(lessons: { status: string; date: string }[], today: string): number {
  const past = lessons.filter((l) => l.status !== 'scheduled' && l.date <= today)
  const i = past.findIndex((l) => l.status === 'done')
  return i === -1 ? past.length : i
}

// Prep hint: the note from the latest held lesson before a given lesson. lessons come newest first (the same query
// as missedStreak). Only that latest lesson counts: if it has no note there's no hint, and older lessons aren't
// searched (an older "next time" may already be done)
export type PrepNote = { date: string; next: string | null; note: string }

export function prepNote(
  lessons: { date: string; status: string; note: string | null }[],
  before: string
): PrepNote | null {
  const last = lessons.find((l) => l.status === 'done' && l.date < before)
  const note = last?.note?.trim()
  if (!last || !note) return null
  return { date: last.date, next: nextStep(note), note }
}

// The part of a note after 【下次】 ("next time"), up to the next 【 or the end; null if absent.
// Notes in other languages work too: 【次回】 (Japanese), 【Next】 (English)
export function nextStep(note: string): string | null {
  const s = note.match(/【(?:下次|次回|Next)】([^【]*)/i)?.[1].trim()
  return s ? s : null
}
