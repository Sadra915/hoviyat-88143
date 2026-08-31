-- HOVIYAT NEXT 006: synced preferences + chat folders
create table if not exists public.user_preferences (
  uid uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'fa',
  theme text not null default 'classic',
  wallpaper text not null default 'hoviyat',
  effects text not null default 'full',
  power_mode text not null default 'normal',
  glass_mode text not null default 'balanced',
  notification_mode text not null default 'smart',
  auto_download text not null default 'wifi',
  reduce_motion boolean not null default false,
  updated_at timestamptz not null default now(),
  check (language in ('fa','en')),
  check (effects in ('full','reduced','minimal')),
  check (power_mode in ('normal','saving')),
  check (glass_mode in ('strong','balanced','minimal')),
  check (notification_mode in ('smart','all','mentions','off')),
  check (auto_download in ('wifi','all','off'))
);
alter table public.user_preferences enable row level security;
drop policy if exists user_preferences_own_select on public.user_preferences;
drop policy if exists user_preferences_own_insert on public.user_preferences;
drop policy if exists user_preferences_own_update on public.user_preferences;
create policy user_preferences_own_select on public.user_preferences for select using (auth.uid()=uid);
create policy user_preferences_own_insert on public.user_preferences for insert with check (auth.uid()=uid);
create policy user_preferences_own_update on public.user_preferences for update using (auth.uid()=uid);

create table if not exists public.chat_folders (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  sort_order integer not null default 0,
  include_unread boolean not null default false,
  include_groups boolean not null default true,
  include_channels boolean not null default true,
  created_at timestamptz not null default now(),
  unique(uid,name)
);
alter table public.chat_folders enable row level security;
create index if not exists idx_chat_folders_uid_order on public.chat_folders(uid,sort_order);
drop policy if exists chat_folders_own_all on public.chat_folders;
create policy chat_folders_own_all on public.chat_folders for all using (auth.uid()=uid) with check (auth.uid()=uid);

create table if not exists public.chat_folder_items (
  folder_id uuid not null references public.chat_folders(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  sort_order integer not null default 0,
  primary key(folder_id,chat_id)
);
alter table public.chat_folder_items enable row level security;
create policy chat_folder_items_own_all on public.chat_folder_items for all
using (exists(select 1 from public.chat_folders f where f.id=folder_id and f.uid=auth.uid()))
with check (exists(select 1 from public.chat_folders f where f.id=folder_id and f.uid=auth.uid()));
