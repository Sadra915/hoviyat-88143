-- =====================================================================
-- وصله: رفع «گزارش‌ها ارسال نمی‌شود»
--
-- علت: کد گزارش‌دهی (chat.js / groups.js) به ستون‌های target_type,
-- target_id, context_id, content_preview روی جدول reports نیاز دارد، اما
-- جدول پایه فقط id/reporter_id/reason/status/created_at را داشت. یعنی هر
-- INSERT گزارش با خطای «Could not find the 'target_type' column ...»
-- شکست می‌خورد — دقیقاً هم‌خانواده‌ی همان باگ invite_code.
--
-- این وصله فقط ستون‌های گمشده را اضافه می‌کند؛ هیچ گزارش قبلی‌ای دست نمی‌خورد.
-- =====================================================================

alter table public.reports add column if not exists target_type text;
alter table public.reports add column if not exists target_id text;
alter table public.reports add column if not exists context_id text;
alter table public.reports add column if not exists content_preview text;

notify pgrst, 'reload schema';
