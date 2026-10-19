// Assistant tools for Claude Desktop (MCP over stdio). Each student gets an assistant prompt in Claude Desktop;
// in that chat, Claude reads and writes the student's data through these tools. Setup: docs/assistant.md.
//
// Safety boundaries:
// - Signs in with the tutor's own account (password in the macOS Keychain), so every read and write goes through RLS
//   and only reaches the tutor's own students
// - No service_role: it bypasses RLS, and it is only granted read access for the parent pages
// - A fixed set of tools: no deletes and no arbitrary queries
// - Every write names a student and checks that the checkpoint / lesson being changed belongs to that student
// - Lessons are logged through logLesson in lib/lesson-write.ts, the same rules as logging a lesson in the web app

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer, type RegisteredPrompt } from '@modelcontextprotocol/sdk/server/mcp.js'
import { completable } from '@modelcontextprotocol/sdk/server/completable.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '../lib/supabase/database.types'
import { addDays } from '../lib/analytics'
import { formatMonthDay } from '../lib/format'
import { missedStreak } from '../lib/lessons'
import {
  NO_PROCTOR_FEE,
  clearBlockedUnderLessons,
  logLesson,
  scheduleExtraLesson,
  setTrialLesson,
  studentRates,
  type Supabase,
} from '../lib/lesson-write'
import { byDate, formatValue, parseValue, reportScore, stageRows, SUBJECT_LABELS, SUBJECTS, subjectKanten, summarize, TEKISEI_MAX, tekiseiPct, toritsuMaxPct, toritsuStages, yearGrades } from '../lib/metrics'
import { byBaselineOrder, computeProgress, toTokyoDate } from '../lib/progress'
import { expandOccurrences, hhmm, lessonsWindow, type ScheduleRule, type StoredLesson } from '../lib/schedule'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
for (const f of [path.join(ROOT, '.env.local'), path.join(ROOT, 'mcp', '.env')]) {
  if (existsSync(f)) process.loadEnvFile(f)
}
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY // a public key; access is decided by RLS after sign-in
const EMAIL = process.env.TUTOR_EMAIL
const KEYCHAIN_SERVICE = 'tutor-baseline-mcp'

// ── Sign-in (on first database use) ────────────────────────

let client: Supabase | null = null
let loggingIn: Promise<Supabase> | null = null

// Concurrent callers share one sign-in; a failed sign-in is cleared so the next call retries
function db(): Promise<Supabase> {
  if (client) return Promise.resolve(client)
  loggingIn ??= login().finally(() => {
    loggingIn = null
  })
  return loggingIn
}

// On a slow network a request can hang: wait at most 20 seconds per request
const TIMEOUT_MS = 20_000
const fetchWithTimeout: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
  })

async function login(): Promise<Supabase> {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase settings not found in .env.local')
  if (!EMAIL) throw new Error('No sign-in email set: run mcp/setup-password.sh <email> in the repository folder')
  let password: string
  try {
    password = execFileSync('/usr/bin/security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', EMAIL, '-w'], {
      encoding: 'utf8',
    }).trim()
  } catch {
    throw new Error('The assistant password is not in the Keychain: run mcp/setup-password.sh <email> in the repository folder')
  }
  const c = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: true },
    global: { fetch: fetchWithTimeout },
  })
  const { error } = await c.auth.signInWithPassword({ email: EMAIL, password })
  if (error) throw new Error(`Sign-in failed (${error.code ?? error.message}). The password may have changed: run mcp/setup-password.sh again`)
  client = c
  return c
}

// ── Helpers ────────────────────────────────────────────

const MOOD = { 1: 'smooth', 2: 'stuck', 3: 'revisit' } as const
const MOOD_OF: Record<string, number> = { smooth: 1, stuck: 2, revisit: 3 }
const STATUS: Record<string, string> = { done: 'done', leave: 'leave', canceled: 'canceled', rescheduled: 'rescheduled', scheduled: 'scheduled' }

