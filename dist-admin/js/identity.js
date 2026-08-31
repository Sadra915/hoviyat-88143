/**
 * identity.js
 * کارت هویت دیجیتال — جایگزین رد و بدل شماره تلفن: فقط QR/یوزرنیم به اشتراک گذاشته می‌شود.
 * از کتابخانه سبک QRCode.js (CDN، global، بدون کلید) استفاده می‌کند.
 * (نسخه Supabase)
 */
import { supabase, auth, uniqueChannelName } from "./supabase-init.js";
import { mapProfile, requestAccountVerification } from "./auth.js";
import { icon } from "./icons.js";

let channel = null;

export function renderIdentityCard(container) {
  if (channel) { supabase.removeChannel(channel); channel = null; }
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  async function refetch() {
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (!data) return;
    const u = mapProfile(data);
    render(u);
  }

  function render(u) {
    const shareUrl = `${location.origin}${location.pathname}#/u/${u.username}`;

    container.innerHTML = `
      <div class="idcard">
        <div class="idcard-glow"></div>
        <div class="idcard-photo">${u.photoURL
          ? `<img src="${escapeHtml(u.photoURL)}" alt="عکس پروفایل">`
          : `<span>${(u.displayName || u.username || "؟")[0]}</span>`}</div>
        <h2 class="idcard-name">${escapeHtml(u.displayName || u.username)}${u.verified ? ` <span class="verified-badge" title="حساب تاییدشده">${icon("check", { size: 11 })}</span>` : ""}</h2>
        <div class="idcard-username">@${escapeHtml(u.username)}</div>
        ${u.bio ? `<p class="idcard-bio">${escapeHtml(u.bio)}</p>` : ""}
        <div class="idcard-status ${u.online ? "on" : "off"}">
          <span class="dot"></span> ${u.online ? "آنلاین" : "آخرین بازدید اخیراً"}
        </div>
        ${u.phone ? `
        <div class="idcard-info-rows">
          <div class="info-row"><span class="info-label">شماره تلفن</span><span class="info-value">${escapeHtml(u.phone)}</span></div>
        </div>` : ""}
        <div id="idcardQr" class="idcard-qr"></div>
        <div class="contact-action-row">
          <button id="idShareBtn" class="contact-action"><span>${icon("share2", { size: 18 })}</span>اشتراک‌گذاری</button>
          <button id="idCopyBtn" class="contact-action"><span>${icon("copy", { size: 18 })}</span>کپی یوزرنیم</button>
        </div>
        ${!u.verified ? `<button id="idRequestVerifyBtn" class="btn-outline full" style="margin-top:14px;">${icon("shieldCheck", { size: 16 })} درخواست تیک آبی برای این حساب</button>` : ""}
      </div>
    `;

    const qrHolder = document.getElementById("idcardQr");
    qrHolder.innerHTML = "";
    if (window.QRCode) {
      new window.QRCode(qrHolder, {
        text: shareUrl, width: 168, height: 168,
        colorDark: "#2E2E2E", colorLight: "#ffffff", correctLevel: window.QRCode.CorrectLevel.M,
      });
    }

    document.getElementById("idShareBtn").onclick = async () => {
      if (navigator.share) {
        navigator.share({ title: "هویت", text: `${u.displayName} را در هویت اضافه کن`, url: shareUrl }).catch(() => {});
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast("لینک کپی شد", "success");
      }
    };
    document.getElementById("idCopyBtn").onclick = async () => {
      await navigator.clipboard.writeText("@" + u.username);
      toast("یوزرنیم کپی شد", "success");
    };
    const verifyBtn = document.getElementById("idRequestVerifyBtn");
    if (verifyBtn) verifyBtn.onclick = async () => {
      const message = prompt("چرا فکر می‌کنی این حساب باید تیک آبی بگیره؟");
      if (!message || !message.trim()) return;
      try {
        await requestAccountVerification(message.trim());
        toast("درخواست تیک آبی ثبت شد — منتظر بررسی ادمین باش", "success");
      } catch (err) {
        toast(err.message || "خطا در ثبت درخواست.", "error");
      }
    };
  }

  refetch();
  channel = supabase
    .channel(uniqueChannelName(`identity-${uid}`))
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${uid}` }, refetch)
    .subscribe();
}

export function stopIdentityCard() {
  if (channel) { supabase.removeChannel(channel); channel = null; }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function toastEscape(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** type: "info" (پیش‌فرض) | "success" | "error" — کنار پیام یه آیکون واقعی (نه ایموجی) نشون می‌ده */
function toast(msg, type = "info") {
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  const iconName = type === "success" ? "check" : type === "error" ? "triangleAlert" : "";
  t.innerHTML = iconName
    ? `${icon(iconName, { size: 15, className: "toast-ic" })}<span>${toastEscape(msg)}</span>`
    : `<span>${toastEscape(msg)}</span>`;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 1800);
}

export { toast };
