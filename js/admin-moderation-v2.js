import { supabase, auth } from "./supabase-init.js";
import { icon } from "./icons.js";

const ESC = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#39;"}[c]));
const fmt = ts => ts ? new Date(ts).toLocaleString("fa-IR") : "—";
const roles = ["admin","moderator","helper","member"];
const perms = [
  ["send_messages","ارسال پیام"],["send_media","ارسال رسانه"],["send_files","ارسال فایل"],
  ["send_voice","ارسال صوت"],["send_stickers","استیکر و GIF"],["add_users","افزودن اعضا"],
  ["pin_messages","پین پیام"],["manage_topics","مدیریت موضوعات"],["manage_calls","مدیریت تماس"],
  ["manage_media","مدیریت رسانه"]
];

export async function mountAdminModerationV2(container, initial = {}) {
  if (auth.currentUser?.id !== (initial.adminUid || auth.currentUser?.id)) return;
  const shell = document.createElement("section");
  shell.className = "admin-v2-shell glass";
  shell.innerHTML = `
    <div class="admin-v2-head">
      <div><span class="admin-kicker">HOVIYAT CONTROL</span><h2>${icon("shieldCheck",{size:18})} مرکز مدیریت و نظارت</h2><p>گروه‌ها، اعضا، گزارش‌ها، نقش‌ها و اقدامات حساس از یک پنل واحد.</p></div>
      <button class="admin-v2-refresh btn-outline small">↻ بروزرسانی</button>
    </div>
    <div class="admin-v2-tabs" role="tablist">
      <button data-tab="groups" class="active">👥 کنترل گروه</button>
      <button data-tab="reports">🚨 گزارش‌ها</button>
      <button data-tab="verify">☑️ تیک آبی</button>
      <button data-tab="audit">📋 رویدادها</button>
    </div>
    <div class="admin-v2-body"></div>`;
  container.prepend(shell);

  const body = shell.querySelector(".admin-v2-body");
  shell.querySelectorAll("[data-tab]").forEach(btn => btn.onclick = () => {
    shell.querySelectorAll("[data-tab]").forEach(x => x.classList.toggle("active", x === btn));
    renderTab(btn.dataset.tab);
  });
  shell.querySelector(".admin-v2-refresh").onclick = () => renderTab(shell.querySelector("[data-tab].active").dataset.tab);

  async function renderTab(tab) {
    body.innerHTML = `<div class="admin-v2-loading"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div>`;
    if (tab === "groups") return renderGroups();
    if (tab === "reports") return renderReports();
    if (tab === "verify") return renderVerify();
    return renderAudit();
  }

  async function renderGroups() {
    const { data: groups, error } = await supabase.from("groups").select("id,name,members,admins,owner_id,is_public,is_blocked,created_at").order("created_at", { ascending: false }).limit(200);
    if (error) return fail(error.message);
    body.innerHTML = `
      <div class="admin-v2-grid">
        <div class="admin-v2-card">
          <label>انتخاب گروه</label>
          <select id="modGroupSelect"><option value="">یک گروه را انتخاب کنید</option>${(groups||[]).map(g => `<option value="${g.id}">${ESC(g.name || "گروه بدون نام")} · ${(g.members||[]).length} عضو</option>`).join("")}</select>
          <div class="admin-v2-note">مدیریت عضو، نقش، محدودیت، بن و مجوزها از طریق RPC امن سمت سرور انجام می‌شود.</div>
        </div>
        <div class="admin-v2-card"><div class="admin-mini-stats"><div><b>${groups?.length||0}</b><span>گروه</span></div><div><b>${(groups||[]).filter(g=>g.is_blocked).length}</b><span>مسدود</span></div></div></div>
      </div><div id="memberControlPanel" class="admin-v2-card" hidden></div>`;
    const sel = body.querySelector("#modGroupSelect");
    sel.onchange = () => loadMembers(sel.value);
  }

  async function loadMembers(groupId) {
    const panel = body.querySelector("#memberControlPanel");
    if (!groupId) { panel.hidden = true; return; }
    panel.hidden = false;
    panel.innerHTML = `<div class="admin-v2-loading"><span class="skeleton"></span><span class="skeleton"></span></div>`;
    const [{ data: group }, { data: modRows }, { data: profiles }] = await Promise.all([
      supabase.from("groups").select("id,name,members,admins,owner_id").eq("id",groupId).maybeSingle(),
      supabase.rpc("group_moderation_snapshot", { p_group_id: groupId }),
      supabase.from("profiles").select("id,username,display_name,photo_url,verified,online").in("id", group?.members || [])
    ]);
    const pMap = Object.fromEntries((profiles||[]).map(p => [p.id,p]));
    const mMap = Object.fromEntries((modRows||[]).map(r => [r.user_id,r]));
    const members = group?.members || [];
    panel.innerHTML = `
      <div class="admin-v2-panel-head"><div><span class="admin-kicker">MEMBERS</span><h3>${ESC(group?.name||"گروه")}</h3></div><input id="memberFilter" placeholder="جستجوی عضو..." /></div>
      <div class="member-grid" id="memberGrid"></div>`;
    const renderMembers = () => {
      const q = (panel.querySelector("#memberFilter").value || "").trim().toLowerCase();
      panel.querySelector("#memberGrid").innerHTML = members.map(uid => {
        const p = pMap[uid] || {}; const m = mMap[uid] || {};
        const role = uid === group?.owner_id ? "owner" : (m.role || (group?.admins||[]).includes(uid) ? "admin" : "member");
        const blocked = m.banned_until && new Date(m.banned_until).getTime() > Date.now();
        const restricted = m.restricted_until && new Date(m.restricted_until).getTime() > Date.now();
        const hay = `${p.display_name||""} ${p.username||""}`.toLowerCase();
        if (q && !hay.includes(q)) return "";
        return `<article class="member-control-card" data-uid="${uid}">
          <div class="member-control-main"><div class="mini-avatar">${p.photo_url ? `<img src="${ESC(p.photo_url)}" alt="">` : ESC((p.display_name||p.username||"؟")[0])}</div><div><strong>${ESC(p.display_name||p.username||"کاربر")}${p.verified?` <span class="verified-badge">✓</span>`:""}</strong><small>@${ESC(p.username||"—")}</small></div></div>
          <div class="member-badges"><span class="role-badge">${role}</span>${blocked?`<span class="state-badge danger">ban</span>`:""}${restricted?`<span class="state-badge warn">محدود</span>`:""}</div>
          <div class="member-actions">
            <button data-act="promote">ادمین</button><button data-act="role">سطح</button><button data-act="restrict">محدود</button><button data-act="mute">بی‌صدا</button><button data-act="remove">حذف</button><button data-act="ban" class="danger">بن</button><button data-act="permissions">مجوزها</button>
          </div></article>`;
      }).join("") || `<div class="empty-hint">عضوی پیدا نشد.</div>`;
      panel.querySelectorAll(".member-control-card").forEach(card => card.querySelectorAll("button").forEach(btn => btn.onclick = () => memberAction(group, pMap[card.dataset.uid], mMap[card.dataset.uid]||{}, btn.dataset.act)));
    };
    panel.querySelector("#memberFilter").oninput = renderMembers;
    renderMembers();
  }

  async function memberAction(group, profile, moderation, action) {
    if (action === "remove") {
      if (!confirm(`عضو ${profile?.display_name||profile?.username||"کاربر"} حذف شود؟`)) return;
      return rpcAction(group.id, profile.id, "remove", null, "حذف توسط مدیر", null, null, false);
    }
    if (action === "ban") {
      const days = prompt("مدت بن به روز (خالی = دائمی):", "7");
      const minutes = days === null || days === "" ? null : Math.max(1, Number(days)) * 1440;
      return rpcAction(group.id, profile.id, "ban", minutes, prompt("دلیل بن:", "نقض قوانین") || "نقض قوانین");
    }
    if (action === "restrict") {
      const minutes = Math.max(1, Number(prompt("مدت محدودیت به دقیقه:", "60") || 60));
      return rpcAction(group.id, profile.id, "restrict", minutes, "محدودیت ارسال پیام");
    }
    if (action === "mute") {
      const minutes = Math.max(1, Number(prompt("مدت بی‌صدا به دقیقه:", "60") || 60));
      return rpcAction(group.id, profile.id, "mute", minutes, "کاهش مزاحمت");
    }
    if (action === "promote") {
      const role = prompt(`سطح ادمینی را انتخاب کن: ${roles.join(" / ")}`, "admin");
      if (!roles.includes(role) || role === "member") return;
      return rpcAction(group.id, profile.id, "set_role", null, null, null, role);
    }
    if (action === "role") {
      const role = prompt(`سطح فعلی ${moderation.role||"member"}. سطح جدید: ${roles.join(" / ")}`, moderation.role||"moderator");
      if (!roles.includes(role)) return;
      return rpcAction(group.id, profile.id, "set_role", null, null, null, role);
    }
    if (action === "permissions") {
      const selected = {};
      const text = perms.map(([key,label]) => `${key}=${((moderation.permissions||{})[key] ?? true) ? "1" : "0"} (${label})`).join("\n");
      const answer = prompt("مجوزها را به شکل key=0 یا key=1 بنویس؛ نمونه: send_messages=0\n\n"+text, "");
      if (!answer) return;
      answer.split(/[\n,]+/).forEach(part => { const [k,v] = part.split("=").map(x=>x?.trim()); if (k) selected[k] = v === "1" || v === "true"; });
      return rpcAction(group.id, profile.id, "set_permissions", null, null, selected, moderation.role||"member");
    }
  }

  async function rpcAction(groupId, uid, action, duration, reason, permissions, role, deleteRecent) {
    try {
      const { error } = await supabase.rpc("group_moderation_action", {
        p_group_id: groupId, p_target_uid: uid, p_action: action, p_duration_minutes: duration,
        p_reason: reason, p_permissions: permissions, p_role: role, p_delete_recent: !!deleteRecent
      });
      if (error) throw error;
      if (typeof window.showToast === "function") window.showToast("عملیات با موفقیت انجام شد ✅");
      await loadMembers(groupId);
    } catch (e) { alert(e.message || "عملیات ناموفق بود"); }
  }

  async function renderReports() {
    const { data, error } = await supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) return fail(error.message);
    const reports = data || [];
    body.innerHTML = `<div class="admin-v2-card"><div class="admin-v2-panel-head"><div><span class="admin-kicker">MODERATION QUEUE</span><h3>مرکز گزارش‌ها</h3></div><select id="reportFilter"><option value="all">همه</option><option value="new">جدید</option><option value="reviewing">در بررسی</option><option value="resolved">حل‌شده</option><option value="escalated">ارجاع‌شده</option></select></div><div class="report-grid" id="reportGrid"></div></div>`;
    const render = () => {
      const filter = body.querySelector("#reportFilter").value;
      const rows = filter === "all" ? reports : reports.filter(r => (r.status||"new") === filter);
      body.querySelector("#reportGrid").innerHTML = rows.map(r => `<article class="report-control-card" data-id="${r.id}"><div class="report-meta"><span class="priority-${ESC(r.priority||"medium")}">${ESC(r.priority||"medium")}</span><span>${ESC(r.target_type||"—")}</span><small>${fmt(r.created_at)}</small></div><p>${ESC(r.content_preview||r.reason||"گزارش بدون متن")}</p><div class="report-actions"><button data-status="reviewing">در بررسی</button><button data-status="resolved">حل شد</button><button data-status="dismissed">رد شد</button><button data-status="escalated">ارجاع</button></div></article>`).join("") || `<div class="empty-hint">گزارشی نیست.</div>`;
      body.querySelectorAll(".report-control-card button").forEach(b => b.onclick = async () => { const id=b.closest(".report-control-card").dataset.id; const {error}=await supabase.rpc("admin_update_report",{p_report_id:id,p_status:b.dataset.status}); if(error) alert(error.message); else renderReports(); });
    };
    body.querySelector("#reportFilter").onchange = render;
    render();
  }

  async function renderVerify() {
    const { data, error } = await supabase.from("verification_requests").select("*").order("created_at", {ascending:false}).limit(200);
    if (error) return fail(error.message);
    body.innerHTML = `<div class="admin-v2-card"><span class="admin-kicker">VERIFICATION</span><h3>مرکز تیک آبی</h3><div class="verify-grid">${(data||[]).map(r=>`<article class="verify-control-card"><div><b>${ESC(r.target_type)}</b><span>${ESC(r.status)}</span></div><p>${ESC(r.message)}</p><small>${fmt(r.created_at)}</small>${r.status === "pending"?`<div class="report-actions"><button data-id="${r.id}" data-ok="1">تأیید</button><button data-id="${r.id}" data-ok="0">رد</button></div>`:""}</article>`).join("")||`<div class="empty-hint">درخواستی نیست.</div>`}</div></div>`;
    body.querySelectorAll(".verify-control-card button").forEach(btn=>btn.onclick=async()=>{const note=prompt("یادداشت بررسی (اختیاری):","");const {error}=await supabase.rpc("admin_review_verification_request",{p_request_id:btn.dataset.id,p_approve:btn.dataset.ok==="1",p_admin_note:note});if(error)alert(error.message);else renderVerify();});
  }

  async function renderAudit() {
    const { data, error } = await supabase.from("admin_action_log").select("*").order("created_at", {ascending:false}).limit(200);
    if (error) return fail(error.message);
    body.innerHTML = `<div class="admin-v2-card"><span class="admin-kicker">AUDIT LOG</span><h3>رویدادهای مدیریتی</h3><div class="audit-list">${(data||[]).map(x=>`<div class="audit-row"><strong>${ESC(x.action)}</strong><span>${ESC(x.target_type||"—")}</span><small>${fmt(x.created_at)}</small></div>`).join("")||`<div class="empty-hint">رویدادی ثبت نشده.</div>`}</div></div>`;
  }

  function fail(message) { body.innerHTML = `<div class="admin-v2-error">${ESC(message)}</div>`; }
  renderTab("groups");
}