function today() {
  return toTokyoDate(new Date())
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

// A student can be named by display name, internal name or id; it must match exactly one
async function findStudent(supabase: Supabase, who: string) {
  const { data, error } = await supabase.from('students').select('id, name, display_name, status, rate_per_hour')
  if (error) throw error
  const w = who.trim()
  const exact = data.filter((s) => s.id === w || s.display_name === w || s.name === w)
  const hits = exact.length > 0 ? exact : data.filter((s) => s.name.includes(w) || (s.display_name ?? '').includes(w))
  if (hits.length === 1) return hits[0]
  const all = data.map((s) => `${s.name} (${s.display_name ?? 'no display name'})`).join(', ')
  throw new Error(hits.length === 0 ? `No student matches "${who}". Students: ${all}` : `"${who}" matches several students; be more specific. Students: ${all}`)
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date format YYYY-MM-DD')
const time = z.string().regex(/^\d{2}:\d{2}$/, 'time format HH:MM')
const student = z.string().describe('Student: display name, internal name or id (the student this chat is about)')

// ── Tools ────────────────────────────────────────────

const server = new McpServer({ name: 'tutor-baseline', version: '1.0.0' })

server.registerTool(
  'list_students',
  {
    title: 'Student list',
    description: "Lists all students (internal name, display name, status). Use it to confirm a student's name.",
    annotations: { readOnlyHint: true },
  },
  async () => {
    const { data, error } = await (await db()).from('students').select('name, display_name, status').order('name')
    if (error) throw error
    return ok(data.map((s) => `- ${s.name} | display name: ${s.display_name ?? 'none'} | ${s.status}`).join('\n'))
  }
)

type StudentRow = { id: string; name: string; display_name: string | null; status: string }

// Everything about one student (shared by the student_overview tool and the per-student assistants)
async function overviewText(supabase: Supabase, s: StudentRow): Promise<string> {
    const t = today()
    const [full, cps, lessons, rules, planned, metrics, records, stages, reports] = await Promise.all([
      supabase.from('students').select('grade, goal, end_date, end_label, hours_per_week, place, risk_level, risk_note, assistant_notes, target_metric_id, toritsu_conversion, report5, report6').eq('id', s.id).single(),
      supabase.from('checkpoints').select('id, seq, due_date, title, criterion, date_tbd, done_at, parent_visible').eq('student_id', s.id),
      supabase.from('lessons').select('date, status, duration_min, online, mood, note, parent_summary, cancel_reason, trial, proctor').eq('student_id', s.id).neq('status', 'scheduled').order('date', { ascending: false }).limit(10),
      supabase.from('schedules').select('id, weekday, start_time, end_time, starts_on, ends_on, proctor').eq('student_id', s.id),
      supabase.from('lessons').select('id, date, status, start_time, end_time, schedule_id, trial, proctor, moved_from, moved_from_start, moved_from_end').eq('student_id', s.id).or(lessonsWindow(t, addDays(t, 14))),
      supabase.from('metrics').select('id, name, unit, direction, max_value, parent_visible').eq('student_id', s.id),
      supabase.from('metric_records').select('id, metric_id, date, value, created_at').eq('student_id', s.id),
      supabase.from('target_stages').select('date, label, target_pass, target_best, pass_pct, best_pct').eq('student_id', s.id).order('date'),
      supabase.from('report_items').select('label, value, max_value').eq('student_id', s.id).order('created_at'),
    ])
    for (const r of [full, cps, lessons, rules, planned, metrics, records, stages, reports]) if (r.error) throw r.error

    const progress = computeProgress(
      cps.data!.map((c) => ({ id: c.id, seq: c.seq, dueDate: c.due_date, title: c.title, doneAt: c.done_at })),
      t,
      full.data!.hours_per_week
    )
    const dated = cps.data!
      .filter((c): c is typeof c & { due_date: string } => c.due_date !== null)
      .sort((a, b) => byBaselineOrder({ dueDate: a.due_date, seq: a.seq }, { dueDate: b.due_date, seq: b.seq }))
    const ongoing = cps.data!.filter((c) => c.due_date === null)
    const upcoming = expandOccurrences(
      rules.data!.map((r): ScheduleRule => ({ id: r.id, studentId: s.id, weekday: r.weekday, start: hhmm(r.start_time)!, end: hhmm(r.end_time)!, startsOn: r.starts_on, endsOn: r.ends_on, proctor: r.proctor })),
      planned.data!.map((l): StoredLesson => ({ id: l.id, studentId: s.id, date: l.date, status: l.status, start: hhmm(l.start_time), end: hhmm(l.end_time), scheduleId: l.schedule_id, trial: l.trial, proctor: l.proctor, movedFrom: l.moved_from, movedFromStart: hhmm(l.moved_from_start), movedFromEnd: hhmm(l.moved_from_end) })),
      t,
      addDays(t, 14)
    ).filter((o) => o.status === 'scheduled')

    const f = full.data!
    const lines: string[] = [
      `# ${s.name} (display name: ${s.display_name ?? 'none'})`,
      `Today: ${t} | Status: ${s.status} | Grade: ${f.grade ?? '—'} | Goal: ${f.goal ?? '—'} | End: ${f.end_label ?? '—'}${f.end_date ? ` (${f.end_date})` : ''}`,
      f.risk_note ? `Risk (internal): ${f.risk_level ?? '—'} | ${f.risk_note}` : 'Risk: none',
      `Notes for the assistant: ${f.assistant_notes ?? '(none)'}`,
      '',
      `## Progress`,
      progress.state === 'none'
        ? 'No dated checkpoints'
        : `Expected ${progress.should} / done ${progress.done} / total ${progress.total} | ${progress.state}${progress.state === 'behind' || progress.state === 'ahead' ? ` ${progress.offsetDays} days` : ''}`,
      `Missed in a row: ${missedStreak(lessons.data!, t)}`,
      '',
      `## Checkpoints (baseline order)`,
      ...dated.map(
        (c) =>
          `- [${c.done_at ? 'x' : ' '}] ${c.due_date}${c.date_tbd ? ' (date TBD)' : ''} | ${c.title}${c.criterion ? ` | criterion: ${c.criterion}` : ''}${c.parent_visible ? ' | visible to parents' : ''} | id=${c.id}`
      ),
      ...ongoing.map((c) => `- Ongoing | ${c.title} | id=${c.id}`),
      '',
      `## Lessons in the next two weeks`,
      ...(upcoming.length ? upcoming.map((o) => `- ${o.date} (${formatMonthDay(o.date, 'en')}) ${o.start ?? ''}–${o.end ?? ''}${o.trial ? ' (trial)' : ''}${o.proctor ? ' (proctored)' : ''}${o.movedFrom ? ` (moved for this week; originally ${formatMonthDay(o.movedFrom, 'en')} ${o.movedFromStart ?? ''})` : ''}`) : ['(none)']),
      '',
      `## Recent lesson logs (newest first)`,
      ...(lessons.data!.length
        ? lessons.data!.map(
            (l) =>
              `- ${l.date}${l.trial ? ' (trial)' : ''}${l.proctor ? ' (proctored)' : ''} ${STATUS[l.status] ?? l.status}${l.online ? ' (online)' : ''}${l.duration_min ? ` ${l.duration_min} min` : ''}${l.mood ? ` mood: ${MOOD[l.mood as 1 | 2 | 3]}` : ''}${l.cancel_reason ? ` | reason: ${l.cancel_reason}` : ''}${l.note ? ` | internal note: ${l.note}` : ''}${l.parent_summary ? ` | for parents: ${l.parent_summary}` : ''}`
          )
        : ['(none)']),
      '',
      `## Grades`,
    ]
    const used = metrics.data!.filter((m) => records.data!.some((r) => r.metric_id === m.id))
    lines.push(
      ...(used.length
        ? used.map((m) => {
            const rs = byDate(records.data!.filter((r) => r.metric_id === m.id).map((r) => ({ id: r.id, metricId: r.metric_id, date: r.date, value: r.value, createdAt: r.created_at })))
            const sm = summarize(rs, m.direction === -1 ? -1 : 1)
            return `- ${m.name}: ${rs.map((r) => `${r.date} ${formatValue(r.value, m.unit)}`).join(', ')} | ${sm.improved === true ? 'improving recently' : sm.improved === false ? 'worse recently' : '—'}`
          })
        : ['(no records)']),
      '',
      `Available metrics: ${metrics.data!.map((m) => `${m.name} (${m.unit || 'no unit'}, ${m.direction === -1 ? 'lower is better' : 'higher is better'}${m.max_value !== null ? `, max ${m.max_value}` : ''}${m.parent_visible ? ', visible to parents' : ''})`).join('; ') || '(none yet; add them on the student page in the web app)'}`
    )
    // Goal card (tutor only, edited on the student page in the web app): the score it compares against,
    // stage targets and gaps, school records (調査書 / 内申)
    const tm = metrics.data!.find((m) => m.id === full.data!.target_metric_id)
    if (tm || stages.data!.length > 0 || reports.data!.length > 0) {
      const dir = tm?.direction === -1 ? -1 : 1
      // Tokyo public combined school conversion: stage targets are a % of the total, and the grades (評定)
      // combined from the viewpoint marks (観点) turn them into an aptitude-test (適性) raw score
      const y5 = yearGrades(f.report5)
      const y6 = yearGrades(f.report6)
      const report = f.toritsu_conversion ? reportScore(y5, y6) : null
      const rows = stageRows(
        toritsuStages(
          stages.data!.map((x) => ({ date: x.date, label: x.label, pass: x.target_pass, best: x.target_best, passPct: x.pass_pct, bestPct: x.best_pct })),
          f.toritsu_conversion ? { report: report?.score ?? null } : null
        ),
        tm ? records.data!.filter((r) => r.metric_id === tm.id).map((r) => ({ date: r.date, value: r.value })) : [],
        dir
      )
      const n = (v: number | null) => (v === null ? 'not set' : `${v}${f.toritsu_conversion && v > TEKISEI_MAX ? ' (over max, out of reach)' : ''}`)
      const g = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}`)
      const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 10) / 10}%`)
      const tpct = (v: number | null) => (v === null || !report ? null : tekiseiPct(v, report.score))
      const year = (k: string | null) => {
        const y = yearGrades(k)
        return y ? `grades 3×${y.g3} 2×${y.g2} 1×${y.g1} (viewpoint marks: ${subjectKanten(k)!.map((v, i) => `${SUBJECT_LABELS.en[SUBJECTS[i]]} ${v}`).join(', ')})` : 'not yet'
      }
      lines.push(
        '',
        `## Goal (tutor only; compared with: ${tm?.name ?? 'none chosen'})`,
        ...(f.toritsu_conversion
          ? [
              `Tokyo public combined school conversion (都立中換算): total 1000 = school report (報告書) 250 (scaled from the 調査書 360) + aptitude test (適性検査) 750 (Ⅰ・Ⅱ・Ⅲ, 100 each → 250). School report: each subject's grade (評定) is the middle of its 3 viewpoint marks (観点); 18 grades at 3=20 2=10 1=5, ×250/360. Stage targets are a % of the total; the lines below are the aptitude raw scores they translate to`,
              `Year 5 ${year(f.report5)} | Year 6 ${year(f.report6)} | School report ${report ? `${Math.round(report.score * 10) / 10} / 250${report.estimated ? ' (missing year estimated from the other)' : ''}` : 'cannot be calculated (no grades entered, so the lines are "not set")'}${report ? ` | full marks on the aptitude test reach at most ${Math.floor(toritsuMaxPct(report.score) * 10) / 10}% of the total` : ''}`,
            ]
          : []),
        ...rows.map(
          (r) =>
            `- ${r.date}${r.label ? ` ${r.label}` : ''} | pass ${n(r.pass)} / best case ${n(r.best)}${f.toritsu_conversion ? ` (total ${pct(r.passPct)} / ${pct(r.bestPct)}, aptitude ${pct(tpct(r.passPct))} / ${pct(tpct(r.bestPct))})` : ''}${
              r.actual ? ` | ${r.near ? 'actual' : 'now'} ${r.actual.value} (${r.actual.date}) gap ${g(r.gapPass)} / ${g(r.gapBest)}` : ''
            }`
        ),
        ...reports.data!.map((r) => `- School record (調査書 · 内申) | ${r.label}: ${r.value ?? 'not yet'}${r.max_value !== null ? ` / ${r.max_value}` : ''}`)
      )
    }
  return lines.join('\n')
}

