-- =====================================================================
-- وصله: رفع خطای «Could not find the 'invite_code' column of 'groups'
-- in the schema cache»
--
-- علت: کد جاوااسکریپت (groups.js) به ستون‌های invite_code / rules /
-- max_members / is_public / pinned_message_id / permissions / description
-- روی جدول groups نیاز دارد، اما ظاهراً invite_code (و شاید یکی‌دو مورد
-- دیگر) هیچ‌وقت با یک migration واقعی به دیتابیس اضافه نشده. این وصله همه‌ی
-- این ستون‌ها را با IF NOT EXISTS اضافه می‌کند — اگر از قبل باشند، بی‌خطر رد
-- می‌شود؛ هیچ داده‌ای پاک/تغییر نمی‌کند.
--
-- بعد از اجرا، از Supabase Dashboard یک بار Settings → API → «Reload schema»
-- را هم بزن (یا چند دقیقه صبر کن) تا کش PostgREST به‌روز شود.
-- =====================================================================

alter table public.groups add column if not exists description text not null default '';
alter table public.groups add column if not exists rules text not null default '';
alter table public.groups add column if not exists invite_code text;
alter table public.groups add column if not exists max_members int;
alter table public.groups add column if not exists is_public boolean not null default false;
alter table public.groups add column if not exists pinned_message_id uuid;
alter table public.groups add column if not exists permissions jsonb not null default '{}';

-- کد دعوت باید یکتا باشد (برای join_group_by_code) — یکتایی فقط روی
-- مقادیر غیر NULL اعمال می‌شود، پس گروه‌های بدون کد دعوت مشکلی ندارند.
create unique index if not exists idx_groups_invite_code on public.groups (invite_code) where invite_code is not null;

-- به PostgREST بگو کش اسکیمایش را رفرش کند (معمولاً خودکار انجام می‌شود، ولی
-- این خط باعث می‌شود فوری اتفاق بیفتد و مجبور نباشی صبر کنی)
notify pgrst, 'reload schema';
