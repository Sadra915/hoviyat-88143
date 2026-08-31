/**
 * service-worker.js
 * نسخه ۲ — استراتژی عوض شد به Network-First (نه Cache-First) تا مشکل
 * «کد قدیمی همیشه کش شده و آپدیت‌ها دیده نمی‌شوند» برای همیشه حل شود.
 * یعنی: همیشه اول از شبکه تلاش می‌کند (سریع، چون GitHub Pages CDN دارد)،
 * فقط اگر آفلاین بود یا شبکه شکست خورد، از کش (اگر موجود بود) استفاده می‌کند.
 *
 * درخواست‌های Supabase (Auth/Postgres/Realtime/Storage) عمداً دست‌نخورده
 * می‌مانند — دخالت Service Worker در ارتباط بلادرنگ Realtime می‌تواند
 * هم‌گام‌سازی را بشکند.
 *
 * ⚠️ یادآوری برای توسعه بعدی: هر بار که فایل‌های پروژه عوض می‌شوند، عدد
 * CACHE_VERSION زیر را افزایش بده، وگرنه کاربرانی که قبلاً سایت را باز
 * کرده‌اند ممکن است نسخه کش‌شده قدیمی را (به‌خصوص در حالت آفلاین) ببینند.
 */

const CACHE_VERSION = "hoviyat-ultimate-ui-v3-glass-final-v3";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./admin.html",
  "./manifest.json",
  "./js/error-handler.js",
  "./css/style.css",
  "./js/supabase-init.js",
  "./js/auth.js",
  "./js/chat.js",
  "./js/groups.js",
  "./js/channels.js",
  "./js/voice.js",
  "./js/identity.js",
  "./js/smartspace.js",
  "./js/admin.js",
  "./js/admin-app.js",
  "./js/ui.js",
  "./js/icons.js",
  "./js/typing.js",
  "./js/call.js",
  "./js/security.js",
  "./js/secret-crypto.js",
  "./js/secretchat.js",
  "./js/media-editor.js",
  "./js/hoviyat-next.js",
  "./js/admin-moderation-v2.js",
  "./js/hoviyat-flow.js",
  "./js/app.js",
  "./js/hoviyat-ai-chat.js",
  "./css/hoviyat-glass-final.css",
  "./css/hoviyat-ultimate-ui.css",
  "./css/hoviyat-v2.css",
  "./css/hoviyat-next.css",
  "./css/hoviyat-redesign.css",
  "./css/admin-v2.css",
  "./assets/icons/favicon-64.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(SHELL_FILES))
      .catch(err => console.warn("SW install cache error:", err))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // فقط فایل‌های هم‌مبدأ (پوسته برنامه) را کش می‌کنیم؛ بقیه (فونت، Supabase و ...) دست‌نخورده می‌مانند
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).then(res => {
      // فقط پاسخ‌های موفق (200) کش می‌شوند — یک پاسخ خطا (404/500) هرگز کش نمی‌شود
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(req, clone));
      }
      return res;
    }).catch(async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      // اگر خود صفحه (navigation) بود و در کش هم نبود، بسته به این‌که کدام
      // پوسته درخواست شده (اپ اصلی یا صفحه ادمین) بازمی‌گردانیم — نه همیشه index.html
      if (req.mode === "navigate") {
        return url.pathname.endsWith("admin.html")
          ? caches.match("./admin.html")
          : caches.match("./index.html");
      }
      return Response.error();
    })
  );
});
