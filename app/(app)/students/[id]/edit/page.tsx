import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { byBaselineOrder } from '@/lib/progress'
import { common } from '@/lib/i18n/messages/common'
import { getTeacherLocale } from '@/lib/i18n/server'
import { SubmitButton } from '@/components/submit-button'
import { addCheckpoint, deleteCheckpoint, deleteStudent, saveCheckpoint, setArchived, updateStudent } from './actions'
import { LOCALES, LOCALE_NAMES, isLocale, type Locale } from '@/lib/i18n/locale'
import { settings } from '@/lib/i18n/messages/settings'
import { student } from '@/lib/i18n/messages/student'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const input = 'w-full rounded-md border border-foreground/20 bg-transparent px-3 py-1.5 text-sm'

type CheckpointRow = {
  id: string
  seq: number
  due_date: string | null
  title: string
  criterion: string | null
  date_tbd: boolean
  parent_visible: boolean
}

export default async function EditStudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error: pageError } = await searchParams
  if (!UUID.test(id)) notFound()

  const supabase = await createClient()
  const locale = await getTeacherLocale()
  const t = student[locale]
  const e = t.editPage
  const f = t.fields
  const { data: s, error } = await supabase
    .from('students')
    .select(
      'id, name, display_name, grade, goal, status, start_date, end_date, end_label, hours_per_week, rate_per_hour, online_rate_per_hour, proctor_fee, place, risk_level, risk_note, assistant_notes, parent_locale, checkpoints(id, seq, due_date, title, criterion, date_tbd, parent_visible)'
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!s) notFound()

  // same order as the detail page: dated checkpoints in baseline order, ongoing items last
  const checkpoints = [
    ...s.checkpoints
      .filter((c): c is CheckpointRow & { due_date: string } => c.due_date !== null)
      .sort((a, b) => byBaselineOrder({ dueDate: a.due_date, seq: a.seq }, { dueDate: b.due_date, seq: b.seq })),
    ...s.checkpoints.filter((c) => c.due_date === null).sort((a, b) => a.seq - b.seq),
  ]

  return (
    <div className="space-y-8">
      <Link href={`/students/${s.id}`} className="text-sm text-foreground/60 hover:text-foreground">
        {e.back(s.name)}
      </Link>

      <section className="space-y-4">
        <h1 className="text-lg font-semibold">{e.title}</h1>
        <form action={updateStudent} className="space-y-4">
          <input type="hidden" name="id" value={s.id} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={f.name} required>
              <input name="name" defaultValue={s.name} required className={input} />
            </Field>
            <Field label={f.displayName} hint={f.displayNameHint}>
              <input name="display_name" defaultValue={s.display_name ?? ''} className={input} />
            </Field>
            <Field label={f.grade}>
              <input name="grade" defaultValue={s.grade ?? ''} placeholder={f.gradePlaceholder} className={input} />
            </Field>
            <Field label={e.status} hint={e.statusHint}>
              <select name="status" defaultValue={s.status} className={input}>
                {Object.entries(common[locale].studentStatus).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={f.goal}>
            <input name="goal" defaultValue={s.goal ?? ''} className={input} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={f.startDate}>
              <input type="date" name="start_date" defaultValue={s.start_date ?? ''} className={input} />
            </Field>
            <Field label={f.endDate} hint={e.endDateHint}>
              <input type="date" name="end_date" defaultValue={s.end_date ?? ''} className={input} />
            </Field>
            <Field label={f.endLabel}>
              <input name="end_label" defaultValue={s.end_label ?? ''} placeholder={f.endLabelPlaceholder} className={input} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={f.hoursPerWeek} hint={e.hoursPerWeekHint}>
              <input type="number" name="hours_per_week" defaultValue={s.hours_per_week ?? ''} min={0} step="any" className={input} />
            </Field>
            <Field label={f.rate} hint={e.rateHint}>
              <input type="number" name="rate_per_hour" defaultValue={s.rate_per_hour ?? ''} min={0} step={1} className={input} />
            </Field>
            <Field label={e.onlineRate} hint={e.onlineRateHint}>
              <input type="number" name="online_rate_per_hour" defaultValue={s.online_rate_per_hour ?? ''} min={1} step={1} className={input} />
            </Field>
            <Field label={e.proctorFee} hint={e.proctorFeeHint}>
              <input type="number" name="proctor_fee" defaultValue={s.proctor_fee ?? ''} min={1} step={1} className={input} />
            </Field>
            <Field label={f.place}>
              <input name="place" defaultValue={s.place ?? ''} className={input} />
            </Field>
            <Field label={settings[locale].parentLanguage} hint={settings[locale].parentLanguageHint}>
              <select name="parent_locale" defaultValue={isLocale(s.parent_locale) ? s.parent_locale : locale} className={input}>
                {LOCALES.map((l) => (
                  <option key={l} value={l} lang={l}>
                    {LOCALE_NAMES[l]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <Field label={e.risk}>
              <select name="risk_level" defaultValue={s.risk_level ?? ''} className={input}>
                <option value="">{e.riskNone}</option>
                <option value="warn">{e.riskWarn}</option>
                <option value="risk">{e.riskRisk}</option>
              </select>
            </Field>
            <Field label={e.riskNote} hint={e.riskNoteHint}>
              <textarea name="risk_note" defaultValue={s.risk_note ?? ''} rows={3} className={input} />
            </Field>
          </div>

          <Field label={f.assistantNotes} hint={f.assistantNotesHint}>
            <textarea
              name="assistant_notes"
              defaultValue={s.assistant_notes ?? ''}
              rows={3}
              placeholder={f.assistantNotesPlaceholder}
              className={input}
            />
          </Field>

          <SubmitButton pendingText={t.saving}>{e.saveStudent}</SubmitButton>
        </form>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{e.checkpoints}</h2>
          <p className="text-xs text-foreground/50">{e.checkpointsHint}</p>
        </div>

        <ul className="space-y-2">
          {checkpoints.map((c) => (
            // the key includes the content: changed data remounts it after saving, so the inputs always show the stored values
            <li key={`${c.id}:${c.due_date}:${c.title}:${c.criterion}:${c.date_tbd}:${c.parent_visible}`}>
              <CheckpointForm studentId={s.id} c={c} locale={locale} />
            </li>
          ))}
          <li>
            <CheckpointForm studentId={s.id} locale={locale} />
          </li>
        </ul>
      </section>

      <section className="space-y-3 border-t border-foreground/10 pt-6">
        <h2 className="text-lg font-semibold">{e.manage}</h2>
        <form action={setArchived} className="flex flex-wrap items-center gap-3 text-sm">
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="archived" value={s.status === 'archived' ? '0' : '1'} />
          <SubmitButton small secondary pendingText="…">
            {s.status === 'archived' ? e.restore : e.archive}
          </SubmitButton>
          <span className="text-xs text-foreground/50">{s.status === 'archived' ? e.archivedNote : e.archiveNote}</span>
        </form>

        <details open={pageError === 'confirm'} className="rounded-md border border-red-500/30 p-3 text-sm">
          <summary className="cursor-pointer text-red-600">{e.deleteStudent}</summary>
          <form action={deleteStudent} className="mt-3 space-y-2">
            <input type="hidden" name="id" value={s.id} />
            <p className="text-xs text-foreground/70">
              {e.deleteWarnBefore}
              <strong>{e.deleteWarnStrong}</strong>
              {e.deleteWarnAfter}
            </p>
            <label className="block space-y-1">
              <span className="text-xs">{e.confirmName(s.name)}</span>
              <input name="confirm_name" autoComplete="off" className={input} />
            </label>
            {pageError === 'confirm' && <p className="text-xs text-red-600">{e.nameMismatch}</p>}
            <button type="submit" className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white">
              {e.deleteForever}
            </button>
          </form>
        </details>
      </section>
    </div>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm">
        {label}
        {required && <span className="text-red-600"> *</span>}
        {hint && <span className="ml-2 text-xs text-foreground/50">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

// with c = edit an existing checkpoint; without = add one
function CheckpointForm({ studentId, c, locale }: { studentId: string; c?: CheckpointRow; locale: Locale }) {
  const t = student[locale]
  const e = t.editPage
  return (
    <div
      className={`space-y-2 rounded-md border p-3 ${
        c ? 'border-foreground/10' : 'border-dashed border-foreground/25'
      }`}
    >
      <form action={c ? saveCheckpoint : addCheckpoint} className="space-y-2">
        {c && <input type="hidden" name="id" value={c.id} />}
        <input type="hidden" name="studentId" value={studentId} />
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            name="due_date"
            defaultValue={c?.due_date ?? ''}
            aria-label={e.dueDate}
            className={`${input} w-auto`}
          />
          <input
            name="title"
            defaultValue={c?.title ?? ''}
            required
            placeholder={c ? '' : e.newCheckpoint}
            aria-label={e.checkpoint}
            className={`${input} min-w-0 flex-1`}
          />
        </div>
        <input
          name="criterion"
          defaultValue={c?.criterion ?? ''}
          placeholder={e.criterionPlaceholder}
          aria-label={e.criterion}
          className={input}
        />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="date_tbd" defaultChecked={c?.date_tbd ?? false} />
            {e.dateTbd}
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="parent_visible" defaultChecked={c?.parent_visible ?? false} />
            {t.parentVisible}
          </label>
          <SubmitButton small pendingText={t.saving} className="ml-auto">
            {c ? common[locale].save : t.add}
          </SubmitButton>
        </div>
      </form>

      {c && (
        <details className="text-xs text-foreground/40">
          <summary className="cursor-pointer list-none hover:text-foreground">{e.deleteCheckpoint}</summary>
          <form action={deleteCheckpoint} className="mt-1">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="studentId" value={studentId} />
            <button type="submit" className="text-red-600 hover:underline">
              {e.confirmDeleteCheckpoint(c.title)}
            </button>
          </form>
        </details>
      )}
    </div>
  )
}
