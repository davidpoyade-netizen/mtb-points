-- ============================================================
-- MTB POINTS — SUPABASE SQL v3 (FULL RESET READY)
-- - IDs TEXT (meetings/races)
-- - RLS public read via is_published
-- - compute_age_category(birth_year, race_year)
-- - trigger auto: age_on_year + age_category_id + organizer_id
-- - vues: v_public_races, v_public_results, v_public_ranking (+ sex/age)
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- 0) Helper updated_at
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 1) PROFILES
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'rider'
    check (role in ('rider','organizer','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Auto-create profile on signup (role depuis raw_user_meta_data.role si présent)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare r text;
begin
  r := coalesce(nullif(new.raw_user_meta_data->>'role',''), 'rider');
  if r not in ('rider','organizer','admin') then r := 'rider'; end if;

  insert into public.profiles(id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1)),
    r
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- RLS helpers
create or replace function public.is_admin()
returns boolean
language sql stable
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.is_organizer()
returns boolean
language sql stable
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('organizer','admin')
  );
$$;

-- RLS profiles
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_no_manual_insert" on public.profiles;
create policy "profiles_no_manual_insert"
on public.profiles for insert
to authenticated
with check (false);

-- ============================================================
-- 2) MEETINGS (ÉVÉNEMENTS) — aligné front (organizer_id / is_published)
-- ============================================================
create table if not exists public.meetings (
  id text primary key,
  organizer_id uuid not null references public.profiles(id) on delete restrict,

  name text not null,
  date date,                     -- ton front met YYYY-MM-DD ou null
  end_date date,
  location text,
  comment text,

  race_ids text[] not null default '{}',
  is_published boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint meetings_end_date_check
    check (end_date is null or date is null or end_date >= date)
);

create index if not exists meetings_org_idx on public.meetings(organizer_id);
create index if not exists meetings_pub_idx on public.meetings(is_published);
create index if not exists meetings_date_idx on public.meetings(date desc);

drop trigger if exists trg_meetings_updated_at on public.meetings;
create trigger trg_meetings_updated_at
before update on public.meetings
for each row execute function public.set_updated_at();

alter table public.meetings enable row level security;

drop policy if exists "meetings_select_public_or_own" on public.meetings;
create policy "meetings_select_public_or_own"
on public.meetings for select
using (
  is_published = true
  or organizer_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "meetings_insert_organizer" on public.meetings;
create policy "meetings_insert_organizer"
on public.meetings for insert
with check (public.is_organizer() and organizer_id = auth.uid());

drop policy if exists "meetings_update_own" on public.meetings;
create policy "meetings_update_own"
on public.meetings for update
using (organizer_id = auth.uid() or public.is_admin())
with check (organizer_id = auth.uid() or public.is_admin());

drop policy if exists "meetings_delete_own" on public.meetings;
create policy "meetings_delete_own"
on public.meetings for delete
using (organizer_id = auth.uid() or public.is_admin());

-- ============================================================
-- 3) RACE CATEGORIES (catégorie "course" choisie par l’orga)
-- ============================================================
create table if not exists public.race_categories (
  id text primary key,               -- ex: 'open', 'u23_only', 'junior', 'masters'
  label text not null,
  rules jsonb not null default '{}'::jsonb
);

insert into public.race_categories (id,label,rules) values
('open','Open / Élite (19+)', '{"age_min":19}'::jsonb),
('u23_only','Espoir U23 (19–22)', '{"age_min":19,"age_max":22}'::jsonb),
('junior','Junior (17–18)', '{"age_min":17,"age_max":18}'::jsonb),
('masters','Masters (35+)', '{"age_min":35}'::jsonb)
on conflict (id) do nothing;

-- ============================================================
-- 4) AGE CATEGORIES (UCI style) — IDs courts (U7, M3, etc)
-- ============================================================
create table if not exists public.age_categories (
  id text primary key,               -- ex: 'U7', 'U23', 'M3'
  label text not null,               -- ex: 'U23 Espoir (19–22)'
  age_min int not null,
  age_max int not null,
  sort_order int not null
);