server.registerTool(
  'student_overview',
  {
    title: 'Student overview',
    description:
      'Reads everything about one student: goal, progress (expected vs done), all checkpoints (with ids), lessons in the next two weeks, recent lesson logs (internal notes and the line for parents), grade trends, and how many lessons were missed in a row. Read this before making any change.',
    inputSchema: { student },
    annotations: { readOnlyHint: true },
  },
  async ({ student: who }) => {
    const supabase = await db()
    return ok(await overviewText(supabase, await findStudent(supabase, who)))
  }
)

server.registerTool(
  'log_lesson',
  {
    title: 'Log a lesson',
    description: [
      'Logs a lesson as done or leave. If that date has a scheduled lesson that is not logged yet, it is logged on that lesson;',
      'if it is already logged (e.g. the tutor marked it done in the web app), the existing record is completed instead of creating a duplicate. When there are several lessons that day, pick one with start_time.',
      'If nothing was scheduled that day (a new record is created), passing start_time (and end_time or duration_min) records the time; an existing record without a time also gets it filled in.',
      'Without a duration: the scheduled time if there is one, otherwise 120 minutes.',
      "Online lessons (online=true) are billed at this student's online rate; pass true when the tutor says the lesson was online. If omitted, an existing record keeps its value and a new one counts as in-person.",
      "kind is the lesson kind: proctor (the tutor supervises a past-paper practice session, billed per session at this student's proctor fee) / lesson. When a day has both (e.g. proctoring on Sunday morning and a review in the afternoon),",
      'pass proctor when the tutor talks about proctoring or past papers and lesson when they talk about teaching or a review; it selects that lesson, and if the day has none of that kind a new one of that kind is created. Omit it when unsure.',
      'When completing an existing record, omitted fields keep their values and passed ones overwrite them; if note already has content, read it with student_overview first and pass the merged text.',
      'note is an internal note only the tutor sees; it can name specific difficulties and judgements.',
      'parent_summary appears directly on the parent page: only what was done and what comes next, in one or two sentences;',
      'no personality or emotions, no comparisons with other children, no internal judgements (e.g. "math is fine but English is weak"). When unsure, leave it empty for the tutor to write.',
    ].join(' '),
    inputSchema: {
      student,
      date,
      status: z.enum(['done', 'leave']),
      duration_min: z.number().int().positive().optional().describe('Actual length in minutes; defaults to the scheduled time, or 120 if nothing was scheduled'),
      mood: z.enum(['smooth', 'stuck', 'revisit']).optional(),
      note: z.string().optional(),
      parent_summary: z.string().optional(),
      reason: z.string().optional().describe('Reason for the leave'),
      start_time: time.optional().describe('Start time: picks the lesson when there are several that day; recorded on a new record or one without a time'),
      end_time: time.optional().describe('End time; defaults to start time + duration'),
      online: z.boolean().optional().describe('Online lesson (billed at the online rate); if omitted, an existing record keeps its value and a new one counts as in-person'),
      kind: z.enum(['lesson', 'proctor']).optional().describe('Lesson kind: picks the proctored or the teaching lesson when there are several that day; omitted = any'),
    },
    annotations: { destructiveHint: false },
  },
  async (a) => {
    if (a.end_time && a.start_time && a.end_time <= a.start_time) throw new Error('The end time must be after the start time')
    const supabase = await db()
    const s = await findStudent(supabase, a.student)
    const done = await logLesson(supabase, {
      studentId: s.id,
      date: a.date,
      status: a.status,
      durationMin: a.duration_min ?? null,
      mood: a.mood ? MOOD_OF[a.mood] : null,
      note: a.note ?? null,
      parentSummary: a.parent_summary ?? null,
      reason: a.reason ?? null,
      start: a.start_time ?? null,
      end: a.end_time ?? null,
      online: a.status === 'done' ? a.online : undefined,
      proctor: a.kind === undefined ? undefined : a.kind === 'proctor',
      defaultMinutes: 120,
    })
    if (done.mode === 'ambiguous') throw new Error(`There are several lessons on ${a.date} (${done.times.join(', ')}): pick one with start_time or kind`)
    const time = done.start ? ` ${done.start}–${done.end ?? ''}` : ''
    const where = {
      planned: `logged on the scheduled lesson${time}`,
      recorded: `added to the existing record${time} (omitted fields kept as they were)`,
      new: `nothing was scheduled that day, so a new record was created${time || ' (no time recorded: pass start_time to record one)'}`,
    }[done.mode]
    return ok(`Logged: ${s.name} ${a.date}${a.kind === 'proctor' ? ' proctored session' : ''} ${STATUS[a.status]}${a.status === 'done' && a.online && a.kind !== 'proctor' ? ' (online)' : ''}, ${where}${a.parent_summary ? '. The line for parents was saved and will show on the parent page' : ''}`)
  }
)

