-- HOVIYAT NextGen AI / Interaction workspace foundation
create extension if not exists pgcrypto;

create table if not exists public.hoviyat_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope_type text not null default 'private',
  scope_id text not null,
  text text not null default '',
  updated_at timestamptz not null default now(),
  unique(user_id, scope_type, scope_id)
);

create table if not exists public.hoviyat_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  due_at timestamptz,
  source_type text,
  source_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hoviyat_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  source_type text,
  source_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.hoviyat_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope_type text not null default 'personal',
  scope_id text,
  memory_key text not null,
  memory_value text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, scope_type, scope_id, memory_key)
);

create table if not exists public.hoviyat_ai_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  microphone text not null default 'ask' check (microphone in ('allow','ask','deny')),
  camera text not null default 'ask' check (camera in ('allow','ask','deny')),
  location text not null default 'deny' check (location in ('allow','ask','deny')),
  files text not null default 'selected' check (files in ('all','selected','deny')),
  contacts text not null default 'ask' check (contacts in ('allow','ask','deny')),
  screen text not null default 'deny' check (screen in ('allow','ask','deny')),
  notifications text not null default 'allow' check (notifications in ('allow','ask','deny')),
  updated_at timestamptz not null default now()
);

create table if not exists public.hoviyat_automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  trigger_type text not null,
  action_type text not null,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hoviyat_transfer_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('upload','download')),
  name text not null,
  progress numeric(5,2) not null default 0 check (progress >= 0 and progress <= 100),
  status text not null default 'queued' check (status in ('queued','running','paused','done','cancelled','error')),
  bytes_done bigint not null default 0,
  bytes_total bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hoviyat_drafts enable row level security;
alter table public.hoviyat_tasks enable row level security;
alter table public.hoviyat_events enable row level security;
alter table public.hoviyat_memories enable row level security;
alter table public.hoviyat_ai_permissions enable row level security;
alter table public.hoviyat_automations enable row level security;
alter table public.hoviyat_transfer_jobs enable row level security;

drop policy if exists "drafts_owner" on public.hoviyat_drafts;
create policy "drafts_owner" on public.hoviyat_drafts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "tasks_owner" on public.hoviyat_tasks;
create policy "tasks_owner" on public.hoviyat_tasks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "events_owner" on public.hoviyat_events;
create policy "events_owner" on public.hoviyat_events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "memories_owner" on public.hoviyat_memories;
create policy "memories_owner" on public.hoviyat_memories for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "ai_permissions_owner" on public.hoviyat_ai_permissions;
create policy "ai_permissions_owner" on public.hoviyat_ai_permissions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "automations_owner" on public.hoviyat_automations;
create policy "automations_owner" on public.hoviyat_automations for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "transfers_owner" on public.hoviyat_transfer_jobs;
create policy "transfers_owner" on public.hoviyat_transfer_jobs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.hoviyat_drafts to authenticated;
grant select, insert, update, delete on public.hoviyat_tasks to authenticated;
grant select, insert, update, delete on public.hoviyat_events to authenticated;
grant select, insert, update, delete on public.hoviyat_memories to authenticated;
grant select, insert, update, delete on public.hoviyat_ai_permissions to authenticated;
grant select, insert, update, delete on public.hoviyat_automations to authenticated;
grant select, insert, update, delete on public.hoviyat_transfer_jobs to authenticated;

create index if not exists idx_hoviyat_drafts_user_updated on public.hoviyat_drafts(user_id, updated_at desc);
create index if not exists idx_hoviyat_tasks_user_updated on public.hoviyat_tasks(user_id, updated_at desc);
create index if not exists idx_hoviyat_events_user_start on public.hoviyat_events(user_id, starts_at);
create index if not exists idx_hoviyat_memories_user_scope on public.hoviyat_memories(user_id, scope_type, scope_id);
create index if not exists idx_hoviyat_automations_user_enabled on public.hoviyat_automations(user_id, enabled);
create index if not exists idx_hoviyat_transfers_user_updated on public.hoviyat_transfer_jobs(user_id, updated_at desc);

alter publication supabase_realtime add table public.hoviyat_drafts;
alter publication supabase_realtime add table public.hoviyat_tasks;
alter publication supabase_realtime add table public.hoviyat_events;
alter publication supabase_realtime add table public.hoviyat_memories;
alter publication supabase_realtime add table public.hoviyat_transfer_jobs;
