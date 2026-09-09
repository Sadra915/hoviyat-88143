-- HOVIYAT v8 — per-user moderation restrictions
create schema if not exists private;

create table if not exists public.user_restrictions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preset text not null default 'custom' check (preset in ('custom','full_lock','read_only','no_media','no_calls','no_ai','no_story','social_limited')),
  restrictions jsonb not null default '{
    "send_messages": true,
    "send_media": true,
    "send_voice": true,
    "react": true,
    "call": true,
    "video_call": true,
    "create_group": true,
    "create_channel": true,
    "story": true,
    "forward": true,
    "edit_messages": true,
    "delete_messages": true,
    "secret_chat": true,
    "ai": true,
    "add_users": true,
    "profile_edit": true,
    "save_messages": true,
    "notifications": true
  }'::jsonb,
  reason text not null default '' check (char_length(reason) <= 1000),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create index if not exists user_restrictions_expires_idx on public.user_restrictions(expires_at);
create index if not exists user_restrictions_updated_idx on public.user_restrictions(updated_at desc);

drop function if exists private.user_action_allowed(uuid,text);
create or replace function private.user_action_allowed(p_uid uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select case
    when p_uid is null then false
    when exists (
      select 1 from public.profiles p
      where p.id = p_uid
        and p.suspended_until is not null
        and p.suspended_until > now()
    ) then false
    else coalesce(
      (
        select (ur.restrictions ->> p_action)::boolean
        from public.user_restrictions ur
        where ur.user_id = p_uid
          and (ur.expires_at is null or ur.expires_at > now())
        limit 1
      ), true
    )
  end;
$$;


alter table public.user_restrictions enable row level security;

drop policy if exists "user_restrictions_select_self_or_admin" on public.user_restrictions;
create policy "user_restrictions_select_self_or_admin"
on public.user_restrictions for select
to authenticated
using ((select auth.uid()) = user_id or (select public.is_admin()));

revoke insert, update, delete on public.user_restrictions from anon, authenticated;
grant select on public.user_restrictions to authenticated;

create or replace function public.get_my_restrictions()
returns jsonb
language sql
stable
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'user_id', (select auth.uid()),
    'preset', coalesce(ur.preset,'custom'),
    'restrictions', coalesce(ur.restrictions, '{}'::jsonb),
    'reason', coalesce(ur.reason,''),
    'starts_at', ur.starts_at,
    'expires_at', ur.expires_at,
    'active', (ur.user_id is not null and (ur.expires_at is null or ur.expires_at > now()))
  )
  from (select 1) x
  left join public.user_restrictions ur on ur.user_id = (select auth.uid());
$$;

create or replace function public.admin_set_user_restrictions(
  p_uid uuid,
  p_preset text default 'custom',
  p_restrictions jsonb default '{}'::jsonb,
  p_expires_at timestamptz default null,
  p_reason text default ''
)
returns public.user_restrictions
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_restrictions jsonb := jsonb_build_object(
    'send_messages', true,
    'send_media', true,
    'send_voice', true,
    'react', true,
    'call', true,
    'video_call', true,
    'create_group', true,
    'create_channel', true,
    'story', true,
    'forward', true,
    'edit_messages', true,
    'delete_messages', true,
    'secret_chat', true,
    'ai', true,
    'add_users', true,
    'profile_edit', true,
    'save_messages', true,
    'notifications', true
  );
  v_row public.user_restrictions;
  k text;
  v boolean;