server.registerTool(
  'add_lesson',
  {
    title: 'Add a lesson',
    description: [
      'Adds a one-off lesson for a student (not a weekly slot), e.g. a make-up lesson after a leave. Only for future lessons: log a lesson that already happened with log_lesson instead of adding and then logging it. Nothing is added if a lesson already exists at that time.',
      'trial=true is a trial lesson: one per student, a fixed 1 hour at ¥1,000, no end_time needed; if one is already scheduled (or on leave) it is moved to this date and time.',
      "kind=proctor is a proctored past-paper session: billed per session at this student's proctor fee (it cannot be added if the student has no proctor fee set); omitted = lesson.",
    ].join(' '),
    inputSchema: {
      student,
      date,
      start_time: time,
      end_time: time.optional().describe('Not needed for trial lessons'),
      trial: z.boolean().optional().describe('Trial lesson'),
      kind: z.enum(['lesson', 'proctor']).optional().describe('Lesson kind; omitted = lesson'),
    },
    annotations: { destructiveHint: false },
  },
  async (a) => {
    const supabase = await db()
    const s = await findStudent(supabase, a.student)
    if (a.trial && a.kind === 'proctor') throw new Error('A trial lesson cannot be a proctored session')
    if (a.trial) {
      const r = await setTrialLesson(supabase, { studentId: s.id, date: a.date, start: a.start_time })
      if (r.done) throw new Error('The trial lesson has already taken place (one per student)')
      if (r.conflict) throw new Error(`There is already a lesson at that time on ${a.date} (${r.conflict.start}–${r.conflict.end}); the trial lesson was not scheduled`)
      await clearBlockedUnderLessons(supabase) // a cell is either a lesson or unavailable, never both
      return ok(`Trial lesson scheduled: ${s.name} ${a.date} from ${a.start_time}, 1 hour (¥1,000)`)
    }
    if (!a.end_time) throw new Error('end_time is required (only trial lessons can omit it)')
    if (a.end_time <= a.start_time) throw new Error('The end time must be after the start time')
    const proctor = a.kind === 'proctor'
    if (proctor && (await studentRates(supabase, s.id)).proctorFee === null) throw new Error(NO_PROCTOR_FEE)
    const { conflict } = await scheduleExtraLesson(supabase, { studentId: s.id, date: a.date, start: a.start_time, end: a.end_time, proctor })
    if (conflict) {
      throw new Error(`There is already a lesson at that time on ${a.date} (${conflict.start}–${conflict.end}), so nothing was added. To log that lesson use log_lesson; to move it, mark it as leave first and then add the new one`)
    }
    await clearBlockedUnderLessons(supabase) // a cell is either a lesson or unavailable, never both
    return ok(`Added ${proctor ? 'proctored session' : 'lesson'}: ${s.name} ${a.date} ${a.start_time}–${a.end_time}`)
  }
)

