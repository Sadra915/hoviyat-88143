/**
 * security.js
 * مرکز امنیت هویت: قفل برنامه (PIN + بیومتریک)، ۲مرحله‌ای (TOTP)، مدیریت
 * نشست‌ها/دستگاه‌ها، کد بازیابی، اسکن لینک مشکوک (ضدفیشینگ)، و «امتیاز
 * امنیت» ساده و قانون‌محور.
 *
 * صادقانه بگوییم چه چیزی این فایل هست و چه چیزی نیست:
 *  - قفل برنامه با بیومتریک از WebAuthn محلی استفاده می‌کند: یعنی «باز کردن
 *    مجدد اپ روی همین دستگاه» را با اثرانگشت/چهره/کلید امنیتی گیت می‌کند؛
 *    این جایگزینِ کامل ورود remote-verified نیست (آن نیاز به چالش سمت سرور
 *    و زیرساخت بیشتری دارد) — برای «قفل صفحه» دقیقاً همین کافی است.
 *  - «امتیاز امنیت» یک چک‌لیست قانون‌محور است، نه هوش مصنوعی/یادگیری ماشین.
 *  - رمزگذاری واقعیِ end-to-end (کلید فقط دست کاربر) در این فایل نیست؛
 *    توضیح کامل در SECURITY.md.
 */
import { supabase, auth } from "./supabase-init.js";

/** auth.currentUser در این پروژه به‌صورت async پر می‌شود (بعد از resolve شدن
 * session)؛ اگر یکی از توابع این فایل زودتر از موعد صدا زده شود (مثلاً
 * درست موقع بوت اپ)، auth.currentUser هنوز null است. این تابع قبل از هر
 * کوئری، اگر لازم باشد صبر می‌کند و در غیر این صورت خطای قابل‌فهم می‌دهد. */
async function requireUid() {
  if (!auth.currentUser && auth.ready) { try { await auth.ready; } catch { /* ignore */ } }
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("ابتدا باید وارد حساب شوی.");
  return uid;
}

/* ============================= دستگاه/نشست ============================= */

export function getDeviceId() {
  let id = localStorage.getItem("hoviyat_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("hoviyat_device_id", id);
  }
  return id;
}

export function getDeviceLabel() {
  const ua = navigator.userAgent || "";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "ناشناس";
  const browser = /Chrome/.test(ua) ? "Chrome" : /Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "مرورگر";
  return `${browser} · ${os}`;
}

/** باید یک‌بار بعد از هر ورود موفق صدا زده شود. اگر true برگرداند یعنی این
 * دستگاه برای این کاربر جدید است — UI باید هشدار «ورود از دستگاه جدید» نشان دهد. */
export async function registerCurrentSession() {
  const { data, error } = await supabase.rpc("register_session", {
    p_device_id: getDeviceId(),
    p_device_label: getDeviceLabel(),
    p_user_agent: navigator.userAgent || "",
  });
  if (error) { console.error(error); return false; }
  return !!data;
}

export async function listMySessions() {
  const uid = await requireUid();
  const { data } = await supabase.from("user_sessions")
    .select("*").eq("uid", uid).order("last_active_at", { ascending: false });
  return (data || []).map(r => ({ ...r, isCurrent: r.device_id === getDeviceId() }));
}

export async function revokeSession(deviceId) {
  const { error } = await supabase.rpc("revoke_session", { p_device_id: deviceId });
  if (error) throw error;
  // توجه: این فقط رکورد نشست را حذف می‌کند تا در آن دستگاه تشخیص داده شود؛
  // ابطال فوری توکن JWT نیاز به Edge Function با service-role دارد (چون آن
  // کلید هرگز نباید سمت کلاینت باشد) — جزئیات در SECURITY.md.
}

export async function listMyLoginEvents(limit = 20) {
  const uid = await requireUid();
  const { data } = await supabase.from("login_events")
    .select("*").eq("uid", uid).order("created_at", { ascending: false }).limit(limit);
  return data || [];
}

/* ============================= تنظیمات امنیتی ============================= */

export async function getSecuritySettings() {
  const uid = await requireUid();
  const { data } = await supabase.from("security_settings").select("*").eq("uid", uid).maybeSingle();
  return data || {
    app_lock_enabled: false, biometric_enabled: false, twofa_enabled: false,
    auto_delete_days: 0, block_forwarding: true, screenshot_shield: false,
  };
}

async function upsertOwnSettings(patch) {
  const uid = await requireUid();
  const { error } = await supabase.from("security_settings").upsert({ uid, ...patch }, { onConflict: "uid" });
  if (error) throw error;
}

