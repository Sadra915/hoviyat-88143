/**
 * supabase-init.js
 * راه‌اندازی Supabase (Auth + Postgres + Realtime + Storage) با کتابخانه رسمی
 * (از CDN بارگذاری می‌شود، نیازی به npm/build ندارد — مستقیم روی GitHub Pages کار می‌کند)
 *
 * جایگزین firebase-init.js قبلی — فقط این دو مقدار را از داشبورد پروژه‌ی
 * Supabase خودتان (Project Settings → API) کپی کنید:
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://ejftgzrrjttntbsapjgz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqZnRnenJyanR0bnRic2Fwamd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNjU5NjYsImV4cCI6MjEwMDg0MTk2Nn0.NA6WRZskB9cfSqNkAWCsAdqF-iofEHAEE-YsY3lYuUM";

// شناسه (UUID) کاربر ادمین در Supabase Auth — بعد از ساخت حساب ادمین از
// Dashboard → Authentication → Users کپی کنید (این دیگر همان مقدار قبلی
// Firebase UID نیست، چون Supabase از UUID استفاده می‌کند)
export const ADMIN_UID = "88398939-05fe-4363-9298-26d9c03c096b";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/**
 * شیء سازگاری با کد قبلی: در نسخه Firebase، `auth.currentUser` به‌صورت همزمان
 * (sync) در دسترس بود. Supabase چنین چیزی ندارد، پس این شیء را با گوش‌دادن به
 * تغییرات session به‌روز نگه می‌داریم تا بقیه فایل‌ها بدون تغییر ساختاری زیاد
 * کار کنند (auth.currentUser.uid دقیقاً مثل قبل در دسترس است).
 */
export const auth = { currentUser: null, ready: null };

function toCompatUser(supaUser) {
  if (!supaUser) return null;
  return { uid: supaUser.id, email: supaUser.email, raw: supaUser };
}

auth.ready = supabase.auth.getSession().then(({ data }) => {
  auth.currentUser = toCompatUser(data.session?.user);
});

supabase.auth.onAuthStateChange((_event, session) => {
  auth.currentUser = toCompatUser(session?.user);
});

/** کمکی برای صبر کردن تا session اولیه لود شود (روی رفرش صفحه لازم است) */
export async function waitForAuthReady() {
  await auth.ready;
}

/**
 * ساخت نام کانال real-time یکتا برای هر بار subscribe.
 *
 * چرا لازم است: اگر یک چت/گروه/کانال به‌سرعت دوبار باز شود (مثلاً دوبار لمس
 * سریع)، و نام کانال فقط بر اساس شناسه‌ی آن گفتگو باشد (مثل `group-messages-<id>`)،
 * ممکن است تلاش برای ساخت کانال دوم — درست وقتی کانال قبلی هنوز در حال
 * unsubscribe شدن است — با همان canal قبلی (که هنوز از فهرست داخلی
 * supabase-js پاک نشده) برخورد کند و این خطا بدهد:
 *   «Cannot add postgres_changes callbacks ... after `subscribe()` has already been called»
 * افزودن یک پسوند تصادفی به نام کانال در هر فراخوانی، این تصادم را کاملاً
 * حذف می‌کند — هر subscribe همیشه یک کانال کاملاً تازه می‌سازد.
 */
export function uniqueChannelName(base) {
  return `${base}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
