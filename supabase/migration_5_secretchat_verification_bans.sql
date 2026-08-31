-- =====================================================================
-- هویت — مهاجرت شماره ۵: چهار بخش مستقل
--   ۱) بک‌اند گفتگوی مخفی (تا الان اصلاً migrate نشده بود — یعنی
--      js/secretchat.js از اول کار نمی‌کرد)
--   ۲) تیک آبی برای کانال (تا الان فقط پروفایل کاربر داشت)
--   ۳) سیستم «درخواست تیک آبی» با متن توضیح + نمایش کامل در پنل ادمین
--   ۴) مسدودسازی موقت/دائم کاربر (بن) — کاربر مسدود نمی‌تواند در هیچ‌کدام
--      از چت خصوصی/گروه/کانال/چت مخفی پیام بفرستد؛ تاریخ پایان + دلیل هم
--      به خودش نمایش داده می‌شود.
--
-- ترتیب اجرا: بعد از migration_4_group_blocking.sql و همه‌ی hotfixها.
-- کاملاً افزایشی و امن برای اجرای دوباره است (همه‌جا if not exists/or replace).
-- =====================================================================

-- =====================================================================
-- بخش ۱) گفتگوی مخفی — E2E واقعی، جدا از چت اصلی، ۴ ساعت بعد از آخرین
-- پیام کاملاً از دیتابیس پاک می‌شود.
-- =====================================================================
alter table public.profiles add column if not exists secret_pubkey jsonb;

create table if not exists public.secret_chats (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references auth.users(id) on delete cascade,
  user_b          uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint secret_chats_distinct_users check (user_a <> user_b),
  constraint secret_chats_unique_pair unique (user_a, user_b)
);
alter table public.secret_chats enable row level security;

drop policy if exists "secret_chats_select_own" on public.secret_chats;
create policy "secret_chats_select_own" on public.secret_chats for select using (
  auth.uid() = user_a or auth.uid() = user_b
);

create table if not exists public.secret_chat_messages (
  id              uuid primary key default gen_random_uuid(),
  secret_chat_id  uuid not null references public.secret_chats(id) on delete cascade,
  sender_id       uuid not null references auth.users(id),
  ciphertext      text not null,
  iv              text not null,
  created_at      timestamptz not null default now(),
  check (char_length(ciphertext) <= 8000)
);
alter table public.secret_chat_messages enable row level security;

drop policy if exists "secret_chat_messages_select" on public.secret_chat_messages;
create policy "secret_chat_messages_select" on public.secret_chat_messages for select using (
  exists (
    select 1 from public.secret_chats sc
    where sc.id = secret_chat_id and (auth.uid() = sc.user_a or auth.uid() = sc.user_b)
  )
);

create or replace function public.get_or_create_secret_chat(p_other_uid uuid)
returns public.secret_chats
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_a uuid; v_b uuid;
  v_row public.secret_chats;
begin
  if p_other_uid = v_uid then
    raise exception 'نمی‌توانید با خودتان گفتگوی مخفی بسازید';
  end if;
  if p_other_uid is null or not exists (select 1 from auth.users u where u.id = p_other_uid) then
    raise exception 'کاربر مقصد پیدا نشد';
  end if;

  if v_uid < p_other_uid then v_a := v_uid; v_b := p_other_uid;
  else v_a := p_other_uid; v_b := v_uid; end if;

  select * into v_row from public.secret_chats where user_a = v_a and user_b = v_b;
  if found then return v_row; end if;

  insert into public.secret_chats (user_a, user_b) values (v_a, v_b)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.send_secret_message(p_secret_chat_id uuid, p_ciphertext text, p_iv text)
returns public.secret_chat_messages
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_msg public.secret_chat_messages;
  v_recent int;
