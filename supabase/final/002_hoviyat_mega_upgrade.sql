-- HOVIYAT MEGA UPGRADE 5.2
-- Additive settings/media/animation preference storage. Safe to run after 001.
create table if not exists public.hoviyat_app_preferences (
  uid uuid primary key references auth.users(id) on delete cascade,
  notifications_enabled boolean not null default true,
  ui_sounds boolean not null default true,
  media_autoplay boolean not null default true,
  privacy_preview boolean not null default true,
  font_scale text not null default 'normal' check (font_scale in ('small','normal','large','xlarge')),
  contrast_level text not null default 'normal' check (contrast_level in ('normal','high')),
  language text not null default 'fa',
  timezone text,
  date_format text not null default 'relative' check (date_format in ('relative','full','short')),
  enter_to_send boolean not null default true,
  compact_mode boolean not null default false,
  chat_wallpaper text not null default 'default',
  bubble_style text not null default 'rounded',
  animation_pack text not null default 'mega',
  sticker_pack text not null default 'default',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hoviyat_animation_preferences (
  uid uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  intensity text not null default 'full' check (intensity in ('full','reduced','off')),
  emoji_motion boolean not null default true,
  message_motion boolean not null default true,
  reaction_motion boolean not null default true,
  selected_pack text not null default 'mega-60',
  disabled_presets jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hoviyat_sticker_packs (
  id uuid primary key default gen_random_uuid(),
  owner_uid uuid references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  items jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_uid, slug)
);

create index if not exists hoviyat_sticker_packs_owner_idx on public.hoviyat_sticker_packs(owner_uid);
create index if not exists hoviyat_sticker_packs_public_idx on public.hoviyat_sticker_packs(is_public);

alter table public.hoviyat_app_preferences enable row level security;
alter table public.hoviyat_animation_preferences enable row level security;
alter table public.hoviyat_sticker_packs enable row level security;

drop policy if exists "app prefs own" on public.hoviyat_app_preferences;
create policy "app prefs own" on public.hoviyat_app_preferences for all using (auth.uid()=uid) with check (auth.uid()=uid);
drop policy if exists "animation prefs own" on public.hoviyat_animation_preferences;
create policy "animation prefs own" on public.hoviyat_animation_preferences for all using (auth.uid()=uid) with check (auth.uid()=uid);
drop policy if exists "sticker packs owner" on public.hoviyat_sticker_packs;
create policy "sticker packs owner" on public.hoviyat_sticker_packs for all using (auth.uid()=owner_uid) with check (auth.uid()=owner_uid);
drop policy if exists "public sticker packs read" on public.hoviyat_sticker_packs;
create policy "public sticker packs read" on public.hoviyat_sticker_packs for select using (is_public=true or auth.uid()=owner_uid);

create or replace function public.set_hoviyat_mega_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;

drop trigger if exists hoviyat_app_preferences_updated_at on public.hoviyat_app_preferences;
create trigger hoviyat_app_preferences_updated_at before update on public.hoviyat_app_preferences for each row execute function public.set_hoviyat_mega_updated_at();
drop trigger if exists hoviyat_animation_preferences_updated_at on public.hoviyat_animation_preferences;
create trigger hoviyat_animation_preferences_updated_at before update on public.hoviyat_animation_preferences for each row execute function public.set_hoviyat_mega_updated_at();
drop trigger if exists hoviyat_sticker_packs_updated_at on public.hoviyat_sticker_packs;
create trigger hoviyat_sticker_packs_updated_at before update on public.hoviyat_sticker_packs for each row execute function public.set_hoviyat_mega_updated_at();

comment on table public.hoviyat_app_preferences is 'User-facing application and accessibility preferences for Hoviyat 5.2';
comment on table public.hoviyat_animation_preferences is 'Per-user motion/animation controls';
comment on table public.hoviyat_sticker_packs is 'Owner-managed sticker and emoji packs';
