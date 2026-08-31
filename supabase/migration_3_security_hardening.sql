-- =====================================================================
-- هویت — مهاجرت امنیتی شماره ۳: رفع نشتی پروفایل + قفل/۲مرحله‌ای/نشست‌ها
-- + رمزگذاری در سطح دیتابیس برای متن پیام‌های خصوصی + محدودسازی نرخ ارسال.
--
-- این فایل را یک‌بار در Supabase Dashboard → SQL Editor اجرا کنید،
-- بعد از migration_2. نیازی به اجرای دوباره schema.sql نیست.
--
-- ⚠️ مهم — این را قبل از اجرا بخوانید:
-- ۱) باکت‌های "chat-media" و "group-media" را می‌توانید بعد از این مهاجرت
--    روی Private تنظیم کنید (Storage → bucket → Make private) و اپ را برای
--    استفاده از createSignedUrl به‌روزرسانی کنید؛ در حالت public فعلی،
--    هرکس لینک مستقیم فایل را داشته باشد می‌تواند بدون توکن آن را ببیند
--    (این محدودیت خود Supabase Storage است، نه یک باگ کد). جزئیات در
--    SECURITY.md بخش "رسانه‌ها".
-- ۲) رمزگذاریِ اینجا "رمزگذاری در حالت سکون" با کلید سمت سرور است، نه
--    E2E واقعی (کلید هرگز روی دستگاه کاربر نیست) — چون پنل مدیریت باید
--    بتواند پیام‌های گزارش‌شده را بازبینی کند. تفاوت در SECURITY.md توضیح
--    داده شده.
-- =====================================================================

-- ---------------------------------------------------------------------
-- بخش ۰) جدول اسرار سمت سرور — هیچ کلاینتی (even با auth) اجازه select
--    ندارد؛ فقط توابع SECURITY DEFINER می‌توانند بخوانند.
-- ---------------------------------------------------------------------
create table if not exists public._server_secrets (
  key   text primary key,
  value text not null
);
alter table public._server_secrets enable row level security;
-- هیچ policy‌ای برای select/insert/update/delete تعریف نمی‌شود => بدون هیچ policy
-- و با RLS روشن، هیچ نقشی (anon/authenticated) دسترسی مستقیم ندارد.
-- فقط SECURITY DEFINER (که به‌صورت پیش‌فرض RLS را دور می‌زند) می‌تواند بخواند.

insert into public._server_secrets (key, value)
values ('msg_enc_key', encode(gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

create or replace function public._msg_key() returns text
language sql security definer set search_path = public, extensions as $$
  select value from public._server_secrets where key = 'msg_enc_key';
$$;

-- =====================================================================
-- بخش ۱) رفع نشتی بحرانی: هر کاربر لاگین‌کرده می‌توانست کل جدول profiles
--    (شامل شماره تلفن) را بدون داشتن یوزرنیم/آیدی کسی ببیند.
-- =====================================================================
drop policy if exists "profiles_select_authenticated" on public.profiles;

-- از این به بعد: هرکس فقط ردیف خودش، یا ردیف کسی که با او در یک چت خصوصی/گروه
-- مشترک است را می‌تواند مستقیماً از جدول بخواند (لازم برای نمایش وضعیت آنلاین/تیک
-- آبی طرفِ چت‌های موجود). دیدن کاربرِ ناشناس («غریبه») از این مسیر ممکن نیست.
create policy "profiles_select_self_or_contact" on public.profiles
  for select using (
    auth.uid() = id
    or exists (
      select 1 from public.chats c
      where c.members @> array[auth.uid(), profiles.id]::uuid[]
    )
    or exists (
      select 1 from public.groups g
      where auth.uid() = any(g.members) and profiles.id = any(g.members)
    )
  );

-- جستجوی یوزرنیم برای «شروع چت جدید» از این تابع عبور می‌کند، نه از جدول مستقیم:
-- فقط با تطابق دقیق username (نه جستجوی جزئی/لیست کامل)، و فقط فیلدهای عمومیِ
-- بی‌خطر را برمی‌گرداند — هرگز phone.
create or replace function public.search_profile_by_username(p_username text)
returns table (
  id uuid, username text, display_name text, photo_url text, bio text, verified boolean, online boolean
)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uname text := lower(regexp_replace(trim(p_username), '^@', ''));
  v_uid uuid := auth.uid();
  v_calls int;
begin
  if v_uid is null then raise exception 'ورود لازم است'; end if;
  if v_uname !~ '^[a-z0-9_]{3,20}$' then return; end if;

  -- ضدِ کاوش/بروت‌فورس یوزرنیم: حداکثر ۳۰ جستجو در هر ۱۰ دقیقه برای هر کاربر
  select count(*) into v_calls from public._rate_events
  where uid = v_uid and kind = 'username_search' and created_at > now() - interval '10 minutes';
  if v_calls > 30 then
    raise exception 'تعداد جستجوها بیش از حد مجاز است، کمی بعد دوباره تلاش کنید';
  end if;
  insert into public._rate_events (uid, kind) values (v_uid, 'username_search');

  return query
    select p.id, p.username, p.display_name, p.photo_url, p.bio, p.verified, p.online
    from public.profiles p
    where p.username = v_uname;
end;
$$;

-- =====================================================================
-- بخش ۲) جدول عمومی رویدادهای نرخ‌محدودشونده (ضد اسپم/بروت‌فورس ساده)
-- =====================================================================
create table if not exists public._rate_events (
  id          bigint generated always as identity primary key,
  uid         uuid not null,
  kind        text not null,
  created_at  timestamptz not null default now()
);
alter table public._rate_events enable row level security;
-- بدون policy => بدون دسترسی مستقیم؛ فقط توابع SECURITY DEFINER استفاده می‌کنند.

