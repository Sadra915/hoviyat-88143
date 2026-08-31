# HOVIYAT MASTER MERGED — Merge & QA Report

## نتیجه ادغام
این بسته از `HOVIYAT_FINAL_MASTER_5.0` به عنوان پایه canonical ساخته شده است؛ چون این نسخه از نظر فایل‌ها superset لایه‌های Ultimate/Next بود. سه نسخه پایه قبلی به‌صورت تکراری داخل خروجی کپی نشده‌اند.

### منابع بررسی‌شده
- HOVIYAT_FINAL_ULTIMATE_4.0
- HOVIYAT_NEXT_FULL
- HOVIYAT_FINAL.zip
- hoviyat_88143_UI_v2.zip
- hoviyat_88143_main(12).zip
- HOVIYAT_FINAL_MASTER_5.0.zip

## چه چیزهایی انتخاب شد
- هسته‌های Auth / Chat / Groups / Channels / Calls / Voice / Secret Chat از شاخه canonical نهایی حفظ شدند.
- UI v2، Experience Control Center، Ultimate layer، Media Editor، Admin Moderation V2 و migrationهای Next/Ultimate حفظ شدند.
- تفاوت‌های نسخه‌های قدیمی‌تر که در Master وجود نداشتند فقط وقتی لازم بود بررسی شدند؛ کپی موازی و متناقض ایجاد نشد.

## اصلاحات انجام‌شده در این ادغام
1. تعریف تکراری `fillMissingChatProfiles()` در `js/app.js` حذف شد.
2. جفت `const riskyLink` / `const openAnyway` تکراری از event handler پیام‌ها حذف شد.
3. پس از اصلاح، `node --check` برای فایل‌های اصلی JS اجرا شد و خطای syntax گزارش نشد.
4. referenceهای محلی `index.html` و `admin.html` بررسی شدند.

## وضعیت Backend / SQL
هیچ migration یا SQL روی Supabase اجرا نشده است. فایل‌های SQL فقط داخل پروژه نگه داشته شده‌اند. اجرای آن‌ها باید جداگانه و با backup + staging انجام شود.

## پیشنهادهای فاز بعدی
### P0 — قبل از انتشار
- اجرای migrationها روی staging و ثبت نتیجه هر migration.
- اجرای security self-test با دو حساب تستی.
- smoke test کامل Login/Register، realtime، private chat، group، channel، media، secret chat، call/voice و admin.
- بررسی خطاهای RLS و permissionها با حساب non-admin.

### P1 — تکمیل محصول
- Push notification واقعی با service worker + backend.
- private storage/media authorization واقعی و migration تدریجی لینک‌های قدیمی.
- Passkey/WebAuthn واقعی با backend policy و recovery flow.
- گزارش crash/error و telemetry حداقلی بدون افشای متن پیام‌ها.

### P2 — قابلیت‌های ارزشمند
- message search/indexing بهتر، pagination و virtualization برای چت‌های بزرگ.
- backup/export/import امن برای داده‌های کاربر.
- مدیریت دستگاه‌ها و revoke session از راه دور.
- anti-spam/abuse pipeline سرورمحور و صف moderation.
- تست خودکار Playwright/E2E برای مسیرهای حیاتی.

## نکته طراحی
قابلیت‌هایی که backend/provider واقعی لازم دارند نباید فقط در UI شبیه‌سازی شوند؛ اتصال واقعی باید بعداً با مرزبندی امنیتی مشخص اضافه شود.
