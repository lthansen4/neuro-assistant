-- Artifacts table for precise rollback of syllabus commits
-- Tracks which assignments and events were created by each parse run
create table if not exists syllabus_commit_artifacts(
  id uuid primary key default gen_random_uuid(),
  parse_run_id uuid not null references syllabus_parse_runs(id),
  assignment_id uuid references assignments(id),
  event_id uuid references calendar_events(id),
  created_at timestamptz default now()
);
create index if not exists idx_artifacts_parse on syllabus_commit_artifacts(parse_run_id);

