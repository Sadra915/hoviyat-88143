-- =====================================================================
-- هویت — مهاجرت شماره ۴: مسدودسازی گروه از پنل ادمین
--
-- این را در Supabase SQL Editor اجرا کن (بعد از migration_3 و وصله‌های
-- hotfix_*). کاملاً افزایشی و امن است — چیزی حذف/جایگزین نمی‌شود جز یک
-- trigger جدید روی group_messages برای رد کردن پیام به گروه مسدود.
--
-- نکته عمدی: به‌جای بازنویسی send_group_message (که چون نسخه‌ی دقیق فعلی‌اش
-- روی دیتابیس شما را نمی‌بینم، ریسک از بین بردن یک پارامتر موجود مثل
-- p_reply_to را دارد — دقیقاً همان اشتباهی که در مهاجرت قبلی رخ داد)، اینجا
-- یک trigger مستقل روی insert می‌گذاریم که با هر نسخه‌ای از آن تابع سازگار
-- است.
-- =====================================================================

alter table public.groups add column if not exists is_blocked boolean not null default false;
alter table public.groups add column if not exists blocked_reason text;
alter table public.groups add column if not exists blocked_at timestamptz;

-- ادمین باید بتواند همه‌ی گروه‌ها را برای پنل مدیریت ببیند (نه فقط گروه‌هایی
-- که خودش عضو است)
drop policy if exists "groups_select_admin" on public.groups;
create policy "groups_select_admin" on public.groups for select using (public.is_admin());

-- تغییر وضعیت مسدودی فقط از طریق این تابع (نه مستقیم UPDATE) تا حتماً چک is_admin() اجرا شود
create or replace function public.admin_set_group_blocked(p_group_id uuid, p_blocked boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then
    raise exception 'فقط ادمین می‌تواند این کار را انجام دهد';
  end if;
  update public.groups set
    is_blocked = p_blocked,
    blocked_reason = case when p_blocked then p_reason else null end,
    blocked_at = case when p_blocked then now() else null end
  where id = p_group_id;
end;
$$;

-- جلوگیری از ارسال پیام به گروه مسدود — مستقل از هر نسخه‌ای از send_group_message
create or replace function public._block_messages_to_blocked_group() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.groups g where g.id = new.group_id and g.is_blocked) then
    raise exception 'این گروه به دلیل نقض قوانین هویت مسدود شده و امکان ارسال پیام وجود ندارد';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_group_messages on public.group_messages;
create trigger trg_block_group_messages
  before insert on public.group_messages
  for each row execute function public._block_messages_to_blocked_group();
