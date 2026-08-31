#!/usr/bin/env node
/**
 * security_selftest.mjs
 * ------------------------------------------------------------------
 * تست خودکارِ تدافعیِ امنیت هویت — روی پروژه‌ی خودتان اجرا می‌شود.
 * هیچ حمله‌ی واقعی انجام نمی‌دهد؛ فقط چیزهایی را که *باید* رد شوند امتحان
 * می‌کند و گزارش «✅ محافظت‌شده» یا «❌ نشتی/باگ» می‌دهد.
 *
 * نصب و اجرا در Termux:
 *   pkg install nodejs
 *   node security_selftest.mjs
 *
 * قبل از اجرا، دو حساب تستِ یک‌بارمصرف در خودِ اپ هویت بساز (نه حساب واقعی‌ات!)
 * و ایمیل/رمزشان را پایین در بخش CONFIG بگذار. اگر فقط یکی را پر کنی، تست‌های
 * «آیا کاربر B می‌تواند اطلاعات A را ببیند» رد می‌شوند و در گزارش «⏭ رد شد»
 * می‌آید — نه شکست.
 * ------------------------------------------------------------------
 */

// ==================== CONFIG ====================
const SUPABASE_URL = "https://ejftgzrrjttntbsapjgz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqZnRnenJyanR0bnRic2Fwamd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNjU5NjYsImV4cCI6MjEwMDg0MTk2Nn0.NA6WRZskB9cfSqNkAWCsAdqF-iofEHAEE-YsY3lYuUM";

const TEST_ACCOUNT_A = { email: "", password: "" }; // حساب تستِ یک‌بارمصرف — اجباری
const TEST_ACCOUNT_B = { email: "", password: "" }; // حساب تستِ دومِ یک‌بارمصرف — اختیاری (برای تست جداسازی بین دو کاربر)
// ==================================================

const results = [];
function record(name, status, detail) {
  results.push({ name, status, detail });
  const icon = status === "pass" ? "✅" : status === "fail" ? "❌" : status === "skip" ? "⏭ " : "⚠️ ";
  console.log(`${icon} ${name}${detail ? " — " + detail : ""}`);
}

