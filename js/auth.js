/**
 * auth.js
 * ثبت‌نام/ورود با ایمیل و رمز عبور + رزرو یوزرنیم یکتا + وضعیت آنلاین/آخرین بازدید
 * (نسخه Supabase — یکتایی یوزرنیم توسط UNIQUE constraint جدول profiles تضمین می‌شود)
 */
import { supabase, auth } from "./supabase-init.js";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function validateUsername(u) {
  return USERNAME_RE.test(u);
}

/**
 * ثبت‌نام: کاربر Auth را می‌سازد. ساخت ردیف profiles دیگر اینجا انجام
 * نمی‌شود — چون اگر «تأیید ایمیل» روشن باشد، در این لحظه هنوز session
 * نداریم و RLS جلوی insert مستقیم را می‌گیرد. به‌جایش username/displayName
 * را به‌عنوان user metadata می‌فرستیم و یک تریگر Postgres (on_auth_user_created
 * در schema.sql) خودش ردیف profiles را می‌سازد، چه ایمیل تأیید شده باشد
 * چه نشده.
 */
export async function signUp({ email, password, username, displayName, captchaToken }) {
  const uname = username.trim().toLowerCase();
  if (!validateUsername(uname)) {
    throw new Error("شناسه کاربری باید ۳ تا ۲۰ حرف/عدد انگلیسی کوچک یا _ باشد.");
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: uname,
        display_name: displayName || uname,
      },
      captchaToken,
    },
  });
  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message || "")) {
      throw new Error("این شناسه کاربری قبلاً گرفته شده است.");
    }
    throw error;
  }
  const user = data.user;
  if (!user) throw new Error("ثبت‌نام انجام شد؛ لطفاً ایمیل خود را برای تایید حساب بررسی کنید.");

  return { uid: user.id, email: user.email };
}

export async function logIn(email, password, captchaToken) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email, password, options: { captchaToken },
  });
  if (error) throw error;
  await supabase.from("profiles")
    .update({ online: true, last_seen_at: new Date().toISOString() })
    .eq("id", data.user.id);
  return { uid: data.user.id, email: data.user.email };
}

export async function logOut() {
  const uid = auth.currentUser?.uid;
  if (uid) {
    await supabase.from("profiles")
      .update({ online: false, last_seen_at: new Date().toISOString() })
      .eq("id", uid);
  }
  await supabase.auth.signOut();
}

/**
 * شبیه‌ساز onAuthStateChanged قبلی: callback با {uid,...} یا null صدا زده می‌شود.
 *
 * نکته مهم: supabase-js با فراخوانی onAuthStateChange بلافاصله یک رویداد اولیه
 * (INITIAL_SESSION) هم می‌فرستد، و بعداً هر بار که توکن به‌صورت خودکار تازه‌سازی
 * می‌شود (معمولاً هر حدود یک ساعت، TOKEN_REFRESHED) دوباره رویداد می‌فرستد — با
 * همان کاربر قبلی. اگر callback را بدون فیلتر روی این رویدادها صدا بزنیم،
 * enterApp() در app.js هر بار دوباره اجرا می‌شود: یعنی Realtime Subscriptionهای
 * چت/گروه/کانال هر بار دوباره ساخته می‌شوند (و نسخه قبلی هرگز پاک نمی‌شود چون
   فقط آخرین unsub ذخیره می‌ماند — نشتی اتصال) و کاربر هم به‌طور ناگهانی از هر
 * صفحه‌ای (مثلاً وسط تایپ در تنظیمات) به صفحه اصلی پرت می‌شود. برای همین، اینجا
 * فقط وقتی uid واقعاً عوض شده callback را صدا می‌زنیم.
 */
export function watchAuth(callback) {
  let lastUid;
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    const uid = session?.user?.id || null;
    if (uid === lastUid) return;
    lastUid = uid;
    callback(session ? { uid: session.user.id, email: session.user.email } : null);
  });
  return () => sub.subscription.unsubscribe();
}

export async function getUserDoc(uid) {
  const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
  return data ? mapProfile(data) : null;
}

/** آپلود عکس پروفایل خودم به باکت avatars و ذخیره آدرسش روی ردیف profiles؛
 * برمی‌گرداند: آدرس عمومی عکس تازه‌آپلودشده */
export async function updateMyAvatar(file) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("ابتدا وارد شوید.");
  const safeName = String(file.name || "avatar").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const path = `${uid}/${Date.now()}_${safeName}`;
  const { error: upErr } = await supabase.storage.from("avatars").upload(path, file);
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
  const { error } = await supabase.from("profiles").update({ photo_url: pub.publicUrl }).eq("id", uid);
  if (error) throw error;
  return pub.publicUrl;
}

/** تبدیل نام ستون‌های snake_case پایگاه‌داده به همان کلیدهایی که بقیه کد (camelCase قبلی) انتظار دارد */
export function mapProfile(row) {
  if (!row) return row;
  return {
    uid: row.id,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    phone: row.phone,
    photoURL: row.photo_url,
    weatherCity: row.weather_city,
    verified: row.verified,
    online: row.online,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    suspendedUntil: row.suspended_until || null,
    suspensionReason: row.suspension_reason || null,
  };
}

/** درخواست تیک آبی برای حساب خودم */
export async function requestAccountVerification(message) {
  const { error } = await supabase.rpc("submit_verification_request", {
    p_target_type: "account", p_target_id: auth.currentUser.uid, p_message: message,
  });
  if (error) throw error;
}

/** وضعیت مسدودی حساب خودم را برمی‌گرداند: null اگر مسدود نیست، وگرنه
 * {until, reason}. برای نمایش بنر هشدار در بالای اپ استفاده می‌شود. */
export async function checkMySuspension() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const { data } = await supabase.from("profiles").select("suspended_until, suspension_reason").eq("id", uid).maybeSingle();
  if (!data?.suspended_until) return null;
  if (new Date(data.suspended_until).getTime() <= Date.now()) return null;
  return { until: data.suspended_until, reason: data.suspension_reason || "نقض قوانین" };
}

// هنگام بستن تب، وضعیت را آفلاین علامت بزن (best-effort سمت کلاینت — درست مثل نسخه قبلی
// این هم تضمین‌شده نیست که همیشه اجرا شود؛ منبع اصلی حقیقت باید last_seen_at باشد)
window.addEventListener("beforeunload", () => {
  const uid = auth.currentUser?.uid;
  if (uid) {
    supabase.from("profiles")
      .update({ online: false, last_seen_at: new Date().toISOString() })
      .eq("id", uid);
  }
});