insert into public.age_categories (id,label,age_min,age_max,sort_order) values
('U7','U7 Poussin (7–8)',7,8,10),
('U9','U9 Pupille (9–10)',9,10,20),
('U11','U11 Benjamin (11–12)',11,12,30),
('U13','U13 Minime (13–14)',13,14,40),
('U15','U15 Cadet (15–16)',15,16,50),
('U17','U17 Junior (17–18)',17,18,60),
('U23','U23 Espoir (19–22)',19,22,70),
('SEN','Senior / Élite (19–34)',19,34,80),
('M1','M1 (35–39)',35,39,90),
('M2','M2 (40–44)',40,44,100),
('M3','M3 (45–49)',45,49,110),
('M4','M4 (50–54)',50,54,120),
('M5','M5 (55–59)',55,59,130),
('M6','M6 (60–64)',60,64,140),
('M7','M7 (65–69)',65,69,150),
('M8','M8 (70–74)',70,74,160),
('M9','M9 (75–79)',75,79,170)
on conflict (id) do nothing;

-- ============================================================
-- 5) COMPUTE AGE CATEGORY (birth_year + race_year)
-- - règle overlap U23 vs SEN: si 19–22 => U23, sinon SEN
-- ============================================================
create or replace function public.compute_age_category(birth_year int, race_year int)
returns text
language plpgsql
stable
as $$
declare
  a int;
begin
  if birth_year is null or race_year is null then
    return null;
  end if;

  a := race_year - birth_year;

  if a between 7 and 8 then return 'U7'; end if;
  if a between 9 and 10 then return 'U9'; end if;
  if a between 11 and 12 then return 'U11'; end if;
  if a between 13 and 14 then return 'U13'; end if;
  if a between 15 and 16 then return 'U15'; end if;
  if a between 17 and 18 then return 'U17'; end if;

  -- overlap: U23 prioritaire
  if a between 19 and 22 then return 'U23'; end if;
  if a between 19 and 34 then return 'SEN'; end if;

  if a between 35 and 39 then return 'M1'; end if;
  if a between 40 and 44 then return 'M2'; end if;
  if a between 45 and 49 then return 'M3'; end if;
  if a between 50 and 54 then return 'M4'; end if;
  if a between 55 and 59 then return 'M5'; end if;
  if a between 60 and 64 then return 'M6'; end if;
  if a between 65 and 69 then return 'M7'; end if;
  if a between 70 and 74 then return 'M8'; end if;
  if a between 75 and 79 then return 'M9'; end if;

  return null;
end;
$$;

-- ============================================================
-- 6) RACE GROUPS (optionnel, pour loops / variations)
-- ============================================================
create table if not exists public.race_groups (
  id text primary key,
  meeting_id text not null references public.meetings(id) on delete cascade,
  name text not null,
  gpx_url text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 7) RACES (ÉPREUVES) — aligné storage-supabase.js
