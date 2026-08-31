-- =====================================================================
-- وصله‌ی امنیتی: جلوگیری از Stored XSS از طریق نوع پیام «استیکر»
--
-- مشکل: تابع send_chat_message هر p_type/p_body دلخواهی را قبول می‌کرد، و
-- سمت کلاینت مقدار استیکر بدون escape مستقیم در صفحه رندر می‌شد. یعنی هرکس
-- (نه لزوماً هکر حرفه‌ای — کافی بود از Console مرورگر تابع را مستقیم صدا بزند)
-- می‌توانست به‌جای ایموجی، کد HTML/جاوااسکریپت بفرستد که برای طرف مقابلِ چت
-- در لحظه‌ی بازکردن پیام اجرا می‌شد (سرقت نشست/کوکی و مشابه آن).
--
-- این وصله را یک‌بار در Supabase SQL Editor اجرا کن. هیچ داده‌ای تغییر
-- نمی‌کند، فقط اعتبارسنجی به تابع اضافه می‌شود. سمت کلاینت هم باید نسخه‌ی
-- به‌روز js/ui.js (که escapeHtml روی استیکر هم اعمال می‌کند) دیپلوی شود.
-- =====================================================================

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

  if p_type not in ('text', 'sticker', 'image', 'voice') then
    raise exception 'نوع پیام نامعتبر است';
  end if;
  if p_type = 'sticker' and (p_body is null or p_body <> all (array[
    '😀','😂','😍','😎','🥳','😭','😡','👍','👎','❤️','🔥','🎉','🙏','👏','😴','🤔','😱','🥰','😇','🤝'
  ])) then
    raise exception 'استیکر نامعتبر است';
  end if;
  if p_type = 'text' and (p_body is null or length(trim(p_body)) = 0) then
    raise exception 'متن پیام نمی‌تواند خالی باشد';
  end if;
  if p_type in ('image', 'voice') and (p_media_url is null or length(trim(p_media_url)) = 0) then
    raise exception 'رسانه‌ای برای این پیام مشخص نشده';
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
