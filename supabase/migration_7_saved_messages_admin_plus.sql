-- HOVIYAT 7: Saved Messages + admin control center enhancements
create table if not exists public.saved_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('private','group','channel')),
  source_id text not null,
  message_id uuid not null,
  body text,
  message_type text not null default 'text',
  media_url text,
  duration numeric,
  waveform jsonb not null default '[]'::jsonb,
  sender_id uuid,
  sender_name text not null default '',
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique(user_id, source_type, source_id, message_id)
);

alter table public.saved_messages enable row level security;
revoke all on public.saved_messages from anon;
grant select, delete on public.saved_messages to authenticated;
drop policy if exists "saved_messages_select_own" on public.saved_messages;
create policy "saved_messages_select_own" on public.saved_messages for select to authenticated
using ((select auth.uid()) = user_id);
drop policy if exists "saved_messages_delete_own" on public.saved_messages;
create policy "saved_messages_delete_own" on public.saved_messages for delete to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.save_message(
  p_source_type text, p_source_id text, p_message_id uuid, p_note text default ''
) returns public.saved_messages
language plpgsql security definer set search_path = public, extensions, pg_catalog as $$
declare
  v_uid uuid := auth.uid();
  v_row public.saved_messages;
  v_note text := left(coalesce(trim(p_note), ''), 500);
  v_chat public.chats;
  v_msg public.chat_messages;
  v_group public.groups;
  v_gmsg public.group_messages;
  v_channel public.channels;
  v_post public.channel_posts;
begin
  if v_uid is null then raise exception 'ابتدا وارد حساب شوید'; end if;
  if p_source_type not in ('private','group','channel') then raise exception 'نوع منبع نامعتبر است'; end if;

  if p_source_type = 'private' then
    select * into v_chat from public.chats where id = p_source_id and v_uid = any(members);
    if not found then raise exception 'عضو این گفتگو نیستید'; end if;
    select * into v_msg from public.chat_messages where id = p_message_id and chat_id = p_source_id;
    if not found then raise exception 'پیام پیدا نشد'; end if;
    insert into public.saved_messages(user_id,source_type,source_id,message_id,body,message_type,media_url,duration,waveform,sender_id,sender_name,note)
    values(v_uid,'private',p_source_id,v_msg.id,
      case when v_msg.body_enc is not null then extensions.pgp_sym_decrypt(v_msg.body_enc, public._msg_key()) else v_msg.body end,
      v_msg.type,v_msg.media_url,v_msg.duration,v_msg.waveform,v_msg.sender_id,
      coalesce((v_chat.member_info -> v_msg.sender_id::text ->> 'displayName'),'کاربر'),v_note)
    on conflict (user_id,source_type,source_id,message_id) do update set note=excluded.note
    returning * into v_row;

  elsif p_source_type = 'group' then
    select * into v_group from public.groups where id = p_source_id::uuid and v_uid = any(members);
    if not found then raise exception 'عضو این گروه نیستید'; end if;
    select * into v_gmsg from public.group_messages where id = p_message_id and group_id = p_source_id::uuid;
    if not found then raise exception 'پیام پیدا نشد'; end if;
    insert into public.saved_messages(user_id,source_type,source_id,message_id,body,message_type,media_url,duration,waveform,sender_id,sender_name,note)
    values(v_uid,'group',p_source_id,v_gmsg.id,v_gmsg.body,v_gmsg.type,v_gmsg.media_url,v_gmsg.duration,v_gmsg.waveform,v_gmsg.sender_id,v_gmsg.sender_name,v_note)
    on conflict (user_id,source_type,source_id,message_id) do update set note=excluded.note
    returning * into v_row;

  else
    select * into v_channel from public.channels where id = p_source_id::uuid and (v_uid = any(subscribers) or is_public);
    if not found then raise exception 'به این کانال دسترسی ندارید'; end if;
    select * into v_post from public.channel_posts where id = p_message_id and channel_id = p_source_id::uuid;
    if not found then raise exception 'پست پیدا نشد'; end if;
    insert into public.saved_messages(user_id,source_type,source_id,message_id,body,message_type,media_url,sender_id,sender_name,note)
    values(v_uid,'channel',p_source_id,v_post.id,v_post.body,v_post.type,v_post.media_url,v_post.sender_id,'',v_note)
    on conflict (user_id,source_type,source_id,message_id) do update set note=excluded.note
    returning * into v_row;
  end if;
  return v_row;