async function checkpointOf(supabase: Supabase, studentId: string, id: string) {
  const { data, error } = await supabase.from('checkpoints').select('id, student_id, title').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data || data.student_id !== studentId) throw new Error('This checkpoint does not belong to this student (look up checkpoint ids with student_overview first)')
  return data
}

server.registerTool(
  'set_checkpoint_done',
  {
    title: 'Check / uncheck a checkpoint',
    description: 'Marks a checkpoint as done or not done. Get checkpoint_id from student_overview. Before marking it done, confirm its criterion has been met.',
    inputSchema: { student, checkpoint_id: z.string().uuid(), done: z.boolean() },
    annotations: { destructiveHint: false, idempotentHint: true },
  },
  async (a) => {
    const supabase = await db()
    const s = await findStudent(supabase, a.student)
    const c = await checkpointOf(supabase, s.id, a.checkpoint_id)
    const { error } = await supabase
      .from('checkpoints')
      .update({ done_at: a.done ? new Date().toISOString() : null })
      .eq('id', c.id)
    if (error) throw error
    return ok(`${a.done ? 'Done' : 'Marked not done'}: ${c.title}`)
  }
)

server.registerTool(
  'add_checkpoint',
  {
    title: 'Add a checkpoint',
    description: "Adds a checkpoint to the student's plan. Always include a criterion (what counts as done). Hidden from parents; the tutor can show it in the web app when needed.",
    inputSchema: {
      student,
      title: z.string().min(1),
      due_date: date.optional().describe('Omit for an ongoing item, which does not count toward progress'),
      criterion: z.string().min(1),
      date_tbd: z.boolean().optional().describe('The date is not fixed yet; this is a placeholder date'),
    },
    annotations: { destructiveHint: false },
  },
  async (a) => {
    const supabase = await db()
    const s = await findStudent(supabase, a.student)
    const { data: last, error: e0 } = await supabase.from('checkpoints').select('seq').eq('student_id', s.id).order('seq', { ascending: false }).limit(1)
    if (e0) throw e0
    const { error } = await supabase.from('checkpoints').insert({
      student_id: s.id,
      seq: (last[0]?.seq ?? 0) + 1,
      title: a.title,
      due_date: a.due_date ?? null,
      criterion: a.criterion,
      date_tbd: a.date_tbd ?? false,
      parent_visible: false,
    })
    if (error) throw error
    return ok(`Checkpoint added: ${a.title}${a.due_date ? ` (${a.due_date})` : ' (ongoing)'}`)
  }
)

