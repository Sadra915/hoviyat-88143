# HOVIYAT FINAL MASTER — Deployment

## 1. Repository
محتویات این ZIP را جایگزین فایل‌های repository فعلی کنید. کلیدهای secret را داخل repository قرار ندهید.

## 2. Supabase
Migrationها را بر اساس تاریخچه پروژه فعلی و ترتیب زیر بررسی و در محیط staging اجرا کنید:

1. migration_2_read_receipts_and_avatars.sql
2. migration_3_security_hardening.sql
3. migration_4_group_blocking.sql
4. migration_5_secretchat_verification_bans.sql
5. hotfix_gen_salt.sql
6. hotfix_2_sticker_xss.sql
7. hotfix_3_missing_group_columns.sql
8. hotfix_4_reports_columns.sql
9. next/006_user_preferences_and_folders.sql
10. next/007_security_audit_and_rate_limits.sql
11. next/008_media_security_check.sql
12. next/009_message_lifecycle.sql
13. next/010_storage_hardening_plan.sql
14. next/011_admin_audit.sql
15. next/012_group_moderation_v2.sql
16. final/001_hoviyat_ultimate_preferences.sql

این فهرست جایگزین بررسی migrationهای قبلی پروژه نیست؛ اگر بخشی قبلاً اجرا شده، دوباره اجرا نکنید مگر اینکه migration به‌صورت idempotent طراحی شده باشد.

## 3. Smoke test
Login/Register، realtime chat، گروه، کانال، secret chat، voice/call، media upload، admin و RLS را روی staging تست کنید.

## 4. Production
پس از موفقیت staging، build/deploy نهایی انجام شود.
