-- HOVIYAT NEXT 009: optional message lifecycle metadata, additive only.
alter table if exists public.chat_messages add column if not exists edited_at timestamptz;
alter table if exists public.chat_messages add column if not exists deleted_at timestamptz;
alter table if exists public.group_messages add column if not exists edited_at timestamptz;
alter table if exists public.group_messages add column if not exists deleted_at timestamptz;
alter table if exists public.channel_posts add column if not exists edited_at timestamptz;
alter table if exists public.channel_posts add column if not exists deleted_at timestamptz;
