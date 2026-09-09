-- Hoviyat Release 2026: settings, privacy, storage telemetry, auth guards and performance hardening.
create table if not exists public.hoviyat_privacy_preferences (
  uid uuid primary key references auth.users(id) on delete cascade,
  profile_visibility text not null default 'contacts' check (profile_visibility in ('everyone','contacts','nobody')),
  message_permission text not null default 'everyone' check (message_permission in ('everyone','contacts','nobody')),
  call_permission text not null default 'contacts' check (call_permission in ('everyone','contacts','nobody')),
  story_visibility text not null default 'contacts' check (story_visibility in ('everyone','contacts','close_friends','nobody')),
  last_seen_visibility text not null default 'contacts' check (last_seen_visibility in ('everyone','contacts','nobody')),
  online_status boolean not null default true,
  read_receipts boolean not null default true,
  typing_indicator boolean not null default true,
  profile_photo_visibility text not null default 'everyone' check (profile_photo_visibility in ('everyone','contacts','nobody')),
  story_replies boolean not null default true,
  ai_data_usage boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.hoviyat_privacy_preferences enable row level security;
drop policy if exists hoviyat_privacy_preferences_own on public.hoviyat_privacy_preferences;
create policy hoviyat_privacy_preferences_own on public.hoviyat_privacy_preferences for all to authenticated using ((select auth.uid())=uid) with check ((select auth.uid())=uid);

alter table public.hoviyat_app_preferences add column if not exists notification_preferences jsonb not null default '{"messages":true,"calls":true,"stories":true,"reactions":true,"mentions":true,"ai":true,"security":true}'::jsonb;
alter table public.hoviyat_app_preferences add column if not exists quiet_hours_enabled boolean not null default false;
alter table public.hoviyat_app_preferences add column if not exists quiet_hours_start time;
alter table public.hoviyat_app_preferences add column if not exists quiet_hours_end time;
alter table public.hoviyat_app_preferences add column if not exists data_saver boolean not null default false;
alter table public.hoviyat_app_preferences add column if not exists media_quality text not null default 'auto' check (media_quality in ('low','standard','high','auto'));
alter table public.hoviyat_app_preferences add column if not exists read_receipts boolean not null default true;
alter table public.hoviyat_app_preferences add column if not exists typing_indicator boolean not null default true;
alter table public.hoviyat_app_preferences add column if not exists auto_delete_days integer not null default 0 check (auto_delete_days >= 0);
alter table public.hoviyat_app_preferences add column if not exists ai_voice_enabled boolean not null default true;
alter table public.hoviyat_app_preferences add column if not exists ai_chat_enabled boolean not null default true;
alter table public.hoviyat_app_preferences add column if not exists ai_summaries_enabled boolean not null default true;
alter table public.hoviyat_app_preferences add column if not exists ai_suggestions_enabled boolean not null default true;
alter table public.hoviyat_app_preferences add column if not exists ai_memory_enabled boolean not null default false;

create table if not exists public.blocked_users (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id, blocked_id),
  check(blocker_id<>blocked_id)
);
alter table public.blocked_users enable row level security;
drop policy if exists blocked_users_own_all on public.blocked_users;
create policy blocked_users_own_all on public.blocked_users for all to authenticated using ((select auth.uid())=blocker_id) with check ((select auth.uid())=blocker_id);
create index if not exists idx_blocked_users_blocked on public.blocked_users(blocked_id);

create or replace function public.get_my_storage_usage() returns jsonb
language plpgsql security definer set search_path=public,storage,pg_catalog as $$
declare v_uid uuid := (select auth.uid()); v_result jsonb;
begin
  if v_uid is null then raise exception 'ورود لازم است'; end if;
  select jsonb_build_object(
    'total_bytes',coalesce(sum(size_bytes),0),
    'images_bytes',coalesce(sum(case when kind='image' then size_bytes else 0 end),0),
    'videos_bytes',coalesce(sum(case when kind='video' then size_bytes else 0 end),0),
    'audio_bytes',coalesce(sum(case when kind='audio' then size_bytes else 0 end),0),
    'files_bytes',coalesce(sum(case when kind='file' then size_bytes else 0 end),0),
    'items',count(*)
  ) into v_result
  from (
    select o.bucket_id,o.name,coalesce(nullif(o.metadata->>'size','')::bigint,0) size_bytes,
      case when coalesce(o.metadata->>'mimetype','') like 'image/%' then 'image'
           when coalesce(o.metadata->>'mimetype','') like 'video/%' then 'video'
           when coalesce(o.metadata->>'mimetype','') like 'audio/%' then 'audio'
           else 'file' end kind
    from storage.objects o
    where (o.bucket_id='avatars' and (storage.foldername(o.name))[1]=v_uid::text)
       or (o.bucket_id='story-media' and (storage.foldername(o.name))[1]=v_uid::text)
       or (o.bucket_id='chat-media' and exists(select 1 from public.chat_messages m where m.sender_id=v_uid and m.media_url=('storage://chat-media/'||o.name)))
       or (o.bucket_id='group-media' and exists(select 1 from public.group_messages m where m.sender_id=v_uid and m.media_url=('storage://group-media/'||o.name)))
       or (o.bucket_id='channel-media' and exists(select 1 from public.channel_posts p where p.sender_id=v_uid and p.media_url=('storage://channel-media/'||o.name)))
  ) s;
  return v_result;
end; $$;
revoke all on function public.get_my_storage_usage() from public;
grant execute on function public.get_my_storage_usage() to authenticated;

