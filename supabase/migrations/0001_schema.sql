-- Tutor Baseline: the full database schema.
--
-- Two kinds of access:
--   * The teacher signs in (role `authenticated`). Every table has row level security, and every row
--     belongs to the teacher through owner_id, directly or through the student.
--   * The parent page (/p/[token]) has no login. It runs on the server with the service role, which
--     bypasses RLS, so the service role only gets column-level grants for exactly what that page reads,
--     plus the two things a parent can do: request an extra lesson, or take a day off.
--   * anon gets nothing at all.
--
-- Supabase does not expose new tables to the API roles by default in this project, so every table
-- has an explicit grant next to its RLS policy. A policy without a grant is "permission denied".
--
-- Dates are `date` columns with no time zone (the business runs in Asia/Tokyo). Money is integer yen.

-- Supabase's default privileges give the API roles TRUNCATE / TRIGGER / REFERENCES on new tables.
-- PostgREST can't use them, but TRUNCATE ignores RLS, so nothing unused is left in place.
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;

-- ============ profiles: the teacher ============

create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now(),
  booking_open boolean not null default false, -- parents may request extra lessons
  locale       text constraint profiles_locale_check check (locale in ('zh', 'en', 'ja')) -- UI language; null = browser
);

-- ============ students ============

create table students (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references profiles(id) on delete cascade,
  name                 text not null,                -- internal name, teacher only
  display_name         text,                         -- shown on the parent page
  grade                text,
  goal                 text,
  status               text not null default 'active'
    constraint students_status_check check (status in ('active', 'at_risk', 'ending', 'cold', 'archived')),
  start_date           date,
  end_date             date,                         -- null = open-ended
  end_label            text,                         -- e.g. "Exam day 2/1"
  hours_per_week       numeric,                      -- turns days behind into catch-up hours
  rate_per_hour        integer default 2000,         -- null = agency student, not counted as income
  online_rate_per_hour integer
    constraint students_online_rate_per_hour_check check (online_rate_per_hour is null or online_rate_per_hour > 0),
  proctor_fee          integer                       -- per proctored past-paper session; null = not offered
    constraint students_proctor_fee_check check (proctor_fee is null or proctor_fee > 0),
  place                text,
  risk_level           text constraint students_risk_level_check check (risk_level in ('warn', 'risk')),
  risk_note            text,                         -- internal
  assistant_notes      text,                         -- read by the Claude Desktop assistant only
  parent_token         text unique,                  -- 32 random bytes, base64url
  parent_enabled       boolean not null default false,
  parent_locale        text                          -- parent page language, independent of the teacher's
    constraint students_parent_locale_check check (parent_locale in ('zh', 'en', 'ja')),
  sort_order           integer,                      -- dashboard card order
  target_metric_id     uuid,                         -- goal card: the score compared with the targets
  toritsu_conversion   boolean not null default false, -- goal card: Tokyo public combined school scoring
  report5              text constraint students_report5_check check (report5 ~ '^[123]{27}$'), -- 9 subjects x 3 viewpoints
  report6              text constraint students_report6_check check (report6 ~ '^[123]{27}$'),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index students_owner_idx on students (owner_id, status);

create function set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger students_updated_at before update on students
  for each row execute function set_updated_at();

-- ============ checkpoints: the baseline ============
-- A dated plan; progress compares how many are due by today with how many are done in order.

create table checkpoints (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references students(id) on delete cascade,
  seq            int not null,                   -- order for items that share a date
  due_date       date,                           -- null = ongoing item, not counted in progress
  title          text not null,
  criterion      text,                           -- what "done" means
  date_tbd       boolean not null default false, -- placeholder date (exam date not announced yet)
  done_at        timestamptz,
  parent_visible boolean not null default false, -- opt-in: the teacher's own to-dos stay private
  created_at     timestamptz not null default now()
);
create index checkpoints_student_idx on checkpoints (student_id, seq);

-- ============ schedules: weekly lesson rules ============
-- A lesson on a given day is computed from these rules; only what happened is stored in lessons.

create table schedules (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  weekday    smallint not null constraint schedules_weekday_check check (weekday between 0 and 6), -- 0 = Monday
  start_time time not null,
  end_time   time not null,
  starts_on  date not null default current_date,
  ends_on    date,
  proctor    boolean not null default false,  -- proctored past-paper session instead of a lesson
  created_at timestamptz not null default now(),
  constraint schedules_check check (end_time > start_time),
  constraint schedules_check1 check (ends_on is null or ends_on >= starts_on)
);
create index schedules_student_idx on schedules (student_id);

-- ============ lessons: what happened ============
-- A lesson from a rule is identified by (schedule_id, original date). Moving it to another day keeps
-- the original date in moved_from, so the rule doesn't produce the lesson again on that day.

create table lessons (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references students(id) on delete cascade,
  date             date not null,
  start_time       time,
  end_time         time,
  status           text not null default 'done'
    constraint lessons_status_check check (status in ('scheduled', 'done', 'canceled', 'rescheduled', 'leave')),
  schedule_id      uuid references schedules(id) on delete set null,
  rescheduled_to   uuid references lessons(id) on delete set null,
  cancel_reason    text,
  duration_min     int,
  billable         boolean not null default true,
  rate_per_hour    integer,                      -- snapshot when recorded: later price changes don't rewrite the past
  trial            boolean not null default false,
  online           boolean not null default false,
  proctor          boolean not null default false,
  proctor_fee      integer constraint lessons_proctor_fee_check check (proctor_fee is null or proctor_fee >= 0),
  moved_from       date,                         -- original date of a lesson moved to another time
  moved_from_start time,
  moved_from_end   time,
  mood             smallint constraint lessons_mood_check check (mood between 1 and 3), -- 1 smooth / 2 stuck / 3 revisit
  note             text,                         -- internal note, never shown to parents
  parent_summary   text,                         -- one line for parents; empty = not shown
  created_at       timestamptz not null default now(),
  constraint lessons_time_order check (start_time is null or end_time is null or end_time > start_time),
  constraint lessons_proctor_not_trial check (not (proctor and trial)),
  constraint lessons_proctor_fee_only_proctor check (proctor or proctor_fee is null),
  constraint lessons_proctor_fee_when_billed check (not proctor or status = 'scheduled' or not billable or proctor_fee is not null),
  constraint lessons_moved_from_times_need_date check (moved_from is not null or (moved_from_start is null and moved_from_end is null))
);
create index lessons_student_idx on lessons (student_id, date desc);
create unique index lessons_schedule_date_uniq on lessons (schedule_id, (coalesce(moved_from, date))) where schedule_id is not null;
create unique index lessons_one_trial_per_student on lessons (student_id) where trial;

-- ============ homework (schema only for now) ============

create table homework (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references students(id) on delete cascade,
  lesson_id      uuid references lessons(id) on delete set null,
  assigned_on    date not null,
  due_on         date,
  content        text not null,
  result         text constraint homework_result_check check (result in ('done', 'partial', 'not_done')),
  parent_visible boolean not null default false,
  created_at     timestamptz not null default now()
);
create index homework_student_idx on homework (student_id, assigned_on desc);

-- ============ slots: weekly availability grid (legacy) ============

create table slots (
  owner_id uuid not null references profiles(id) on delete cascade,
  weekday  smallint not null constraint slots_weekday_check check (weekday between 0 and 6),
  band     smallint not null constraint slots_band_check check (band between 0 and 3),
  kind     smallint not null default 0 constraint slots_kind_check check (kind between 0 and 3),
  primary key (owner_id, weekday, band)
);

-- ============ metrics: grades ============
-- One shape for every score: a metric per student, and dated values. A metric can have parts
-- (one level), e.g. an exam total with sections I / II / III.

create table metrics (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references profiles(id) on delete cascade,
  student_id     uuid not null references students(id) on delete cascade,
  parent_id      uuid,
  name           text not null,
  unit           text not null default '',
  direction      smallint not null default 1 constraint metrics_direction_check check (direction in (1, -1)), -- 1 higher is better
  max_value      numeric,
  parent_visible boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint metrics_student_id_name_key unique (student_id, name),
  constraint metrics_id_student_uniq unique (id, student_id),
  constraint metrics_parent_not_self check (parent_id is null or parent_id <> id)
);
alter table metrics
  add constraint metrics_parent_fk foreign key (parent_id, student_id) references metrics (id, student_id) on delete restrict;
create index metrics_parent_idx on metrics (parent_id) where parent_id is not null;

create table metric_records (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  metric_id  uuid not null references metrics(id) on delete cascade,
  date       date not null,
  value      numeric not null,
  note       text,                               -- internal
  created_at timestamptz not null default now()
);
create index metric_records_student_idx on metric_records (student_id, metric_id, date);

-- The goal card's metric must belong to the same student
alter table students
  add constraint students_target_metric_fk foreign key (target_metric_id, id)
  references metrics (id, student_id) on delete set null (target_metric_id);

-- ============ goal card: stage targets and school report items ============

create table target_stages (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students(id) on delete cascade,
  date        date not null,
  label       text constraint target_stages_label_check check (label is null or length(label) <= 60),
  target_pass numeric constraint target_stages_target_pass_check check (target_pass is null or target_pass >= 0),
  target_best numeric constraint target_stages_target_best_check check (target_best is null or target_best >= 0),
  pass_pct    numeric constraint target_stages_pass_pct_check check (pass_pct is null or pass_pct between 0 and 100),
  best_pct    numeric constraint target_stages_best_pct_check check (best_pct is null or best_pct between 0 and 100),
  created_at  timestamptz not null default now(),
  unique (student_id, date)
);

create table report_items (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  label      text not null constraint report_items_label_check check (length(trim(label)) between 1 and 60),
  value      numeric constraint report_items_value_check check (value is null or value >= 0),
  max_value  numeric constraint report_items_max_value_check check (max_value is null or max_value > 0),
  created_at timestamptz not null default now()
);
create index report_items_student_idx on report_items (student_id, created_at);

-- ============ monthly statements ============

-- "Other" items on a statement: materials bought for the student (+), discounts (−)
create table statement_items (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  month      text not null constraint statement_items_month_format check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  date       date,
  label      text not null constraint statement_items_label_check check (length(trim(label)) > 0),
  amount     integer not null constraint statement_items_amount_check check (amount <> 0),
  created_at timestamptz not null default now(),
  constraint statement_items_date_in_month check (date is null or to_char(date, 'YYYY-MM') = month)
);
create index statement_items_student_month_idx on statement_items (student_id, month);

-- A row = the teacher has shared that month's statement on the parent page
create table statement_months (
  student_id   uuid not null references students(id) on delete cascade,
  month        text not null constraint statement_months_month_check check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  published_at timestamptz not null default now(),
  primary key (student_id, month)
);

-- ============ booking: parent requests and the teacher's unavailable times ============

create table lesson_requests (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  kind       text not null constraint lesson_requests_kind_check check (kind in ('add', 'leave')),
  date       date not null,
  start_time time not null,
  end_time   time not null,
  message    text constraint lesson_requests_message_check check (message is null or length(message) <= 200), -- teacher only
  status     text not null default 'pending'
    constraint lesson_requests_status_check check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  decided_at timestamptz,
  seen_at    timestamptz,                      -- the teacher dismissed the reminder
  created_at timestamptz not null default now(),
  constraint lesson_requests_check check (end_time > start_time)
);
create index lesson_requests_student_idx on lesson_requests (student_id, date);
create unique index lesson_requests_one_pending on lesson_requests (student_id, kind, date, start_time) where status = 'pending';

-- Half-hour cells the teacher marked as unavailable: weekly (with a validity range) or on one date
create table blocked_times (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references profiles(id) on delete cascade,
  weekday    smallint constraint blocked_times_weekday_check check (weekday between 0 and 6),
  date       date,
  start_time time not null
    constraint blocked_times_start_time_check check (extract(minute from start_time) in (0, 30) and extract(second from start_time) = 0),
  valid_from date,
  valid_to   date,
  created_at timestamptz not null default now(),
  constraint blocked_times_check check ((weekday is null) <> (date is null)),
  constraint blocked_times_validity check (
    (weekday is null and valid_from is null and valid_to is null)
    or (weekday is not null and valid_from is not null and (valid_to is null or valid_to >= valid_from))
  )
);
create unique index blocked_times_weekly on blocked_times (owner_id, weekday, start_time) where weekday is not null and valid_to is null;
create unique index blocked_times_dated on blocked_times (owner_id, date, start_time) where date is not null;

-- ============ row level security: the teacher sees only their own rows ============

alter table profiles        enable row level security;
alter table students        enable row level security;
alter table checkpoints     enable row level security;
alter table schedules       enable row level security;
alter table lessons         enable row level security;
alter table homework        enable row level security;
alter table slots           enable row level security;
alter table metrics         enable row level security;
alter table metric_records  enable row level security;
alter table target_stages   enable row level security;
alter table report_items    enable row level security;
alter table statement_items enable row level security;
alter table statement_months enable row level security;
alter table lesson_requests enable row level security;
alter table blocked_times   enable row level security;

create policy profiles_self on profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy students_owner on students for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy slots_owner on slots for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy blocked_times_owner on blocked_times for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy metrics_owner on metrics for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from students s where s.id = metrics.student_id and s.owner_id = (select auth.uid()))
  );

