/**
 * admin.js
 * پنل ادمین — فقط برای UID مشخص‌شده در ADMIN_UID قابل مشاهده است.
 * توجه: این گیت سمت کلاینت صرفاً برای تجربه کاربری است؛ محافظت واقعی از
 * طریق Supabase Row Level Security انجام می‌شود (فایل supabase/schema.sql، تابع is_admin()).
 */
import { supabase, auth, ADMIN_UID } from "./supabase-init.js";
import { icon } from "./icons.js";
import { adminListAllGroups, adminSetGroupBlocked } from "./groups.js";
import { mountAdminModerationV2 } from "./admin-moderation-v2.js";

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
    const [usersRes, reportsRes, groups, verifyReqsRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(100),
      adminListAllGroups().catch(err => { console.error(err); return []; }),
      supabase.from("verification_requests").select("*").order("created_at", { ascending: false }).limit(100),
    ]);

    const users = (usersRes.data || []).map(u => ({ id: u.id, ...u }));
    const reports = (reportsRes.data || []).map(r => ({ id: r.id, ...r }));
    const verifyReqs = verifyReqsRes.data || [];
    const pendingReqs = verifyReqs.filter(r => r.status === "pending");

    const channelTargetIds = [...new Set(verifyReqs.filter(r => r.target_type === "channel").map(r => r.target_id))];
    const targetChannels = channelTargetIds.length
      ? await supabase.from("channels").select("id, name").in("id", channelTargetIds)
      : { data: [] };
    const channelMap = Object.fromEntries((targetChannels.data || []).map(c => [c.id, c]));
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    const now = Date.now();
    const isSuspended = u => u.suspended_until && new Date(u.suspended_until).getTime() > now;

    container.innerHTML = `
      <div class="admin-stats">
        <div class="admin-stat"><span class="num">${users.length}</span><span class="lbl">کاربر ثبت‌شده</span></div>
        <div class="admin-stat"><span class="num">${users.filter(u => u.online).length}</span><span class="lbl">آنلاین الان</span></div>
        <div class="admin-stat"><span class="num">${users.filter(isSuspended).length}</span><span class="lbl">مسدود</span></div>
        <div class="admin-stat"><span class="num">${reports.length}</span><span class="lbl">گزارش</span></div>
        <div class="admin-stat"><span class="num">${groups.length}</span><span class="lbl">گروه</span></div>
        <div class="admin-stat"><span class="num">${pendingReqs.length}</span><span class="lbl">درخواست تیک آبی</span></div>
      </div>

      <h3 class="admin-section-title">${icon("users", { size: 16, className: "chat-kind-ic" })} کاربران</h3>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>نام</th><th>یوزرنیم</th><th>وضعیت</th><th>تاریخ عضویت</th><th>تایید</th><th>مسدودسازی</th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr class="${isSuspended(u) ? "group-blocked-row" : ""}">
                <td>${escapeHtml(u.display_name || "—")}${u.verified ? ` <span class="verified-badge" title="تاییدشده">${icon("check", { size: 11 })}</span>` : ""}</td>
                <td>@${escapeHtml(u.username || "—")}</td>
                <td>${u.online ? '<span class="badge-on">آنلاین</span>' : '<span class="badge-off">آفلاین</span>'}${isSuspended(u) ? `<br><small class="badge-off">مسدود تا ${fmtDate(u.suspended_until)}${u.suspension_reason ? " — " + escapeHtml(u.suspension_reason) : ""}</small>` : ""}</td>
                <td>${fmtDate(u.created_at)}</td>
                <td><button class="btn-outline small verify-toggle-btn" data-uid="${u.id}" data-verified="${!!u.verified}">${u.verified ? "لغو تایید" : "تایید"}</button></td>
                <td>${isSuspended(u)
                  ? `<button class="btn-outline tiny unsuspend-btn" data-uid="${u.id}">آزادسازی</button>`
                  : `<button class="btn-outline tiny danger suspend-btn" data-uid="${u.id}">مسدود کردن</button>`}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>

      <h3 class="admin-section-title">${icon("shieldCheck", { size: 16, className: "chat-kind-ic" })} درخواست‌های تیک آبی</h3>
      <div class="admin-table-wrap">
        ${verifyReqs.length ? `
        <table class="admin-table">
          <thead><tr><th>درخواست‌دهنده</th><th>برای</th><th>متن درخواست</th><th>وضعیت</th><th>تاریخ</th><th></th></tr></thead>
          <tbody>
            ${verifyReqs.map(r => {
              const requester = userMap[r.requester_id];
              const targetLabel = r.target_type === "account"
                ? "حساب کاربری خودش"
                : `کانال «${escapeHtml(channelMap[r.target_id]?.name || "—")}»`;
              const statusLabel = { pending: "در انتظار بررسی", approved: "تاییدشده", rejected: "ردشده" }[r.status] || r.status;
              return `
              <tr>
                <td>${requester ? `@${escapeHtml(requester.username)}` : r.requester_id.slice(0, 8)}</td>
                <td>${targetLabel}</td>
                <td class="verify-req-message">${escapeHtml(r.message)}</td>
                <td><span class="badge-${r.status === "approved" ? "on" : r.status === "rejected" ? "off" : ""}">${statusLabel}</span></td>
                <td>${fmtDate(r.created_at)}</td>
                <td>${r.status === "pending" ? `
                  <button class="btn-outline tiny verify-req-approve" data-id="${r.id}">تایید</button>
                  <button class="btn-outline tiny danger verify-req-reject" data-id="${r.id}">رد</button>
                ` : (r.admin_note ? `<small>${escapeHtml(r.admin_note)}</small>` : "")}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>` : `<p class="admin-empty">درخواستی ثبت نشده است.</p>`}
      </div>

      <h3 class="admin-section-title">${icon("users", { size: 16, className: "chat-kind-ic" })} گروه‌ها</h3>
      <div class="admin-table-wrap">
        ${groups.length ? `
        <table class="admin-table">
          <thead><tr><th>نام گروه</th><th>اعضا</th><th>وضعیت</th><th>تاریخ ساخت</th><th></th></tr></thead>
          <tbody>
            ${groups.map(g => `
              <tr class="${g.isBlocked ? "group-blocked-row" : ""}">
                <td>${escapeHtml(g.name || "—")}</td>
                <td>${g.members.length}</td>
                <td>${g.isBlocked ? `<span class="badge-off">مسدود${g.blockedReason ? " — " + escapeHtml(g.blockedReason) : ""}</span>` : '<span class="badge-on">فعال</span>'}</td>
                <td>${fmtDate(g.createdAt)}</td>
                <td><button class="btn-outline tiny group-block-toggle-btn" data-gid="${g.id}" data-blocked="${g.isBlocked}">${g.isBlocked ? "آزادسازی" : "مسدود کردن"}</button></td>
              </tr>`).join("")}
          </tbody>
        </table>` : `<p class="admin-empty">گروهی پیدا نشد.</p>`}
      </div>

      <h3 class="admin-section-title">${icon("flag", { size: 16, className: "chat-kind-ic" })} گزارش‌ها</h3>
      <div class="admin-table-wrap">
        ${reports.length ? `
        <table class="admin-table">
          <thead><tr><th>گزارش‌دهنده</th><th>نوع</th><th>محتوا</th><th>دلیل</th><th>وضعیت</th><th>تاریخ</th></tr></thead>
          <tbody>
            ${reports.map(r => `
              <tr>
                <td>${userMap[r.reporter_id] ? `@${escapeHtml(userMap[r.reporter_id].username)}` : (r.reporter_id?.slice(0, 8) || "—")}</td>
                <td>${reportTargetLabel(r.target_type)}</td>
                <td>${escapeHtml(r.content_preview || "—")}</td>
                <td>${escapeHtml(r.reason || "—")}</td>
                <td>${r.status || "open"}</td>
                <td>${fmtDate(r.created_at)}</td>
              </tr>`).join("")}
          </tbody>
        </table>` : `<p class="admin-empty">گزارشی ثبت نشده است.</p>`}
      </div>
    `;

    mountAdminModerationV2(container, { adminUid: ADMIN_UID });

    container.querySelectorAll(".verify-toggle-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const uid = btn.dataset.uid;
        const currentlyVerified = btn.dataset.verified === "true";
        btn.disabled = true;
        try {
          const { error } = await supabase.from("profiles").update({ verified: !currentlyVerified }).eq("id", uid);
          if (error) throw error;
          renderAdminPanel(container);
        } catch (err) {
          btn.disabled = false;
          alert("خطا در تغییر وضعیت تایید: " + err.message);
        }
      });
    });

    container.querySelectorAll(".suspend-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const uid = btn.dataset.uid;
        const daysStr = prompt("مسدودسازی برای چند روز؟ (برای همیشه، 0 بنویس)", "7");
        if (daysStr === null) return;
        const days = parseInt(daysStr, 10);
        if (isNaN(days) || days < 0) { alert("عدد نامعتبر است."); return; }
        const reason = prompt("دلیل مسدودسازی (نمایش داده می‌شود به خود کاربر):", "ارسال هرزنامه") || "";
        btn.disabled = true;
        try {
          const { error } = await supabase.rpc("admin_suspend_user", { p_uid: uid, p_days: days, p_reason: reason });
          if (error) throw error;
          renderAdminPanel(container);
        } catch (err) {
          btn.disabled = false;
          alert("خطا در مسدودسازی: " + err.message);
        }
      });
    });

    container.querySelectorAll(".unsuspend-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const uid = btn.dataset.uid;
        btn.disabled = true;
        try {
          const { error } = await supabase.rpc("admin_unsuspend_user", { p_uid: uid });
          if (error) throw error;
          renderAdminPanel(container);
        } catch (err) {
          btn.disabled = false;
          alert("خطا در آزادسازی: " + err.message);
        }
      });
    });

    container.querySelectorAll(".verify-req-approve, .verify-req-reject").forEach(btn => {
      btn.addEventListener("click", async () => {
        const approve = btn.classList.contains("verify-req-approve");
        const note = prompt(approve ? "یادداشت (اختیاری، برای خودت):" : "دلیل رد درخواست (اختیاری):") || null;
        btn.disabled = true;
        try {
          const { error } = await supabase.rpc("admin_review_verification_request", {
            p_request_id: btn.dataset.id, p_approve: approve, p_admin_note: note,
          });
          if (error) throw error;
          renderAdminPanel(container);
        } catch (err) {
          btn.disabled = false;
          alert("خطا در بررسی درخواست: " + err.message);
        }
      });
    });

    container.querySelectorAll(".group-block-toggle-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const gid = btn.dataset.gid;
        const currentlyBlocked = btn.dataset.blocked === "true";
        btn.disabled = true;
        try {
          let reason = null;
          if (!currentlyBlocked) {
            reason = prompt("دلیل مسدودسازی (اختیاری):", "نقض قوانین پیام‌رسان") || "";
          }
          await adminSetGroupBlocked(gid, !currentlyBlocked, reason);
          renderAdminPanel(container);
        } catch (err) {
          btn.disabled = false;
          alert("خطا در تغییر وضعیت گروه: " + err.message);
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<p class="admin-denied">خطا در بارگذاری داده ادمین: ${escapeHtml(err.message)}</p>`;
  }
}

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("fa-IR");
}
function reportTargetLabel(type) {
  return { chat_message: "پیام خصوصی", group_message: "پیام گروه", channel_post: "پست کانال", group: "گروه" }[type] || "—";
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