-- ============================================================
create table if not exists public.races (
  id text primary key,
  organizer_id uuid not null references public.profiles(id) on delete restrict,
  meeting_id text references public.meetings(id) on delete cascade, -- nullable car ton front peut avoir des races "sans meeting"

  name text not null,
  date date,
  time time,

  disc text,
  level text,
  ebike boolean not null default false,

  distance_km numeric,
  dplus_m integer,
  participants integer,

  score_phys integer,
  score_tech integer,
  score_global integer,

  tech_v2 jsonb,
  gpx jsonb,
  gpx_file_name text,

  race_category_id text references public.race_categories(id),
  ranking_options jsonb not null default
    '{"general":true,"sex":true,"age":true,"u23_separate":true,"masters_by_band":true}'::jsonb,

  race_group_id text references public.race_groups(id),
  laps int,
  sex_allowed text default 'all' check (sex_allowed in ('all','M','F')),

  comment text,
  is_published boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists races_org_idx on public.races(organizer_id);
create index if not exists races_meeting_idx on public.races(meeting_id);
create index if not exists races_date_idx on public.races(date desc);
create index if not exists races_pub_idx on public.races(is_published);

drop trigger if exists trg_races_updated_at on public.races;
create trigger trg_races_updated_at
before update on public.races
for each row execute function public.set_updated_at();

alter table public.races enable row level security;

drop policy if exists "races_select_public_or_own" on public.races;
create policy "races_select_public_or_own"
on public.races for select
using (
  organizer_id = auth.uid()
  or public.is_admin()
  or (
    is_published = true
    and (
      meeting_id is null
      or exists (select 1 from public.meetings m where m.id = races.meeting_id and m.is_published = true)
    )
  )
);

drop policy if exists "races_insert_organizer" on public.races;
create policy "races_insert_organizer"
on public.races for insert
with check (public.is_organizer() and organizer_id = auth.uid());

drop policy if exists "races_update_own" on public.races;
create policy "races_update_own"
on public.races for update
using (organizer_id = auth.uid() or public.is_admin())
with check (organizer_id = auth.uid() or public.is_admin());

drop policy if exists "races_delete_own" on public.races;
create policy "races_delete_own"
on public.races for delete
using (organizer_id = auth.uid() or public.is_admin());

-- ============================================================
-- 8) RESULTS — + birth_year/sex/nationality + status + age_category
-- ============================================================
create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),

  race_id text not null references public.races(id) on delete cascade,
  organizer_id uuid not null references public.profiles(id) on delete restrict,

  rider_id uuid references public.profiles(id) on delete set null,

  last_name text not null,
  first_name text not null,
  club text,
  nationality text,

  sex text check (sex in ('M','F')),

  birth_year int,
  age_on_year int,
  age_category_id text references public.age_categories(id),

  course_category_id text references public.race_categories(id),

  category text, -- si tu importes une catégorie "texte" depuis XLS
  rank integer check (rank is null or rank >= 1),
  time_seconds integer check (time_seconds is null or time_seconds >= 0),
  time_display text,

  points numeric(10,2) check (points is null or points >= 0),

  status text not null default 'FINISH'
    check (status in ('FINISH','DNF','DNS','DSQ')),

  created_at timestamptz not null default now()
);

create index if not exists results_race_idx on public.results(race_id);
create index if not exists results_org_idx on public.results(organizer_id);
create index if not exists results_rank_idx on public.results(race_id, rank);
create index if not exists results_rider_idx on public.results(rider_id);

-- Trigger auto enrich results (organizer_id + race_year + age_on_year + age_category_id + course_category_id)
create or replace function public.enrich_result_before_write()
returns trigger
language plpgsql
as $$
declare
  ry int;
  org uuid;
  cc text;
begin
  -- normalise sex
  if new.sex is not null then
    new.sex := upper(new.sex);
    if new.sex not in ('M','F') then
      new.sex := null;
    end if;
  end if;

  select
    extract(year from r.date)::int,
    r.organizer_id,
    r.race_category_id
  into ry, org, cc
  from public.races r
  where r.id = new.race_id;

  -- organizer_id auto depuis la race si absent/mauvais
  if new.organizer_id is null then
    new.organizer_id := org;
  end if;

  -- course_category auto depuis la race si vide
  if new.course_category_id is null then
    new.course_category_id := cc;
  end if;

  -- compute age_on_year / birth_year
  if ry is not null then
    if new.birth_year is not null then
      new.age_on_year := ry - new.birth_year;
    elsif new.age_on_year is not null then
      new.birth_year := ry - new.age_on_year;
    end if;

    -- compute age category
    new.age_category_id := public.compute_age_category(new.birth_year, ry);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_results_enrich on public.results;
