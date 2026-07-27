/**
 * identity.js
 * کارت هویت دیجیتال — جایگزین رد و بدل شماره تلفن: فقط QR/یوزرنیم به اشتراک گذاشته می‌شود.
 * از کتابخانه سبک QRCode.js (CDN، global، بدون کلید) استفاده می‌کند.
 */
import { auth, db } from "./firebase-init.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let unsubscribe = null;

export function renderIdentityCard(container) {
  if (unsubscribe) unsubscribe();
  const uid = auth.currentUser.uid;

  unsubscribe = onSnapshot(doc(db, "users", uid), snap => {
    if (!snap.exists()) return;
    const u = snap.data();
    const shareUrl = `${location.origin}${location.pathname}#/u/${u.username}`;

    container.innerHTML = `
      <div class="idcard">
        <div class="idcard-glow"></div>
        <div class="idcard-photo">${u.photoURL
          ? `<img src="${u.photoURL}" alt="عکس پروفایل">`
          : `<span>${(u.displayName || u.username || "؟")[0]}</span>`}</div>
        <h2 class="idcard-name">${u.displayName || u.username}${u.verified ? ' <span class="verified-badge" title="حساب تاییدشده">✓</span>' : ""}</h2>
        <div class="idcard-username">@${u.username}</div>
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
          <button id="idShareBtn" class="contact-action"><span>🔗</span>اشتراک‌گذاری</button>
          <button id="idCopyBtn" class="contact-action"><span>📋</span>کپی یوزرنیم</button>
        </div>
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
        toast("لینک کپی شد ✅");
      }
    };
    document.getElementById("idCopyBtn").onclick = async () => {
      await navigator.clipboard.writeText("@" + u.username);
      toast("یوزرنیم کپی شد ✅");
    };
  });
}

export function stopIdentityCard() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 1800);
}

export { toast };
