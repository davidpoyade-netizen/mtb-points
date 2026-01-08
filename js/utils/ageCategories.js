create table if not exists public.race_groups (
  id text primary key,
  meeting_id text not null references public.meetings(id) on delete cascade,
  name text not null,
  gpx_url text,
  created_at timestamptz not null default now()
);

alter table public.races
  add column if not exists race_group_id text references public.race_groups(id),
  add column if not exists laps int,
  add column if not exists sex_allowed text default 'all' check (sex_allowed in ('all','M','F'));