end; $$;

create or replace function public.unsave_message(p_source_type text, p_source_id text, p_message_id uuid)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if auth.uid() is null then raise exception 'ابتدا وارد حساب شوید'; end if;
  delete from public.saved_messages where user_id=auth.uid() and source_type=p_source_type and source_id=p_source_id and message_id=p_message_id;
end; $$;

create or replace function public.get_saved_messages(p_limit integer default 200)
returns setof public.saved_messages
language sql security definer set search_path = public, extensions, pg_catalog as $$
  select * from public.saved_messages
  where user_id = auth.uid()
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit,200),500));
$$;

revoke all on function public.save_message(text,text,uuid,text) from public, anon;
grant execute on function public.save_message(text,text,uuid,text) to authenticated;
revoke all on function public.unsave_message(text,text,uuid) from public, anon;
grant execute on function public.unsave_message(text,text,uuid) to authenticated;
revoke all on function public.get_saved_messages(integer) from public, anon;
grant execute on function public.get_saved_messages(integer) to authenticated;

-- Admin notes: private operator notes attached to accounts.
create table if not exists public.admin_user_notes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 2000),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.admin_user_notes enable row level security;
revoke all on public.admin_user_notes from anon;
grant select, insert, update on public.admin_user_notes to authenticated;
drop policy if exists "admin_user_notes_admin" on public.admin_user_notes;
create policy "admin_user_notes_admin" on public.admin_user_notes for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.admin_set_user_note(p_uid uuid, p_note text)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if not public.is_admin() then raise exception 'فقط ادمین سامانه مجاز است'; end if;
  insert into public.admin_user_notes(user_id,note,updated_by,updated_at)
  values(p_uid,left(coalesce(p_note,''),2000),auth.uid(),now())
  on conflict(user_id) do update set note=excluded.note,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  perform public.admin_write_action_log('user_note_update','user',p_uid,null,jsonb_build_object('has_note', length(coalesce(p_note,'')) > 0));
end; $$;
revoke all on function public.admin_set_user_note(uuid,text) from public, anon;
grant execute on function public.admin_set_user_note(uuid,text) to authenticated;

-- Extra admin metrics in one protected RPC. No raw message contents are returned.
create or replace function public.admin_dashboard_metrics()
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v jsonb;
begin
  if not public.is_admin() then raise exception 'فقط ادمین سامانه مجاز است'; end if;
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'online', (select count(*) from public.profiles where online),
    'new_24h', (select count(*) from public.profiles where created_at >= now()-interval '24 hours'),
    'new_7d', (select count(*) from public.profiles where created_at >= now()-interval '7 days'),
    'chats', (select count(*) from public.chats),
    'groups', (select count(*) from public.groups),
    'channels', (select count(*) from public.channels),
    'messages', (select count(*) from public.chat_messages) + (select count(*) from public.group_messages) + (select count(*) from public.channel_posts),
    'open_reports', (select count(*) from public.reports where status not in ('resolved','dismissed')),
    'active_stories', (select count(*) from public.stories where expires_at > now() and archived_at is null),
    'story_views', (select count(*) from public.story_views),
    'story_likes', (select count(*) from public.story_likes),
    'story_replies', (select count(*) from public.story_replies),
    'saved_messages', (select count(*) from public.saved_messages),
    'sessions', (select count(*) from public.user_sessions where revoked_at is null)
  ) into v;
  return v;
end; $$;
revoke all on function public.admin_dashboard_metrics() from public, anon;
grant execute on function public.admin_dashboard_metrics() to authenticated;

-- Admin-only cleanup of expired stories. Keeps rows for audit instead of hard deleting.
create or replace function public.admin_archive_expired_stories()
returns integer language plpgsql security definer set search_path = public, pg_catalog as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'فقط ادمین سامانه مجاز است'; end if;
  update public.stories set archived_at=now()
  where archived_at is null and expires_at <= now();
  get diagnostics n = row_count;
  perform public.admin_write_action_log('archive_expired_stories','story',null,null,jsonb_build_object('count',n));
  return n;
end; $$;
revoke all on function public.admin_archive_expired_stories() from public, anon;
grant execute on function public.admin_archive_expired_stories() to authenticated;

-- Realtime for saved-message sync across the user's devices.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='saved_messages') then
    alter publication supabase_realtime add table public.saved_messages;
  end if;
end $$;
