import { BANDS } from '@/lib/schedule'
import type { Locale } from '@/lib/i18n/locale'
import { schedule } from '@/lib/i18n/messages/schedule'

const input = 'rounded-md border border-foreground/20 bg-transparent px-2 py-1 text-sm'

// Time: pick one of the four standard slots, or enter a start and end (e.g. 12:20–14:20, any minute). An entered start/end wins
export function TimeFields({ locale }: { locale: Locale }) {
  const t = schedule[locale].fields
  return (
    <>
      <select name="band" defaultValue="3" aria-label={t.band} className={input}>
        {BANDS.map((b, i) => (
          <option key={b.start} value={i}>
            {b.start}–{b.end}
          </option>
        ))}
        <option value="custom">{t.custom}</option>
      </select>
      <span className="flex items-center gap-1 text-xs text-foreground/60">
        <input type="time" name="start" aria-label={t.customStart} className={input} />–
        <input type="time" name="end" aria-label={t.customEnd} className={input} />
      </span>
    </>
  )
}

// Lesson kind: teaching / proctored (proctored sessions are billed per session: the student needs a proctor fee set first, otherwise they cannot be added)
export function KindField({ locale }: { locale: Locale }) {
  const t = schedule[locale].fields
  return (
    <select name="proctor" defaultValue="" aria-label={t.kind} className={input}>
      <option value="">{t.lesson}</option>
      <option value="1">{t.proctor}</option>
    </select>
  )
}