export async function setAutoDeleteDays(days) {
  await upsertOwnSettings({ auto_delete_days: Math.max(0, Number(days) || 0) });
}
export async function setScreenshotShield(enabled) {
  await upsertOwnSettings({ screenshot_shield: !!enabled });
}
export async function setBlockForwarding(enabled) {
  await upsertOwnSettings({ block_forwarding: !!enabled });
}

/* ============================= قفل برنامه: PIN ============================= */

export async function setAppLockPin(pin) {
  const { error } = await supabase.rpc("set_app_lock_pin", { p_pin: String(pin) });
  if (error) throw error;
}
export async function verifyAppLockPin(pin) {
  const { data, error } = await supabase.rpc("verify_app_lock_pin", { p_pin: String(pin) });
  if (error) throw error;
  return !!data;
}
export async function disableAppLock() {
  const { error } = await supabase.rpc("disable_app_lock");
  if (error) throw error;
}

/* ============================= قفل برنامه: بیومتریک (WebAuthn) ============================= */

export function biometricSupported() {
  return !!(window.PublicKeyCredential && navigator.credentials);
}

/** ثبت اثرانگشت/چهره/کلید امنیتی این دستگاه برای باز کردن قفل اپ */
export async function enrollBiometric() {
  if (!biometricSupported()) throw new Error("این دستگاه/مرورگر از بیومتریک پشتیبانی نمی‌کند.");
  const uid = await requireUid();
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "هویت" },
      user: { id: new TextEncoder().encode(uid), name: uid, displayName: "قفل هویت" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
      timeout: 60000,
    },
  });
  if (!cred) throw new Error("ثبت بیومتریک لغو شد.");
  const credId = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
  await upsertOwnSettings({ biometric_enabled: true, webauthn_credential_id: credId });
  return credId;
}

/** باز کردن قفل با همان اثرانگشت/چهره/کلید امنیتیِ ثبت‌شده روی این دستگاه.
 * این یک تایید محلی است (چالش تصادفی سمت کلاینت)، نه احراز هویت remote. */
export async function unlockWithBiometric(credentialIdBase64) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const credId = Uint8Array.from(atob(credentialIdBase64), c => c.charCodeAt(0));
  const assertion = await navigator.credentials.get({
    publicKey: { challenge, allowCredentials: [{ id: credId, type: "public-key" }], userVerification: "required", timeout: 60000 },
  });
  return !!assertion;
}

/* ============================= ۲مرحله‌ای (TOTP) ============================= */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function randomBase32Secret(len = 20) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let bits = "", out = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  for (let i = 0; i + 5 <= bits.length; i += 5) out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const c of clean) bits += BASE32_ALPHABET.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(bytes);
}

async function hotp(secretBytes, counter) {
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const counterBuf = new ArrayBuffer(8);
  const view = new DataView(counterBuf);
  // نوشتن ۶۴بیتی به‌صورت دو نیمه ۳۲بیتی (JS Number برای شیفت ۶۴بیتی کافی نیست)
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBuf));
  const offset = sig[sig.length - 1] & 0x0f;
  const code = ((sig[offset] & 0x7f) << 24 | (sig[offset + 1] & 0xff) << 16 | (sig[offset + 2] & 0xff) << 8 | (sig[offset + 3] & 0xff)) % 1_000_000;
  return code.toString().padStart(6, "0");
}

export async function totpNow(secretBase32, stepSeconds = 30) {
  const counter = Math.floor(Date.now() / 1000 / stepSeconds);
  return hotp(base32Decode(secretBase32), counter);
}

/** کد را با یک گام قبل/بعد هم چک می‌کند تا اختلاف ساعت جزئی مشکل نسازد */
export async function verifyTotp(secretBase32, code, stepSeconds = 30) {
  const counter = Math.floor(Date.now() / 1000 / stepSeconds);
  const clean = String(code).replace(/\D/g, "");
  for (const c of [counter - 1, counter, counter + 1]) {
    if ((await hotp(base32Decode(secretBase32), c)) === clean) return true;
  }
  return false;
}

/** شروع راه‌اندازی ۲مرحله‌ای: یک سکرت تازه می‌سازد، آن را (رمزنگاری‌شده) ذخیره
 * می‌کند، و لینک otpauth برای QR کد برمی‌گرداند. کد باید توسط verifyTotp تایید
 * شود، بعد confirmTwofaEnable صدا زده شود. */