server.registerTool(
  'update_checkpoint',
  {
    title: 'Edit a checkpoint',
    description: 'Changes a checkpoint\'s title, date, criterion or "date TBD" flag. Pass only the fields to change.',
    inputSchema: {
      student,
      checkpoint_id: z.string().uuid(),
      title: z.string().min(1).optional(),
      due_date: date.optional(),
      criterion: z.string().optional(),
      date_tbd: z.boolean().optional(),
    },
    annotations: { destructiveHint: false },
  },
  async (a) => {
    const supabase = await db()
    const s = await findStudent(supabase, a.student)
    const c = await checkpointOf(supabase, s.id, a.checkpoint_id)
    const patch: { title?: string; due_date?: string; criterion?: string; date_tbd?: boolean } = {}
    if (a.title !== undefined) patch.title = a.title
    if (a.due_date !== undefined) patch.due_date = a.due_date
    if (a.criterion !== undefined) patch.criterion = a.criterion
    if (a.date_tbd !== undefined) patch.date_tbd = a.date_tbd
    if (Object.keys(patch).length === 0) throw new Error('No fields to change')
    const { error } = await supabase.from('checkpoints').update(patch).eq('id', c.id)
    if (error) throw error
    return ok(`Checkpoint updated: ${c.title} → ${JSON.stringify(patch)}`)
  }
)

