/**
 * ui.js
 * رندر بخش‌های بصری: کارت‌های چت، حباب‌های پیام (متن/عکس/ویس)، ری‌اکشن.
 */

const REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "👏"];

function initials(name) {
  return (name || "؟").trim()[0] || "؟";
}

function fmtTime(ts) {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDayLabel(ts) {
  if (!ts?.toDate) return "";
  const d = ts.toDate();
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return "امروز";
  return d.toLocaleDateString("fa-IR", { day: "numeric", month: "long" });
}

/** رندر کارت‌های چت در صفحه اصلی */
export function renderChatList(container, chats, myUid) {
  if (!chats.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-emoji">💬</div>
      <p>هنوز گفتگویی نداری. با زدن دکمه + یک نفر را با یوزرنیمش پیدا کن.</p>
    </div>`;
    return;
  }
  container.innerHTML = chats.map(chat => {
    const otherUid = chat.members.find(m => m !== myUid);
    const other = chat.memberInfo?.[otherUid] || {};
    const mine = chat.lastSenderId === myUid;
    return `
      <div class="chat-card" data-chat-id="${chat.id}" data-other-uid="${otherUid}">
        <div class="chat-avatar">${other.photoURL ? `<img src="${other.photoURL}">` : `<span>${initials(other.displayName)}</span>`}</div>
        <div class="chat-card-body">
          <div class="chat-card-top"><span class="chat-name">${other.displayName || other.username || "کاربر"}</span><span class="chat-time">${fmtTime(chat.lastMessageAt)}</span></div>
          <div class="chat-card-bottom"><span class="chat-preview">${mine ? "شما: " : ""}${escapeHtml(chat.lastMessage || "شروع گفتگو")}</span></div>
        </div>
      </div>`;
  }).join("");
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** هدر صفحه گفتگو */
export function renderChatHeader(container, other) {
  container.innerHTML = `
    <button id="chatBackBtn" class="icon-btn" aria-label="بازگشت">◀️</button>
    <div class="chat-header-avatar">${other.photoURL ? `<img src="${other.photoURL}">` : `<span>${initials(other.displayName)}</span>`}</div>
    <div class="chat-header-info">
      <strong>${other.displayName || other.username}</strong>
      <span class="chat-header-status ${other.online ? "on" : ""}">${other.online ? "آنلاین" : "آخرین بازدید اخیراً"}</span>
    </div>
    <div class="chat-header-actions">
      <button class="icon-btn" title="تماس صوتی (به‌زودی)">📞</button>
      <button class="icon-btn" title="تماس تصویری (به‌زودی)">🎥</button>
      <button id="chatMenuBtn" class="icon-btn">⋮</button>
    </div>
  `;
}

/** رندر کامل لیست پیام‌ها با جداکننده روز */
export function renderMessages(container, messages, myUid) {
  let lastDay = null;
  let html = "";
  messages.forEach(m => {
    const day = fmtDayLabel(m.createdAt);
    if (day && day !== lastDay) {
      html += `<div class="day-divider"><span>${day}</span></div>`;
      lastDay = day;
    }
    html += renderBubble(m, m.senderId === myUid);
  });
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

function renderBubble(m, mine) {
  let inner = "";
  if (m.type === "text") {
    inner = `<p class="bubble-text">${escapeHtml(m.body)}</p>`;
  } else if (m.type === "image") {
    inner = `<img class="bubble-image" src="${m.mediaURL}" loading="lazy" alt="عکس">`;
  } else if (m.type === "voice") {
    const bars = (m.waveform && m.waveform.length ? m.waveform : new Array(20).fill(0.3))
      .map(v => `<span style="height:${Math.max(12, Math.round(v * 100))}%"></span>`).join("");
    inner = `
      <div class="bubble-voice" data-audio-src="${m.mediaURL}">
        <button class="voice-play-btn">▶️</button>
        <div class="voice-wave">${bars}</div>
        <span class="voice-duration">${fmtDuration(m.duration)}</span>
        <audio class="voice-audio-el" preload="none" src="${m.mediaURL}"></audio>
      </div>`;
  }

  const reactionEntries = Object.entries(m.reactions || {});
  const reactionSummary = reactionEntries.length
    ? `<div class="bubble-reactions">${summarizeReactions(reactionEntries)}</div>` : "";

  return `
    <div class="bubble-row ${mine ? "mine" : "theirs"}" data-msg-id="${m.id}">
      <div class="bubble ${mine ? "mine" : "theirs"}">
        ${inner}
        <span class="bubble-time">${fmtTime(m.createdAt)}</span>
        ${reactionSummary}
      </div>
    </div>`;
}

function summarizeReactions(entries) {
  const counts = {};
  entries.forEach(([, emoji]) => { counts[emoji] = (counts[emoji] || 0) + 1; });
  return Object.entries(counts).map(([emoji, n]) => `<span class="reaction-chip">${emoji} ${n > 1 ? n : ""}</span>`).join("");
}

function fmtDuration(sec) {
  if (!sec && sec !== 0) return "";
  const s = Math.round(sec);
  return `0:${String(s % 60).padStart(2, "0")}`;
}

/** نمایش پاپ‌آور ری‌اکشن روی یک پیام (هنگام نگه‌داشتن) */
export function showReactionPicker(anchorEl, onPick) {
  document.querySelectorAll(".reaction-picker").forEach(p => p.remove());
  const picker = document.createElement("div");
  picker.className = "reaction-picker";
  picker.innerHTML = REACTIONS.map(e => `<button data-emoji="${e}">${e}</button>`).join("");
  document.body.appendChild(picker);

  const rect = anchorEl.getBoundingClientRect();
  picker.style.top = `${rect.top - 52 + window.scrollY}px`;
  picker.style.left = `${Math.max(8, rect.left)}px`;
  requestAnimationFrame(() => picker.classList.add("show"));

  picker.addEventListener("click", e => {
    const btn = e.target.closest("button[data-emoji]");
    if (btn) onPick(btn.dataset.emoji);
    picker.remove();
  });

  setTimeout(() => {
    document.addEventListener("click", function closeOnce(ev) {
      if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener("click", closeOnce); }
    });
  }, 0);
}
