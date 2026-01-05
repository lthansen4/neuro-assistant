create type assignment_status as enum ('Inbox','Scheduled','Locked_In','Completed');
create type session_type as enum ('Focus','Chill');
create type event_type as enum ('Class','Work','OfficeHours','Focus','Chill','Other');

create table users(
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  target_study_ratio integer default 25,
  created_at timestamptz default now()
);

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
  created_at timestamptz default now()
);

create index idx_assignments_user_due on assignments(user_id, due_date);

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
