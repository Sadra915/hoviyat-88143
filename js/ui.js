/**
 * ui.js
 * رندر بخش‌های بصری: کارت‌های گفتگو (چت/گروه/کانال)، حباب‌های پیام، ری‌اکشن، پروفایل، انتخاب عضو.
 */
import { icon } from "./icons.js";
import { scanTextForLinks } from "./security.js";

const REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "👏"];

function initials(name) {
  return (name || "؟").trim()[0] || "؟";
}

// نکته مهاجرت: در Firestore، createdAt/lastMessageAt یک شیء Timestamp با متد toDate()
// بود. در Supabase این ستون‌ها رشته ISO (timestamptz) هستند، پس مستقیماً new Date(ts).
function fmtTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDayLabel(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return "امروز";
  return d.toLocaleDateString("fa-IR", { day: "numeric", month: "long" });
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function avatarHtml(photoURL, name, extraClass) {
  return `<div class="chat-avatar ${extraClass || ""}">${photoURL ? `<img src="${escapeHtml(photoURL)}">` : `<span>${initials(name)}</span>`}</div>`;
}

/** رندر لیست یکپارچه‌ی گفتگوها: چت خصوصی + گروه + کانال، هرکدام با data-kind مشخص.
 * مثل پیام‌ها، این لیست هم با هر رویداد بلادرنگ (حتی فقط آنلاین‌شدن یک نفر) کامل
 * از نو ساخته می‌شود؛ بدون ردیابی، انیمیشن ورود کارت‌ها هر بار برای همه پخش
 * می‌شد. اینجا فقط کارت‌هایی که تازه به لیست اضافه شده‌اند (یا بار اول است)
 * کلاس ورود می‌گیرند. */
let _seenListIds = new Set();

export function renderChatList(container, items, myUid) {
  if (!items.length) {
    _seenListIds = new Set();
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${icon("messageCircle", { size: 40 })}</div>
      <p>هنوز گفتگویی نداری. با زدن دکمه + یک گفتگوی خصوصی، گروه یا کانال بساز.</p>
    </div>`;
    return;
  }
  const isNewCard = id => !_seenListIds.has(id);
  container.innerHTML = items.map((item, i) => {
    const cardClass = isNewCard(item.id) ? "chat-card card-enter" : "chat-card";
    const cardStyle = isNewCard(item.id) ? ` style="animation-delay:${Math.min(i, 8) * 35}ms"` : "";
    if (item.kind === "group") {
      const unread = item.unreadCounts?.[myUid] || 0;
      const mine = item.lastSenderId === myUid;
      return `
        <div class="${cardClass}"${cardStyle} data-kind="group" data-id="${item.id}">
          <div class="chat-avatar-wrap">${avatarHtml(item.photoURL, item.name)}</div>
          <div class="chat-card-body">
            <div class="chat-card-top"><span class="chat-name">${icon("users", { size: 15, className: "chat-kind-ic" })} ${escapeHtml(item.name)}</span><span class="chat-time">${fmtTime(item.lastMessageAt)}</span></div>
            <div class="chat-card-bottom">
              <span class="chat-preview">${mine ? "شما: " : ""}${escapeHtml(item.lastMessage || "")}</span>
              ${unread > 0 ? `<span class="unread-badge">${unread > 9 ? "9+" : unread}</span>` : ""}
            </div>
          </div>
        </div>`;
    }
    if (item.kind === "channel") {
      return `
        <div class="${cardClass}"${cardStyle} data-kind="channel" data-id="${item.id}">
          <div class="chat-avatar-wrap">${avatarHtml(item.photoURL, item.name)}</div>
          <div class="chat-card-body">
            <div class="chat-card-top"><span class="chat-name">${icon("megaphone", { size: 15, className: "chat-kind-ic" })} ${escapeHtml(item.name)}${item.verified ? ` <span class="verified-badge" title="کانال تاییدشده">${icon("check", { size: 9 })}</span>` : ""}</span><span class="chat-time">${fmtTime(item.lastMessageAt)}</span></div>
            <div class="chat-card-bottom"><span class="chat-preview">${escapeHtml(item.lastMessage || "")}</span></div>
          </div>
        </div>`;
    }
    // چت خصوصی
    const otherUid = item.members.find(m => m !== myUid);
    const other = item.memberInfo?.[otherUid] || {};
    const mine = item.lastSenderId === myUid;
    const unread = item.unreadCounts?.[myUid] || 0;
    return `
      <div class="${cardClass}"${cardStyle} data-kind="private" data-id="${item.id}" data-other-uid="${otherUid}">
        <div class="chat-avatar-wrap">
          ${avatarHtml(other.photoURL, other.displayName)}
          ${item._online ? '<span class="online-dot"></span>' : ""}
        </div>
        <div class="chat-card-body">
          <div class="chat-card-top"><span class="chat-name">${escapeHtml(other.displayName || other.username || "کاربر")}${item._verified ? ` <span class="verified-badge" title="حساب تاییدشده">${icon("check", { size: 9 })}</span>` : ""}</span><span class="chat-time">${fmtTime(item.lastMessageAt)}</span></div>
          <div class="chat-card-bottom">
            <span class="chat-preview">${mine ? "شما: " : ""}${escapeHtml(item.lastMessage || "شروع گفتگو")}</span>
            ${unread > 0 ? `<span class="unread-badge">${unread > 9 ? "9+" : unread}</span>` : ""}
          </div>
        </div>
      </div>`;
  }).join("");
  items.forEach(item => _seenListIds.add(item.id));
}

/** هدر صفحه گفتگو؛ entity.mode یکی از private|group|channel است */
export function renderChatHeader(container, entity) {
  const canPost = entity.mode !== "channel" || entity.isAdminUser;
  const subtitle = entity.mode === "private"
    ? `<span class="chat-header-status ${entity.online ? "on" : ""}">${entity.online ? "آنلاین" : "آخرین بازدید اخیراً"}</span>`
    : entity.mode === "group"
      ? `<span class="chat-header-status">${entity.memberCount} عضو</span>`
      : `<span class="chat-header-status">${entity.memberCount} دنبال‌کننده${entity.isAdminUser ? " · ادمین" : ""}</span>`;

  const infoBtnId = entity.mode === "private" ? "chatHeaderProfileArea" : "chatHeaderGroupInfoArea";

  container.innerHTML = `
    <button id="chatBackBtn" class="icon-btn" aria-label="بازگشت">${icon("chevronLeft")}</button>
    <div id="${infoBtnId}" class="chat-header-profile-area">
      <div class="chat-header-avatar">${entity.photoURL ? `<img src="${escapeHtml(entity.photoURL)}">` : `<span>${initials(entity.displayName)}</span>`}</div>
      <div class="chat-header-info">
        <strong>${entity.mode === "group" ? icon("users", { size: 14, className: "chat-kind-ic" }) + " " : entity.mode === "channel" ? icon("megaphone", { size: 14, className: "chat-kind-ic" }) + " " : ""}${escapeHtml(entity.displayName)}${entity.verified ? ` <span class="verified-badge" title="حساب تاییدشده">${icon("check", { size: 10 })}</span>` : ""}</strong>
        <span id="chatHeaderSubtitle">${subtitle}</span>
        <span id="chatHeaderTyping" class="chat-header-status typing" hidden>در حال تایپ<span class="typing-dots"><i></i><i></i><i></i></span></span>
      </div>
    </div>
    <div class="chat-header-actions">
      ${entity.mode === "channel" ? "" : `
        <button id="chatCallBtn" class="icon-btn" title="در حال تکمیل و توسعه این بخش هستیم">${icon("phone")}</button>
        <button id="chatVideoBtn" class="icon-btn" title="در حال تکمیل و توسعه این بخش هستیم">${icon("video")}</button>`}
      <button id="chatMenuBtn" class="icon-btn">${icon("moreVertical")}</button>
    </div>
  `;
  container.dataset.canPost = canPost ? "1" : "0";
}

/** رندر کامل لیست پیام‌ها؛ showSenderNames=true برای گروه (نام فرستنده بالای حباب طرف مقابل).
 * convKey شناسه گفتگوی جاری است (chatId/groupId/channelId) — چون کل لیست هر بار
 * از نو ساخته می‌شود (innerHTML)، بدون این ردیابی، انیمیشن ورود پیام هر بار برای
 * تمام پیام‌های قدیمی هم دوباره پخش می‌شد (مثلاً فقط با زدن یک ری‌اکشن). اینجا
 * فقط پیام‌هایی که واقعاً تازه‌اند (قبلاً دیده نشده‌اند) کلاس انیمیشن می‌گیرند. */
let _msgTrackKey = null;
let _seenMsgIds = new Set();

export const STICKERS = ["😀","😂","😍","😎","🥳","😭","😡","👍","👎","❤️","🔥","🎉","🙏","👏","😴","🤔","😱","🥰","😇","🤝","🫡","🫶","🤌","🫠","🫣","🫢","🥹","😶‍🌫️","😮‍💨","🤗","😈","👻","💀","🤖","👽","🦊","🐼","🐱","🐶","🦁","🐯","🐸","🐵","🦄","🐝","🦋","🌸","🌻","🌙","⭐","🌟","☀️","🌧️","❄️","💎","🎯","🚀","✈️","🚗","🏆","🥇","🎮","🎧","🎵","🎬","📸","💡","⚡","💯","✅","❌","❗","❓","💬","🧿","🪄","🧨","🎊","🎈","🪩","🍀","🌈"];

export function renderStickerPicker(container) {
  container.innerHTML = STICKERS.map(s => `<button data-sticker="${s}">${s}</button>`).join("");
}

export function renderMessages(container, messages, myUid, showSenderNames, convKey, otherLastRead, verifiedMap = {}) {
  if (convKey !== _msgTrackKey) {
    _msgTrackKey = convKey;
    _seenMsgIds = new Set();
  }
  let lastDay = null;
  let html = "";
  const newIds = [];
  const byId = {};
  messages.forEach(m => { byId[m.id] = m; });
  messages.forEach((m, i) => {
    const day = fmtDayLabel(m.createdAt);
    const dayChanged = day && day !== lastDay;
    if (dayChanged) {
      html += `<div class="day-divider"><span>${day}</span></div>`;
      lastDay = day;
    }
    const isNew = !_seenMsgIds.has(m.id);
    if (isNew) newIds.push(m.id);

    // گروه‌بندی پیام‌های پیاپی از یک نفر (مثل واتساپ/تلگرام): وقتی چند پیام
    // پشت‌سرهم از یک نفر و با فاصله‌ی کم می‌آید، به‌جای اینکه هرکدام یک
    // «جعبه»ی کاملاً جدا به‌نظر برسند، به‌هم می‌چسبند و فقط گوشه‌ی بیرونی
    // گرد می‌ماند — همون چیزی که به گفتگو حس جریان و فضای باز می‌ده به‌جای
    // این‌که هر پیام مثل یک بلوک مجزا توی یک فضای بسته باشه.
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const closeToPrev = prev && !dayChanged && prev.senderId === m.senderId
      && (new Date(m.createdAt) - new Date(prev.createdAt)) < 60000;
    const closeToNext = next && next.senderId === m.senderId
      && (new Date(next.createdAt) - new Date(m.createdAt)) < 60000
      && fmtDayLabel(next.createdAt) === day;
    let groupClass = "grouped-single";
    if (closeToPrev && closeToNext) groupClass = "grouped-middle";
    else if (closeToPrev) groupClass = "grouped-last";
    else if (closeToNext) groupClass = "grouped-first";

    html += renderBubble(m, m.senderId === myUid, showSenderNames, isNew, m.replyTo ? byId[m.replyTo] : null, otherLastRead, !!verifiedMap[m.senderId], groupClass);
  });
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
  newIds.forEach(id => _seenMsgIds.add(id));
}

function quotePreviewText(m) {
  if (!m) return "پیامی که به آن پاسخ داده شده حذف شده";
  if (m.type === "image") return "📷 عکس";
  if (m.type === "voice") return "🎙 پیام صوتی";
  if (m.type === "sticker") return "🧩 استیکر";
  return m.body || "";
}

/** متن پیام را با escapeHtml امن می‌کند، لینک‌ها را کلیک‌پذیر می‌کند، و اگر
 * لینکی مشکوک تشخیص داده شود (ضدفیشینگ ساده)، به‌جای بازکردن مستقیم، یک بنر
 * هشدار زیر پیام نشان می‌دهد که کاربر باید صریحاً روی «بازکردن» بزند. */
function linkifyMessageBody(text) {
  const assessed = scanTextForLinks(text);
  const riskByUrl = new Map(assessed.filter(a => a.risky).map(a => [a.url, a]));
  const escaped = escapeHtml(text).replace(/\bhttps?:\/\/[^\s<>&]+/gi, url => {
    // escapeHtml ممکن است & را به &amp; تبدیل کرده باشد؛ برای مقایسه دقیق با URL خام برمی‌گردانیم
    const rawUrl = url.replace(/&amp;/g, "&");
    if (riskByUrl.has(rawUrl)) {
      return `<span class="risky-link" data-url="${escapeHtml(rawUrl)}">${url}</span>`;
    }
    return `<a href="${escapeHtml(rawUrl)}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
  const riskyList = [...riskByUrl.values()];
  const banner = riskyList.length ? `
    <div class="link-risk-banner">
      <div>
        <b>${icon("triangleAlert", { size: 14 })} این لینک مشکوک به نظر می‌رسد</b>
        ${riskyList.map(r => escapeHtml(r.reasons.join("، "))).join("<br>")}
        <span class="link-risk-open-anyway" data-url="${escapeHtml(riskyList[0].url)}">با این حال باز کن</span>
      </div>
    </div>` : "";
  return escaped + banner;
}

function renderBubble(m, mine, showSenderNames, isNew, repliedMsg, otherLastRead, senderVerified, groupClass = "grouped-single") {
  let inner = "";
  if (m.type === "text") {
    inner = `<p class="bubble-text">${linkifyMessageBody(m.body || "")}</p>`;
  } else if (m.type === "sticker") {
    inner = `<div class="bubble-sticker">${escapeHtml(m.body || "")}</div>`;
  } else if (m.type === "image") {
    inner = `<img class="bubble-image" src="${escapeHtml(m.mediaURL)}" loading="lazy" alt="عکس">`;
  } else if (m.type === "voice") {
    const bars = (m.waveform && m.waveform.length ? m.waveform : new Array(20).fill(0.3))
      .map(v => `<span style="height:${Math.max(12, Math.round(v * 100))}%"></span>`).join("");
    inner = `
      <div class="bubble-voice" data-audio-src="${escapeHtml(m.mediaURL)}">
        <button class="voice-play-btn" data-playing="0">${icon("play", { size: 16 })}</button>
        <div class="voice-wave">${bars}</div>
        <span class="voice-duration">${fmtDuration(m.duration)}</span>
        <audio class="voice-audio-el" preload="none" src="${escapeHtml(m.mediaURL)}"></audio>
      </div>`;
  }

  const reactionEntries = Object.entries(m.reactions || {});
  const reactionSummary = reactionEntries.length
    ? `<div class="bubble-reactions">${summarizeReactions(reactionEntries)}</div>` : "";
  const senderLabel = (showSenderNames && !mine && m.senderName && (groupClass === "grouped-single" || groupClass === "grouped-first"))
    ? `<div class="bubble-sender">${escapeHtml(m.senderName)}${senderVerified ? ` <span class="verified-badge" title="حساب تاییدشده">${icon("check", { size: 10 })}</span>` : ""}</div>` : "";
  const quote = m.replyTo
    ? `<div class="bubble-reply-quote">${escapeHtml(quotePreviewText(repliedMsg))}</div>` : "";

  // تیک آبی: فقط روی پیام‌های خودم در چت خصوصی (otherLastRead فقط از آن‌جا پاس داده می‌شود).
  // یک تیک خاکستری = ارسال شد؛ دو تیک آبی = طرف مقابل تا این لحظه گفتگو را خوانده.
  let tick = "";
  if (mine && otherLastRead !== undefined) {
    const isRead = otherLastRead && new Date(otherLastRead) >= new Date(m.createdAt);
    tick = isRead
      ? `<span class="bubble-tick read" title="خوانده شد">${icon("checkCheck", { size: 14 })}</span>`
      : `<span class="bubble-tick" title="ارسال شد">${icon("check", { size: 14 })}</span>`;
  }

  return `
    <div class="bubble-row ${mine ? "mine" : "theirs"} ${groupClass} ${isNew ? "is-new" : ""}" data-msg-id="${m.id}">
      <div class="bubble ${mine ? "mine" : "theirs"} ${groupClass}">
        ${senderLabel}
        ${quote}
        ${inner}
        <span class="bubble-time">${fmtTime(m.createdAt)}${tick}</span>
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

/** نمایش پاپ‌آور ری‌اکشن + ریپلای/حذف روی یک پیام (هنگام نگه‌داشتن) */
export function showReactionPicker(anchorEl, onAction, opts = {}) {
  document.querySelectorAll(".reaction-picker").forEach(p => p.remove());
  const picker = document.createElement("div");
  picker.className = "reaction-picker";
  picker.innerHTML =
    (opts.hideReactions ? "" : REACTIONS.map(e => `<button data-emoji="${e}">${e}</button>`).join("")) +
    (opts.hideReply ? "" : `<button data-action="reply" title="پاسخ">↩️</button>`) +
    `<button data-action="copy" title="کپی متن">${icon("copy", { size: 15 })}</button>` +
    (opts.canPin ? `<button data-action="${opts.isPinned ? "unpin" : "pin"}" title="${opts.isPinned ? "برداشتن سنجاق" : "سنجاق کردن"}">${icon("pin", { size: 15 })}</button>` : "") +
    (opts.canReport ? `<button data-action="report" title="گزارش">${icon("triangleAlert", { size: 15 })}</button>` : "") +
    (opts.canDelete ? `<button data-action="delete" title="حذف">${icon("trash", { size: 15 })}</button>` : "");
  document.body.appendChild(picker);

  const rect = anchorEl.getBoundingClientRect();
  picker.style.top = `${rect.top - 52}px`;
  picker.style.left = `${Math.max(8, rect.left)}px`;
  requestAnimationFrame(() => picker.classList.add("show"));

  picker.addEventListener("click", e => {
    const emojiBtn = e.target.closest("button[data-emoji]");
    const actionBtn = e.target.closest("button[data-action]");
    if (emojiBtn) onAction({ type: "reaction", emoji: emojiBtn.dataset.emoji });
    else if (actionBtn) onAction({ type: actionBtn.dataset.action });
    picker.remove();
  });

  setTimeout(() => {
    document.addEventListener("click", function closeOnce(ev) {
      if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener("click", closeOnce); }
    });
  }, 0);
}

/** پروفایل یک مخاطب (نه خود کاربر) — با زدن روی هدر چت خصوصی باز می‌شود */
export function renderContactProfile(container, other, handlers, isBlocked = false) {
  container.innerHTML = `
    <div class="view-title-bar contact-title-bar">
      <button id="contactBackBtn" class="icon-btn">${icon("chevronLeft")}</button>
      <h2>پروفایل</h2>
    </div>
    <div class="idcard">
      <div class="idcard-glow"></div>
      <div class="idcard-photo">${other.photoURL
        ? `<img src="${escapeHtml(other.photoURL)}" alt="عکس پروفایل">`
        : `<span>${initials(other.displayName)}</span>`}</div>
      <h2 class="idcard-name">${escapeHtml(other.displayName || other.username)}${other.verified ? ` <span class="verified-badge" title="حساب تاییدشده">${icon("check", { size: 11 })}</span>` : ""}</h2>
      <div class="idcard-username">@${escapeHtml(other.username)}</div>
      ${other.bio ? `<p class="idcard-bio">${escapeHtml(other.bio)}</p>` : ""}
      <div class="idcard-status ${other.online ? "on" : "off"}">
        <span class="dot"></span> ${other.online ? "آنلاین" : "آخرین بازدید اخیراً"}
      </div>
      ${other.phone ? `
      <div class="idcard-info-rows">
        <div class="info-row"><span class="info-label">شماره تلفن</span><span class="info-value">${escapeHtml(other.phone)}</span></div>
      </div>` : ""}
      <div class="contact-action-row">
        <button id="caMessageBtn" class="contact-action"><span>${icon("messageCircle", { size: 18 })}</span>پیام</button>
        <button id="caCallBtn" class="contact-action"><span>${icon("phone", { size: 18 })}</span>تماس</button>
        <button id="caVideoCallBtn" class="contact-action"><span>${icon("video", { size: 18 })}</span>تماس تصویری</button>
        <button id="caShareBtn" class="contact-action"><span>${icon("share2", { size: 18 })}</span>اشتراک‌گذاری</button>
      </div>
      <button id="caSecretChatBtn" class="btn-outline full" style="margin-top:12px;">${icon("lock", { size: 15 })} گفتگوی مخفی</button>
    </div>
    <button id="blockUserBtn" class="btn-outline ${isBlocked ? "" : "danger"} full" style="margin:14px;width:calc(100% - 28px);">${isBlocked ? "رفع بلاک" : "بلاک کردن این کاربر"}</button>
    <button id="deleteChatBtn" class="btn-outline danger full" style="margin:0 14px 14px;width:calc(100% - 28px);">حذف کامل گفتگو</button>
  `;
  container.querySelector("#contactBackBtn").onclick = handlers.onBack;
  container.querySelector("#caMessageBtn").onclick = handlers.onMessage;
  container.querySelector("#caShareBtn").onclick = handlers.onShare;
  const callBtn = container.querySelector("#caCallBtn");
  if (callBtn && handlers.onCall) callBtn.onclick = handlers.onCall;
  const videoCallBtn = container.querySelector("#caVideoCallBtn");
  if (videoCallBtn && handlers.onVideoCall) videoCallBtn.onclick = handlers.onVideoCall;
  const secretBtn = container.querySelector("#caSecretChatBtn");
  if (secretBtn && handlers.onSecretChat) secretBtn.onclick = handlers.onSecretChat;
  container.querySelectorAll("[data-soon]").forEach(b => b.onclick = handlers.onSoon);
  const deleteBtn = container.querySelector("#deleteChatBtn");
  if (deleteBtn && handlers.onDeleteChat) deleteBtn.onclick = () => {
    if (confirm("این گفتگو و همه‌ی پیام‌هایش برای همیشه حذف می‌شود. مطمئنی؟")) handlers.onDeleteChat();
  };
  const blockBtn = container.querySelector("#blockUserBtn");
  if (blockBtn && handlers.onToggleBlock) blockBtn.onclick = () => {
    if (isBlocked || confirm("این کاربر دیگه نمی‌تونه برات پیام بفرسته. مطمئنی؟")) handlers.onToggleBlock();
  };
}

/** لیست انتخاب عضو با چک‌باکس (برای ساخت گروه) */
export function renderMemberPicker(container, users, selectedUids) {
  if (!users.length) {
    container.innerHTML = `<p class="empty-hint">کاربر دیگری تو اپ ثبت‌نام نکرده.</p>`;
    return;
  }
  container.innerHTML = users.map(u => `
    <label class="member-pick-row">
      <input type="checkbox" value="${u.uid}" ${selectedUids.has(u.uid) ? "checked" : ""}>
      ${avatarHtml(u.photoURL, u.displayName, "small")}
      <span>${escapeHtml(u.displayName || u.username)}${u.verified ? ` <span class="verified-badge" title="حساب تاییدشده">${icon("check", { size: 10 })}</span>` : ""}<br><small>@${escapeHtml(u.username)}</small></span>
    </label>`).join("");
}

/** صفحه‌ی اطلاعات و مدیریت اعضای گروه */
export function renderGroupInfo(container, group, myUid, handlers) {
  const isAdmin = (group.admins || []).includes(myUid);
  const isOwner = group.ownerId === myUid;
  const members = group.members.map(uid => ({ uid, ...(group.memberInfo?.[uid] || {}) }));
  const perms = group.permissions || {};
  const permLabels = {
    send_messages: "ارسال پیام", forward: "ارسال پیام‌های فورواردی", media: "ارسال رسانه",
    stickers_gifs: "ارسال استیکر و گیف", links: "قرار دادن لینک",
    view_members: "مشاهده‌ی اعضای گروه", add_users: "افزودن کاربر",
  };
  container.innerHTML = `
    <div class="view-title-bar contact-title-bar">
      <button id="groupInfoBackBtn" class="icon-btn">${icon("chevronLeft")}</button>
      <h2>اطلاعات گروه</h2>
    </div>
    <div class="idcard">
      <div class="idcard-photo">${group.photoURL ? `<img src="${escapeHtml(group.photoURL)}">` : `<span>${initials(group.name)}</span>`}</div>
      ${isAdmin ? `<button id="groupPhotoBtn" class="btn-outline small" style="margin-top:6px;">تغییر عکس گروه</button>
      <input id="groupPhotoInput" type="file" accept="image/*" hidden>` : ""}
      ${isAdmin ? `
        <div class="field" style="padding:0 16px;text-align:right;">
          <label>نام گروه</label>
          <input id="groupNameInput" type="text" value="${escapeHtml(group.name)}">
          <label>توضیحات</label>
          <textarea id="groupDescInput" rows="2" placeholder="توضیحات گروه (اختیاری)">${escapeHtml(group.description || "")}</textarea>
          <label>قوانین گروه</label>
          <textarea id="groupRulesInput" rows="3" placeholder="قوانین گروه (اختیاری)">${escapeHtml(group.rules || "")}</textarea>
          <button id="saveGroupInfoBtn" class="btn-primary small" style="margin-top:8px;">ذخیره تغییرات</button>
          <p id="groupInfoMsg" class="auth-error"></p>
        </div>
      ` : `
        <h2 class="idcard-name">${icon("users", { size: 18, className: "chat-kind-ic" })} ${escapeHtml(group.name)}</h2>
        ${group.description ? `<p class="idcard-bio">${escapeHtml(group.description)}</p>` : ""}
        ${group.rules ? `<p class="idcard-bio"><strong>قوانین:</strong> ${escapeHtml(group.rules)}</p>` : ""}
      `}
      <div class="idcard-username">${members.length}${group.maxMembers ? ` / ${group.maxMembers}` : ""} عضو${group.isPublic ? " · عمومی" : " · خصوصی"}</div>
      <div class="idcard-username" style="opacity:.7;">ساخته‌شده: ${new Date(group.createdAt).toLocaleDateString("fa-IR")}</div>
    </div>
    ${isAdmin ? `
      <div class="field" style="padding:0 16px;">
        <label>لینک دعوت</label>
        <div class="invite-code-box">
          <span id="groupInviteCode" style="flex:1;">${escapeHtml(group.inviteCode || "—")}</span>
          <button id="copyInviteCodeBtn" class="mini-btn">کپی</button>
          <button id="regenInviteCodeBtn" class="mini-btn">کد جدید</button>
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;padding:0 16px;">
        <input type="checkbox" id="adminOnlyModeInput" ${perms.send_messages === false ? "checked" : ""}>
        حالت فقط‌مدیر (فقط ادمین‌ها می‌توانند پیام بفرستند)
      </label>
      ` : ""}
    ${!isAdmin ? `<button id="reportGroupBtn" class="btn-outline full" style="margin:8px 14px;width:calc(100% - 28px);">${icon("triangleAlert", { size: 15 })} گزارش این گروه</button>` : ""}
    ${isAdmin ? `
      <div class="field" style="padding:0 16px;">
        <label>افزودن عضو جدید (با یوزرنیم)</label>
        <div style="display:flex;gap:8px;">
          <input id="addMemberUsernameInput" type="text" style="flex:1;" placeholder="username">
          <button id="addMemberBtn" class="btn-primary small">افزودن</button>
        </div>
        <p id="addMemberMsg" class="auth-error"></p>
      </div>
      <div class="field" style="padding:0 16px;">
        <label style="font-weight:bold;">اعضای این گروه چه کارهایی می‌توانند انجام دهند؟</label>
        <div id="groupPermsList" style="display:flex;flex-direction:column;gap:8px;margin-top:6px;">
          ${Object.entries(permLabels).map(([key, label]) => `
            <label style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <span>${label}</span>
              <input type="checkbox" data-perm="${key}" ${perms[key] ? "checked" : ""}>
            </label>
          `).join("")}
        </div>
        <button id="savePermsBtn" class="btn-primary small" style="margin-top:8px;">ذخیره‌ی دسترسی‌ها</button>
        <p id="groupPermsMsg" class="auth-error"></p>
      </div>
      ` : ""}
    ${(isAdmin || perms.view_members !== false) ? `
    <div class="group-members-list">
      ${members.map(m => `
        <div class="member-row">
          ${avatarHtml(m.photoURL, m.displayName, "small")}
          <span>${escapeHtml(m.displayName || m.username)} ${(group.admins || []).includes(m.uid) ? "· ادمین" : ""}</span>
          ${isAdmin && m.uid !== myUid ? `
            <div class="member-actions">
              ${!(group.admins || []).includes(m.uid) ? `<button class="mini-btn" data-promote="${m.uid}">ادمین کن</button>` : ""}
              <button class="mini-btn danger" data-remove="${m.uid}">حذف</button>
            </div>` : ""}
        </div>`).join("")}
    </div>` : `<p class="empty-hint" style="padding:0 16px;">مشاهده‌ی لیست اعضا توسط ادمین محدود شده است.</p>`}
    <button id="leaveGroupBtn" class="btn-outline danger full" style="margin:14px;width:calc(100% - 28px);">خروج از گروه</button>
    ${isOwner ? `<button id="deleteGroupBtn" class="btn-outline danger full" style="margin:0 14px 14px;width:calc(100% - 28px);">حذف کامل گروه</button>` : ""}
  `;
  container.querySelector("#groupInfoBackBtn").onclick = handlers.onBack;
  container.querySelector("#leaveGroupBtn").onclick = handlers.onLeave;
  container.querySelectorAll("[data-promote]").forEach(b => b.onclick = () => handlers.onPromote(b.dataset.promote));
  container.querySelectorAll("[data-remove]").forEach(b => b.onclick = () => handlers.onRemove(b.dataset.remove));
  const addMemberBtn = container.querySelector("#addMemberBtn");
  if (addMemberBtn) addMemberBtn.onclick = () => handlers.onAddMember(container.querySelector("#addMemberUsernameInput").value.trim());
  const saveInfoBtn = container.querySelector("#saveGroupInfoBtn");
  if (saveInfoBtn) saveInfoBtn.onclick = () => handlers.onSaveInfo({
    name: container.querySelector("#groupNameInput").value,
    description: container.querySelector("#groupDescInput").value,
    rules: container.querySelector("#groupRulesInput").value,
  });
  const copyInviteBtn = container.querySelector("#copyInviteCodeBtn");
  if (copyInviteBtn) copyInviteBtn.onclick = () => handlers.onCopyInviteCode(group.inviteCode);
  const regenInviteBtn = container.querySelector("#regenInviteCodeBtn");
  if (regenInviteBtn) regenInviteBtn.onclick = () => handlers.onRegenInviteCode();
  const adminOnlyInput = container.querySelector("#adminOnlyModeInput");
  if (adminOnlyInput) adminOnlyInput.onchange = () => handlers.onToggleAdminOnly(!adminOnlyInput.checked);
  const reportGroupBtn = container.querySelector("#reportGroupBtn");
  if (reportGroupBtn) reportGroupBtn.onclick = () => handlers.onReportGroup();
  const deleteBtn = container.querySelector("#deleteGroupBtn");
  if (deleteBtn) deleteBtn.onclick = () => {
    if (confirm("این گروه و همه‌ی پیام‌هایش برای همیشه حذف می‌شود. مطمئنی؟")) handlers.onDelete();
  };
  const photoBtn = container.querySelector("#groupPhotoBtn");
  const photoInput = container.querySelector("#groupPhotoInput");
  if (photoBtn) photoBtn.onclick = () => photoInput.click();
  if (photoInput) photoInput.onchange = () => {
    if (photoInput.files[0]) handlers.onChangePhoto(photoInput.files[0]);
  };
  const savePermsBtn = container.querySelector("#savePermsBtn");
  if (savePermsBtn) savePermsBtn.onclick = () => {
    const next = {};
    container.querySelectorAll("[data-perm]").forEach(cb => { next[cb.dataset.perm] = cb.checked; });
    handlers.onSavePermissions(next);
  };
}

/** صفحه‌ی اطلاعات کانال (توضیحات، تعداد دنبال‌کننده، افزودن ادمین، لغو عضویت) */
export function renderChannelInfo(container, channel, myUid, handlers) {
  const isAdmin = (channel.admins || []).includes(myUid);
  const isOwner = channel.ownerId === myUid;
  container.innerHTML = `
    <div class="view-title-bar contact-title-bar">
      <button id="channelInfoBackBtn" class="icon-btn">${icon("chevronLeft")}</button>
      <h2>اطلاعات کانال</h2>
    </div>
    <div class="idcard">
      <div class="idcard-photo">${channel.photoURL ? `<img src="${escapeHtml(channel.photoURL)}">` : `<span>${initials(channel.name)}</span>`}</div>
      ${isAdmin ? `<button id="channelPhotoBtn" class="btn-outline small" style="margin-top:6px;">تغییر عکس کانال</button>
      <input id="channelPhotoInput" type="file" accept="image/*" hidden>` : ""}
      ${isAdmin ? `
        <div class="field" style="padding:0 16px;text-align:right;">
          <label>نام کانال</label>
          <input id="channelNameInput" type="text" value="${escapeHtml(channel.name)}">
          <label>توضیحات</label>
          <textarea id="channelDescInput" rows="2" placeholder="توضیحات کانال (اختیاری)">${escapeHtml(channel.description || "")}</textarea>
          <button id="saveChannelInfoBtn" class="btn-primary small" style="margin-top:8px;">ذخیره تغییرات</button>
          <p id="channelInfoMsg" class="auth-error"></p>
        </div>
      ` : `
        <h2 class="idcard-name">${icon("megaphone", { size: 18, className: "chat-kind-ic" })} ${escapeHtml(channel.name)}${channel.verified ? ` <span class="verified-badge" title="کانال تاییدشده">${icon("check", { size: 11 })}</span>` : ""}</h2>
        ${channel.description ? `<p class="idcard-bio">${escapeHtml(channel.description)}</p>` : ""}
      `}
      <div class="idcard-username">${(channel.subscribers || []).length} دنبال‌کننده${channel.isPublic ? " · عمومی" : " · خصوصی"}${channel.verified ? " · ✓ تاییدشده" : ""}</div>
    </div>
    ${isAdmin && !channel.verified ? `<button id="requestChannelVerifyBtn" class="btn-outline full" style="margin:10px 16px 0;width:calc(100% - 32px);">${icon("shieldCheck", { size: 16 })} درخواست تیک آبی برای این کانال</button>` : ""}
    ${isAdmin ? `
      <div class="field" style="padding:0 16px;">
        <label>افزودن ادمین جدید (با یوزرنیم)</label>
        <div style="display:flex;gap:8px;">
          <input id="addAdminUsernameInput" type="text" style="flex:1;" placeholder="username">
          <button id="addAdminBtn" class="btn-primary small">افزودن</button>
        </div>
        <p id="addAdminMsg" class="auth-error"></p>
      </div>` : ""}
    ${!isOwner ? `<button id="unsubChannelBtn" class="btn-outline danger full" style="margin:14px;width:calc(100% - 28px);">لغو عضویت از کانال</button>` : ""}
    ${isOwner ? `<button id="deleteChannelBtn" class="btn-outline danger full" style="margin:14px;width:calc(100% - 28px);">حذف کامل کانال</button>` : ""}
  `;
  container.querySelector("#channelInfoBackBtn").onclick = handlers.onBack;
  const unsubBtn = container.querySelector("#unsubChannelBtn");
  if (unsubBtn) unsubBtn.onclick = handlers.onUnsubscribe;
  const addAdminBtn = container.querySelector("#addAdminBtn");
  if (addAdminBtn) addAdminBtn.onclick = () => handlers.onAddAdmin(container.querySelector("#addAdminUsernameInput").value.trim());
  const saveInfoBtn = container.querySelector("#saveChannelInfoBtn");
  if (saveInfoBtn) saveInfoBtn.onclick = () => handlers.onSaveInfo({
    name: container.querySelector("#channelNameInput").value,
    description: container.querySelector("#channelDescInput").value,
  });
  const deleteBtn = container.querySelector("#deleteChannelBtn");
  if (deleteBtn) deleteBtn.onclick = () => {
    if (confirm("این کانال و همه‌ی پست‌هایش برای همیشه حذف می‌شود. مطمئنی؟")) handlers.onDelete();
  };
  const photoBtn = container.querySelector("#channelPhotoBtn");
  const photoInput = container.querySelector("#channelPhotoInput");
  if (photoBtn) photoBtn.onclick = () => photoInput.click();
  if (photoInput) photoInput.onchange = () => {
    if (photoInput.files[0]) handlers.onChangePhoto(photoInput.files[0]);
  };
  const verifyBtn = container.querySelector("#requestChannelVerifyBtn");
  if (verifyBtn) verifyBtn.onclick = handlers.onRequestVerify;
}

/** نتیجه‌ی جستجوی کانال‌های عمومی */
export function renderChannelSearchResults(container, channels, mySubs, onToggle) {
  if (!channels.length) {
    container.innerHTML = `<p class="empty-hint">کانالی پیدا نشد.</p>`;
    return;
  }
  container.innerHTML = channels.map(c => `
    <div class="member-row">
      ${avatarHtml(c.photoURL, c.name, "small")}
      <span>${icon("megaphone", { size: 14, className: "chat-kind-ic" })} ${escapeHtml(c.name)}${c.verified ? ` <span class="verified-badge" title="کانال تاییدشده">${icon("check", { size: 9 })}</span>` : ""}<br><small>${(c.subscribers || []).length} دنبال‌کننده</small></span>
      <button class="mini-btn ${mySubs.has(c.id) ? "danger" : ""}" data-toggle="${c.id}">${mySubs.has(c.id) ? "لغو عضویت" : "عضویت"}</button>
    </div>`).join("");
  container.querySelectorAll("[data-toggle]").forEach(b => b.onclick = () => onToggle(b.dataset.toggle, mySubs.has(b.dataset.toggle)));
}

/* ==================== گفتگوی مخفی (فضای جدا) ==================== */

export function fmtCountdown(lastMessageAt) {
  const expiresAt = new Date(lastMessageAt).getTime() + 4 * 60 * 60 * 1000;
  const remainMs = expiresAt - Date.now();
  if (remainMs <= 0) return "در حال پاک‌شدن…";
  const h = Math.floor(remainMs / 3600000);
  const m = Math.floor((remainMs % 3600000) / 60000);
  return `پاک می‌شه تا ${h} ساعت و ${m} دقیقه دیگه`;
}

export function renderSecretChatList(container, chats, myUid, othersInfo, onOpen) {
  if (!chats.length) {
    container.innerHTML = `<p class="empty-hint">هنوز گفتگوی مخفی‌ای نداری. از پروفایل یه مخاطب، «گفتگوی مخفی» رو بزن.</p>`;
    return;
  }
  container.innerHTML = chats.map(c => {
    const otherUid = c.user_a === myUid ? c.user_b : c.user_a;
    const info = othersInfo[otherUid] || {};
    return `
    <div class="chat-card secret-card" data-id="${c.id}" data-other-uid="${otherUid}">
      ${avatarHtml(info.photoURL, info.displayName || info.username, "")}
      <div class="chat-card-body">
        <div class="chat-card-top"><span class="chat-card-name">${icon("lock", { size: 13 })} ${escapeHtml(info.displayName || info.username || "کاربر")}</span></div>
        <div class="chat-card-preview">${fmtCountdown(c.last_message_at)}</div>
      </div>
    </div>`;
  }).join("");
  container.querySelectorAll("[data-id]").forEach(el => {
    el.onclick = () => onOpen(el.dataset.id, el.dataset.otherUid);
  });
}

export function renderSecretMessages(container, messages, myUid) {
  container.innerHTML = messages.map(m => `
    <div class="bubble-row ${m.senderId === myUid ? "mine" : "theirs"}">
      <div class="bubble ${m.senderId === myUid ? "mine" : "theirs"} ${m.broken ? "secret-broken" : ""}">
        <p class="bubble-text">${escapeHtml(m.body)}</p>
        <span class="bubble-time">${fmtTime(m.createdAt)}</span>
      </div>
    </div>`).join("");
  container.scrollTop = container.scrollHeight;
}
