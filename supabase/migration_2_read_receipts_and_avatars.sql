-- =====================================================================
-- هویت — مهاجرت افزایشی شماره ۲: تیک آبی (خوانده‌شد) + آپلود عکس پروفایل
-- این فایل را یک‌بار در Supabase Dashboard → SQL Editor اجرا کنید.
-- (فقط همین تکه جدید را اجرا کنید؛ نیازی به اجرای دوباره کل schema.sql قبلی نیست.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- ۱) تیک آبی برای چت خصوصی: یک ستون جدید که آخرین لحظه‌ی خواندن هر عضو را
--    نگه می‌دارد (map از uid به زمان). روی گروه/کانال عمداً اضافه نشده،
--    چون «خوانده‌شد توسط چند نفر» یک UX جدا و پیچیده‌تر می‌خواهد.
-- ---------------------------------------------------------------------
alter table public.chats add column if not exists last_read jsonb not null default '{}';

create or replace function public.mark_chat_read(p_chat_id text) returns void
language sql security definer set search_path = public as $$
  update public.chats set
    unread_counts = jsonb_set(coalesce(unread_counts, '{}'), array[auth.uid()::text], '0'),
    last_read = jsonb_set(coalesce(last_read, '{}'), array[auth.uid()::text], to_jsonb(now()))
  where id = p_chat_id and auth.uid() = any(members);
$$;

-- ---------------------------------------------------------------------
-- ۲) باکت آپلود عکس پروفایل — مسیر هر فایل با uid خود کاربر شروع می‌شود
--    (مثلاً "3fa85f64-.../عکس.jpg")، پس فقط خودش می‌تواند در پوشه‌ی خودش
--    آپلود/جایگزین کند؛ خواندن مثل بقیه باکت‌های رسانه عمومی است.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_select" on storage.objects for select using (
  bucket_id = 'avatars'
);
create policy "avatars_insert_own" on storage.objects for insert with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "avatars_update_own" on storage.objects for update using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "avatars_delete_own_or_admin" on storage.objects for delete using (
  bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);
