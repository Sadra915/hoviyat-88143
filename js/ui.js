/**
 * ui.js
 * رندر بخش‌های بصری: کارت‌های گفتگو (چت/گروه/کانال)، حباب‌های پیام، ری‌اکشن، پروفایل، انتخاب عضو.
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

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function avatarHtml(photoURL, name, extraClass) {
  return `<div class="chat-avatar ${extraClass || ""}">${photoURL ? `<img src="${photoURL}">` : `<span>${initials(name)}</span>`}</div>`;
}

/** رندر لیست یکپارچه‌ی گفتگوها: چت خصوصی + گروه + کانال، هرکدام با data-kind مشخص */
export function renderChatList(container, items, myUid) {
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-emoji">💬</div>
      <p>هنوز گفتگویی نداری. با زدن دکمه + یک گفتگوی خصوصی، گروه یا کانال بساز.</p>
    </div>`;
    return;
  }
  container.innerHTML = items.map(item => {
    if (item.kind === "group") {
      const unread = item.unreadCounts?.[myUid] || 0;
      const mine = item.lastSenderId === myUid;
      return `
        <div class="chat-card" data-kind="group" data-id="${item.id}">
          <div class="chat-avatar-wrap">${avatarHtml(item.photoURL, item.name)}</div>
          <div class="chat-card-body">
            <div class="chat-card-top"><span class="chat-name">👥 ${escapeHtml(item.name)}</span><span class="chat-time">${fmtTime(item.lastMessageAt)}</span></div>
            <div class="chat-card-bottom">
              <span class="chat-preview">${mine ? "شما: " : ""}${escapeHtml(item.lastMessage || "")}</span>
              ${unread > 0 ? `<span class="unread-badge">${unread > 9 ? "9+" : unread}</span>` : ""}
            </div>
          </div>
        </div>`;
    }
    if (item.kind === "channel") {
      return `
        <div class="chat-card" data-kind="channel" data-id="${item.id}">
          <div class="chat-avatar-wrap">${avatarHtml(item.photoURL, item.name)}</div>
          <div class="chat-card-body">
            <div class="chat-card-top"><span class="chat-name">📢 ${escapeHtml(item.name)}</span><span class="chat-time">${fmtTime(item.lastMessageAt)}</span></div>
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
      <div class="chat-card" data-kind="private" data-id="${item.id}" data-other-uid="${otherUid}">
        <div class="chat-avatar-wrap">
          ${avatarHtml(other.photoURL, other.displayName)}
          ${item._online ? '<span class="online-dot"></span>' : ""}
        </div>
        <div class="chat-card-body">
          <div class="chat-card-top"><span class="chat-name">${escapeHtml(other.displayName || other.username || "کاربر")}</span><span class="chat-time">${fmtTime(item.lastMessageAt)}</span></div>
          <div class="chat-card-bottom">
            <span class="chat-preview">${mine ? "شما: " : ""}${escapeHtml(item.lastMessage || "شروع گفتگو")}</span>
            ${unread > 0 ? `<span class="unread-badge">${unread > 9 ? "9+" : unread}</span>` : ""}
          </div>
        </div>
      </div>`;
  }).join("");
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
    <button id="chatBackBtn" class="icon-btn" aria-label="بازگشت">◀️</button>
    <div id="${infoBtnId}" class="chat-header-profile-area">
      <div class="chat-header-avatar">${entity.photoURL ? `<img src="${entity.photoURL}">` : `<span>${initials(entity.displayName)}</span>`}</div>
      <div class="chat-header-info">
        <strong>${entity.mode === "group" ? "👥 " : entity.mode === "channel" ? "📢 " : ""}${escapeHtml(entity.displayName)}</strong>
        ${subtitle}
      </div>
    </div>
    <div class="chat-header-actions">
      ${entity.mode === "channel" ? "" : `
        <button class="icon-btn" title="تماس صوتی (به‌زودی)">📞</button>
        <button class="icon-btn" title="تماس تصویری (به‌زودی)">🎥</button>`}
      <button id="chatMenuBtn" class="icon-btn">⋮</button>
    </div>
  `;
  container.dataset.canPost = canPost ? "1" : "0";
}

/** رندر کامل لیست پیام‌ها؛ showSenderNames=true برای گروه (نام فرستنده بالای حباب طرف مقابل) */
export function renderMessages(container, messages, myUid, showSenderNames) {
  let lastDay = null;
  let html = "";
  messages.forEach(m => {
    const day = fmtDayLabel(m.createdAt);
    if (day && day !== lastDay) {
      html += `<div class="day-divider"><span>${day}</span></div>`;
      lastDay = day;
    }
    html += renderBubble(m, m.senderId === myUid, showSenderNames);
  });
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

function renderBubble(m, mine, showSenderNames) {
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
  const senderLabel = (showSenderNames && !mine && m.senderName)
    ? `<div class="bubble-sender">${escapeHtml(m.senderName)}</div>` : "";

  return `
    <div class="bubble-row ${mine ? "mine" : "theirs"}" data-msg-id="${m.id}">
      <div class="bubble ${mine ? "mine" : "theirs"}">
        ${senderLabel}
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
  picker.style.top = `${rect.top - 52}px`;
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

/** پروفایل یک مخاطب (نه خود کاربر) — با زدن روی هدر چت خصوصی باز می‌شود */
export function renderContactProfile(container, other, handlers) {
  container.innerHTML = `
    <div class="view-title-bar contact-title-bar">
      <button id="contactBackBtn" class="icon-btn">◀️</button>
      <h2>پروفایل</h2>
    </div>
    <div class="idcard">
      <div class="idcard-glow"></div>
      <div class="idcard-photo">${other.photoURL
        ? `<img src="${other.photoURL}" alt="عکس پروفایل">`
        : `<span>${initials(other.displayName)}</span>`}</div>
      <h2 class="idcard-name">${escapeHtml(other.displayName || other.username)}${other.verified ? ' <span class="verified-badge" title="حساب تاییدشده">✓</span>' : ""}</h2>
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
        <button id="caMessageBtn" class="contact-action"><span>💬</span>پیام</button>
        <button class="contact-action" data-soon><span>📞</span>تماس</button>
        <button class="contact-action" data-soon><span>🎥</span>تماس تصویری</button>
        <button id="caShareBtn" class="contact-action"><span>🔗</span>اشتراک‌گذاری</button>
      </div>
    </div>
  `;
  container.querySelector("#contactBackBtn").onclick = handlers.onBack;
  container.querySelector("#caMessageBtn").onclick = handlers.onMessage;
  container.querySelector("#caShareBtn").onclick = handlers.onShare;
  container.querySelectorAll("[data-soon]").forEach(b => b.onclick = handlers.onSoon);
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
      <span>${escapeHtml(u.displayName || u.username)}<br><small>@${escapeHtml(u.username)}</small></span>
    </label>`).join("");
}

