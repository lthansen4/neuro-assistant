-- Enums
create type assignment_status as enum ('Inbox','Scheduled','Locked_In','Completed');
create type session_type as enum ('Focus','Chill');
create type event_type as enum ('Class','Work','OfficeHours','Focus','Chill','Other');
create type syllabus_parse_status as enum ('queued','processing','succeeded','failed');

-- Users
create table users(
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  timezone text not null default 'UTC',
  target_study_ratio numeric(4,2) not null default 2.50,
  created_at timestamptz default now()
);
create index idx_users_clerk on users(clerk_user_id);

-- Courses
create table courses(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  name text not null,
  professor text,
  color_code text,
  credits integer default 3,
  schedule_json jsonb,
  office_hours_json jsonb,
  grade_weights_json jsonb,
  created_at timestamptz default now()
);
create index idx_courses_user_name on courses(user_id, name);

-- Normalized office hours
create table course_office_hours(
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) not null,
  day_of_week integer not null,
  start_time time not null,
  end_time time not null,
  location text
);
create index idx_office_hours_course_day on course_office_hours(course_id, day_of_week);

-- Assignments
create table assignments(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  course_id uuid references courses(id),
  title text not null,
  due_date timestamptz,
  category text,
  effort_estimate_minutes integer,
  priority_score integer default 0,
  status assignment_status default 'Inbox',
  graded boolean default false,
  points_earned numeric(10,2),
  points_possible numeric(10,2),
  weight_override numeric(5,2),
  submitted_at timestamptz,
  created_at timestamptz default now()
);
create index idx_assignments_user_due on assignments(user_id, due_date);
create index idx_assignments_course_due on assignments(course_id, due_date);

-- Sessions
create table sessions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  assignment_id uuid references assignments(id),
  type session_type not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  planned_duration integer,
  actual_duration integer,
  created_at timestamptz default now()
);
create index idx_sessions_user_start on sessions(user_id, start_time);

-- Calendar events
create table calendar_events(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  course_id uuid references courses(id),
  assignment_id uuid references assignments(id),
  type event_type not null,
  title text,
  location text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  is_movable boolean default false,
  metadata jsonb,
  created_at timestamptz default now()
);
create index idx_events_user_time on calendar_events(user_id, start_time);

-- Dashboard preferences
create table dashboard_preferences(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) unique not null,
  show_grade_forecast boolean not null default true,
  show_chill_bank boolean not null default true,
  default_range text not null default 'week',
  created_at timestamptz default now()
);

-- Daily productivity
create table user_daily_productivity(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  day date not null,
  focus_minutes integer not null default 0,
  chill_minutes integer not null default 0,
  earned_chill_minutes integer not null default 0,
  created_at timestamptz default now(),
  constraint uniq_user_day unique(user_id, day)
);

-- Weekly productivity
create table user_weekly_productivity(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  iso_year integer not null,
  iso_week integer not null,
  start_date date not null,
  end_date date not null,
  focus_minutes integer not null default 0,
  chill_minutes integer not null default 0,
  earned_chill_minutes integer not null default 0,
  created_at timestamptz default now(),
  constraint uniq_user_week unique(user_id, iso_year, iso_week)
);

-- Streaks
create table user_streaks(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) unique not null,
  current_streak_days integer not null default 0,
  longest_streak_days integer not null default 0,
  last_active_date date,
  created_at timestamptz default now()
);

-- Grade forecasts
create table course_grade_forecasts(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  course_id uuid references courses(id) not null,
  current_score numeric(5,2),
  projected_score numeric(5,2),
  updated_at timestamptz default now(),
  constraint uniq_course_forecast unique(course_id)
);

-- Syllabus ingestion
create table syllabus_files(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  course_id uuid references courses(id),
  path text not null,
  original_filename text,
  uploaded_at timestamptz default now()
);
create index idx_syllabus_files_user on syllabus_files(user_id, uploaded_at);