begin
  if not (select public.is_admin()) then raise exception 'فقط ادمین سامانه مجاز است'; end if;
  if p_uid is null then raise exception 'کاربر نامعتبر است'; end if;
  if p_uid = v_uid then raise exception 'نمی‌توان محدودیت ادمین اصلی را تغییر داد'; end if;
  if not exists (select 1 from auth.users where id = p_uid) then raise exception 'کاربر پیدا نشد'; end if;
  if p_preset not in ('custom','full_lock','read_only','no_media','no_calls','no_ai','no_story','social_limited') then raise exception 'پروفایل محدودیت نامعتبر است'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'زمان انقضا باید در آینده باشد'; end if;
  if char_length(coalesce(p_reason,'')) > 1000 then raise exception 'دلیل بیش از حد طولانی است'; end if;

  case p_preset
    when 'full_lock' then
      v_restrictions := jsonb_set(v_restrictions, '{send_messages}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{send_media}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{send_voice}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{react}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{call}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{video_call}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{create_group}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{create_channel}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{story}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{forward}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{edit_messages}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{delete_messages}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{secret_chat}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{ai}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{add_users}', 'false'::jsonb);
    when 'read_only' then
      v_restrictions := jsonb_set(v_restrictions, '{send_messages}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{send_media}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{send_voice}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{react}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{call}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{video_call}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{forward}', 'false'::jsonb);
    when 'no_media' then
      v_restrictions := jsonb_set(v_restrictions, '{send_media}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{send_voice}', 'false'::jsonb);
    when 'no_calls' then
      v_restrictions := jsonb_set(v_restrictions, '{call}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{video_call}', 'false'::jsonb);
    when 'no_ai' then
      v_restrictions := jsonb_set(v_restrictions, '{ai}', 'false'::jsonb);
    when 'no_story' then
      v_restrictions := jsonb_set(v_restrictions, '{story}', 'false'::jsonb);
    when 'social_limited' then
      v_restrictions := jsonb_set(v_restrictions, '{create_group}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{create_channel}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{add_users}', 'false'::jsonb);
      v_restrictions := jsonb_set(v_restrictions, '{forward}', 'false'::jsonb);
    else null;
  end case;

  if jsonb_typeof(coalesce(p_restrictions,'{}'::jsonb)) <> 'object' then raise exception 'محدودیت‌ها باید JSON object باشند'; end if;
  for k in select jsonb_object_keys(p_restrictions) loop
    if not (k = any(array['send_messages','send_media','send_voice','react','call','video_call','create_group','create_channel','story','forward','edit_messages','delete_messages','secret_chat','ai','add_users','profile_edit','save_messages','notifications'])) then
      raise exception 'کلید محدودیت نامعتبر است: %', k;
    end if;
    v := (p_restrictions ->> k)::boolean;
    v_restrictions := jsonb_set(v_restrictions, array[k], to_jsonb(v));
  end loop;

  insert into public.user_restrictions(user_id,preset,restrictions,reason,starts_at,expires_at,updated_by,updated_at)
  values(p_uid,p_preset,v_restrictions,left(trim(coalesce(p_reason,'')),1000),now(),p_expires_at,v_uid,now())
  on conflict (user_id) do update set
    preset=excluded.preset,
    restrictions=excluded.restrictions,
    reason=excluded.reason,
    starts_at=excluded.starts_at,
    expires_at=excluded.expires_at,
    updated_by=excluded.updated_by,
    updated_at=excluded.updated_at
  returning * into v_row;

  perform public.admin_write_action_log('user_restrictions_update','user',p_uid,null,jsonb_build_object('preset',p_preset,'expires_at',p_expires_at,'restrictions',v_restrictions));
  return v_row;
end;
$$;

