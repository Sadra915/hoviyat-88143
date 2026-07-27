# تنظیمات Firebase Console — «هویت»

این فایل جدا از کد است. باید این ۵ مرحله را داخل **console.firebase.google.com**
(نه گیت‌هاب) روی پروژه `hoviyat-88143` انجام بدی. بدون این‌ها، ثبت‌نام/ورود/چت
هیچ‌کدام کار نمی‌کنند — این‌ها فنی‌ترین و مهم‌ترین بخش راه‌اندازی هستند.

---

## ۱) فعال‌سازی روش ورود (Email/Password)
مسیر: **Authentication → Sign-in method**
روی **Email/Password** کلیک کن → کلید Enable را بزن → Save.

## ۲) ساخت دیتابیس Firestore (اگر هنوز نساختی)
مسیر: **Firestore Database → Create database**
حالت **Production mode** را انتخاب کن (نه Test mode).
نزدیک‌ترین Location به ایران را بزن (مثلاً `europe-west` یا `me-west1` اگر موجود بود).

## ۳) جای‌گذاری قوانین امنیتی Firestore (اجباری)
مسیر: **Firestore Database → Rules**
تمام متن داخل ادیتور پیش‌فرض را پاک کن (Ctrl+A → Delete) و کل محتوای فایل
`firestore.rules` (داخل زیپی که برات فرستادم) را جایگزینش کن.
دکمه آبی **Publish** بالا سمت راست را بزن.

## ۴) ساخت Storage و جای‌گذاری قوانین آن
مسیر: **Storage → Get started** (اگر هنوز نساختی، طبق مراحل پیش‌فرض جلو برو)
سپس: **Storage → Rules** → محتوای فایل `storage.rules` را جایگزین کن → **Publish**.

## ۵) افزودن دامنه GitHub Pages به لیست مجاز
مسیر: **Authentication → Settings → Authorized domains**
روی **Add domain** بزن و دقیقاً این را وارد کن (بدون https:// و بدون اسلش آخر):
```
sadra915.github.io
```

---

## چطور مطمئن شوم درست انجام دادم؟

بعد از هر مرحله، یک علامت تیک/تایید در همان صفحه Firebase می‌بینی. برای تست نهایی:
1. سایت را باز کن → روی «ثبت‌نام» بزن → یک حساب تستی بساز.
2. اگر پیام خطا دیدی، همان متن دقیق خطا را برایم بفرست (یا از کنسول مرورگر
   با زدن F12 → تب Console، خط قرمز رنگ را کپی کن).
3. رایج‌ترین خطاها:
   - `auth/operation-not-allowed` → مرحله ۱ انجام نشده.
   - `permission-denied` → مرحله ۳ (Firestore Rules) انجام نشده یا Publish نشده.
   - `auth/unauthorized-domain` → مرحله ۵ انجام نشده.
   - آپلود عکس/ویس با خطا مواجه می‌شود → مرحله ۴ (Storage Rules) انجام نشده.

## کلید ادمین (یادآوری)
UID زیر تنها حسابی است که به پنل ادمین (تب 🛡️ در پایین صفحه) دسترسی دارد
و تنها کسی است که می‌تواند کاربران را «تایید» (تیک آبی) کند:
```
YTxAE8HNmPYfVfNBJCUPlG9ai3Y2
```
این از قبل هم در کد (`js/firebase-init.js`) و هم در `firestore.rules` تنظیم شده — کاری لازم نیست بکنی.