create table syllabus_parse_runs(
  id uuid primary key default gen_random_uuid(),
  syllabus_file_id uuid references syllabus_files(id) not null,
  status syllabus_parse_status not null default 'queued',
  model text,
  confidence numeric(4,3),
  error text,
  created_at timestamptz default now(),
  completed_at timestamptz
);
create index idx_parse_runs_file_status on syllabus_parse_runs(syllabus_file_id, status);

create table syllabus_staging_items(
  id uuid primary key default gen_random_uuid(),
  parse_run_id uuid references syllabus_parse_runs(id) not null,
  type text not null,
  payload jsonb not null,
  confidence numeric(4,3),
  dedupe_key text,
  created_at timestamptz default now()
);
create index idx_staging_run_type on syllabus_staging_items(parse_run_id, type);

create table syllabus_commits(
  id uuid primary key default gen_random_uuid(),
  parse_run_id uuid references syllabus_parse_runs(id) not null,
  committed_by uuid references users(id) not null,
  committed_at timestamptz default now(),
  summary jsonb
);

-- Aggregation helpers: daily/weekly recompute
create or replace function recompute_daily_productivity(p_user uuid, p_day date)
returns void language sql as $$
with sessions_day as (
  select
    extract(epoch from (least(end_time, (p_day + 1)::date)::timestamptz - greatest(start_time, p_day::timestamptz))) / 60 as minutes,
    type
  from sessions
  where user_id = p_user
    and start_time < (p_day + 1)
    and end_time > p_day
),
agg as (
  select
    coalesce(sum(case when type = 'Focus' then minutes end),0)::int as focus_minutes,
    coalesce(sum(case when type = 'Chill' then minutes end),0)::int as chill_minutes
  from sessions_day
)
insert into user_daily_productivity (user_id, day, focus_minutes, chill_minutes, earned_chill_minutes)
select p_user, p_day, a.focus_minutes, a.chill_minutes,
  floor(a.focus_minutes / (select coalesce(nullif(target_study_ratio,0), 2.50) from users where id = p_user))::int
from agg a
on conflict (user_id, day)
do update set
  focus_minutes = excluded.focus_minutes,
  chill_minutes = excluded.chill_minutes,
  earned_chill_minutes = excluded.earned_chill_minutes;
$$;

create or replace function recompute_weekly_productivity(p_user uuid, p_day date)
returns void language plpgsql as $$
declare
  week_start date := date_trunc('week', p_day)::date;
  week_end date := (week_start + interval '6 day')::date;
  iso_y int := extract(isoyear from week_start);
  iso_w int := extract(week from week_start);
  f int; c int; e int;
begin
  select coalesce(sum(focus_minutes),0), coalesce(sum(chill_minutes),0), coalesce(sum(earned_chill_minutes),0)
  into f, c, e
  from user_daily_productivity
  where user_id = p_user and day between week_start and week_end;

  insert into user_weekly_productivity (user_id, iso_year, iso_week, start_date, end_date, focus_minutes, chill_minutes, earned_chill_minutes)
  values (p_user, iso_y, iso_w, week_start, week_end, f, c, e)
  on conflict (user_id, iso_year, iso_week)
  do update set
    focus_minutes = excluded.focus_minutes,
    chill_minutes = excluded.chill_minutes,
    earned_chill_minutes = excluded.earned_chill_minutes,
    start_date = excluded.start_date,
    end_date = excluded.end_date;
end $$;

create or replace function sessions_after_change() returns trigger language plpgsql as $$
declare
  u uuid;
  d date;
begin
  if (tg_op = 'DELETE') then
    u := old.user_id;
    d := date_trunc('day', old.start_time)::date;
  else
    u := new.user_id;
    d := date_trunc('day', new.start_time)::date;
  end if;
  perform recompute_daily_productivity(u, d);
  perform recompute_weekly_productivity(u, d);
  return null;
end $$;

drop trigger if exists trg_sessions_after_change on sessions;
create trigger trg_sessions_after_change
  after insert or update or delete on sessions
  for each row execute function sessions_after_change();