create trigger trg_results_enrich
before insert or update on public.results
for each row execute function public.enrich_result_before_write();

alter table public.results enable row level security;

drop policy if exists "results_select_public_or_own" on public.results;
create policy "results_select_public_or_own"
on public.results for select
using (
  organizer_id = auth.uid()
  or public.is_admin()
  or exists (
    select 1
    from public.races r
    where r.id = results.race_id
      and r.is_published = true
      and (r.meeting_id is null or exists (select 1 from public.meetings m where m.id = r.meeting_id and m.is_published = true))
  )
);

drop policy if exists "results_insert_organizer" on public.results;
create policy "results_insert_organizer"
on public.results for insert
with check (public.is_organizer() and organizer_id = auth.uid());

drop policy if exists "results_update_own" on public.results;
create policy "results_update_own"
on public.results for update
using (organizer_id = auth.uid() or public.is_admin())
with check (organizer_id = auth.uid() or public.is_admin());

drop policy if exists "results_delete_own" on public.results;
create policy "results_delete_own"
on public.results for delete
using (organizer_id = auth.uid() or public.is_admin());

-- ============================================================
-- 9) VUES PUBLIQUES (events/races/results)
-- ============================================================
create or replace view public.v_public_races as
select
  r.*,
  m.name as meeting_name,
  m.location as meeting_location,
  m.date as meeting_date
from public.races r
left join public.meetings m on m.id = r.meeting_id
where r.is_published = true
  and (r.meeting_id is null or m.is_published = true);

create or replace view public.v_public_results as
select
  res.*,
  r.name as race_name,
  r.date as race_date,
  r.disc as race_disc,
  r.level as race_level,
  r.ebike as race_ebike,
  r.meeting_id,
  m.name as meeting_name,
  m.location as meeting_location
from public.results res
join public.races r on r.id = res.race_id
left join public.meetings m on m.id = r.meeting_id
where r.is_published = true
  and (r.meeting_id is null or m.is_published = true);

-- ============================================================
-- 10) CLASSEMENT PUBLIC AGRÉGÉ (pour public-ranking.js)
-- - score = somme(points) sur résultats FINISH
-- - rider_id stable:
--    si rider_id existe => rider_id
--    sinon => hash md5(nom+prenom+club)
-- Colonnes attendues: rider_id, name, sex, birth_year, nationality, team, score, races
-- ============================================================
create or replace view public.v_public_ranking as
select
  coalesce(res.rider_id::text,
    md5(lower(coalesce(res.last_name,'') || '|' || coalesce(res.first_name,'') || '|' || coalesce(res.club,'')))
  ) as rider_id,
  max(res.last_name) as last_name,
  max(res.first_name) as first_name,
  trim(max(coalesce(res.last_name,'') || ' ' || coalesce(res.first_name,''))) as name,
  max(res.sex) as sex,
  min(res.birth_year) as birth_year,
  max(res.nationality) as nationality,
  max(res.club) as team,
  sum(coalesce(res.points,0))::int as score,
  count(distinct res.race_id)::int as races
from public.results res
join public.races r on r.id = res.race_id
left join public.meetings m on m.id = r.meeting_id
where res.status = 'FINISH'
  and r.is_published = true
  and (r.meeting_id is null or m.is_published = true)
group by 1;

-- Classement par SEXE
create or replace view public.v_public_ranking_by_sex as
select
  sex,
  rider_id,
  name,
  birth_year,
  nationality,
  team,
  score,
  races
from public.v_public_ranking
where sex in ('M','F');

-- Classement par CATEGORIE D'AGE (U23, M3, etc)
create or replace view public.v_public_ranking_by_agecat as
select
  ac.id as age_category_id,
  ac.label as age_category_label,
  pr.rider_id,
  pr.name,
  pr.sex,
  pr.birth_year,
  pr.nationality,
  pr.team,
  pr.score,
  pr.races