create or replace function public.can_call_user(p_other uuid) returns boolean
language sql security definer set search_path=public,pg_catalog as $$
select case
 when auth.uid() is null or p_other is null or auth.uid()=p_other then false
 when exists(select 1 from public.blocked_users b where (b.blocker_id=auth.uid() and b.blocked_id=p_other) or (b.blocker_id=p_other and b.blocked_id=auth.uid())) then false
 when coalesce((select pp.call_permission from public.hoviyat_privacy_preferences pp where pp.uid=p_other),'contacts')='nobody' then false
 else true end
$$;
revoke all on function public.can_call_user(uuid) from public;
grant execute on function public.can_call_user(uuid) to authenticated;

-- Keep story visibility/privacy enforced at the database boundary.
drop policy if exists stories_select_active_or_owner_admin on public.stories;
create policy stories_select_active_or_owner_admin on public.stories for select to authenticated using (
  ((select auth.uid())=user_id) or (select is_admin()) or
  (expires_at>now() and (
    coalesce((select pp.story_visibility from public.hoviyat_privacy_preferences pp where pp.uid=stories.user_id),'contacts')='everyone'
    or (coalesce((select pp.story_visibility from public.hoviyat_privacy_preferences pp where pp.uid=stories.user_id),'contacts')='contacts'
        and exists(select 1 from public.chats c where (select auth.uid())=any(c.members) and stories.user_id=any(c.members)))
  ))
);
drop policy if exists story_replies_insert_active on public.story_replies;
create policy story_replies_insert_active on public.story_replies for insert to authenticated with check (
  sender_id=(select auth.uid()) and exists(select 1 from public.stories s where s.id=story_replies.story_id and s.expires_at>now() and coalesce((select pp.story_replies from public.hoviyat_privacy_preferences pp where pp.uid=s.user_id),true)=true)
);

-- Performance indexes used by message/session/story/admin query paths.
create index if not exists idx_chat_messages_chat_id on public.chat_messages(chat_id);
create index if not exists idx_chat_messages_sender_id on public.chat_messages(sender_id);
create index if not exists idx_chat_messages_reply_to on public.chat_messages(reply_to);
create index if not exists idx_group_messages_group_id on public.group_messages(group_id);
create index if not exists idx_group_messages_sender_id on public.group_messages(sender_id);
create index if not exists idx_group_messages_reply_to on public.group_messages(reply_to);
create index if not exists idx_channel_posts_channel_id on public.channel_posts(channel_id);
create index if not exists idx_channel_posts_sender_id on public.channel_posts(sender_id);
create index if not exists idx_story_views_user_id on public.story_views(user_id);
create index if not exists idx_story_reactions_user_id on public.story_reactions(user_id);
create index if not exists idx_story_replies_sender_id on public.story_replies(sender_id);
create index if not exists idx_story_likes_user_id on public.story_likes(user_id);
create index if not exists idx_user_sessions_uid on public.user_sessions(uid);
create index if not exists idx_login_events_uid_created on public.login_events(uid, created_at desc);
create index if not exists idx_admin_user_notes_updated_by on public.admin_user_notes(updated_by);
create index if not exists idx_channels_owner_id on public.channels(owner_id);
create index if not exists idx_group_member_moderation_updated_by on public.group_member_moderation(updated_by);
create index if not exists idx_groups_owner_id on public.groups(owner_id);
create index if not exists idx_notifications_actor_id on public.notifications(actor_id);
create index if not exists idx_reports_assigned_to on public.reports(assigned_to);
create index if not exists idx_reports_reporter_id on public.reports(reporter_id);
create index if not exists idx_secret_chat_messages_secret_chat_id on public.secret_chat_messages(secret_chat_id);
create index if not exists idx_secret_chat_messages_sender_id on public.secret_chat_messages(sender_id);
create index if not exists idx_secret_chats_user_b on public.secret_chats(user_b);
create index if not exists idx_verification_requests_requester_id on public.verification_requests(requester_id);
create index if not exists idx_verification_requests_reviewed_by on public.verification_requests(reviewed_by);

-- Prevent ordinary users from changing privileged profile fields.
create or replace function private.protect_profile_privileged_fields()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if not (select public.is_admin()) and new.id=(select auth.uid()) then
    new.verified:=old.verified; new.suspended_until:=old.suspended_until; new.suspension_reason:=old.suspension_reason;
  end if;
  return new;
end; $$;
drop trigger if exists trg_protect_profile_privileged_fields on public.profiles;
create trigger trg_protect_profile_privileged_fields before update on public.profiles for each row execute function private.protect_profile_privileged_fields();

-- Rebuild public RLS auth checks using initplan-friendly SELECT wrappers.
do $$
declare r record; q text; w text; stmt text;
begin
  for r in select schemaname,tablename,policyname,qual,with_check from pg_policies where schemaname='public' and (coalesce(qual,'') like '%auth.uid()%' or coalesce(with_check,'') like '%auth.uid()%') loop
    q:=replace(coalesce(r.qual,''),'(select auth.uid())','__AUTH_UID_SELECT__'); q:=replace(q,'auth.uid()','(select auth.uid())'); q:=replace(q,'__AUTH_UID_SELECT__','(select auth.uid())');
    w:=replace(coalesce(r.with_check,''),'(select auth.uid())','__AUTH_UID_SELECT__'); w:=replace(w,'auth.uid()','(select auth.uid())'); w:=replace(w,'__AUTH_UID_SELECT__','(select auth.uid())');
    stmt:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
    if r.qual is not null then stmt:=stmt||' using ('||q||')'; end if;
    if r.with_check is not null then stmt:=stmt||' with check ('||w||')'; end if;
    execute stmt;
  end loop;
end $$;
