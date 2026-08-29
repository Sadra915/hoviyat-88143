/**
 * error-handler.js
 * عمداً خارج از ماژول‌ها و اولین اسکریپتی است که اجرا می‌شود — تا حتی اگر
 * بارگذاری app.js (یا هر import داخلش، مثل یک تایپوی export نام Firebase)
 * کامل شکست بخورد، کاربر یک صفحه کاملاً سفید و بی‌توضیح نبیند.
 */
window.addEventListener("error", e => showGlobalError(e.message));
window.addEventListener("unhandledrejection", e => showGlobalError(e.reason?.message || String(e.reason)));

function showGlobalError(msg) {
  const banner = document.getElementById("globalErrorBanner");
  const text = document.getElementById("globalErrorText");
  if (!banner || !text) return;
  text.textContent = msg;
  banner.hidden = false;
  const boot = document.getElementById("bootScreen");
  if (boot) boot.classList.add("hide");
}