from public.v_public_ranking pr
left join public.age_categories ac
  on ac.id = public.compute_age_category(pr.birth_year, extract(year from now())::int);

-- Classement combiné SEXE + AGE (ex: M3 Homme, U23 Femme)
create or replace view public.v_public_ranking_by_sex_age as
select
  ac.id as age_category_id,
  ac.label as age_category_label,
  pr.sex,
  pr.rider_id,
  pr.name,
  pr.birth_year,
  pr.nationality,
  pr.team,
  pr.score,
  pr.races
from public.v_public_ranking pr
left join public.age_categories ac
  on ac.id = public.compute_age_category(pr.birth_year, extract(year from now())::int)
where pr.sex in ('M','F');

-- ============================================================
-- 11) GRANTS (PostgREST)
-- ============================================================
grant usage on schema public to anon, authenticated;

-- Vues publiques
grant select on public.v_public_races                 to anon, authenticated;
grant select on public.v_public_results               to anon, authenticated;
grant select on public.v_public_ranking               to anon, authenticated;
grant select on public.v_public_ranking_by_sex        to anon, authenticated;
grant select on public.v_public_ranking_by_agecat     to anon, authenticated;
grant select on public.v_public_ranking_by_sex_age    to anon, authenticated;

-- Tables (SELECT possible, RLS fait foi)
grant select on public.meetings to anon, authenticated;
grant select on public.races    to anon, authenticated;
grant select on public.results  to anon, authenticated;

-- Accès app authenticated (RLS fait foi)
grant select, insert, update, delete on public.meetings to authenticated;
grant select, insert, update, delete on public.races    to authenticated;
grant select, insert, update, delete on public.results  to authenticated;

grant select, update on public.profiles to authenticated;

-- ============================================================
-- Notes:
-- Promote organizer/admin:
-- update public.profiles set role='organizer' where email='xxx';
-- update public.profiles set role='admin' where email='xxx';
-- ============================================================
if new.organizer_id is null then new.organizer_id := org; end if;
create or replace function public.ranking_year()
returns int
language sql
stable
as $$
  select extract(year from now())::int
$$;
create or replace view public.v_public_ranking as
select
  coalesce(res.rider_id::text,
    md5(lower(coalesce(res.last_name,'') || '|' || coalesce(res.first_name,'') || '|' || coalesce(res.club,'')))
  ) as rider_id,
  max(res.last_name) as last_name,
  max(res.first_name) as first_name,
  trim(max(coalesce(res.last_name,'') || ' ' || coalesce(res.first_name,''))) as name,
  max(res.sex) as sex,
  min(res.birth_year) as birth_year,
  max(res.nationality) as nationality,
  max(res.club) as team,
  sum(coalesce(res.points,0))::int as score,
  count(distinct res.race_id)::int as races,

  -- ✅ catégorie UCI “courte” calculée sur l'année de classement
  public.compute_age_category(min(res.birth_year), public.ranking_year()) as age_category_id

from public.results res
join public.races r on r.id = res.race_id
left join public.meetings m on m.id = r.meeting_id
where res.status = 'FINISH'
  and r.is_published = true
  and (r.meeting_id is null or m.is_published = true)
group by 1;
create or replace view public.v_public_ranking_by_agecat as
select
  pr.age_category_id,
  pr.rider_id,
  pr.name,
  pr.sex,
  pr.birth_year,
  pr.nationality,
  pr.team,
  pr.score,
  pr.races
from public.v_public_ranking pr
where pr.age_category_id is not null;
create or replace view public.v_public_ranking_by_sex_age as
select
  pr.age_category_id,
  pr.sex,
  pr.rider_id,
  pr.name,
  pr.birth_year,
  pr.nationality,
  pr.team,
  pr.score,
  pr.races
from public.v_public_ranking pr
where pr.sex in ('M','F')
  and pr.age_category_id is not null;