-- A record must point at the teacher's own student and at a metric of that same student
create policy metric_records_owner on metric_records for all to authenticated
  using (exists (select 1 from students s where s.id = metric_records.student_id and s.owner_id = (select auth.uid())))
  with check (
    exists (select 1 from students s where s.id = metric_records.student_id and s.owner_id = (select auth.uid()))
    and exists (
      select 1 from metrics m
      where m.id = metric_records.metric_id and m.owner_id = (select auth.uid()) and m.student_id = metric_records.student_id
    )
  );

-- Child tables of students: the row's student must be the teacher's
create policy checkpoints_owner on checkpoints for all to authenticated
  using (exists (select 1 from students s where s.id = checkpoints.student_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from students s where s.id = checkpoints.student_id and s.owner_id = (select auth.uid())));

create policy schedules_owner on schedules for all to authenticated
  using (exists (select 1 from students s where s.id = schedules.student_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from students s where s.id = schedules.student_id and s.owner_id = (select auth.uid())));

create policy lessons_owner on lessons for all to authenticated
  using (exists (select 1 from students s where s.id = lessons.student_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from students s where s.id = lessons.student_id and s.owner_id = (select auth.uid())));

create policy homework_owner on homework for all to authenticated
  using (exists (select 1 from students s where s.id = homework.student_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from students s where s.id = homework.student_id and s.owner_id = (select auth.uid())));