create index if not exists idx_rate_events_uid_kind_time on public._rate_events (uid, kind, created_at);

-- پاک‌سازی دوره‌ای رویدادهای قدیمی (اختیاری، از طریق pg_cron قابل زمان‌بندی است)
create or replace function public.cleanup_rate_events() returns void
language sql security definer set search_path = public, extensions as $$
  delete from public._rate_events where created_at < now() - interval '1 day';
$$;

-- =====================================================================
-- بخش ۳) نشست‌ها/دستگاه‌ها + تاریخچه ورود + هشدار دستگاه جدید
-- =====================================================================
create table if not exists public.user_sessions (
  id            uuid primary key default gen_random_uuid(),
  uid           uuid not null references auth.users(id) on delete cascade,
  device_id     text not null,          -- شناسه پایدار دستگاه (در مرورگر کاربر ساخته و ذخیره می‌شود)
  device_label  text not null default 'دستگاه ناشناس',
  user_agent    text not null default '',
  created_at    timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  revoked_at    timestamptz,
  unique (uid, device_id)
);
alter table public.user_sessions enable row level security;
create policy "sessions_select_own" on public.user_sessions for select using (auth.uid() = uid);
create policy "sessions_delete_own" on public.user_sessions for delete using (auth.uid() = uid);
-- insert/update فقط از طریق تابع زیر (نه مستقیم)، تا last_active_at/برچسب‌ها دستکاری نشوند.

create table if not exists public.login_events (
  id           bigint generated always as identity primary key,
  uid          uuid not null references auth.users(id) on delete cascade,
  device_id    text not null,
  device_label text not null default 'دستگاه ناشناس',
  is_new_device boolean not null default false,
  created_at   timestamptz not null default now()
);
alter table public.login_events enable row level security;
create policy "login_events_select_own" on public.login_events for select using (auth.uid() = uid);

