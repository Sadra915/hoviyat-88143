# ساخت APK از هویت — اپ پیام رسان

## قبل از شروع — چیزی که باید بدونی

من نمی‌تونم از همین‌جا (sandbox من) یه فایل APK واقعی بسازم — نه Android SDK دارم،
نه Gradle، نه دسترسی شبکه برای نصب ابزارها. چیزی که آماده کردم، **پروژه و تنظیمات**
هست؛ خود ساختن APK باید روی یک کامپیوتر واقعی (یا یک سرویس CI رایگان) انجام بشه.

**نکته‌ی مهم درباره‌ی Termux:** اگه داری از گوشی/Termux کار می‌کنی، ساختن APK با
Gradle معمولاً روی Termux قابل‌اعتماد نیست (نه SDK کامل اندروید داره، نه منابع کافی).
دو راه واقعی داری:
1. یه کامپیوتر (ویندوز/مک/لینوکس) با Android Studio نصب‌شده.
2. GitHub Actions (رایگان) — یه workflow می‌ساز�� که خودش APK رو در ابر می‌سازه و به‌عنوان
   artifact بهت می‌ده، بدون این‌که خودت Android Studio نصب کنی.

## مراحل (روی کامپیوتر با Android Studio نصب‌شده)

### ۱) پیش‌نیازها
- Node.js (نسخه ۱۸ به بالا)
- Android Studio (شامل Android SDK)
- JDK 17 (معمولاً همراه Android Studio نصب می‌شه)

### ۲) نصب ابزارها
```bash
cd hoviyat-88143-main      # پوشه‌ی پروژه
npm install
```

### ۳) ساخت اپ اصلی
```bash
npm run app:add-android     # فقط بار اول — پروژه‌ی اندروید رو می‌سازه
npm run app:open            # Android Studio رو با پروژه باز می‌کنه
```
تو Android Studio: **Build → Generate Signed Bundle / APK** → APK رو انتخاب کن →
یه keystore جدید بساز (یا اگه از قبل داری، همونو استفاده کن) → Build.

### هروقت کد را تغییر دادی
دیگه لازم نیست `add-android` رو دوباره بزنی (فقط بار اول لازمه). برای هر تغییر بعدی:
```bash
npm run app:sync      # برای اپ اصلی
```
بعد دوباره از Android Studio Build بگیر.

## آیکون و اسم اپ

`build-dist.mjs` یه `manifest.json` جدا برای PWA می‌سازه، ولی
**آیکون واقعی APK** رو باید با ابزار رسمی Capacitor بسازی (چون اندروید به فرمت/سایزهای
خاص خودش نیاز داره، نه فقط یه PNG ساده):
```bash
npm install @capacitor/assets --save-dev
npx capacitor-assets generate --android --iconBackgroundColor '#F0651E'
```
این کار رو برای پروژه اندروید (بعد از `add-android`) انجام بده تا آیکون‌های
درست تو `android/app/src/main/res/` قرار بگیره.

## اطلاعات اپ

| | اپ پیام رسان |
|---|---|
| appId | `ir.hoviyat.app` |
| اسم روی گوشی | هویت |
| صفحه‌ی ورودی | `index.html` |
| آیکون | `assets/icons/` |