create policy target_stages_owner on target_stages for all to authenticated
  using (exists (select 1 from students s where s.id = target_stages.student_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from students s where s.id = target_stages.student_id and s.owner_id = (select auth.uid())));

create policy report_items_owner on report_items for all to authenticated
  using (exists (select 1 from students s where s.id = report_items.student_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from students s where s.id = report_items.student_id and s.owner_id = (select auth.uid())));

create policy statement_items_owner on statement_items for all to authenticated
  using (exists (select 1 from students s where s.id = statement_items.student_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from students s where s.id = statement_items.student_id and s.owner_id = (select auth.uid())));

create policy statement_months_owner on statement_months for all to authenticated
  using (exists (select 1 from students s where s.id = statement_months.student_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from students s where s.id = statement_months.student_id and s.owner_id = (select auth.uid())));

create policy lesson_requests_owner on lesson_requests for all to authenticated
  using (exists (select 1 from students s where s.id = lesson_requests.student_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from students s where s.id = lesson_requests.student_id and s.owner_id = (select auth.uid())));

-- ============ grants: the teacher ============
-- Rows are limited by the policies above. Requests are created by parents only, statement months
-- and unavailable times are never edited in place.

grant select, insert, update, delete on
  profiles, students, checkpoints, schedules, lessons, homework, slots,
  metrics, metric_records, target_stages, report_items, statement_items
  to authenticated;
