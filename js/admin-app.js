/**
 * admin-app.js
 * نقطه ورود مستقل صفحه ادمین (admin.html) — کاملاً جدا از اپلیکیشن اصلی.
 * حتی اگر کسی مستقیم وارد این صفحه شود، تا وقتی با حساب ADMIN_UID لاگین
 * نکند چیزی جز فرم ورود نمی‌بیند؛ محافظت واقعی هم توسط Supabase RLS
 * انجام می‌شود (سمت سرور)، نه فقط این چک سمت کلاینت.
 */
import { supabase, auth, ADMIN_UID } from "./supabase-init.js";
import { renderAdminPanel } from "./admin.js";

const $ = sel => document.querySelector(sel);

function showOnly(id) {
  ["adminLoginWrap", "adminDenied", "adminPage"].forEach(x => $(`#${x}`).hidden = x !== id);
}

async function handleAuthState(uid) {
  if (!uid) { showOnly("adminLoginWrap"); return; }
  if (uid !== ADMIN_UID) { showOnly("adminDenied"); return; }
  showOnly("adminPage");
  renderAdminPanel($("#adminHolder"));
  loadAnnouncement();
}

supabase.auth.getSession().then(({ data }) => handleAuthState(data.session?.user?.id || null));
supabase.auth.onAuthStateChange((_event, session) => handleAuthState(session?.user?.id || null));

async function loadAnnouncement() {
  const { data } = await supabase.from("announcements").select("text").eq("id", "latest").maybeSingle();
  $("#announceText").value = data?.text || "";
}

$("#announceSendBtn").addEventListener("click", async () => {
  const text = $("#announceText").value.trim();
  if (!text) { $("#announceStatus").textContent = "متن اعلان خالی است."; return; }
  await supabase.from("announcements").upsert({ id: "latest", text, updated_at: new Date().toISOString() });
  $("#announceStatus").textContent = "✅ اعلان ارسال شد — کاربران در باز کردن بعدی اپ می‌بینند.";
});

$("#announceClearBtn").addEventListener("click", async () => {
  await supabase.from("announcements").upsert({ id: "latest", text: "", updated_at: new Date().toISOString() });
  $("#announceText").value = "";
  $("#announceStatus").textContent = "اعلان فعلی حذف شد.";
});

$("#adminLoginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("#adminLoginError").textContent = "";
  const { error } = await supabase.auth.signInWithPassword({
    email: $("#adminEmail").value.trim(), password: $("#adminPassword").value,
  });
  if (error) {
    const map = {
      "Invalid login credentials": "ایمیل یا رمز عبور اشتباه است.",
    };
    $("#adminLoginError").textContent = map[error.message] || error.message;
  }
});

$("#adminDeniedLogout").addEventListener("click", () => supabase.auth.signOut());
$("#adminLogoutBtn").addEventListener("click", () => supabase.auth.signOut());
