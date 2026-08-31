-- HOVIYAT ULTIMATE: additive preference storage
create table if not exists public.hoviyat_user_preferences (
  uid uuid primary key references auth.users(id) on delete cascade,
  ai_enabled boolean not null default true,
  ai_history_enabled boolean not null default true,
  motion_level text not null default 'full' check (motion_level in ('full','reduced','off')),
  glass_level text not null default 'balanced' check (glass_level in ('strong','balanced','minimal')),
  power_profile text not null default 'normal' check (power_profile in ('normal','balanced','saving','adaptive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.hoviyat_secret_preferences (
  uid uuid primary key references auth.users(id) on delete cascade,
  disappearing_default text not null default 'off' check (disappearing_default in ('off','30s','1m','5m','1h','1d','1w')),
  secret_blur boolean not null default true,
  secret_motion text not null default 'full' check (secret_motion in ('full','reduced','off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.hoviyat_user_preferences enable row level security;
alter table public.hoviyat_secret_preferences enable row level security;
drop policy if exists "ultimate preferences own read" on public.hoviyat_user_preferences;
drop policy if exists "ultimate preferences own write" on public.hoviyat_user_preferences;
create policy "ultimate preferences own read" on public.hoviyat_user_preferences for select using (auth.uid() = uid);
create policy "ultimate preferences own write" on public.hoviyat_user_preferences for all using (auth.uid() = uid) with check (auth.uid() = uid);
drop policy if exists "secret preferences own read" on public.hoviyat_secret_preferences;
drop policy if exists "secret preferences own write" on public.hoviyat_secret_preferences;
create policy "secret preferences own read" on public.hoviyat_secret_preferences for select using (auth.uid() = uid);
create policy "secret preferences own write" on public.hoviyat_secret_preferences for all using (auth.uid() = uid) with check (auth.uid() = uid);
create or replace function public.set_hoviyat_ultimate_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists hoviyat_user_preferences_updated_at on public.hoviyat_user_preferences;
create trigger hoviyat_user_preferences_updated_at before update on public.hoviyat_user_preferences for each row execute function public.set_hoviyat_ultimate_updated_at();
drop trigger if exists hoviyat_secret_preferences_updated_at on public.hoviyat_secret_preferences;
create trigger hoviyat_secret_preferences_updated_at before update on public.hoviyat_secret_preferences for each row execute function public.set_hoviyat_ultimate_updated_at();
