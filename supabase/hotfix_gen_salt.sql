-- =====================================================================
-- وصله‌ی فوری: رفع خطای «function gen_salt(unknown) does not exist»
--
-- علت: در Supabase، اکستنشن pgcrypto معمولاً در اسکیمای extensions نصب
-- می‌شود، نه public. توابع امنیتیِ من search_path را فقط روی public
-- گذاشته بودند، پس crypt/gen_salt/pgp_sym_encrypt/pgp_sym_decrypt پیدا
-- نمی‌شدند. این وصله فقط search_path را اصلاح می‌کند — هیچ جدول/داده‌ای
-- تغییر نمی‌کند و اجرای آن کاملاً بی‌خطر و تکرارپذیر است.
--
-- این را یک‌بار در Supabase SQL Editor اجرا کن (نیازی به اجرای دوباره‌ی
-- کل migration_3 نیست).
-- =====================================================================

create or replace function public.set_app_lock_pin(p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_pin is null or length(p_pin) < 4 then
    raise exception 'رمز باید حداقل ۴ رقم باشد';
  end if;
  insert into public.security_settings (uid, app_lock_enabled, app_lock_pin_hash)
  values (auth.uid(), true, crypt(p_pin, gen_salt('bf')))
  on conflict (uid) do update set app_lock_enabled = true, app_lock_pin_hash = crypt(p_pin, gen_salt('bf')), updated_at = now();
end;
$$;

create or replace function public.verify_app_lock_pin(p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text; v_uid uuid := auth.uid(); v_calls int;
begin
  select count(*) into v_calls from public._rate_events
  where uid = v_uid and kind = 'pin_attempt' and created_at > now() - interval '10 minutes';
  if v_calls > 10 then
    raise exception 'تعداد تلاش‌های اشتباه زیاد بود، ۱۰ دقیقه صبر کنید';
  end if;
  insert into public._rate_events (uid, kind) values (v_uid, 'pin_attempt');

  select app_lock_pin_hash into v_hash from public.security_settings where uid = v_uid;
  if v_hash is null then return false; end if;
  return v_hash = crypt(p_pin, v_hash);
end;
$$;

create or replace function public.disable_app_lock() returns void
language sql security definer set search_path = public, extensions as $$
  update public.security_settings set app_lock_enabled = false, app_lock_pin_hash = null, biometric_enabled = false
  where uid = auth.uid();
$$;

create or replace function public.set_recovery_key(p_code text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.security_settings (uid, recovery_key_hash)
  values (auth.uid(), crypt(p_code, gen_salt('bf')))
  on conflict (uid) do update set recovery_key_hash = crypt(p_code, gen_salt('bf')), updated_at = now();
end;
$$;

create or replace function public.use_recovery_key(p_code text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text; v_uid uuid := auth.uid();
begin
  select recovery_key_hash into v_hash from public.security_settings where uid = v_uid;
  if v_hash is null or v_hash != crypt(p_code, v_hash) then return false; end if;
  update public.security_settings set
    app_lock_enabled = false, app_lock_pin_hash = null, biometric_enabled = false,
    twofa_enabled = false, twofa_secret_enc = null
  where uid = v_uid;
  return true;
end;
$$;

create or replace function public.set_twofa_secret(p_secret_base32 text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.security_settings (uid, twofa_secret_enc, twofa_enabled)
  values (auth.uid(), pgp_sym_encrypt(p_secret_base32, public._msg_key()), false)
  on conflict (uid) do update set twofa_secret_enc = pgp_sym_encrypt(p_secret_base32, public._msg_key()), updated_at = now();
end;
$$;

create or replace function public.get_twofa_secret_for_verification() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_enc text;
begin
  select twofa_secret_enc into v_enc from public.security_settings where uid = auth.uid();
  if v_enc is null then return null; end if;
  return pgp_sym_decrypt(v_enc::bytea, public._msg_key());
end;
$$;

create or replace function public.send_chat_message(
  p_chat_id text, p_type text, p_body text default null, p_media_url text default null,
  p_duration numeric default null, p_waveform jsonb default '[]', p_reply_to uuid default null
) returns public.chat_messages
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_members uuid[];
  v_other uuid;
  v_msg public.chat_messages;
  v_preview text;
  v_recent int;
begin
  select members into v_members from public.chats where id = p_chat_id;
  if v_members is null or not (v_uid = any(v_members)) then
    raise exception 'عضو این گفتگو نیستید';
  end if;

  select count(*) into v_recent from public._rate_events
  where uid = v_uid and kind = 'send_message' and created_at > now() - interval '10 seconds';
  if v_recent >= 20 then
    raise exception 'خیلی سریع پیام می‌فرستید، چند ثانیه صبر کنید';
  end if;
  insert into public._rate_events (uid, kind) values (v_uid, 'send_message');

  insert into public.chat_messages (chat_id, sender_id, type, body, body_enc, media_url, duration, waveform, reply_to)
  values (
    p_chat_id, v_uid, p_type, null,
    case when p_body is not null then pgp_sym_encrypt(p_body, public._msg_key()) else null end,
    p_media_url, p_duration, coalesce(p_waveform, '[]'), p_reply_to
  )
  returning * into v_msg;

  v_preview := case p_type
    when 'image' then '📷 عکس'
    when 'voice' then '🎙 پیام صوتی'
    else left(coalesce(p_body, ''), 80)
  end;

  select x into v_other from unnest(v_members) x where x <> v_uid limit 1;

  update public.chats set
    last_message = v_preview, last_message_at = now(), last_sender_id = v_uid,
    unread_counts = case when v_other is not null then public._jsonb_increment(unread_counts, v_other::text) else unread_counts end
  where id = p_chat_id;

  v_msg.body := p_body;
  return v_msg;
end;
$$;

create or replace function public.get_chat_messages(p_chat_id text)
returns table (
  id uuid, chat_id text, sender_id uuid, type text, body text, media_url text,
  duration numeric, waveform jsonb, reactions jsonb, created_at timestamptz, reply_to uuid
)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from public.chats c where c.id = p_chat_id and auth.uid() = any(c.members)) then
    raise exception 'عضو این گفتگو نیستید';
  end if;
  return query
    select m.id, m.chat_id, m.sender_id, m.type,
      case when m.body_enc is not null then pgp_sym_decrypt(m.body_enc, public._msg_key()) else m.body end,
      m.media_url, m.duration, m.waveform, m.reactions, m.created_at, m.reply_to
    from public.chat_messages m
    where m.chat_id = p_chat_id
    order by m.created_at asc
    limit 200;
end;
$$;
