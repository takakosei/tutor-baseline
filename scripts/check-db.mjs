// Database permission check: npm run check:db
//
// Run it after changing the schema to confirm that:
//   1. signed out (anon), no table can be read
//   2. the parent page (service_role) can read the columns it uses (matching the queries in lib/parent-data.ts),
//      but no internal columns and no select *
//   3. the parent page can write only what it needs: requests (lesson_requests) and marking a lesson as leave
//      (a few lessons columns); nothing else
// It never writes: a write check uses a student id that does not exist, so the permission check runs first and the
// foreign key then rejects the row (23503 = permitted). Nothing is written.
// Prints no data. Uses the keys in .env.local (as local development does). Exit code 0 if every check passes, else 1

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])
)
const url = env.NEXT_PUBLIC_SUPABASE_URL
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts)
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, opts)

const NIL = '00000000-0000-0000-0000-000000000000'
const TABLES = [
  'profiles', 'students', 'checkpoints', 'lessons', 'schedules', 'homework', 'slots', 'metrics', 'metric_records',
  'statement_items', 'statement_months', 'lesson_requests', 'blocked_times', 'target_stages', 'report_items',
]

let failed = 0
function report(label, ok, detail) {
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `  ← ${detail}`}`)
}
const code = (res) => (res.error ? res.error.code : 'ok')
async function allowed(label, query) {
  const res = await query
  report(label, !res.error, `denied (${code(res)})`)
}
async function denied(label, query) {
  const res = await query
  report(label, res.error?.code === '42501', `should be denied, got ${code(res)}`)
}
// Writes: passing the permission check and then failing a foreign key / check constraint (23503 / 23514) = permitted, and nothing was written
async function writable(label, query) {
  const res = await query
  report(label, res.error?.code === '23503' || res.error?.code === '23514' || !res.error, `should be permitted, got ${code(res)}`)
}

console.log('— Signed out (anon): no table is readable')
for (const t of TABLES) await denied(`anon reads ${t}`, anon.from(t).select('*').limit(1))

console.log('\n— Parent page (service_role) can read (the columns lib/parent-data.ts uses)')
await allowed('students', admin.from('students').select('id, owner_id, display_name, goal, end_label, start_date, end_date, rate_per_hour, parent_locale').eq('parent_token', 'x').eq('parent_enabled', true).limit(1))
await allowed('checkpoints', admin.from('checkpoints').select('id, seq, due_date, title, criterion, done_at, parent_visible').eq('student_id', NIL))
await allowed('lessons (lesson records)', admin.from('lessons').select('date, status, parent_summary, trial, proctor').eq('student_id', NIL))
await allowed('lessons (schedule)', admin.from('lessons').select('id, student_id, date, status, start_time, end_time, schedule_id, proctor, moved_from').eq('student_id', NIL))
await allowed('lessons (tuition)', admin.from('lessons').select('date, status, duration_min, start_time, end_time, billable, rate_per_hour, trial, online, proctor, proctor_fee').eq('student_id', NIL))
await allowed('schedules', admin.from('schedules').select('id, student_id, weekday, start_time, end_time, starts_on, ends_on, proctor').eq('student_id', NIL))
await allowed('metrics', admin.from('metrics').select('id, name, unit, direction, max_value, parent_visible, parent_id').eq('student_id', NIL))
await allowed('metric_records', admin.from('metric_records').select('id, metric_id, date, value, created_at').eq('student_id', NIL))
await allowed('statement_months', admin.from('statement_months').select('month, published_at').eq('student_id', NIL))
await allowed('statement_items', admin.from('statement_items').select('id, month, date, label, amount').eq('student_id', NIL))
await allowed('lesson_requests', admin.from('lesson_requests').select('kind, date, start_time, end_time, status').eq('student_id', NIL))
await allowed('blocked_times', admin.from('blocked_times').select('weekday, date, start_time, valid_from, valid_to').eq('owner_id', NIL))
await allowed('profiles.booking_open, locale', admin.from('profiles').select('booking_open, locale').eq('id', NIL))

console.log('\n— Parent page cannot read (internal columns, select *)')
for (const [t, col] of [
  ['lessons', 'note'], ['lessons', 'mood'], ['lessons', 'cancel_reason'],
  // the original start and end of a moved lesson: the parent page only shows that the time changed
  ['lessons', 'moved_from_start'], ['lessons', 'moved_from_end'],
  ['students', 'name'], ['students', 'risk_note'], ['students', 'risk_level'], ['students', 'place'], ['students', 'assistant_notes'],
  ['students', 'online_rate_per_hour'], ['students', 'proctor_fee'], ['metric_records', 'note'], ['lesson_requests', 'message'], ['statement_items', 'created_at'],
  ['blocked_times', 'id'], ['profiles', 'name'],
  // the target card is the tutor's internal assessment and never reaches parents: the compared metric, stage targets,
  // school report, Toritsu conversion and grades
  ['students', 'target_metric_id'], ['target_stages', 'target_pass'], ['report_items', 'value'],
  ['students', 'toritsu_conversion'], ['students', 'report5'], ['students', 'report6'], ['target_stages', 'pass_pct'],
]) {
  await denied(`${t}.${col}`, admin.from(t).select(col).limit(1))
}
// statement_months has only three columns (student, month, published time), all granted to the parent page per the
// column grants in the schema, so select * is expected to succeed there
for (const t of TABLES.filter((t) => t !== 'statement_months')) await denied(`${t} select *`, admin.from(t).select('*').limit(1))

console.log('\n— Parent page can write (only these; nothing is actually written)')
await writable('lesson_requests: insert a request', admin.from('lesson_requests').insert({ student_id: NIL, kind: 'leave', date: '2026-01-01', start_time: '10:00', end_time: '12:00', message: null, status: 'accepted', decided_at: new Date().toISOString() }))
await writable('lesson_requests: withdraw (update status)', admin.from('lesson_requests').update({ status: 'withdrawn' }).eq('student_id', NIL).eq('status', 'pending'))
await writable('lessons: insert a leave record', admin.from('lessons').insert({ student_id: NIL, date: '2026-01-01', schedule_id: null, start_time: '10:00', end_time: '12:00', status: 'leave', billable: false }))
await writable('lessons: insert a leave record (proctoring)', admin.from('lessons').insert({ student_id: NIL, date: '2026-01-01', schedule_id: null, start_time: '09:00', end_time: '12:15', status: 'leave', billable: false, proctor: true }))
await writable('lessons: change to leave', admin.from('lessons').update({ status: 'leave', billable: false, duration_min: null, rate_per_hour: null }).eq('id', NIL).eq('student_id', NIL))

console.log('\n— Parent page cannot write')
await denied('lessons: update note', admin.from('lessons').update({ note: 'x' }).eq('id', NIL))
await denied('lessons: update parent_summary', admin.from('lessons').update({ parent_summary: 'x' }).eq('id', NIL))
await denied('lessons: delete', admin.from('lessons').delete().eq('id', NIL))
await denied('lessons: insert with a note', admin.from('lessons').insert({ student_id: NIL, date: '2026-01-01', status: 'leave', note: 'x' }))
await denied('lessons: update the proctor_fee snapshot', admin.from('lessons').update({ proctor_fee: 0 }).eq('id', NIL))
await denied('lessons: set proctor', admin.from('lessons').update({ proctor: true }).eq('id', NIL))
await denied('lessons: move to another date (parents cannot)', admin.from('lessons').update({ moved_from: '2026-01-01', date: '2026-01-02' }).eq('id', NIL))
await denied('lesson_requests: delete', admin.from('lesson_requests').delete().eq('id', NIL))
await denied('lesson_requests: update message', admin.from('lesson_requests').update({ message: 'x' }).eq('id', NIL))
await denied("lesson_requests: update seen_at (the tutor's acknowledgement)", admin.from('lesson_requests').update({ seen_at: new Date().toISOString() }).eq('id', NIL))
await denied('students: update', admin.from('students').update({ parent_enabled: true }).eq('id', NIL))
await denied('metrics: insert', admin.from('metrics').insert({ owner_id: NIL, student_id: NIL, name: 'x', unit: '', direction: 1 }))
await denied('blocked_times: insert', admin.from('blocked_times').insert({ owner_id: NIL, weekday: 1, start_time: '10:00', valid_from: '2026-01-01' }))
await denied('profiles: update booking_open', admin.from('profiles').update({ booking_open: true }).eq('id', NIL))
await denied('profiles: update locale', admin.from('profiles').update({ locale: 'en' }).eq('id', NIL))
await denied('students: update parent_locale', admin.from('students').update({ parent_locale: 'en' }).eq('id', NIL))

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed: review the column grants in the schema and lib/parent-data.ts.`)
process.exit(failed === 0 ? 0 : 1)
