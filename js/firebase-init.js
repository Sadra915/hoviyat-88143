/**
 * firebase-init.js
 * راه‌اندازی Firebase (Auth + Firestore + Storage) با ماژول‌های وب رسمی گوگل
 * (از CDN بارگذاری می‌شود، نیازی به npm/build ندارد — مستقیم روی GitHub Pages کار می‌کند)
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// پیکربندی پروژه Firebase شما (این کلیدها محرمانه نیستند؛ امنیت واقعی از Firestore Security Rules تأمین می‌شود)
const firebaseConfig = {
  apiKey: "AIzaSyAQfh9i9kq3A5Mv8tlgY7wczTjcNOWMk7Q",
  authDomain: "hoviyat-88143.firebaseapp.com",
  databaseURL: "https://hoviyat-88143-default-rtdb.firebaseio.com",
  projectId: "hoviyat-88143",
  storageBucket: "hoviyat-88143.firebasestorage.app",
  messagingSenderId: "767291207702",
  appId: "1:767291207702:web:618fbf3e0eff2f74a64537",
  measurementId: "G-9Z0Y10631N"
};

// تنها UID که دسترسی ادمین دارد (طبق درخواست صریح صاحب پروژه)
export const ADMIN_UID = "YTxAE8HNmPYfVfNBJCUPlG9ai3Y2";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

// کش محلی Firestore فعال است تا برنامه در حالت آفلاین هم (تا حدی) قابل استفاده باشد
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) })
});

export const storage = getStorage(app);