begin
  if not exists (
    select 1 from public.secret_chats sc
    where sc.id = p_secret_chat_id and (v_uid = sc.user_a or v_uid = sc.user_b)
  ) then
    raise exception 'عضو این گفتگوی مخفی نیستید';
  end if;
  if p_ciphertext is null or length(p_ciphertext) = 0 or p_iv is null or length(p_iv) = 0 then
    raise exception 'پیام نامعتبر است';
  end if;

  select count(*) into v_recent from public._rate_events
  where uid = v_uid and kind = 'secret_message' and created_at > now() - interval '10 seconds';
  if v_recent >= 20 then
    raise exception 'خیلی سریع پیام می‌فرستید، چند ثانیه صبر کنید';
  end if;
  insert into public._rate_events (uid, kind) values (v_uid, 'secret_message');

  insert into public.secret_chat_messages (secret_chat_id, sender_id, ciphertext, iv)
  values (p_secret_chat_id, v_uid, p_ciphertext, p_iv)
  returning * into v_msg;

  update public.secret_chats set last_message_at = now() where id = p_secret_chat_id;

  return v_msg;
end;
$$;

create or replace function public.cleanup_expired_secret_chats()
returns void language sql security definer set search_path = public as $$
  delete from public.secret_chats where last_message_at < now() - interval '4 hours';
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'secret_chats'
  ) then
    alter publication supabase_realtime add table public.secret_chats;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'secret_chat_messages'
  ) then
    alter publication supabase_realtime add table public.secret_chat_messages;
  end if;
end $$;

-- =====================================================================
-- بخش ۲) تیک آبی برای کانال
-- =====================================================================
alter table public.channels add column if not exists verified boolean not null default false;

create or replace function public._protect_channel_verified() returns trigger
language plpgsql as $$
begin
  if new.verified is distinct from old.verified and not public.is_admin() then
    raise exception 'فقط ادمین هویت می‌تواند وضعیت تایید کانال را تغییر دهد';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_protect_channel_verified on public.channels;
create trigger trg_protect_channel_verified before update on public.channels
for each row execute function public._protect_channel_verified();

