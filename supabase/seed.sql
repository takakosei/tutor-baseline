-- Sample data: four fictional students for a private tutor in Tokyo.
-- Paste it into the Supabase SQL Editor (or run it with psql) once your account exists.
--
-- Prerequisite: your account must already exist in auth.users.
--   Dashboard → Authentication → Users → Add user (tick Auto Confirm),
--   or sign in once through /login.
--   Without a user, this script stops with an error (it uses the oldest user as the tutor).
--
-- Everything here is invented: the students, their plans and the weekly grid.

do $$
declare
  me uuid;
  a  uuid; b uuid; c uuid; dd uuid;
begin
  select id into me from auth.users order by created_at asc limit 1;
  if me is null then
    raise exception 'auth.users is empty: create a user before running the seed';
  end if;

  -- students / checkpoints have no unique constraint, so a second run would silently duplicate everything
  if exists (select 1 from students where owner_id = me) then
    raise exception 'students already has data: the seed can only run once (delete from students to start over)';
  end if;

  insert into profiles (id, name) values (me, 'Tutor')
    on conflict (id) do nothing;

  -- ========== Students ==========
  insert into students (owner_id, name, display_name, grade, goal, status,
                        start_date, end_date, end_label, hours_per_week,
                        rate_per_hour, place, risk_level, risk_note, parent_locale)
  values
    (me, 'Student A · Grade 5', 'A', 'Grade 5',
     'Private junior high entrance exam (math and science); first choice has a math-only exam', 'active',
     '2026-04-06', '2027-02-01', 'Exam day 2/1', 3,
     2500, 'At home (in person)', null, null, 'en')
  returning id into a;

  insert into students (owner_id, name, display_name, grade, goal, status,
                        start_date, end_date, end_label, hours_per_week,
                        rate_per_hour, place, risk_level, risk_note, parent_locale)
  values
    (me, 'Student B · Grade 8', 'B', 'Grade 8',
     'Math and science for school tests; Eiken Grade 3', 'at_risk',
     '2026-06-15', null, 'No end date · long-term', 2,
     2200, 'Online', 'warn',
     'Homework unfinished twice in a row. Check the homework load with the parents by 11/7.', 'ja')
  returning id into b;

  insert into students (owner_id, name, display_name, grade, goal, status,
                        start_date, end_date, end_label, hours_per_week,
                        rate_per_hour, place, risk_level, risk_note, parent_locale)
  values
    (me, 'Student C · Grade 10 · agency', 'C', 'Grade 10',
     'Math I / A support, arranged through an agency', 'ending',
     '2026-05-10', '2027-03-20', 'Ends with the school year in March', null,
     null, 'Agency classroom', null,
     'Arranged and billed by the agency; ends with the school year, then the slots go back to direct students.', 'en')
  returning id into c;

  insert into students (owner_id, name, display_name, grade, goal, status,
                        start_date, end_date, end_label, hours_per_week,
                        rate_per_hour, place, risk_level, risk_note, parent_locale)
  values
    (me, 'Student D · Grade 3', 'D', 'Grade 3',
     'Paused; treated as lost', 'cold',
     null, null, 'Paused since 10/1', null,
     2000, 'TBD', 'risk',
     'No reply for two weeks after the trial lesson. Send one closing message; archive if there is still no reply by 11/15.', 'zh')
  returning id into dd;

  -- ========== A: entrance exam ==========
  insert into checkpoints (student_id, seq, due_date, title, criterion, date_tbd) values
    (a, 1, '2026-10-31', 'Math past papers: first pass',     'Three years of the first-choice school done; mistakes sorted by unit', false),
    (a, 2, '2026-11-21', 'Speed and ratio units solid',      'Two unit quizzes in a row at 80% or more', false),
    (a, 3, '2026-12-12', 'Science calculation patterns',     'Ten problems each on circuits, levers and solubility, within the target time', false),
    (a, 4, '2027-01-09', 'Last mock exam',                   'Math deviation score of 55 or more', false),
    (a, 5, '2027-01-20', 'Two past papers per backup school + review', 'Gap to each school''s passing score written down', false),
    (a, 6, '2027-01-28', 'Final days: review only',          'No new problems; only the mistake notebook', false),
    (a, 7, '2027-02-01', 'Exam day',                         null, false);

  -- ========== B: school tests and Eiken (checkpoints 3 and 4 share a date) ==========
  insert into checkpoints (student_id, seq, due_date, title, criterion, date_tbd) values
    (b, 1, '2026-10-24', 'Review lesson for the midterms',   'Every mistake redone within a week of getting the tests back', false),
    (b, 2, '2026-11-07', 'Agree on the homework load',       'Pages per week and when they are checked, agreed with the parents', false),
    (b, 3, '2026-11-14', 'Linear functions unit test',       '70% or more on the school unit test', false),
    (b, 4, '2026-11-14', 'Eiken Grade 3: apply and confirm the date', 'Application done and the real date entered (this one is a placeholder)', true),
    (b, 5, '2026-11-28', 'Grade 3 vocabulary: first pass',   '70% on the vocabulary part of past papers', false),
    (b, 6, '2026-12-05', 'Term finals: math and science',    'Both above the school average', false),
    (b, 7, '2026-12-19', 'Third Eiken past paper',           'Written part consistently 60% or more', false),
    (b, 8, '2027-01-09', 'Interview practice',               'Two mock interviews without getting stuck', false),
    (b, 9, '2027-01-31', 'Eiken Grade 3 test day',           'Date to be confirmed', true),
    (b,10, '2027-02-20', 'Plan for the end-of-year tests',   'Worked back from the test dates', false),
    (b,11, null,         'Every lesson: redo last time''s mistakes for 10 minutes', 'Ongoing item; not counted in progress', false);

  -- ========== C: agency ==========
  insert into checkpoints (student_id, seq, due_date, title, criterion, date_tbd) values
    (c, 1, '2026-11-30', 'Term-end test scope confirmed',    null, false),
    (c, 2, '2027-01-16', 'Timed practice routine agreed',    'Once a week, timed, then reviewed together', false),
    (c, 3, '2027-03-20', 'School year over: tell the agency the lessons end', null, false),
    (c, 4, '2027-03-31', 'Freed slots offered to direct students', null, false);

  -- ========== D: wrapping up ==========
  insert into checkpoints (student_id, seq, due_date, title, criterion, date_tbd) values
    (dd, 1, '2026-10-25', 'Send a closing message',          'One short message, no pressure', false),
    (dd, 2, '2026-11-15', 'Archive and reopen the slot',     'Slot returned to the recruiting plan', false);

  -- ========== Weekly availability grid ==========
  -- weekday: 0=Mon 1=Tue 2=Wed 3=Thu 4=Fri 5=Sat 6=Sun
  -- band:    0=10-12  1=13-15  2=15:30-17:30  3=18-20
  -- kind:    0=free 1=direct student 2=agency/other 3=not available
  insert into slots (owner_id, weekday, band, kind) values
    (me, 0, 3, 1),   -- Mon 18-20       direct
    (me, 1, 2, 2),   -- Tue 15:30-17:30 agency
    (me, 2, 3, 1),   -- Wed 18-20       direct
    (me, 3, 2, 2),   -- Thu 15:30-17:30 agency
    (me, 4, 3, 1),   -- Fri 18-20       direct
    (me, 5, 0, 1),   -- Sat 10-12       direct
    (me, 5, 1, 3),   -- Sat 13-15       not available
    (me, 6, 0, 1),   -- Sun 10-12       direct
    (me, 6, 1, 1)    -- Sun 13-15       direct
  on conflict (owner_id, weekday, band) do update set kind = excluded.kind;

  raise notice 'Seed done: 4 students, 24 checkpoints, 9 slots';
end $$;

-- Check:
--   select name, status, end_label from students order by name;
--   select s.name, count(*) from checkpoints c join students s on s.id = c.student_id group by 1;
--   select weekday, band, kind from slots order by weekday, band;