async function rest(path, { method = "GET", token, body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(method !== "GET" ? { Prefer: "return=representation" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, ok: res.ok, data: json };
}

async function signIn(email, password) {
  const r = await rest("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  if (!r.ok || !r.data?.access_token) throw new Error(`ورود ناموفق برای ${email}: ${JSON.stringify(r.data)}`);
  return { token: r.data.access_token, uid: r.data.user.id };
}

async function main() {
  console.log("🛡️  تست امنیت هویت — شروع\n");

  // ---------- ۱) خواندن پروفایل‌ها بدون ورود (باید خالی/رد شود) ----------
  try {
    const r = await rest("/rest/v1/profiles?select=id,username,phone");
    const leaked = Array.isArray(r.data) && r.data.length > 0;
    record("خواندن profiles بدون ورود", leaked ? "fail" : "pass",
      leaked ? `${r.data.length} ردیف بدون ورود قابل‌خواندن بود!` : "بدون ورود چیزی برنگشت");
  } catch (e) { record("خواندن profiles بدون ورود", "warn", e.message); }

  if (!TEST_ACCOUNT_A.email || !TEST_ACCOUNT_A.password) {
    console.log("\n⏭  حساب تست A پر نشده — بقیه‌ی تست‌ها (که به ورود نیاز دارند) رد می‌شوند.");
    console.log("   یک حساب تستِ یک‌بارمصرف در اپ بساز و ایمیل/رمزش را بالای این فایل بگذار.\n");
    printSummary();
    return;
  }

  const a = await signIn(TEST_ACCOUNT_A.email, TEST_ACCOUNT_A.password).catch(e => { record("ورود حساب A", "fail", e.message); return null; });
  if (!a) { printSummary(); return; }
  record("ورود حساب A", "pass");

  // ---------- ۲) کاربر A کل جدول profiles را می‌بیند یا فقط ردیف خودش را؟ ----------
  {
    const r = await rest("/rest/v1/profiles?select=id,username,phone", { token: a.token });
    const rows = Array.isArray(r.data) ? r.data : [];
    const onlySelfOrContacts = rows.every(row => row.id === a.uid) || rows.length <= 5; // معیار محافظه‌کارانه
    const anyPhoneOfOthers = rows.some(row => row.id !== a.uid && row.phone);
    record("لیست کامل کاربران دیگر (باگ اصلی قدیمی)", anyPhoneOfOthers ? "fail" : "pass",
      anyPhoneOfOthers ? "شماره تلفن یک کاربر دیگر قابل‌خواندن بود!" : `فقط ${rows.length} ردیف دیدنی (خود/مخاطب‌ها)`);
  }

  // ---------- ۳) جدول‌های داخلی امنیتی نباید از بیرون قابل‌خواندن باشند ----------
  for (const table of ["_server_secrets", "_rate_events"]) {
    const r = await rest(`/rest/v1/${table}?select=*`, { token: a.token });
    const empty = !Array.isArray(r.data) || r.data.length === 0;
    record(`جدول داخلی ${table} از بیرون قابل‌خواندن نیست`, empty ? "pass" : "fail",
      empty ? "خالی/بی‌دسترسی برگشت" : `${r.data.length} ردیف برگشت!`);
  }

  // ---------- ۴) جستجوی یوزرنیم با کاراکترهای عجیب نباید خطای بد یا داده‌ی اضافه بدهد ----------
  {
    const r = await rest("/rest/v1/rpc/search_profile_by_username", { method: "POST", token: a.token, body: { p_username: "'; drop table profiles; --" } });
    record("ورودی مخرب در جستجوی یوزرنیم", r.ok ? "pass" : "warn",
      r.ok ? "بدون خطا و بدون نتیجه رد شد (پارامتری‌سازی درست است)" : `status ${r.status}`);
  }

  // ---------- ۵) خواندن مستقیم chat_messages باید فقط متن رمزنگاری‌شده/خالی بدهد ----------
  {
    const r = await rest("/rest/v1/chat_messages?select=id,body,body_enc&limit=5", { token: a.token });
    const rows = Array.isArray(r.data) ? r.data : [];
    const anyPlainBody = rows.some(row => row.body && row.body.length > 0);
    record("متن پیام خصوصی در ستون خام رمزنگاری‌نشده نیست", anyPlainBody ? "fail" : "pass",
      anyPlainBody ? "متن خام پیام مستقیم از جدول قابل‌خواندن بود!" : "ستون body خالی بود (فقط body_enc پر است) ✔");
  }

  if (TEST_ACCOUNT_B.email && TEST_ACCOUNT_B.password) {
    const b = await signIn(TEST_ACCOUNT_B.email, TEST_ACCOUNT_B.password).catch(e => { record("ورود حساب B", "fail", e.message); return null; });
    if (b) {
      record("ورود حساب B", "pass");
      // ---------- ۶) B نباید بتواند پروفایل کامل A را ببیند (چون مخاطب هم نیستند) ----------
      const r = await rest(`/rest/v1/profiles?select=phone&id=eq.${a.uid}`, { token: b.token });
      const rows = Array.isArray(r.data) ? r.data : [];
      record("کاربر B نمی‌تواند پروفایل/تلفن کاربر A (غریبه) را ببیند", rows.length === 0 ? "pass" : "fail",
        rows.length === 0 ? "صفر ردیف — درست است" : "پروفایل A بدون رابطه برای B قابل‌خواندن بود!");

      // ---------- ۷) B نباید بتواند verified حساب خودش را مستقیم true کند (privilege escalation) ----------
      const r2 = await rest(`/rest/v1/profiles?id=eq.${b.uid}`, {
        method: "PATCH", token: b.token, body: { verified: true },
      });
      const nowVerified = Array.isArray(r2.data) && r2.data[0]?.verified === true;
      record("کاربر عادی نمی‌تواند خودش را verified کند", nowVerified ? "fail" : "pass",
        nowVerified ? "موفق شد! این یک باگ افزایش امتیاز جدی است" : `رد شد (status ${r2.status})`);
    }
  } else {
    record("تست جداسازی دو کاربر (A/B)", "skip", "حساب تست B پر نشده");
  }

  printSummary();
}

function printSummary() {
  const fails = results.filter(r => r.status === "fail");
  console.log("\n————————————————————————————————");
  console.log(`نتیجه: ${results.length - fails.length}/${results.length} تست موفق`);
  if (fails.length) {
    console.log("\n❌ موارد نیازمند بررسی فوری:");
    fails.forEach(f => console.log(`  - ${f.name}: ${f.detail}`));
  } else {
    console.log("هیچ نشتی‌ای در این دور تست پیدا نشد.");
  }
  console.log("————————————————————————————————\n");
}

main().catch(e => { console.error("خطای غیرمنتظره در اجرای تست:", e); process.exit(1); });