server.registerTool(
  'record_grade',
  {
    title: 'Record a grade',
    description: 'Records one score (call it once per metric when one test has several). Use a metric name from "Available metrics" at the end of student_overview; percentage metrics accept "correct/total", e.g. 18/20; metrics with a maximum accept "score/max", e.g. 250/300.',
    inputSchema: { student, metric: z.string().min(1), date, value: z.string().min(1), note: z.string().optional() },
    annotations: { destructiveHint: false },
  },
  async (a) => {
    const supabase = await db()
    const s = await findStudent(supabase, a.student)
    const { data: metrics, error: e0 } = await supabase.from('metrics').select('id, name, unit, max_value').eq('student_id', s.id)
    if (e0) throw e0
    const m = metrics.find((x) => x.name === a.metric)
    if (!m) throw new Error(`There is no metric "${a.metric}". Available: ${metrics.map((x) => x.name).join(', ') || '(none yet; add them in the web app)'}`)
    const value = parseValue(a.value, m.unit, m.max_value)
    if (value === null) {
      throw new Error(`Could not read "${a.value}"${m.max_value !== null ? ` or it is over the maximum ${m.max_value}` : ''}. Pass a number; percentage metrics also accept 18/20`)
    }
    const { error } = await supabase.from('metric_records').insert({ student_id: s.id, metric_id: m.id, date: a.date, value, note: a.note ?? null })
    if (error) throw error
    return ok(`Grade recorded: ${s.name} ${m.name} ${a.date} ${formatValue(value, m.unit)}`)
  }
)

server.registerTool(
  'update_risk',
  {
    title: 'Update the risk note',
    description: "Updates the student's risk level and risk note (both internal; parents never see them).",
    inputSchema: { student, risk_level: z.enum(['none', 'warn', 'risk']), risk_note: z.string().optional() },
    annotations: { destructiveHint: false },
  },
  async (a) => {
    const supabase = await db()
    const s = await findStudent(supabase, a.student)
    const { error } = await supabase
      .from('students')
      .update({ risk_level: a.risk_level === 'none' ? null : a.risk_level, risk_note: a.risk_note ?? null })
      .eq('id', s.id)
    if (error) throw error
    return ok(`Risk updated: ${s.name} ${a.risk_level}`)
  }
)

// ── One assistant per student (MCP prompts) ────────────────────────────
// In Claude Desktop, "+" offers "Assistant for <student>": a new chat starts with that student's instructions and current overview.
// The student list syncs every 5 minutes: a student created in the web app gets an assistant, and an archived one loses it.

