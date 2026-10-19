import Link from 'next/link'
import { toTokyoDate } from '@/lib/progress'
import { TEMPLATE_OPTIONS } from '@/lib/templates'
import { SubmitButton } from '@/components/submit-button'
import { createStudent } from './actions'
import { getTeacherLocale } from '@/lib/i18n/server'
import { schedule } from '@/lib/i18n/messages/schedule'
import { student } from '@/lib/i18n/messages/student'

const input = 'w-full rounded-md border border-foreground/20 bg-transparent px-3 py-1.5 text-sm'

export default async function NewStudentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const today = toTokyoDate(new Date())
  const locale = await getTeacherLocale()
  const t = student[locale]
  const f = t.fields
  const n = t.newStudent

  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-sm text-foreground/60 hover:text-foreground">
        {t.allStudents}
      </Link>
      <h1 className="text-lg font-semibold">{n.title}</h1>

      <form action={createStudent} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={f.name} required hint={t.onlyYou}>
            <input name="name" required placeholder={n.namePlaceholder} className={input} />
          </Field>
          <Field label={f.displayName} hint={f.displayNameHint}>
            <input name="display_name" className={input} />
          </Field>
          <Field label={f.grade}>
            <input name="grade" placeholder={f.gradePlaceholder} className={input} />
          </Field>
          <Field label={f.place}>
            <input name="place" className={input} />
          </Field>
        </div>

        <Field label={f.goal}>
          <input name="goal" className={input} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={f.startDate}>
            <input type="date" name="start_date" defaultValue={today} className={input} />
          </Field>
          <Field label={f.endDate} hint={n.endDateHint}>
            <input type="date" name="end_date" className={input} />
          </Field>
          <Field label={f.endLabel}>
            <input name="end_label" placeholder={f.endLabelPlaceholder} className={input} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={f.hoursPerWeek}>
            <input type="number" name="hours_per_week" min={0} step="any" className={input} />
          </Field>
          <Field label={f.rate} hint={n.rateHint}>
            <input type="number" name="rate_per_hour" min={0} step={1} defaultValue={2000} className={input} />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm">
            {t.trial.lesson}
            <span className="ml-2 text-xs text-foreground/50">{n.trialNote}</span>
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={schedule[locale].move.date}>
              <input type="date" name="trial_date" className={input} />
            </Field>
            <Field label={t.trial.start} hint={n.trialStartHint}>
              <input type="time" name="trial_start" className={input} />
            </Field>
          </div>
          {error === 'trial' && <p className="text-sm text-red-600">{n.trialError}</p>}
        </fieldset>

        <Field label={f.assistantNotes} hint={f.assistantNotesHint}>
            <textarea
              name="assistant_notes"
              defaultValue={''}
              rows={3}
              placeholder={f.assistantNotesPlaceholder}
              className={input}
            />
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm">{n.templates}</legend>
          <p className="text-xs text-foreground/50">{n.templatesHint}</p>
          {TEMPLATE_OPTIONS.map((o, i) => (
            <label key={o.id} className="flex items-center gap-2 text-sm">
              <input type="radio" name="template" value={o.id} defaultChecked={i === 0} />
              {t.templates[o.id]}
              {o.needsEnd && <span className="text-xs text-foreground/50">{n.needsEnd}</span>}
            </label>
          ))}
          {error === 'need_end' && (
            <p className="text-sm text-red-600">{n.needEndError}</p>
          )}
        </fieldset>

        <SubmitButton pendingText={t.saving}>{t.add}</SubmitButton>
      </form>
    </div>
  )
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
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