-- =====================================================================
-- بخش ۳) درخواست تیک آبی — هم برای حساب، هم برای کانال
-- =====================================================================
create table if not exists public.verification_requests (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references auth.users(id) on delete cascade,
  target_type   text not null check (target_type in ('account', 'channel')),
  target_id     uuid not null,
  message       text not null check (char_length(message) between 1 and 1000),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note    text,
  reviewed_by   uuid references auth.users(id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.verification_requests enable row level security;

drop policy if exists "verification_requests_select_own_or_admin" on public.verification_requests;
create policy "verification_requests_select_own_or_admin" on public.verification_requests for select using (
  requester_id = auth.uid() or public.is_admin()
);
drop policy if exists "verification_requests_admin_update" on public.verification_requests;
create policy "verification_requests_admin_update" on public.verification_requests for update using (
  public.is_admin()
);

create or replace function public.submit_verification_request(
  p_target_type text, p_target_id uuid, p_message text
) returns public.verification_requests
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_row public.verification_requests;
  v_open_count int;
begin
  if p_target_type not in ('account', 'channel') then
    raise exception 'نوع درخواست نامعتبر است';
  end if;
  if p_message is null or length(trim(p_message)) = 0 then
    raise exception 'توضیح درخواست نمی‌تواند خالی باشد';
  end if;

  if p_target_type = 'account' then
    if p_target_id <> v_uid then
      raise exception 'فقط می‌توانید برای حساب خودتان درخواست بدهید';
    end if;
    if exists (select 1 from public.profiles where id = v_uid and verified) then
      raise exception 'حساب شما از قبل تاییدشده است';
    end if;
  else
    if not exists (select 1 from public.channels c where c.id = p_target_id and v_uid = any(c.admins)) then
      raise exception 'فقط ادمین‌های این کانال می‌توانند برای آن درخواست تایید بدهند';
    end if;
    if exists (select 1 from public.channels where id = p_target_id and verified) then
      raise exception 'این کانال از قبل تاییدشده است';
    end if;
  end if;

  select count(*) into v_open_count from public.verification_requests
  where target_type = p_target_type and target_id = p_target_id and status = 'pending';
  if v_open_count > 0 then
    raise exception 'یک درخواست در انتظار بررسی برای همین مورد از قبل ثبت شده است';
  end if;

  insert into public.verification_requests (requester_id, target_type, target_id, message)
  values (v_uid, p_target_type, p_target_id, trim(p_message))
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.admin_review_verification_request(
  p_request_id uuid, p_approve boolean, p_admin_note text default null
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_req public.verification_requests;
begin
  if not public.is_admin() then
    raise exception 'فقط ادمین می‌تواند درخواست‌ها را بررسی کند';
  end if;
  select * into v_req from public.verification_requests where id = p_request_id;
  if not found then raise exception 'درخواست پیدا نشد'; end if;
  if v_req.status <> 'pending' then raise exception 'این درخواست قبلاً بررسی شده'; end if;

  update public.verification_requests set
    status = case when p_approve then 'approved' else 'rejected' end,
    admin_note = p_admin_note, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id;

  if p_approve then
    if v_req.target_type = 'account' then
      update public.profiles set verified = true where id = v_req.target_id;
    else
      update public.channels set verified = true where id = v_req.target_id;
    end if;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'verification_requests'
  ) then
    alter publication supabase_realtime add table public.verification_requests;
  end if;
end $$;

-- =====================================================================
-- بخش ۴) مسدودسازی (بن) کاربر — موقت یا دائم
-- =====================================================================
alter table public.profiles add column if not exists suspended_until timestamptz;
alter table public.profiles add column if not exists suspension_reason text;

-- فقط ادمین می‌تواند این دو فیلد را تغییر دهد (مثل verified، یک تریگر مستقل)
create or replace function public._protect_suspension_fields() returns trigger
language plpgsql as $$
begin
  if (new.suspended_until is distinct from old.suspended_until
      or new.suspension_reason is distinct from old.suspension_reason)
     and not public.is_admin() then
    raise exception 'فقط ادمین می‌تواند وضعیت مسدودی حساب را تغییر دهد';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_protect_suspension on public.profiles;
create trigger trg_protect_suspension before update on public.profiles
for each row execute function public._protect_suspension_fields();

/** ادمین یک کاربر را مسدود می‌کند. p_days=0 یعنی مسدودی همیشگی (تا وقتی
 * خودش آزادش کند) — عملاً با ۱۰۰ سال جلوتر شبیه‌سازی شده تا از nullable
 * timestamptz برای "همیشگی" راحت‌تر استفاده شود. */
create or replace function public.admin_suspend_user(p_uid uuid, p_days int, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'فقط ادمین می‌تواند کاربر را مسدود کند';
  end if;
  update public.profiles set
    suspended_until = now() + make_interval(days => case when p_days <= 0 then 36500 else p_days end),
    suspension_reason = coalesce(nullif(trim(p_reason), ''), 'نقض قوانین هویت')
  where id = p_uid;
end;
$$;

create or replace function public.admin_unsuspend_user(p_uid uuid)
returns void
language sql security definer set search_path = public as $$
  update public.profiles set suspended_until = null, suspension_reason = null
  where id = p_uid and public.is_admin();
$$;

-- گارد یکسان روی هر ۴ جدول پیام: قبل از درج، اگر فرستنده الان مسدود است رد کن.
-- عمداً به‌جای دست‌کاری کدهای send_chat_message/send_group_message/
-- post_channel_message (که نمی‌بینمشان و ریسک بازنویسی اشتباهِ منطق rate-limit/
-- بلاک‌گروه/XSS داخلشان را دارد)، یک تریگر مستقل و افزایشی روی خودِ جدول‌ها
-- گذاشته شده — امن‌ترین راه برای اضافه‌کردن این قابلیت بدون لمس چیزی که نمی‌بینم.
create or replace function public._block_if_suspended() returns trigger
language plpgsql as $$
declare
  v_until timestamptz;
  v_reason text;
begin
  select suspended_until, suspension_reason into v_until, v_reason
  from public.profiles where id = new.sender_id;
  if v_until is not null and v_until > now() then
    raise exception 'ACCOUNT_SUSPENDED|%|%', v_until, coalesce(v_reason, 'نقض قوانین');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_if_suspended on public.chat_messages;
create trigger trg_block_if_suspended before insert on public.chat_messages
for each row execute function public._block_if_suspended();

drop trigger if exists trg_block_if_suspended on public.group_messages;
create trigger trg_block_if_suspended before insert on public.group_messages
for each row execute function public._block_if_suspended();

drop trigger if exists trg_block_if_suspended on public.channel_posts;
create trigger trg_block_if_suspended before insert on public.channel_posts
for each row execute function public._block_if_suspended();

drop trigger if exists trg_block_if_suspended on public.secret_chat_messages;
create trigger trg_block_if_suspended before insert on public.secret_chat_messages
for each row execute function public._block_if_suspended();
