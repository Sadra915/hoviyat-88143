-- HOVIYAT 2026 Social Layer
-- Remote migration applied: 2026-09-07
-- Adds 24h stories, views, reactions, replies, notifications and feature flags.

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_url text not null default '',
  media_type text not null default 'image' check (media_type in ('image','video')),
  caption text not null default '' check (char_length(caption) <= 500),
  author_name text not null default '', author_username text not null default '',
  author_photo_url text not null default '', author_verified boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  archived_at timestamptz null
);

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_name text not null default '', actor_username text not null default '', actor_photo_url text not null default '',
  viewed_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create table if not exists public.story_reactions (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_name text not null default '', actor_username text not null default '', actor_photo_url text not null default '',
  reaction text not null default '❤️' check (char_length(reaction) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create table if not exists public.story_replies (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('story_like','story_reply','story_view','system')),
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.app_feature_flags (
  key text primary key check (key ~ '^[a-z0-9_]{2,80}$'),
  enabled boolean not null default true,
  rollout_percent integer not null default 100 check (rollout_percent between 0 and 100),
  description text not null default '', updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- RLS policies and private story-media Storage bucket are installed in the remote migration.
-- The client uploads to story-media/<story_id>/... after creating an owned story row.
-- Reactions/views/replies are owner-scoped and story owners can see participant snapshots.