export async function beginTwofaSetup(accountLabel) {
  const secret = randomBase32Secret();
  const { error } = await supabase.rpc("set_twofa_secret", { p_secret_base32: secret });
  if (error) throw error;
  const otpauthUrl = `otpauth://totp/${encodeURIComponent("هویت")}:${encodeURIComponent(accountLabel || "")}?secret=${secret}&issuer=${encodeURIComponent("هویت")}`;
  return { secret, otpauthUrl };
}
export async function confirmTwofaEnable() {
  const { error } = await supabase.rpc("confirm_twofa_enable");
  if (error) throw error;
}
export async function disableTwofa() {
  const { error } = await supabase.rpc("disable_twofa");
  if (error) throw error;
}
/** برای تایید کد در لحظه‌ی ورود (بعد از رمز عبور) — فقط صاحب حساب می‌تواند صدا بزند */
export async function verifyTwofaLogin(code) {
  const { data: secret, error } = await supabase.rpc("get_twofa_secret_for_verification");
  if (error) throw error;
  if (!secret) return false;
  return verifyTotp(secret, code);
}

/* ============================= کد بازیابی ============================= */

export function generateRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  const b32 = randomBase32FromBytes(bytes);
  return b32.match(/.{1,5}/g).join("-");
}
function randomBase32FromBytes(bytes) {
  let bits = "", out = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  for (let i = 0; i + 5 <= bits.length; i += 5) out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}
export async function saveRecoveryCode(code) {
  const { error } = await supabase.rpc("set_recovery_key", { p_code: code });
  if (error) throw error;
}
export async function redeemRecoveryCode(code) {
  const { data, error } = await supabase.rpc("use_recovery_key", { p_code: code });
  if (error) throw error;
  return !!data;
}

/* ============================= ضدفیشینگ: اسکن لینک‌های پیام ============================= */

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "ow.ly", "cutt.ly"]);
const KNOWN_BRANDS = ["instagram", "telegram", "whatsapp", "google", "paypal", "apple", "microsoft", "bank", "بانک", "sana", "شاپرک"];

/** بررسی سطحیِ قانون‌محور یک لینک — نه یک سرویس واقعی تشخیص فیشینگ، فقط
 * چند نشانه‌ی رایج را پرچم می‌زند تا کاربر قبل از باز کردن دوباره فکر کند. */
export function assessLink(url) {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return { url, risky: true, reasons: ["آدرس نامعتبر"] }; }
  const reasons = [];
  if (host.startsWith("xn--") || host.includes(".xn--")) reasons.push("دامنه با کاراکترهای غیرلاتین شبیه‌سازی‌شده (Punycode)");
  if (SHORTENERS.has(host)) reasons.push("لینک کوتاه‌شده — مقصد واقعی مشخص نیست");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) reasons.push("آدرس IP خام به‌جای دامنه");
  const hyphenCount = (host.match(/-/g) || []).length;
  if (hyphenCount >= 3) reasons.push("دامنه با خط‌تیره‌های زیاد (رایج در فیشینگ)");
  for (const brand of KNOWN_BRANDS) {
    if (host.includes(brand) && !host.endsWith(`${brand}.com`) && !host.endsWith(`.${brand}.com`)) {
      reasons.push(`شبیه نام «${brand}» اما دامنه اصلی آن نیست`);
      break;
    }
  }
  return { url, risky: reasons.length > 0, reasons };
}

export function scanTextForLinks(text) {
  const urls = [...(text || "").matchAll(URL_RE)].map(m => m[0]);
  return urls.map(assessLink);
}

/* ============================= امتیاز امنیت (قانون‌محور، نه AI) ============================= */

export function computeSecurityScore(settings, sessionCount) {
  let score = 20; // پایه: رمز عبور + RLS همیشه فعال است
  const tips = [];
  if (settings.app_lock_enabled) score += 20; else tips.push("قفل برنامه (PIN) را فعال کن");
  if (settings.biometric_enabled) score += 15; else tips.push("باز کردن با اثرانگشت/چهره را اضافه کن");
  if (settings.twofa_enabled) score += 25; else tips.push("ورود دومرحله‌ای را فعال کن");
  if (settings.recovery_key_hash) score += 10; else tips.push("یک کد بازیابی بساز و جای امنی نگه دار");
  if (settings.auto_delete_days > 0) score += 5;
  if ((sessionCount || 0) <= 3) score += 5; else tips.push("دستگاه‌های ناشناس/قدیمی را از «نشست‌ها» حذف کن");
  return { score: Math.min(100, score), tips };
}