-- این تابع در لحظه‌ی ورود (بعد از auth) از کلاینت صدا زده می‌شود.
-- برمی‌گرداند: آیا این دستگاه برای این کاربر جدید بود یا نه (برای نمایش هشدار).
create or replace function public.register_session(p_device_id text, p_device_label text, p_user_agent text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_is_new boolean;
begin
  if v_uid is null then raise exception 'ورود لازم است'; end if;

  select not exists (
    select 1 from public.user_sessions where uid = v_uid and device_id = p_device_id
  ) into v_is_new;

  insert into public.user_sessions (uid, device_id, device_label, user_agent)
  values (v_uid, p_device_id, coalesce(nullif(p_device_label, ''), 'دستگاه ناشناس'), coalesce(p_user_agent, ''))
  on conflict (uid, device_id) do update
    set last_active_at = now(), revoked_at = null, device_label = excluded.device_label;

  insert into public.login_events (uid, device_id, device_label, is_new_device)
  values (v_uid, p_device_id, coalesce(nullif(p_device_label, ''), 'دستگاه ناشناس'), v_is_new);

  return v_is_new;
end;
$$;

-- خروج از راه دور: کاربر یک نشست (دستگاه) دیگرِ خودش را حذف می‌کند.
-- توجه: این ردیف را حذف می‌کند و اپ در آن دستگاه در اولین فراخوانی متوجه
-- می‌شود و کاربر را از حالت لاگین محلی خارج می‌کند؛ برای باطل کردن فوریِ
-- توکن JWT خود Supabase Auth، نیاز به یک Edge Function با service-role است
-- (چون آن عملیات نیاز به کلیدی دارد که هرگز نباید در کلاینت باشد) —
-- جزئیات در SECURITY.md.
create or replace function public.revoke_session(p_device_id text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from public.user_sessions where uid = auth.uid() and device_id = p_device_id;
$$;

-- =====================================================================
-- بخش ۴) تنظیمات امنیتی هر کاربر: قفل برنامه، ۲مرحله‌ای، پاک‌سازی خودکار،
--    ضدفوروارد/اسکرین‌شات (سطح ترجیح کاربر)، هش کلید بازیابی
-- =====================================================================
create table if not exists public.security_settings (
  uid                   uuid primary key references auth.users(id) on delete cascade,
  app_lock_enabled      boolean not null default false,
  app_lock_pin_hash     text,                         -- هش PIN (هرگز متن ساده ذخیره نمی‌شود)
  biometric_enabled     boolean not null default false,
  webauthn_credential_id text,                         -- شناسه اعتبارنامه WebAuthn (اثر انگشت/چهره/کلید سخت‌افزاری)
  twofa_enabled         boolean not null default false,
  twofa_secret_enc      text,                          -- سکرت TOTP، رمزنگاری‌شده با pgcrypto
  recovery_key_hash     text,                          -- هش کد بازیابی (اگر ۲مرحله‌ای/قفل را گم کرد)
  auto_delete_days      int not null default 0 check (auto_delete_days >= 0),  -- ۰ = خاموش
  block_forwarding      boolean not null default true, -- پیش‌فرض: فوروارد پیام خصوصی غیرفعال
  screenshot_shield     boolean not null default false,
  updated_at            timestamptz not null default now()
);
alter table public.security_settings enable row level security;
create policy "security_settings_own" on public.security_settings for select using (auth.uid() = uid);
create policy "security_settings_upsert_own" on public.security_settings for insert with check (auth.uid() = uid);
create policy "security_settings_update_own" on public.security_settings for update using (auth.uid() = uid);

-- تنظیم PIN قفل برنامه (هش شده سمت سرور با pgcrypto؛ کلاینت هرگز PIN خام را ذخیره نمی‌کند)
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

-- کد بازیابی: کلاینت یک کد تصادفی می‌سازد و فقط هشش را اینجا ذخیره می‌کند؛
-- خودِ کد فقط یک‌بار به کاربر نمایش داده می‌شود و جایی ذخیره نمی‌گردد.
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

-- ۲مرحله‌ای (TOTP): سکرت با کلید سرور رمزنگاری می‌شود؛ تایید کد در کلاینت با
-- Web Crypto (HMAC-SHA1) محاسبه می‌گردد چون سکرت باید حداقل یک‌بار پیش خودِ
-- کاربر باشد تا در Authenticator App اسکن شود؛ اینجا فقط ذخیره/فعال‌سازی را
-- کنترل می‌کنیم.
create or replace function public.set_twofa_secret(p_secret_base32 text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.security_settings (uid, twofa_secret_enc, twofa_enabled)
  values (auth.uid(), pgp_sym_encrypt(p_secret_base32, public._msg_key()), false)
  on conflict (uid) do update set twofa_secret_enc = pgp_sym_encrypt(p_secret_base32, public._msg_key()), updated_at = now();
end;
$$;

create or replace function public.confirm_twofa_enable() returns void
language sql security definer set search_path = public, extensions as $$
  update public.security_settings set twofa_enabled = true, updated_at = now() where uid = auth.uid();
$$;

create or replace function public.disable_twofa() returns void
language sql security definer set search_path = public, extensions as $$
  update public.security_settings set twofa_enabled = false, twofa_secret_enc = null, updated_at = now() where uid = auth.uid();
$$;

-- کلاینت برای تایید کد ۶رقمی به سکرت رمزگشایی‌شده نیاز دارد (فقط پس از
-- احراز نشست فعلی)؛ این تابع فقط برای صاحبِ حساب سکرت را برمی‌گرداند.
create or replace function public.get_twofa_secret_for_verification() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_enc text;
begin
  select twofa_secret_enc into v_enc from public.security_settings where uid = auth.uid();
  if v_enc is null then return null; end if;
  return pgp_sym_decrypt(v_enc::bytea, public._msg_key());
end;
$$;

-- =====================================================================
-- بخش ۵) محدودسازی نرخ ارسال پیام (ضد اسپم/ربات) + رمزگذاری در حالت سکون
--    برای متن پیام‌های خصوصی. توابع insert/select پیام‌ها جایگزین می‌شوند.
--
-- ⚠️ نکته مهم سازگاری: نسخه‌ی فعلی کلاینت (chat.js) پارامتر p_reply_to را
--    هنگام ارسال پیام می‌فرستد و ستون reply_to را هنگام خواندن انتظار دارد.
--    این تابع همان رفتار را حفظ می‌کند — فقط رمزگذاری/ضداسپم را اضافه کرده‌ایم.
--    اگر ستون reply_to از قبل روی جدول شما نیست (مثلاً روی یک دیتابیس تازه از
--    schema.sql پایه)، خط زیر آن را اضافه می‌کند؛ اگر از قبل هست، بی‌خطر رد
--    می‌شود.
-- =====================================================================
alter table public.chat_messages add column if not exists body_enc bytea;
alter table public.chat_messages add column if not exists reply_to uuid references public.chat_messages(id);

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

  -- امنیتی: قبلاً کلاینت هر p_type/p_body دلخواهی می‌توانست بفرستد و UI مقدار
  -- استیکر را بدون escape رندر می‌کرد — یعنی هرکس با صدا زدن مستقیم این تابع
  -- (نه لزوماً از توی اپ) می‌توانست به‌جای استیکر، HTML/اسکریپت بفرستد که برای
  -- طرف مقابل اجرا شود (Stored XSS). اینجا هم نوع پیام و هم محتوای استیکر را
  -- محدود به مقادیر مجاز می‌کنیم؛ سمت کلاینت هم escapeHtml اضافه شد (دفاع دوگانه).
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

  -- ضد اسپم: حداکثر ۲۰ پیام در هر ۱۰ ثانیه برای هر کاربر (در همه چت‌ها)
  select count(*) into v_recent from public._rate_events
  where uid = v_uid and kind = 'send_message' and created_at > now() - interval '10 seconds';
  if v_recent >= 20 then
    raise exception 'خیلی سریع پیام می‌فرستید، چند ثانیه صبر کنید';
  end if;
  insert into public._rate_events (uid, kind) values (v_uid, 'send_message');

  insert into public.chat_messages (chat_id, sender_id, type, body, body_enc, media_url, duration, waveform, reply_to)
  values (
    p_chat_id, v_uid, p_type,
    null,  -- متن خام هرگز ذخیره نمی‌شود
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
    last_message = v_preview,
    last_message_at = now(),
    last_sender_id = v_uid,
    unread_counts = case when v_other is not null
      then public._jsonb_increment(unread_counts, v_other::text)
      else unread_counts end
  where id = p_chat_id;

  -- به کلاینت متن خام را برمی‌گردانیم (برای نمایش فوری)، هرچند در دیتابیس رمزنگاری‌شده ذخیره شد
  v_msg.body := p_body;
  return v_msg;
end;
$$;

-- خواندن پیام‌های یک چت: چون body اکنون رمزنگاری‌شده در body_enc ذخیره می‌شود،
-- کلاینت باید از این تابع بخواند نه select مستقیم از جدول (که فقط bytea خام می‌دهد).
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

-- =====================================================================
-- بخش ۶) پاک‌سازی خودکار پیام‌های قدیمی (بر اساس ترجیح هر کاربر)
--    نکته: این تابع را باید با pg_cron یا یک Supabase Scheduled Function
--    هر روز صدا بزنید؛ از کلاینت صدا زده نمی‌شود.
--    مثال زمان‌بندی (در SQL Editor، پروژه‌های با pg_cron فعال):
--      select cron.schedule('cleanup-old-messages', '0 3 * * *',
--        $$select public.cleanup_expired_messages()$$);
-- =====================================================================
create or replace function public.cleanup_expired_messages() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  for r in select uid, auto_delete_days from public.security_settings where auto_delete_days > 0 loop
    delete from public.chat_messages m
    using public.chats c
    where m.chat_id = c.id
      and r.uid = any(c.members)
      and m.created_at < now() - (r.auto_delete_days || ' days')::interval;
  end loop;
end;
$$;

-- =====================================================================
-- بخش ۷) گزارش فعالیت مشکوک (ساده/قانون‌محور — نه یادگیری ماشین واقعی):
--    شمارش رویدادهای پرخطر اخیر برای نمایش «امتیاز امنیت» در کلاینت.
-- =====================================================================
create or replace function public.get_recent_risk_signals()
returns table (kind text, cnt bigint)
language sql security definer set search_path = public, extensions as $$
  select kind, count(*) from public._rate_events
  where uid = auth.uid() and created_at > now() - interval '24 hours'
  group by kind;
$$;
