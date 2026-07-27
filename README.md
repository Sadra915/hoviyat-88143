# هویت — پیام‌رسان

## نصب و آپلود روی GitHub
محتوای این پوشه رو کامل جایگزین محتوای فعلی ریپازیتوری `Sadra915/hoviyat-88143` کن (همه‌ی فایل‌ها و پوشه‌های `css/`, `js/`, `assets/` باید با همین ساختار آپلود بشن).

## تنظیمات لازم تو Firebase Console
1. **Firestore → Rules**: محتوای `firestore.rules` رو کامل کپی و Publish کن.
2. **Storage → Rules**: محتوای `storage.rules` رو کامل کپی و Publish کن.
3. اولین بار که وارد بخش گروه‌ها یا کانال‌ها بشی، ممکنه Firestore خطای «index لازم است» بده — این عادیه، فقط روی لینکی که تو همون خطا میاد بزن، خودش Index رو می‌سازه (چند دقیقه طول می‌کشه).

## ساختار پروژه
- `index.html` — نقطه ورود
- `css/style.css` — استایل
- `js/*.js` — منطق برنامه (auth, chat, groups, channels, identity, smartspace, admin, voice, ui, app)
- `service-worker.js` — کش PWA (باید در ریشه بمونه، نه داخل js/)
- `manifest.json`, `assets/icons/` — تنظیمات PWA برای نصب و تبدیل بعدی به APK

## ادمین
پنل ادمین فقط برای UID مشخص‌شده در `js/firebase-init.js` (`ADMIN_UID`) نمایش داده می‌شه؛ این هم سمت کلاینت هم تو Rules چک می‌شه.