create or replace function public.admin_clear_user_restrictions(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not (select public.is_admin()) then raise exception 'فقط ادمین سامانه مجاز است'; end if;
  if p_uid = auth.uid() then raise exception 'نمی‌توان محدودیت ادمین اصلی را تغییر داد'; end if;
  delete from public.user_restrictions where user_id=p_uid;
  perform public.admin_write_action_log('user_restrictions_clear','user',p_uid,null,'{}'::jsonb);
end;
$$;

revoke execute on function public.get_my_restrictions() from anon;
grant execute on function public.get_my_restrictions() to authenticated;
revoke execute on function public.admin_set_user_restrictions(uuid,text,jsonb,timestamptz,text) from anon, public;
grant execute on function public.admin_set_user_restrictions(uuid,text,jsonb,timestamptz,text) to authenticated;
revoke execute on function public.admin_clear_user_restrictions(uuid) from anon, public;
grant execute on function public.admin_clear_user_restrictions(uuid) to authenticated;

-- Enforce restrictions at the database boundary for core actions.
DO $$
BEGIN
  IF to_regprocedure('public.send_chat_message(text,text,text,text,numeric,jsonb,uuid)') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION public.send_chat_message(p_chat_id text,p_type text,p_body text DEFAULT NULL,p_media_url text DEFAULT NULL,p_duration numeric DEFAULT NULL,p_waveform jsonb DEFAULT '[]'::jsonb,p_reply_to uuid DEFAULT NULL)
    RETURNS public.chat_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog,extensions AS $f$
    declare v_uid uuid:=auth.uid(); v_members uuid[]; v_other uuid; v_msg public.chat_messages; v_preview text; v_recent int;
    begin
      if v_uid is null then raise exception 'احراز هویت لازم است'; end if;
      if not private.user_action_allowed(v_uid,'send_messages') then raise exception 'ارسال پیام برای این حساب محدود شده است'; end if;
      if p_type in ('image','video') and not private.user_action_allowed(v_uid,'send_media') then raise exception 'ارسال رسانه برای این حساب محدود شده است'; end if;
      if p_type='voice' and not private.user_action_allowed(v_uid,'send_voice') then raise exception 'ارسال پیام صوتی برای این حساب محدود شده است'; end if;
      select members into v_members from public.chats where id=p_chat_id;
      if v_members is null or not(v_uid=any(v_members)) then raise exception 'عضو این گفتگو نیستید'; end if;
      if p_type not in ('text','sticker','image','video','voice') then raise exception 'نوع پیام نامعتبر است'; end if;
      if p_type in ('image','video','voice') and left(coalesce(p_media_url,''),length('storage://chat-media/'||p_chat_id||'/')) <> 'storage://chat-media/'||p_chat_id||'/' then raise exception 'رسانه نامعتبر است'; end if;
      if p_type='text' and char_length(coalesce(p_body,''))>4000 then raise exception 'پیام بیش از حد طولانی است'; end if;
      select count(*) into v_recent from public._rate_events where uid=v_uid and kind='send_message' and created_at>now()-interval '10 seconds';
      if v_recent>=20 then raise exception 'خیلی سریع پیام می‌فرستید، چند ثانیه صبر کنید'; end if;
      insert into public._rate_events(uid,kind) values(v_uid,'send_message');
      insert into public.chat_messages(chat_id,sender_id,type,body,body_enc,media_url,duration,waveform,reply_to) values(p_chat_id,v_uid,p_type,null,case when p_body is not null then extensions.pgp_sym_encrypt(p_body,public._msg_key()) else null end,p_media_url,p_duration,coalesce(p_waveform,'[]'),p_reply_to) returning * into v_msg;
      v_preview:=case p_type when 'image' then '📷 عکس' when 'video' then '🎬 ویدیو' when 'voice' then '🎙 پیام صوتی' when 'sticker' then '🧩 استیکر' else left(coalesce(p_body,''),80) end;
      select x into v_other from unnest(v_members)x where x<>v_uid limit 1;
      update public.chats set last_message=v_preview,last_message_at=now(),last_sender_id=v_uid,unread_counts=case when v_other is not null then public._jsonb_increment(unread_counts,v_other::text) else unread_counts end where id=p_chat_id;
      v_msg.body:=p_body; return v_msg;
    end;
    $f$;
  END IF;
END $$;

-- Group messages: preserve reply-aware signature.
CREATE OR REPLACE FUNCTION public.send_group_message(p_group_id uuid,p_type text,p_body text DEFAULT NULL,p_media_url text DEFAULT NULL,p_duration numeric DEFAULT NULL,p_waveform jsonb DEFAULT '[]'::jsonb,p_reply_to uuid DEFAULT NULL)
RETURNS public.group_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $f$
declare v_uid uuid:=auth.uid(); v_members uuid[]; v_sender_name text; v_msg public.group_messages; v_preview text; v_counts jsonb; m uuid; v_recent int;
begin
 if v_uid is null then raise exception 'احراز هویت لازم است'; end if;
 if not private.user_action_allowed(v_uid,'send_messages') then raise exception 'ارسال پیام برای این حساب محدود شده است'; end if;
 if p_type in ('image','video') and not private.user_action_allowed(v_uid,'send_media') then raise exception 'ارسال رسانه برای این حساب محدود شده است'; end if;
 if p_type='voice' and not private.user_action_allowed(v_uid,'send_voice') then raise exception 'ارسال پیام صوتی برای این حساب محدود شده است'; end if;
 select members into v_members from public.groups where id=p_group_id;
 if v_members is null or not(v_uid=any(v_members)) then raise exception 'عضو این گروه نیستید'; end if;
 if p_type not in ('text','sticker','image','video','voice') then raise exception 'نوع پیام نامعتبر است'; end if;
 if p_type='text' and char_length(coalesce(p_body,''))>4000 then raise exception 'پیام بیش از حد طولانی است'; end if;
 if p_type in ('image','video','voice') and left(coalesce(p_media_url,''),length('storage://group-media/'||p_group_id||'/')) <> 'storage://group-media/'||p_group_id||'/' then raise exception 'رسانه نامعتبر است'; end if;
 select count(*) into v_recent from public._rate_events where uid=v_uid and kind='send_group_message' and created_at>now()-interval '10 seconds';
 if v_recent>=20 then raise exception 'خیلی سریع پیام می‌فرستید، چند ثانیه صبر کنید'; end if;
 insert into public._rate_events(uid,kind) values(v_uid,'send_group_message');
 select display_name into v_sender_name from public.profiles where id=v_uid; v_sender_name:=coalesce(v_sender_name,'کاربر');
 insert into public.group_messages(group_id,sender_id,sender_name,type,body,media_url,duration,waveform,reply_to) values(p_group_id,v_uid,v_sender_name,p_type,p_body,p_media_url,p_duration,coalesce(p_waveform,'[]'),p_reply_to) returning * into v_msg;
 v_preview:=case p_type when 'image' then v_sender_name||': 📷 عکس' when 'video' then v_sender_name||': 🎬 ویدیو' when 'voice' then v_sender_name||': 🎙 پیام صوتی' when 'sticker' then v_sender_name||': 🧩 استیکر' else v_sender_name||': '||left(coalesce(p_body,''),60) end;
 select unread_counts into v_counts from public.groups where id=p_group_id;
 foreach m in array v_members loop if m<>v_uid then v_counts:=public._jsonb_increment(v_counts,m::text); end if; end loop;
 update public.groups set last_message=v_preview,last_message_at=now(),last_sender_id=v_uid,unread_counts=v_counts where id=p_group_id;
 return v_msg;
end; $f$;

CREATE OR REPLACE FUNCTION public.create_group(p_name text,p_member_ids uuid[])
RETURNS public.groups LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $f$
declare v_uid uuid:=auth.uid(); v_members uuid[]; v_info jsonb:='{}'; v_unread jsonb:='{}'; r record; v_row public.groups;
begin
 if v_uid is null then raise exception 'احراز هویت لازم است'; end if;
 if not private.user_action_allowed(v_uid,'create_group') then raise exception 'ساخت گروه برای این حساب محدود شده است'; end if;
 v_members:=array_append(coalesce(p_member_ids,'{}'::uuid[]),v_uid);
 for r in select id,username,display_name,photo_url from public.profiles where id=any(v_members) loop
  v_info:=jsonb_set(v_info,array[r.id::text],jsonb_build_object('username',r.username,'displayName',r.display_name,'photoURL',coalesce(r.photo_url,'')));
  v_unread:=jsonb_set(v_unread,array[r.id::text],'0');
 end loop;
 insert into public.groups(name,owner_id,admins,members,member_info,unread_counts,last_message,last_message_at,last_sender_id) values(p_name,v_uid,array[v_uid],v_members,v_info,v_unread,'گروه ساخته شد 🎉',now(),v_uid) returning * into v_row;
 return v_row;
end; $f$;

CREATE OR REPLACE FUNCTION public.get_or_create_secret_chat(p_other_uid uuid)
RETURNS public.secret_chats LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $f$
declare v_uid uuid:=auth.uid(); v_a uuid; v_b uuid; v_row public.secret_chats;
begin
 if v_uid is null then raise exception 'احراز هویت لازم است'; end if;
 if not private.user_action_allowed(v_uid,'secret_chat') then raise exception 'گفتگوی مخفی برای این حساب محدود شده است'; end if;
 if p_other_uid is null or p_other_uid=v_uid then raise exception 'کاربر مقصد نامعتبر است'; end if;
 if not exists(select 1 from auth.users where id=p_other_uid) then raise exception 'کاربر مقصد پیدا نشد'; end if;
 if v_uid<p_other_uid then v_a:=v_uid;v_b:=p_other_uid;else v_a:=p_other_uid;v_b:=v_uid;end if;
 select * into v_row from public.secret_chats where user_a=v_a and user_b=v_b;
 if found then return v_row; end if;
 insert into public.secret_chats(user_a,user_b) values(v_a,v_b) returning * into v_row; return v_row;
end; $f$;

-- Reactions.
CREATE OR REPLACE FUNCTION public.toggle_chat_reaction(p_chat_id text,p_message_id uuid,p_emoji text)
RETURNS public.chat_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $f$
declare v_uid uuid:=auth.uid(); v_reactions jsonb; v_msg public.chat_messages; v_recent int;
begin
 if v_uid is null then raise exception 'احراز هویت لازم است'; end if;
 if not private.user_action_allowed(v_uid,'react') then raise exception 'واکنش‌ها برای این حساب محدود شده است'; end if;
 if p_emoji is null or char_length(p_emoji)>32 then raise exception 'واکنش نامعتبر است'; end if;
 if not exists(select 1 from public.chats c where c.id=p_chat_id and v_uid=any(c.members)) then raise exception 'عضو این گفتگو نیستید'; end if;
 select count(*) into v_recent from public._rate_events where uid=v_uid and kind='chat_reaction' and created_at>now()-interval '10 seconds';
 if v_recent>=40 then raise exception 'تعداد واکنش‌ها زیاد است'; end if;
 insert into public._rate_events(uid,kind) values(v_uid,'chat_reaction');
 select reactions into v_reactions from public.chat_messages where id=p_message_id and chat_id=p_chat_id;
 if v_reactions is null then raise exception 'پیام پیدا نشد'; end if;
 if v_reactions->>v_uid::text=p_emoji then v_reactions:=v_reactions-v_uid::text; else v_reactions:=jsonb_set(v_reactions,array[v_uid::text],to_jsonb(p_emoji)); end if;
 update public.chat_messages set reactions=v_reactions where id=p_message_id returning * into v_msg; return v_msg;
end; $f$;

CREATE OR REPLACE FUNCTION public.toggle_group_reaction(p_group_id uuid,p_message_id uuid,p_emoji text)
RETURNS public.group_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $f$
declare v_uid uuid:=auth.uid(); v_reactions jsonb; v_msg public.group_messages; v_recent int;
begin
 if v_uid is null then raise exception 'احراز هویت لازم است'; end if;
 if not private.user_action_allowed(v_uid,'react') then raise exception 'واکنش‌ها برای این حساب محدود شده است'; end if;
 if p_emoji is null or char_length(p_emoji)>32 then raise exception 'واکنش نامعتبر است'; end if;
 if not exists(select 1 from public.groups g where g.id=p_group_id and v_uid=any(g.members)) then raise exception 'عضو این گروه نیستید'; end if;
 select count(*) into v_recent from public._rate_events where uid=v_uid and kind='group_reaction' and created_at>now()-interval '10 seconds';
 if v_recent>=40 then raise exception 'تعداد واکنش‌ها زیاد است'; end if;
 insert into public._rate_events(uid,kind) values(v_uid,'group_reaction');
 select reactions into v_reactions from public.group_messages where id=p_message_id and group_id=p_group_id;
 if v_reactions is null then raise exception 'پیام پیدا نشد'; end if;
 if v_reactions->>v_uid::text=p_emoji then v_reactions:=v_reactions-v_uid::text; else v_reactions:=jsonb_set(v_reactions,array[v_uid::text],to_jsonb(p_emoji)); end if;
 update public.group_messages set reactions=v_reactions where id=p_message_id returning * into v_msg; return v_msg;
end; $f$;

-- Secret message: replace the v3 overload used by the client.
CREATE OR REPLACE FUNCTION public.send_secret_message(p_secret_chat_id uuid,p_ciphertext text,p_iv text,p_crypto_version smallint DEFAULT 3,p_salt text DEFAULT NULL)
RETURNS public.secret_chat_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $f$
declare v_uid uuid:=auth.uid(); v_msg public.secret_chat_messages; v_recent int;
begin
 if v_uid is null then raise exception 'احراز هویت لازم است'; end if;
 if not private.user_action_allowed(v_uid,'secret_chat') then raise exception 'گفتگوی مخفی برای این حساب محدود شده است'; end if;
 if p_crypto_version not in (2,3) then raise exception 'نسخه رمزنگاری پشتیبانی نمی‌شود'; end if;
 if p_ciphertext is null or length(p_ciphertext)=0 or length(p_ciphertext)>12000 then raise exception 'پیام رمزنگاری‌شده نامعتبر است'; end if;
 if p_iv is null or length(p_iv)<>16 then raise exception 'IV نامعتبر است'; end if;
 if p_crypto_version=3 and (p_salt is null or length(p_salt)<>44) then raise exception 'نمک رمزنگاری نامعتبر است'; end if;
 if not exists(select 1 from public.secret_chats sc where sc.id=p_secret_chat_id and (v_uid=sc.user_a or v_uid=sc.user_b)) then raise exception 'عضو این گفتگوی مخفی نیستید'; end if;
 select count(*) into v_recent from public._rate_events where uid=v_uid and kind='secret_message' and created_at>now()-interval '10 seconds';
 if v_recent>=20 then raise exception 'خیلی سریع پیام می‌فرستید، چند ثانیه صبر کنید'; end if;
 insert into public._rate_events(uid,kind) values(v_uid,'secret_message');
 insert into public.secret_chat_messages(secret_chat_id,sender_id,ciphertext,iv,crypto_version,salt) values(p_secret_chat_id,v_uid,p_ciphertext,p_iv,p_crypto_version,p_salt) returning * into v_msg;
 update public.secret_chats set last_message_at=now() where id=p_secret_chat_id; return v_msg;
end; $f$;

-- Channel posts are guarded by a trigger so direct inserts cannot bypass the restriction.
CREATE OR REPLACE FUNCTION private.guard_channel_post_restriction()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $f$
begin
 if not private.user_action_allowed(auth.uid(),'send_messages') then raise exception 'ارسال پست برای این حساب محدود شده است'; end if;
 if new.type in ('image','video') and not private.user_action_allowed(auth.uid(),'send_media') then raise exception 'ارسال رسانه برای این حساب محدود شده است'; end if;
 return new;
end; $f$;
DROP TRIGGER IF EXISTS trg_guard_channel_post_restriction ON public.channel_posts;
CREATE TRIGGER trg_guard_channel_post_restriction BEFORE INSERT ON public.channel_posts FOR EACH ROW EXECUTE FUNCTION private.guard_channel_post_restriction();

CREATE OR REPLACE FUNCTION private.guard_story_restriction()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $f$
begin
 if not private.user_action_allowed(new.user_id,'story') then raise exception 'انتشار استوری برای این حساب محدود شده است'; end if;
 return new;
end; $f$;
DROP TRIGGER IF EXISTS trg_guard_story_restriction ON public.stories;
CREATE TRIGGER trg_guard_story_restriction BEFORE INSERT ON public.stories FOR EACH ROW EXECUTE FUNCTION private.guard_story_restriction();

-- Storage gates for media and story uploads.
DROP POLICY IF EXISTS chat_media_insert_auth ON storage.objects;
CREATE POLICY chat_media_insert_auth ON storage.objects FOR INSERT TO authenticated
WITH CHECK ((bucket_id='chat-media') AND (EXISTS (select 1 from public.chats c where c.id=(storage.foldername(name))[1] and (select auth.uid())=any(c.members))) AND private.user_action_allowed((select auth.uid()),'send_media'));

DROP POLICY IF EXISTS group_media_insert_auth ON storage.objects;
CREATE POLICY group_media_insert_auth ON storage.objects FOR INSERT TO authenticated
WITH CHECK ((bucket_id='group-media') AND (EXISTS (select 1 from public.groups g where g.id::text=(storage.foldername(name))[1] and (select auth.uid())=any(g.members))) AND private.user_action_allowed((select auth.uid()),'send_media'));

DROP POLICY IF EXISTS channel_media_insert_auth ON storage.objects;
CREATE POLICY channel_media_insert_auth ON storage.objects FOR INSERT TO authenticated
WITH CHECK ((bucket_id='channel-media') AND (EXISTS (select 1 from public.channels ch where ch.id::text=(storage.foldername(name))[1] and (select auth.uid())=any(ch.admins))) AND private.user_action_allowed((select auth.uid()),'send_media'));

DROP POLICY IF EXISTS story_media_insert_own ON storage.objects;
CREATE POLICY story_media_insert_own ON storage.objects FOR INSERT TO authenticated
WITH CHECK ((bucket_id='story-media') AND ((storage.foldername(name))[1]=(select auth.uid())::text) AND private.user_action_allowed((select auth.uid()),'story') AND EXISTS (select 1 from public.stories s where s.user_id=(select auth.uid()) and s.media_url=('storage://story-media/'||objects.name)));

-- Stories direct insert gate in RLS too, for defense in depth.
DROP POLICY IF EXISTS stories_insert_own ON public.stories;
CREATE POLICY stories_insert_own ON public.stories FOR INSERT TO authenticated
WITH CHECK ((select auth.uid())=user_id AND private.user_action_allowed((select auth.uid()),'story'));

-- Channel creation via direct INSERT is blocked for restricted accounts.
DROP POLICY IF EXISTS channels_insert_owner ON public.channels;
CREATE POLICY channels_insert_owner ON public.channels FOR INSERT TO authenticated
WITH CHECK (((select auth.uid())=owner_id) AND ((select auth.uid())=ANY(subscribers)) AND ((select auth.uid())=ANY(admins)) AND private.user_action_allowed((select auth.uid()),'create_channel'));

-- Group creation is RPC-gated. Existing public table insert remains unavailable to normal clients.

-- Saved messages remain available to the owner; admin restrictions can be extended later without weakening its RLS.