/** صفحه‌ی اطلاعات و مدیریت اعضای گروه */
export function renderGroupInfo(container, group, myUid, handlers) {
  const isAdmin = (group.admins || []).includes(myUid);
  const members = group.members.map(uid => ({ uid, ...(group.memberInfo?.[uid] || {}) }));
  container.innerHTML = `
    <div class="view-title-bar contact-title-bar">
      <button id="groupInfoBackBtn" class="icon-btn">◀️</button>
      <h2>اطلاعات گروه</h2>
    </div>
    <div class="idcard">
      <div class="idcard-photo">${group.photoURL ? `<img src="${group.photoURL}">` : `<span>${initials(group.name)}</span>`}</div>
      <h2 class="idcard-name">👥 ${escapeHtml(group.name)}</h2>
      <div class="idcard-username">${members.length} عضو</div>
    </div>
    ${isAdmin ? `
      <div class="field" style="padding:0 16px;">
        <label>افزودن عضو جدید (با یوزرنیم)</label>
        <div style="display:flex;gap:8px;">
          <input id="addMemberUsernameInput" type="text" style="flex:1;" placeholder="username">
          <button id="addMemberBtn" class="btn-primary small">افزودن</button>
        </div>
        <p id="addMemberMsg" class="auth-error"></p>
      </div>` : ""}
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
    </div>
    <button id="leaveGroupBtn" class="btn-outline danger full" style="margin:14px;width:calc(100% - 28px);">خروج از گروه</button>
  `;
  container.querySelector("#groupInfoBackBtn").onclick = handlers.onBack;
  container.querySelector("#leaveGroupBtn").onclick = handlers.onLeave;
  container.querySelectorAll("[data-promote]").forEach(b => b.onclick = () => handlers.onPromote(b.dataset.promote));
  container.querySelectorAll("[data-remove]").forEach(b => b.onclick = () => handlers.onRemove(b.dataset.remove));
  const addMemberBtn = container.querySelector("#addMemberBtn");
  if (addMemberBtn) addMemberBtn.onclick = () => handlers.onAddMember(container.querySelector("#addMemberUsernameInput").value.trim());
}

/** صفحه‌ی اطلاعات کانال (توضیحات، تعداد دنبال‌کننده، افزودن ادمین، لغو عضویت) */
export function renderChannelInfo(container, channel, myUid, handlers) {
  const isAdmin = (channel.admins || []).includes(myUid);
  const isOwner = channel.ownerId === myUid;
  container.innerHTML = `
    <div class="view-title-bar contact-title-bar">
      <button id="channelInfoBackBtn" class="icon-btn">◀️</button>
      <h2>اطلاعات کانال</h2>
    </div>
    <div class="idcard">
      <div class="idcard-photo">${channel.photoURL ? `<img src="${channel.photoURL}">` : `<span>${initials(channel.name)}</span>`}</div>
      <h2 class="idcard-name">📢 ${escapeHtml(channel.name)}</h2>
      <div class="idcard-username">${(channel.subscribers || []).length} دنبال‌کننده${channel.isPublic ? " · عمومی" : " · خصوصی"}</div>
      ${channel.description ? `<p class="idcard-bio">${escapeHtml(channel.description)}</p>` : ""}
    </div>
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
  `;
  container.querySelector("#channelInfoBackBtn").onclick = handlers.onBack;
  const unsubBtn = container.querySelector("#unsubChannelBtn");
  if (unsubBtn) unsubBtn.onclick = handlers.onUnsubscribe;
  const addAdminBtn = container.querySelector("#addAdminBtn");
  if (addAdminBtn) addAdminBtn.onclick = () => handlers.onAddAdmin(container.querySelector("#addAdminUsernameInput").value.trim());
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
      <span>📢 ${escapeHtml(c.name)}<br><small>${(c.subscribers || []).length} دنبال‌کننده</small></span>
      <button class="mini-btn ${mySubs.has(c.id) ? "danger" : ""}" data-toggle="${c.id}">${mySubs.has(c.id) ? "لغو عضویت" : "عضویت"}</button>
    </div>`).join("");
  container.querySelectorAll("[data-toggle]").forEach(b => b.onclick = () => onToggle(b.dataset.toggle, mySubs.has(b.dataset.toggle)));
}