grant select, insert, delete on statement_months, blocked_times to authenticated;
grant update (valid_to) on blocked_times to authenticated;
grant select, update, delete on lesson_requests to authenticated;

-- ============ grants: the parent page (service role) ============
-- Only the columns lib/parent-data.ts reads. Internal columns (notes, risk, internal names,
-- the assistant's notes, request messages, goal-card data) are not readable even with the service role.
-- scripts/check-db.mjs checks this list against the live database.

grant select (id, owner_id, display_name, goal, start_date, end_date, end_label, rate_per_hour,
              parent_token, parent_enabled, parent_locale) on students to service_role;
grant select (id, booking_open, locale) on profiles to service_role;
grant select (id, student_id, seq, due_date, title, criterion, done_at, parent_visible) on checkpoints to service_role;
grant select (id, student_id, weekday, start_time, end_time, starts_on, ends_on, proctor) on schedules to service_role;
grant select (id, student_id, date, status, start_time, end_time, schedule_id, duration_min, billable, rate_per_hour,
              trial, online, proctor, proctor_fee, moved_from, parent_summary) on lessons to service_role;
grant select (id, student_id, name, unit, direction, max_value, parent_visible, parent_id) on metrics to service_role;
grant select (id, student_id, metric_id, date, value, created_at) on metric_records to service_role;
grant select (id, student_id, month, date, label, amount) on statement_items to service_role;
grant select (student_id, month, published_at) on statement_months to service_role;
grant select (owner_id, weekday, date, start_time, valid_from, valid_to) on blocked_times to service_role;
grant select (id, student_id, kind, date, start_time, end_time, status, created_at, decided_at) on lesson_requests to service_role;

-- What a parent can write: a request (status can change when they withdraw it) ...
grant insert (student_id, kind, date, start_time, end_time, message, status, decided_at) on lesson_requests to service_role;
grant update (status) on lesson_requests to service_role;
-- ... and a day off, which takes effect at once: a lesson row marked as leave, never notes or summaries
grant insert (student_id, date, schedule_id, start_time, end_time, status, billable, proctor) on lessons to service_role;
grant update (status, billable, duration_min, rate_per_hour) on lessons to service_role;

-- anon: nothing. Anonymous requests are refused before RLS is consulted.

-- ============ Supabase project housekeeping ============
-- Projects created with "enable RLS on new tables" get public.rls_auto_enable(), callable by PUBLIC.
-- It returns event_trigger, so it can't really be called, but the advisor flags it; revoke it if present.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