function instructions(label: string, notes: string | null): string {
  return [
    `You are the study assistant for the student "${label}" and work on this student only.`,
    '',
    'Tools:',
    `- Pass "${label}" as the student parameter of every tool, and never touch other students. Re-read with student_overview when you need the latest state.`,
    '- When I say "today we did…": log the lesson with log_lesson (status=done), and put the difficulties and judgements I mention in note.',
    '- The line for parents: show me a draft first, and write it to parent_summary only after I approve it.',
    '- Photos of tests and worksheets: read the score / time / accuracy and record it with record_grade, using a metric name listed at the end of the overview. Ask me about anything you cannot read; do not guess.',
    '- Checkpoints: use set_checkpoint_done only when the criterion is really met. New checkpoints always need a criterion.',
    '- Leave: log_lesson with status=leave. For a make-up lesson, add one with add_lesson.',
    '- Proctored past-paper sessions: pass kind=proctor to log_lesson / add_lesson; when the same day also has a lesson, pass kind=lesson to log that one.',
    '',
    'Notes for parents (parent_summary):',
    '- Only what was done and what comes next, in one or two sentences.',
    '- No personality or emotions, no comparisons with other children, no internal judgements (e.g. "math is fine but English is weak").',
    '',
    'About this student (written by the tutor):',
    notes ? notes : '(Nothing yet. The tutor can add it under "Notes for the assistant" on the student\'s edit page in the web app.)',
  ].join('\n')
}

async function assistantMessages(s: StudentRow) {
  const supabase = await db()
  const { data, error } = await supabase.from('students').select('assistant_notes').eq('id', s.id).single()
  if (error) throw error
  const label = s.display_name ?? s.name
  const text = `${instructions(label, data.assistant_notes)}\n\n---\nThe current state, read when this chat started:\n\n${await overviewText(supabase, s)}`
  return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] }
}

// General entry point: works for any student (including a new one before the next sync)
server.registerPrompt(
  'assistant',
  {
    title: 'Student assistant (pick a student)',
    description: 'Pick a student and start a chat with their assistant',
    argsSchema: {
      student: completable(z.string().describe("The student's display name"), async (value) => {
        const names = [...prompts.values()].map((p) => p.label)
        return names.filter((n) => n.includes(value ?? ''))
      }),
    },
  },
  async ({ student: who }) => {
    const supabase = await db()
    return assistantMessages(await findStudent(supabase, who))
  }
)

const prompts = new Map<string, { label: string; handle: RegisteredPrompt }>()

async function syncPrompts() {
  const supabase = await db()
  const { data, error } = await supabase.from('students').select('id, name, display_name, status').neq('status', 'archived')
  if (error) throw error
  const alive = new Set(data.map((s) => s.id))
  for (const [id, p] of prompts) {
    if (!alive.has(id)) {
      p.handle.remove()
      prompts.delete(id)
    }
  }
  for (const s of data) {
    const label = s.display_name ?? s.name
    const existing = prompts.get(s.id)
    if (existing) {
      if (existing.label !== label) {
        existing.handle.update({ title: `Assistant for ${label}` })
        existing.label = label
      }
      continue
    }
    const handle = server.registerPrompt(
      `assistant_${s.id.slice(0, 8)}`,
      { title: `Assistant for ${label}`, description: `Chat with the assistant for ${label} (starts with its instructions and the current overview)` },
      async () => assistantMessages(s)
    )
    prompts.set(s.id, { label, handle })
  }
}

const SYNC_MS = 5 * 60 * 1000
const RETRY_MS = 30 * 1000
async function syncQuietly() {
  try {
    await syncPrompts()
  } catch (e) {
    // No password set, a network timeout and so on: the tools still report the error; the assistant list retries in 30 seconds
    console.error('[tutor-baseline] Syncing the student assistants failed:', e instanceof Error ? e.message : e)
    setTimeout(syncQuietly, RETRY_MS).unref()
  }
}

// Sync the student list before connecting: Claude Desktop reads the prompt list once on connect and may ignore later
// "list changed" notifications. Wait at most 8 seconds: on a slow network, connect first (the tools still work) and
// notify once the sync finishes
const STARTUP_WAIT_MS = 8_000
const firstSync = syncQuietly()
await Promise.race([firstSync, new Promise((r) => setTimeout(r, STARTUP_WAIT_MS))])
await server.connect(new StdioServerTransport())
setInterval(syncQuietly, SYNC_MS).unref()
