-- User course aliases (for quick add parsing)
create table user_course_aliases(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  alias text not null,
  course_id uuid references courses(id) not null,
  confidence numeric(4,3),
  usage_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_user_course_aliases_course on user_course_aliases(course_id);

-- Case-insensitive unique constraint on (user_id, lower(alias))
create unique index uniq_user_alias_ci on user_course_aliases(user_id, lower(alias));

-- Quick add logs (for parsing and deduplication)
create table quick_add_logs(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  raw_input text not null,
  parsed_payload jsonb,
  confidence numeric(4,3),
  dedupe_hash text,
  created_assignment_id uuid references assignments(id),
  created_event_id uuid references calendar_events(id),
  error text,
  created_at timestamptz default now()
);

create index idx_quick_add_logs_user_created on quick_add_logs(user_id, created_at);
create index idx_quick_add_logs_dedupe on quick_add_logs(dedupe_hash);




