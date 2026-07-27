-- LexQCM CRFPA V2 — Supabase schema
-- Run this file once in Supabase > SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_goal integer not null default 20 check (daily_goal between 1 and 500),
  default_question_count integer not null default 20 check (default_question_count between 1 and 500),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'practice',
  subject text,
  score integer not null default 0,
  total integer not null default 0,
  duration_seconds integer not null default 0,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint study_sessions_valid_score check (score >= 0 and total >= 0 and score <= total),
  constraint study_sessions_valid_duration check (duration_seconds >= 0)
);

create index if not exists study_sessions_user_created_idx on public.study_sessions(user_id, created_at desc);
create index if not exists study_sessions_user_subject_idx on public.study_sessions(user_id, subject);

alter table public.profiles enable row level security;
alter table public.user_progress enable row level security;
alter table public.user_settings enable row level security;
alter table public.study_sessions enable row level security;

-- Profiles
create policy "profiles_select_own" on public.profiles
for select to authenticated
using ((select auth.uid()) = id);

create policy "profiles_insert_own" on public.profiles
for insert to authenticated
with check ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Progress
create policy "progress_select_own" on public.user_progress
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "progress_insert_own" on public.user_progress
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "progress_update_own" on public.user_progress
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Settings
create policy "settings_select_own" on public.user_settings
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "settings_insert_own" on public.user_settings
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "settings_update_own" on public.user_settings
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Session history
create policy "sessions_select_own" on public.study_sessions
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "sessions_insert_own" on public.study_sessions
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "sessions_delete_own" on public.study_sessions
for delete to authenticated
using ((select auth.uid()) = user_id);

-- Automatically prepare rows when a new Auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  insert into public.user_progress (user_id, progress)
  values (new.id, jsonb_build_object(
    'version', 3,
    'answered', 0,
    'correct', 0,
    'favorites', '[]'::jsonb,
    'questionStats', '{}'::jsonb,
    'history', '[]'::jsonb,
    'lastStudy', null,
    'streak', 0
  ))
  on conflict (user_id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Backfill rows if accounts existed before this SQL was installed.
insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

insert into public.user_progress (user_id, progress)
select id, jsonb_build_object(
  'version', 3,
  'answered', 0,
  'correct', 0,
  'favorites', '[]'::jsonb,
  'questionStats', '{}'::jsonb,
  'history', '[]'::jsonb,
  'lastStudy', null,
  'streak', 0
)
from auth.users
on conflict (user_id) do nothing;

insert into public.user_settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;
