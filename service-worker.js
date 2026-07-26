/**
 * service-worker.js
 * فقط پوسته برنامه (فایل‌های هم‌مبدأ) کش می‌شود تا برنامه سریع‌تر و تا حدی
 * آفلاین بالا بیاید. درخواست‌های Firebase/Firestore/Storage عمداً دست‌نخورده
 * و مستقیم به شبکه فرستاده می‌شوند — دخالت Service Worker در ارتباط بلادرنگ
 * Firestore (WebChannel/long-polling) می‌تواند باعث قطعی هم‌گام‌سازی شود.
 */

const CACHE_VERSION = "hoviyat-v1";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/firebase-init.js",
  "./js/auth.js",
  "./js/chat.js",
  "./js/voice.js",
  "./js/identity.js",
  "./js/smartspace.js",
  "./js/admin.js",
  "./js/ui.js",
  "./js/app.js",
  "./assets/icons/favicon.svg",
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

  // فقط فایل‌های هم‌مبدأ (پوسته برنامه) را کش می‌کنیم؛ بقیه (فونت، Firebase و ...) دست‌نخورده می‌مانند
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const clone = res.clone();
      caches.open(CACHE_VERSION).then(cache => cache.put(req, clone));
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
