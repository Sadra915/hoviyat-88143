/**
 * admin.js
 * پنل ادمین — فقط برای UID مشخص‌شده در ADMIN_UID قابل مشاهده است.
 * توجه: این گیت سمت کلاینت صرفاً برای تجربه کاربری است؛ محافظت واقعی از
 * طریق Firestore Security Rules انجام می‌شود (فایل firestore.rules).
 */
import { auth, db, ADMIN_UID } from "./firebase-init.js";
import { collection, getDocs, query, orderBy, limit, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function isAdmin() {
  return auth.currentUser?.uid === ADMIN_UID;
}

export async function renderAdminPanel(container) {
  if (!isAdmin()) {
    container.innerHTML = `<p class="admin-denied">دسترسی به این بخش فقط برای ادمین سامانه مجاز است.</p>`;
    return;
  }

  container.innerHTML = `<div class="admin-loading skeleton" style="height:120px"></div>`;

  try {
    const [usersSnap, reportsSnap] = await Promise.all([
      getDocs(query(collection(db, "users"), orderBy("createdAt", "desc"), limit(200))),
      getDocs(query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(100))).catch(() => ({ forEach: () => {} })),
    ]);

    const users = [];
    usersSnap.forEach(d => users.push({ id: d.id, ...d.data() }));
    const reports = [];
    reportsSnap.forEach(d => reports.push({ id: d.id, ...d.data() }));

    container.innerHTML = `
      <div class="admin-stats">
        <div class="admin-stat"><span class="num">${users.length}</span><span class="lbl">کاربر ثبت‌شده</span></div>
        <div class="admin-stat"><span class="num">${users.filter(u => u.online).length}</span><span class="lbl">آنلاین الان</span></div>
        <div class="admin-stat"><span class="num">${reports.length}</span><span class="lbl">گزارش</span></div>
      </div>
      <h3 class="admin-section-title">👥 کاربران</h3>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>نام</th><th>یوزرنیم</th><th>وضعیت</th><th>تاریخ عضویت</th><th>تایید</th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td>${u.displayName || "—"}${u.verified ? ' <span class="verified-badge" title="تاییدشده">✓</span>' : ""}</td>
                <td>@${u.username || "—"}</td>
                <td>${u.online ? '<span class="badge-on">آنلاین</span>' : '<span class="badge-off">آفلاین</span>'}</td>
                <td>${fmtDate(u.createdAt)}</td>
                <td><button class="btn-outline small verify-toggle-btn" data-uid="${u.id}" data-verified="${!!u.verified}">${u.verified ? "لغو تایید" : "تایید"}</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <h3 class="admin-section-title">🚩 گزارش‌ها</h3>
      <div class="admin-table-wrap">
        ${reports.length ? `
        <table class="admin-table">
          <thead><tr><th>گزارش‌دهنده</th><th>دلیل</th><th>وضعیت</th><th>تاریخ</th></tr></thead>
          <tbody>
            ${reports.map(r => `
              <tr>
                <td>${r.reporterId?.slice(0, 8) || "—"}</td>
                <td>${escapeHtml(r.reason || "—")}</td>
                <td>${r.status || "open"}</td>
                <td>${fmtDate(r.createdAt)}</td>
              </tr>`).join("")}
          </tbody>
        </table>` : `<p class="admin-empty">گزارشی ثبت نشده است.</p>`}
      </div>
    `;

    container.querySelectorAll(".verify-toggle-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const uid = btn.dataset.uid;
        const currentlyVerified = btn.dataset.verified === "true";
        btn.disabled = true;
        try {
          await updateDoc(doc(db, "users", uid), { verified: !currentlyVerified });
          renderAdminPanel(container); // بازخوانی لیست برای نمایش وضعیت به‌روز
        } catch (err) {
          btn.disabled = false;
          alert("خطا در تغییر وضعیت تایید: " + err.message);
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<p class="admin-denied">خطا در بارگذاری داده ادمین: ${escapeHtml(err.message)}</p>`;
  }
}

function fmtDate(ts) {
  if (!ts?.toDate) return "—";
  return ts.toDate().toLocaleDateString("fa-IR");
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
