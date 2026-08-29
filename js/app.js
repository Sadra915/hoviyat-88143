/**
 * app.js
 * نقطه ورود و هماهنگ‌کننده اصلی هویت — گفتگوی خصوصی، گروه، کانال.
 */
import { supabase, auth, ADMIN_UID, uniqueChannelName } from "./supabase-init.js";
import { signUp, logIn, logOut, watchAuth, validateUsername, getUserDoc, mapProfile, updateMyAvatar, checkMySuspension } from "./auth.js";
import {
  findUserByUsername, getMyContacts, openOrCreateChat, watchMyChats, watchMessages, watchChatMeta,
  sendTextMessage, sendImageMessage, sendVoiceMessage, toggleReaction, markChatRead, deleteChat,
  sendStickerMessage, deleteMessage, reportMessage, blockUser, unblockUser, isUserBlocked,
} from "./chat.js";
import {
  createGroup, watchMyGroups, watchGroupMessages, sendGroupText, sendGroupImage,
  sendGroupVoice, toggleGroupReaction, markGroupRead, addGroupMember, removeGroupMember,
  leaveGroup, promoteGroupAdmin, isGroupAdmin, getGroup, updateGroupInfo, deleteGroup,
  updateGroupPermissions, updateGroupPhoto, sendGroupSticker, deleteGroupMessage, reportGroupMessage,
  joinGroupByCode, searchPublicGroups, pinGroupMessage, unpinGroupMessage, regenerateInviteCode,
  reportGroup, getGroupMessageCount,
} from "./groups.js";
import {
  createChannel, watchMyChannels, searchPublicChannels, watchChannelPosts,
  postChannelText, postChannelImage, subscribeChannel, unsubscribeChannel,
  promoteChannelAdmin, isChannelAdmin, getChannel, updateChannelInfo, deleteChannel,
  updateChannelPhoto, reportChannelPost,
} from "./channels.js";
import {
  renderChatList, renderChatHeader, renderMessages, showReactionPicker, escapeHtml,
  renderContactProfile, renderMemberPicker, renderGroupInfo, renderChannelInfo,
  renderChannelSearchResults, renderStickerPicker, renderSecretChatList, renderSecretMessages,
  fmtCountdown as secretCountdownText,
} from "./ui.js";
import { renderIdentityCard, stopIdentityCard, toast } from "./identity.js";
import { renderSmartSpace } from "./smartspace.js";
import { createVoiceRecorder } from "./voice.js";
import { icon } from "./icons.js";
import { watchTyping } from "./typing.js";
import * as security from "./security.js";
import {
  ensureMyPublicKeyPublished, openSecretChatWith, watchMySecretChats,
  watchSecretMessages, sendSecretText, deleteSecretChat, runExpiredCleanup,
} from "./secretchat.js";
import * as callManager from "./call.js";

const $ = sel => document.querySelector(sel);

/* ==================== افکت Ripple سراسری روی دکمه‌ها ====================
 * به‌جای اضافه‌کردن ایونت جداگانه به تک‌تک دکمه‌ها (که در این پروژه بیشترشان
 * با innerHTML و به‌صورت پویا ساخته می‌شوند)، یک listener سراسری روی کل سند
 * می‌گذاریم و با closest() نزدیک‌ترین دکمه هدف را پیدا می‌کنیم. */
const RIPPLE_SELECTOR = ".btn-primary, .btn-outline, .icon-btn, .fab, .option-row, .contact-action, .nav-btn, .auth-tab";
document.addEventListener("pointerdown", e => {
  const target = e.target.closest(RIPPLE_SELECTOR);
  if (!target || target.disabled) return;
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.4;
  const ink = document.createElement("span");
  ink.className = "ripple-ink";
  ink.style.width = ink.style.height = `${size}px`;
  ink.style.left = `${e.clientX - rect.left - size / 2}px`;
  ink.style.top = `${e.clientY - rect.top - size / 2}px`;
  target.appendChild(ink);
  ink.addEventListener("animationend", () => ink.remove());
  // شبکه ایمنی: اگر عنصر میزبان (مثلاً چون مودالش بسته شد) قبل از پایان
  // انیمیشن hidden شود، animationend شلیک نمی‌شود؛ این تایمر مطمئن می‌شود
  // که ریپل باقی‌مانده همیشه پاک می‌شود.
  setTimeout(() => ink.remove(), 700);
});

// در نسخه Supabase، Storage (باکت‌های chat-media/group-media/channel-media) در
// اسکریپت supabase/schema.sql ساخته می‌شود، پس آپلود عکس/ویس را می‌توان فعال کرد.
// اگر هنوز اسکریپت SQL را روی پروژه Supabase خود اجرا نکرده‌اید، این را false نگه دارید.
const MEDIA_UPLOADS_ENABLED = true;

let currentEntity = null; // { mode: 'private'|'group'|'channel', id, otherUid?, data }
let replyingTo = null; // { id } — پیامی که در حال پاسخ‌دادن به آن هستیم
let lastMessagesCache = []; // آخرین لیست پیام‌های رندرشده، برای پیدا کردن متن پیشنمایش ریپلای
let unsubChats = null, unsubGroups = null, unsubChannels = null, unsubMessages = null;
let currentTyping = null; // { ping, stop } — کانال «در حال تایپ» گفتگوی باز فعلی
let unsubChatMeta = null; // فقط برای چت خصوصی: ردیابی لحظه‌ای last_read طرف مقابل (تیک آبی)
let otherLastRead = null;
let verifiedMap = {}; // uid -> boolean، کش وضعیت تایید حساب برای نمایش تیک آبی کنار اسم در چت گروه
let currentContactBlocked = false; // آیا مخاطب چت خصوصی فعلی بلاک شده
let unsubSecretList = null, unsubSecretMessages = null;
let secretCountdownTimer = null;
let currentSecretChat = null; // { id, otherUid, aesKey }
let secretOthersInfoCache = {}; // uid -> {displayName, username, photoURL} برای لیست گفتگوهای مخفی
let myProfileCache = {}; // پروفایل خودم — برای فرستادن نام/عکس هنگام تماس گرفتن
let latestChats = [], latestGroups = [], latestChannels = [];
const presenceMap = {};
const presenceUnsubs = {};
const recorder = createVoiceRecorder();
let isRecording = false;
let currentFilter = "all";
let pickableUsers = [];  // مخاطب‌های موجود + هرکسی که با یوزرنیم دقیق پیدا/اضافه شده
const groupSelectedUids = new Set();

/* ==================== احراز هویت ==================== */

watchAuth(async user => {
  $("#bootScreen").classList.add("hide");
  if (user) {
    try {
      await enterApp(user);
    } catch (err) {
      console.error("enterApp failed:", err);
      toast("مشکلی در بارگذاری پیش آمد؛ دوباره تلاش می‌کنیم…");
      switchView("home"); // حداقل صفحه اصلی باز شود؛ امنیتِ اضافه بعداً از تنظیمات قابل تلاش مجدد است
    }
  } else {
    exitToAuth();
  }
});

function exitToAuth() {
  $("#appShell").hidden = true;
  $("#view-auth").hidden = true;
  $("#view-welcome").hidden = false;
  if (unsubChats) { unsubChats(); unsubChats = null; }
  if (unsubGroups) { unsubGroups(); unsubGroups = null; }
  if (unsubChannels) { unsubChannels(); unsubChannels = null; }
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  if (currentTyping) { currentTyping.stop(); currentTyping = null; }
  if (unsubChatMeta) { unsubChatMeta(); unsubChatMeta = null; }
  Object.values(presenceUnsubs).forEach(u => u());
  Object.keys(presenceUnsubs).forEach(k => delete presenceUnsubs[k]);
}

$("#welcomeSignupBtn").addEventListener("click", () => {
  $("#view-welcome").hidden = true;
  $("#view-auth").hidden = false;
  switchAuthTab("signup");
});
$("#welcomeLoginBtn").addEventListener("click", () => {
  $("#view-welcome").hidden = true;
  $("#view-auth").hidden = false;
  switchAuthTab("login");
});
$("#authBackToWelcome").addEventListener("click", () => {
  $("#view-auth").hidden = true;
  $("#view-welcome").hidden = false;
});

async function enterApp(user) {
  $("#view-welcome").hidden = true;
  $("#view-auth").hidden = true;
  $("#appShell").hidden = false;

  const myData = (await getUserDoc(user.uid)) || {};
  ensureMyPublicKeyPublished().catch(() => {}); // بی‌سروصدا؛ اگه شکست خورد، دفعه‌ی بعد امتحان می‌شه
  myProfileCache = myData; // برای فرستادن نام/عکس خودم هنگام تماس گرفتن
  renderTopbarAvatar(myData.photoURL, myData.displayName || myData.username);

  loadThemePref();
  renderSmartSpace($("#smartSpaceHolder"));
  checkAnnouncement();
  checkSuspension();
  watchMySuspension(user.uid);
  showChatListSkeleton();

  unsubChats = watchMyChats(async chats => {
    latestChats = chats.map(c => ({ ...c, kind: "private" }));
    ensurePresenceSubs(latestChats, user.uid);
    renderList(); // رندر فوری با هرچه موجود است، بدون معطلی
    await fillMissingChatProfiles();
    renderList(); // بعد از تکمیل پروفایل‌های ناقص/قدیمی، دوباره رندر کن
  });
  unsubGroups = watchMyGroups(groups => { latestGroups = groups; renderList(); });
  unsubChannels = watchMyChannels(channels => { latestChannels = channels; renderList(); });

  initCallFeature(user.uid);

  switchView("home");

  // امنیت: ثبت این دستگاه به‌عنوان یک نشست + هشدار اگر دستگاه جدید بود،
  // سپس در صورت فعال بودن قفل برنامه، صفحه را قفل نگه دار تا رمز/بیومتریک تایید شود.
  security.registerCurrentSession().then(isNew => {
    if (isNew) toast("ورود از یک دستگاه جدید ثبت شد — برای بررسی، مرکز امنیت حساب رو نگاه کن");
  });
  await maybeShowAppLock();
}

/* ==================== قفل برنامه (PIN/بیومتریک) ==================== */

let cachedSecuritySettings = null;
let lockPinBuffer = "";
let appIsLocked = false;

async function maybeShowAppLock() {
  cachedSecuritySettings = await security.getSecuritySettings();
  if (cachedSecuritySettings.app_lock_enabled) showLockScreen();
}

function showLockScreen() {
  appIsLocked = true;
  lockPinBuffer = "";
  updateLockDots();
  $("#lockError").textContent = "";
  $("#appLockScreen").hidden = false;
  $("#lockBiometricBtn").style.visibility = cachedSecuritySettings?.biometric_enabled ? "visible" : "hidden";
}
function hideLockScreen() {
  appIsLocked = false;
  $("#appLockScreen").hidden = true;
}
function updateLockDots() {
  const dots = $("#lockPinDots").children;
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle("filled", i < lockPinBuffer.length);
}
$("#lockKeypad").addEventListener("click", async e => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const k = btn.dataset.k;
  if (k === "back") { lockPinBuffer = lockPinBuffer.slice(0, -1); updateLockDots(); return; }
  if (k === "bio") {
    try {
      const ok = await security.unlockWithBiometric(cachedSecuritySettings.webauthn_credential_id);
      if (ok) hideLockScreen(); else $("#lockError").textContent = "تایید بیومتریک ناموفق بود.";
    } catch { $("#lockError").textContent = "بیومتریک لغو یا ناموفق بود."; }
    return;
  }
  if (lockPinBuffer.length >= 8) return;
  lockPinBuffer += k;
  updateLockDots();
  if (lockPinBuffer.length >= 4) {
    try {
      const ok = await security.verifyAppLockPin(lockPinBuffer);
      if (ok) { hideLockScreen(); }
      else { $("#lockError").textContent = "رمز اشتباه است."; lockPinBuffer = ""; updateLockDots(); }
    } catch (err) { $("#lockError").textContent = err.message || "خطا"; lockPinBuffer = ""; updateLockDots(); }
  }
});

// اگر اپ چند ثانیه در پس‌زمینه بوده و قفل فعال است، دوباره قفل کن
let hiddenSince = null;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { hiddenSince = Date.now(); return; }
  if (hiddenSince && cachedSecuritySettings?.app_lock_enabled && Date.now() - hiddenSince > 5000) showLockScreen();
  hiddenSince = null;
});

function ensurePresenceSubs(chats, myUid) {
  const currentUids = new Set(chats.map(c => c.members.find(m => m !== myUid)).filter(Boolean));

  // پاک‌سازی نشتی حافظه: هر Listener که مخاطبش دیگر در لیست چت‌ها نیست، لغو می‌شود
  Object.keys(presenceUnsubs).forEach(uid => {
    if (!currentUids.has(uid)) {
      presenceUnsubs[uid]();
      delete presenceUnsubs[uid];
      delete presenceMap[uid];
    }
  });

  currentUids.forEach(otherUid => {
    if (!presenceUnsubs[otherUid]) {
      const refetch = async () => {
        const { data } = await supabase.from("profiles").select("online, verified").eq("id", otherUid).maybeSingle();
        presenceMap[otherUid] = { online: !!data?.online, verified: !!data?.verified };
        renderList();
      };
      refetch();
      const ch = supabase
        .channel(uniqueChannelName(`presence-${otherUid}`))
        .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${otherUid}` }, refetch)
        .subscribe();
      presenceUnsubs[otherUid] = () => supabase.removeChannel(ch);
    }
  });
}

/** اسکلت شیمر موقت، فقط تا وقتی اولین داده واقعی چت/گروه/کانال از سرور برسد */
function showChatListSkeleton() {
  const row = `
    <div class="chat-card skeleton-card">
      <div class="skeleton-circle"></div>
      <div class="chat-card-body">
        <div class="skeleton-line" style="width:40%"></div>
        <div class="skeleton-line" style="width:70%"></div>
      </div>
    </div>`;
  $("#chatListHolder").innerHTML = row.repeat(5);
}

/**
 * برای چت‌هایی که member_info آن‌ها ناقص/خالی است (مثلاً چت‌های قدیمی‌تر از
 * زمانی که این snapshot اضافه شد)، پروفایل طرف مقابل را مستقیم از profiles
 * می‌خواند و در حافظه پر می‌کند — همان چیزی که در «همه چت‌ها» نشان داده نمی‌شد.
 */
async function fillMissingChatProfiles() {
  const myUid = auth.currentUser?.uid;
  if (!myUid) return;
  const needed = new Set();
  for (const c of latestChats) {
    const otherUid = c.members?.find(m => m !== myUid);
    if (!otherUid) continue;
    const info = c.memberInfo?.[otherUid];
    if (!info || (!info.photoURL && !info.displayName)) needed.add(otherUid);
  }
  if (!needed.size) return;
  const { data } = await supabase.from("profiles")
    .select("id, username, display_name, photo_url").in("id", [...needed]);
  if (!data || !data.length) return;
  const byId = new Map(data.map(r => [r.id, r]));
  latestChats = latestChats.map(c => {
    const otherUid = c.members?.find(m => m !== myUid);
    const row = otherUid && byId.get(otherUid);
    if (!row) return c;
    return {
      ...c,
      memberInfo: { ...c.memberInfo, [otherUid]: { username: row.username, displayName: row.display_name, photoURL: row.photo_url || "" } },
    };
  });
}



/** ترکیب چت/گروه/کانال، اعمال فیلتر و مرتب‌سازی بر اساس آخرین پیام، سپس رندر */
function renderList() {
  const myUid = auth.currentUser?.uid;
  if (!myUid) return;
  const chatsWithPresence = latestChats.map(c => {
    const p = presenceMap[c.members.find(m => m !== myUid)] || {};
    return { ...c, _online: p.online, _verified: p.verified };
  });
  let merged = [...chatsWithPresence, ...latestGroups, ...latestChannels];

  if (currentFilter === "unread") {
    merged = merged.filter(item => (item.unreadCounts?.[myUid] || 0) > 0);
  } else if (currentFilter === "groups") {
    merged = merged.filter(item => item.kind === "group");
  } else if (currentFilter === "channels") {
    merged = merged.filter(item => item.kind === "channel");
  }

  merged.sort((a, b) => (new Date(b.lastMessageAt || 0).getTime()) - (new Date(a.lastMessageAt || 0).getTime()));
  renderChatList($("#chatListHolder"), merged, myUid);
}

$("#tabLogin").addEventListener("click", () => switchAuthTab("login"));
$("#tabSignup").addEventListener("click", () => switchAuthTab("signup"));
function switchAuthTab(tab) {
  $("#tabLogin").classList.toggle("active", tab === "login");
  $("#tabSignup").classList.toggle("active", tab === "signup");
  $("#loginForm").hidden = tab !== "login";
  $("#signupForm").hidden = tab !== "signup";
}

/* ==================== hCaptcha (محافظت در برابر ربات) ==================== */
const HCAPTCHA_SITE_KEY = "9000f244-32ce-4a3e-9144-5df80d4c2bac";
let loginCaptchaId = null, signupCaptchaId = null;
function initCaptchas() {
  if (typeof hcaptcha === "undefined") { setTimeout(initCaptchas, 300); return; }
  loginCaptchaId = hcaptcha.render("loginCaptcha", { sitekey: HCAPTCHA_SITE_KEY });
  signupCaptchaId = hcaptcha.render("signupCaptcha", { sitekey: HCAPTCHA_SITE_KEY });
}
initCaptchas();

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("#loginError").textContent = "";
  const token = hcaptcha.getResponse(loginCaptchaId);
  if (!token) { $("#loginError").textContent = "لطفاً کپچا را کامل کنید."; return; }
  try {
    await logIn($("#loginEmail").value.trim(), $("#loginPassword").value, token);
  } catch (err) {
    $("#loginError").textContent = translateAuthError(err);
  } finally {
    hcaptcha.reset(loginCaptchaId);
  }
});

$("#signupForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("#signupError").textContent = "";
  const username = $("#signupUsername").value.trim().toLowerCase();
  if (!validateUsername(username)) {
    $("#signupError").textContent = "شناسه کاربری باید ۳ تا ۲۰ حرف/عدد انگلیسی کوچک یا _ باشد.";
    return;
  }
  const token = hcaptcha.getResponse(signupCaptchaId);
  if (!token) { $("#signupError").textContent = "لطفاً کپچا را کامل کنید."; return; }
  try {
    await signUp({
      email: $("#signupEmail").value.trim(),
      password: $("#signupPassword").value,
      username, displayName: $("#signupName").value.trim(),
      captchaToken: token,
    });
  } catch (err) {
    $("#signupError").textContent = translateAuthError(err);
  } finally {
    hcaptcha.reset(signupCaptchaId);
  }
});

// نکته مهاجرت: این نگاشت قبلاً روی کدهای خطای Firebase (auth/email-already-in-use و...)
// بود که Supabase اصلاً تولیدشان نمی‌کند — یعنی هیچ‌وقت با پیام فارسی جایگزین
// نمی‌شدند. اینجا با متن واقعی پیام‌های خطای Supabase Auth (انگلیسی، ثابت در نسخه فعلی)
// تطبیق داده شده.
function translateAuthError(err) {
  const msg = err?.message || "";
  const rules = [
    [/already registered/i, "این ایمیل قبلاً ثبت شده است."],
    [/invalid login credentials/i, "ایمیل یا رمز عبور اشتباه است."],
    [/email.*invalid|invalid.*email/i, "ایمیل معتبر نیست."],
    [/password should be at least/i, "رمز عبور باید حداقل ۶ کاراکتر باشد."],
    [/email not confirmed/i, "ایمیل شما هنوز تایید نشده — صندوق ورودی خود را بررسی کنید."],
    [/rate limit|only request this after/i, "درخواست‌های زیاد — کمی صبر کن و دوباره امتحان کن."],
  ];
  const hit = rules.find(([re]) => re.test(msg));
  return hit ? hit[1] : (msg || "خطای غیرمنتظره‌ای رخ داد.");
}

/* ==================== ناوبری بین صفحات ==================== */

function switchView(view) {
  if (view === "chatsearch") { openNewChatOptions(); return; }
  document.querySelectorAll(".view").forEach(v => v.hidden = true);
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  $(`#view-${view}`).hidden = false;
  const navBtn = document.querySelector(`.nav-btn[data-view="${view}"]`);
  if (navBtn) navBtn.classList.add("active");

  if (view === "identity") renderIdentityCard($("#identityHolder"));
  else stopIdentityCard();

  if (view === "settings") loadSettingsForm();
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});
$("#profileBtn").addEventListener("click", () => switchView("settings"));

document.querySelectorAll(".filter-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentFilter = tab.dataset.filter;
    renderList();
  });
});

/* ==================== باز کردن یک گفتگو (چت/گروه/کانال) ==================== */

$("#chatListHolder").addEventListener("click", e => {
  const card = e.target.closest(".chat-card");
  if (!card) return;
  const kind = card.dataset.kind;
  if (kind === "private") openChatById(card.dataset.id, card.dataset.otherUid);
  else if (kind === "group") openGroupById(card.dataset.id);
  else if (kind === "channel") openChannelById(card.dataset.id);
});

function showChatView() {
  document.querySelectorAll(".view").forEach(v => v.hidden = true);
  $("#view-chat").hidden = false;
}

/** پاک‌سازی مشترک قبل از باز کردن هر گفتگوی جدید یا برگشت به لیست */
function teardownConversation() {
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  if (currentTyping) { currentTyping.stop(); currentTyping = null; }
  if (unsubChatMeta) { unsubChatMeta(); unsubChatMeta = null; }
  otherLastRead = null;
}

function setTypingUI(isTyping) {
  const sub = $("#chatHeaderSubtitle");
  const typ = $("#chatHeaderTyping");
  if (!sub || !typ) return;
  sub.hidden = isTyping;
  typ.hidden = !isTyping;
}

/* ==================== پیش‌نویس پیام (فقط روی همین دستگاه، در حافظه‌ی مرورگر) ==================== */
function draftKey(id) { return `hoviyat_draft_${id}`; }
function restoreDraft(id) {
  const saved = localStorage.getItem(draftKey(id));
  $("#messageInput").value = saved || "";
}
function saveDraft(id, text) {
  if (text) localStorage.setItem(draftKey(id), text);
  else localStorage.removeItem(draftKey(id));
}
let draftSaveTimer = null;
$("#messageInput").addEventListener("input", e => {
  if (!currentEntity) return;
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => saveDraft(currentEntity.id, e.target.value), 400);
});

async function openChatById(chatId, otherUid) {
  teardownConversation();
  currentEntity = { mode: "private", id: chatId, otherUid };
  const otherUser = (await getUserDoc(otherUid)) || { uid: otherUid, displayName: "کاربر" };
  currentEntity.data = otherUser;
  currentContactBlocked = await isUserBlocked(otherUid).catch(() => false);

  renderChatHeader($("#chatHeader"), {
    mode: "private", displayName: otherUser.displayName || otherUser.username,
    photoURL: otherUser.photoURL, online: otherUser.online, verified: otherUser.verified,
  });
  setComposerMode(true);
  showChatView();
  restoreDraft(chatId);
  $("#pinnedBar").hidden = true;

  unsubMessages = watchMessages(chatId, msgs => {
    lastMessagesCache = msgs;
    renderMessages($("#messagesHolder"), msgs, auth.currentUser.uid, false, chatId, otherLastRead);
  });
  currentTyping = watchTyping("private", chatId, setTypingUI);
  unsubChatMeta = watchChatMeta(chatId, meta => {
    otherLastRead = meta.lastRead?.[otherUid] || null;
    renderMessages($("#messagesHolder"), lastMessagesCache, auth.currentUser.uid, false, chatId, otherLastRead);
  });
  markChatRead(chatId);
}

async function openGroupById(groupId) {
  teardownConversation();
  const group = await getGroup(groupId);
  if (!group) return;

  if (group.isBlocked) {
    currentEntity = null;
    $("#groupBlockedReasonText").textContent = group.blockedReason
      ? `دلیل: ${group.blockedReason}`
      : "به دلیل نقض قوانین پیام‌رسان هویت، دسترسی به این گروه بسته شده است.";
    document.querySelectorAll(".view").forEach(v => v.hidden = true);
    $("#view-group-blocked").hidden = false;
    return;
  }

  currentEntity = { mode: "group", id: groupId, data: group };

  renderChatHeader($("#chatHeader"), {
    mode: "group", displayName: group.name, photoURL: group.photoURL, memberCount: group.members.length,
  });
  setComposerMode(true);
  showChatView();
  restoreDraft(groupId);
  updatePinnedBar(group);

  unsubMessages = watchGroupMessages(groupId, async msgs => {
    lastMessagesCache = msgs;
    const unknown = [...new Set(msgs.map(m => m.senderId))].filter(uid => !(uid in verifiedMap));
    if (unknown.length) {
      const { data } = await supabase.from("profiles").select("id, verified").in("id", unknown);
      (data || []).forEach(row => { verifiedMap[row.id] = !!row.verified; });
      unknown.forEach(uid => { if (!(uid in verifiedMap)) verifiedMap[uid] = false; });
    }
    renderMessages($("#messagesHolder"), msgs, auth.currentUser.uid, true, groupId, undefined, verifiedMap);
  });
  currentTyping = watchTyping("group", groupId, setTypingUI);
  markGroupRead(groupId);
}

/** به‌روزرسانی نوار پیام سنجاق‌شده‌ی بالای صفحه چت گروه */
async function updatePinnedBar(group) {
  const bar = $("#pinnedBar");
  if (!group.pinnedMessageId) { bar.hidden = true; return; }
  const { data } = await supabase.from("group_messages").select("*").eq("id", group.pinnedMessageId).maybeSingle();
  if (!data) { bar.hidden = true; return; }
  const preview = data.type === "text" ? data.body : data.type === "image" ? "📷 عکس" : data.type === "voice" ? "🎙 پیام صوتی" : "🧩 استیکر";
  $("#pinnedBarText").textContent = preview || "";
  bar.hidden = false;
  const unpinBtn = $("#pinnedBarUnpinBtn");
  const isAdmin = isGroupAdmin(group);
  unpinBtn.hidden = !isAdmin;
  if (isAdmin) unpinBtn.onclick = async () => {
    await unpinGroupMessage(group.id);
    bar.hidden = true;
    if (currentEntity?.id === group.id) currentEntity.data.pinnedMessageId = null;
  };
}

async function openChannelById(channelId) {
  teardownConversation();
  const channel = await getChannel(channelId);
  if (!channel) return;
  currentEntity = { mode: "channel", id: channelId, data: channel };
  const admin = isChannelAdmin(channel);

  renderChatHeader($("#chatHeader"), {
    mode: "channel", displayName: channel.name, photoURL: channel.photoURL,
    memberCount: (channel.subscribers || []).length, isAdminUser: admin,
  });
  setComposerMode(admin);
  showChatView();
  $("#pinnedBar").hidden = true;
  $("#replyPreviewBar").hidden = true;
  $("#stickerPicker").hidden = true;

  unsubMessages = watchChannelPosts(channelId, posts => { lastMessagesCache = posts; renderMessages($("#messagesHolder"), posts, auth.currentUser.uid, false, channelId); });
}

function setComposerMode(canPost) {
  $("#composerForm").hidden = !canPost;
  $("#channelViewOnlyBar").hidden = canPost;
  $("#voiceRecordBar").hidden = true;
  $("#replyPreviewBar").hidden = true;
  $("#stickerPicker").hidden = true;
  replyingTo = null;
}

$("#chatHeader").addEventListener("click", e => {
  if (e.target.closest("#chatBackBtn")) {
    teardownConversation();
    switchView("home");
    return;
  }
  if (e.target.closest("#chatHeaderProfileArea")) {
    openContactProfile();
    return;
  }
  if (e.target.closest("#chatHeaderGroupInfoArea") || e.target.closest("#chatMenuBtn")) {
    if (currentEntity?.mode === "group") openGroupInfoView();
    else if (currentEntity?.mode === "channel") openChannelInfoView();
    return;
  }
  if (e.target.closest("#chatCallBtn") || e.target.closest("#chatVideoBtn")) {
    toast("در حال تکمیل و توسعه این بخش هستیم");
  }
});

function openContactProfile() {
  document.querySelectorAll(".view").forEach(v => v.hidden = true);
  $("#view-contact").hidden = false;
  renderContactProfile($("#contactProfileHolder"), currentEntity.data, {
    onBack: () => { $("#view-contact").hidden = true; $("#view-chat").hidden = false; },
    onMessage: () => { $("#view-contact").hidden = true; $("#view-chat").hidden = false; },
    onShare: async () => {
      const shareUrl = `${location.origin}${location.pathname}#/u/${currentEntity.data.username}`;
      if (navigator.share) navigator.share({ title: "هویت", url: shareUrl }).catch(() => {});
      else { await navigator.clipboard.writeText(shareUrl); toast("لینک کپی شد", "success"); }
    },
    onSoon: () => toast("در حال تکمیل و توسعه این بخش هستیم"),
    onCall: () => startOutgoingCall(false),
    onVideoCall: () => startOutgoingCall(true),
    onSecretChat: async () => {
      try {
        await openSecretChatById(currentEntity.otherUid, currentEntity.data);
      } catch (err) { toast(err.message || "خطا در باز کردن گفتگوی مخفی", "error"); }
    },
    onDeleteChat: async () => {
      await deleteChat(currentEntity.id);
      $("#view-contact").hidden = true;
      switchView("home");
      toast("گفتگو حذف شد");
    },
    onToggleBlock: async () => {
      try {
        if (currentContactBlocked) await unblockUser(currentEntity.otherUid);
        else await blockUser(currentEntity.otherUid);
        currentContactBlocked = !currentContactBlocked;
        toast(currentContactBlocked ? "کاربر بلاک شد" : "بلاک برداشته شد");
        openContactProfile();
      } catch (err) { toast(err.message || "خطا", "error"); }
    },
  }, currentContactBlocked);
}

function openGroupInfoView() {
  document.querySelectorAll(".view").forEach(v => v.hidden = true);
  $("#view-groupinfo").hidden = false;
  renderGroupInfoNow();
}
async function renderGroupInfoNow() {
  const group = await getGroup(currentEntity.id);
  renderGroupInfo($("#groupInfoHolder"), group, auth.currentUser.uid, {
    onBack: () => { $("#view-groupinfo").hidden = true; $("#view-chat").hidden = false; },
    onLeave: async () => {
      await leaveGroup(currentEntity.id);
      $("#view-groupinfo").hidden = true;
      switchView("home");
      toast("از گروه خارج شدی");
    },
    onPromote: async uid => { await promoteGroupAdmin(currentEntity.id, uid); renderGroupInfoNow(); },
    onRemove: async uid => { await removeGroupMember(currentEntity.id, uid); renderGroupInfoNow(); },
    onAddMember: async username => {
      const msgEl = $("#addMemberMsg");
      if (!username) return;
      const user = await findUserByUsername(username);
      if (!user) { msgEl.textContent = "کاربری با این شناسه پیدا نشد."; return; }
      if (group.members.includes(user.uid)) { msgEl.textContent = "این کاربر از قبل عضو گروهه."; return; }
      await addGroupMember(currentEntity.id, user);
      msgEl.textContent = "";
      toast("عضو جدید اضافه شد", "success");
      renderGroupInfoNow();
    },
    onSaveInfo: async ({ name, description, rules }) => {
      const msgEl = $("#groupInfoMsg");
      if (!name?.trim()) { msgEl.textContent = "نام گروه نمی‌تواند خالی باشد."; return; }
      try {
        await updateGroupInfo(currentEntity.id, { name, description, rules });
        toast("تغییرات ذخیره شد", "success");
        renderGroupInfoNow();
      } catch (err) {
        msgEl.textContent = err.message || "خطا در ذخیره تغییرات.";
      }
    },
    onDelete: async () => {
      await deleteGroup(currentEntity.id);
      $("#view-groupinfo").hidden = true;
      switchView("home");
      toast("گروه حذف شد");
    },
    onCopyInviteCode: async code => {
      if (!code) return;
      await navigator.clipboard.writeText(code);
      toast("کد دعوت کپی شد", "success");
    },
    onRegenInviteCode: async () => {
      try {
        await regenerateInviteCode(currentEntity.id);
        toast("کد دعوت جدید ساخته شد", "success");
        renderGroupInfoNow();
      } catch (err) { toast(err.message || "خطا در ساخت کد جدید", "error"); }
    },
    onToggleAdminOnly: async adminOnly => {
      try {
        await updateGroupPermissions(currentEntity.id, { ...group.permissions, send_messages: !adminOnly });
        toast(adminOnly ? "حالت فقط‌مدیر روشن شد" : "حالت فقط‌مدیر خاموش شد", "success");
        renderGroupInfoNow();
      } catch (err) { toast(err.message || "خطا در تغییر حالت", "error"); }
    },
    onReportGroup: async () => {
      const reason = prompt("دلیل گزارش این گروه چیه؟ (اختیاری)") || "";
      try {
        await reportGroup(currentEntity.id, group.name, reason);
        toast("گزارش ثبت شد، ممنون از توجهت", "success");
      } catch (err) { toast(err.message || "خطا در ثبت گزارش", "error"); }
    },
    onSavePermissions: async permissions => {
      const msgEl = $("#groupPermsMsg");
      try {
        await updateGroupPermissions(currentEntity.id, permissions);
        toast("دسترسی‌ها ذخیره شد", "success");
        renderGroupInfoNow();
      } catch (err) {
        msgEl.textContent = err.message || "خطا در ذخیره دسترسی‌ها.";
      }
    },
    onChangePhoto: async file => {
      try {
        await updateGroupPhoto(currentEntity.id, file);
        toast("عکس گروه عوض شد", "success");
        renderGroupInfoNow();
      } catch (err) {
        toast(err.message || "خطا در آپلود عکس.", "error");
      }
    },
  });
}

function openChannelInfoView() {
  document.querySelectorAll(".view").forEach(v => v.hidden = true);
  $("#view-channelinfo").hidden = false;
  renderChannelInfoNow();
}
async function renderChannelInfoNow() {
  const channel = await getChannel(currentEntity.id);
  renderChannelInfo($("#channelInfoHolder"), channel, auth.currentUser.uid, {
    onBack: () => { $("#view-channelinfo").hidden = true; $("#view-chat").hidden = false; },
    onUnsubscribe: async () => {
      await unsubscribeChannel(currentEntity.id);
      $("#view-channelinfo").hidden = true;
      switchView("home");
      toast("عضویت لغو شد");
    },
    onAddAdmin: async username => {
      const msgEl = $("#addAdminMsg");
      if (!username) return;
      const user = await findUserByUsername(username);
      if (!user) { msgEl.textContent = "کاربری با این شناسه پیدا نشد."; return; }
      if (!(channel.subscribers || []).includes(user.uid)) { msgEl.textContent = "این کاربر باید اول عضو کانال بشه."; return; }
      await promoteChannelAdmin(currentEntity.id, user.uid);
      msgEl.textContent = "";
      toast("ادمین جدید اضافه شد", "success");
      renderChannelInfoNow();
    },
    onSaveInfo: async ({ name, description }) => {
      const msgEl = $("#channelInfoMsg");
      if (!name?.trim()) { msgEl.textContent = "نام کانال نمی‌تواند خالی باشد."; return; }
      try {
        await updateChannelInfo(currentEntity.id, { name, description });
        toast("تغییرات ذخیره شد", "success");
        renderChannelInfoNow();
      } catch (err) {
        msgEl.textContent = err.message || "خطا در ذخیره تغییرات.";
      }
    },
    onDelete: async () => {
      await deleteChannel(currentEntity.id);
      $("#view-channelinfo").hidden = true;
      switchView("home");
      toast("کانال حذف شد");
    },
    onChangePhoto: async file => {
      try {
        await updateChannelPhoto(currentEntity.id, file);
        toast("عکس کانال عوض شد", "success");
        renderChannelInfoNow();
      } catch (err) {
        toast(err.message || "خطا در آپلود عکس.", "error");
      }
    },
  });
}

/* ==================== گفتگوی جدید: گزینه‌ها (خصوصی/گروه/کانال) ==================== */

function openNewChatOptions() {
  $("#newChatOptionsModal").hidden = false;
  $("#newChatOptionsModal").classList.add("open");
}
$("#closeNewChatOptions").addEventListener("click", () => closeModal("#newChatOptionsModal"));
$("#fabNewChat").addEventListener("click", openNewChatOptions);

function closeModal(sel) {
  const el = $(sel);
  el.classList.remove("open");
  // صبر می‌کنیم انیمیشن بسته‌شدن (fade/scale یا اسلاید شیت) واقعاً پخش شود؛
  // قبلاً hidden بلافاصله ست می‌شد و ترنزیشن اصلاً دیده نمی‌شد.
  window.setTimeout(() => { el.hidden = true; }, 260);
}

$("#optPrivate").addEventListener("click", () => { closeModal("#newChatOptionsModal"); openNewChatModal(); });
$("#optGroup").addEventListener("click", () => { closeModal("#newChatOptionsModal"); openGroupModal(); });
$("#optChannel").addEventListener("click", () => { closeModal("#newChatOptionsModal"); openChannelModal(); });

/* ---------- پیام خصوصی جدید (جستجوی یوزرنیم) ---------- */

function openNewChatModal() {
  $("#newChatModal").hidden = false;
  $("#newChatModal").classList.add("open");
  $("#newChatUsernameInput").value = "";
  $("#newChatError").textContent = "";
  $("#newChatResult").innerHTML = "";
  $("#newChatUsernameInput").focus();
}
$("#closeNewChat").addEventListener("click", () => closeModal("#newChatModal"));

$("#chatSearchInput").addEventListener("input", e => {
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll("#chatListHolder .chat-card").forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = !q || text.includes(q) ? "" : "none";
  });
});

let searchTimer = null;
$("#newChatUsernameInput").addEventListener("input", e => {
  clearTimeout(searchTimer);
  const val = e.target.value.trim();
  searchTimer = setTimeout(async () => {
    $("#newChatError").textContent = "";
    $("#newChatResult").innerHTML = "";
    if (!val) return;
    const myUname = (await getUserDoc(auth.currentUser.uid))?.username;
    if (val.replace(/^@/, "").toLowerCase() === myUname) {
      $("#newChatError").textContent = "این شناسه کاربری خودت است.";
      return;
    }
    const user = await findUserByUsername(val);
    if (!user) { $("#newChatError").textContent = "کاربری با این شناسه پیدا نشد."; return; }
    $("#newChatResult").innerHTML = `
      <div class="found-user-card">
        <div class="chat-avatar">${user.photoURL ? `<img src="${escapeHtml(user.photoURL)}">` : `<span>${(user.displayName || user.username)[0]}</span>`}</div>
        <div><strong>${escapeHtml(user.displayName)}${user.verified ? ` <span class="verified-badge" title="حساب تاییدشده">${icon("check", { size: 10 })}</span>` : ""}</strong><br><small>@${escapeHtml(user.username)}</small></div>
        <button id="startChatBtn" class="btn-primary small">شروع گفتگو</button>
      </div>`;
    $("#startChatBtn").onclick = async () => {
      const chatId = await openOrCreateChat(user);
      closeModal("#newChatModal");
      switchView("home");
      openChatById(chatId, user.uid);
    };
  }, 400);
});

/* ---------- ساخت گروه ---------- */

async function openGroupModal() {
  $("#groupModal").hidden = false;
  $("#groupModal").classList.add("open");
  $("#groupNameInput").value = "";
  $("#groupModalError").textContent = "";
  $("#joinGroupCodeInput").value = "";
  $("#joinGroupMsg").textContent = "";
  $("#groupIsPublicInput").checked = false;
  $("#groupMaxMembersInput").value = "";
  groupSelectedUids.clear();
  $("#groupAddByUsernameInput").value = "";
  $("#groupAddByUsernameMsg").textContent = "";
  // فقط مخاطب‌هایی که از قبل با آن‌ها چت خصوصی داری (امن، بدون نیاز به لیست کامل کاربران)
  pickableUsers = await getMyContacts();
  renderMemberPicker($("#groupMembersList"), pickableUsers, groupSelectedUids);
}
$("#closeGroupModal").addEventListener("click", () => closeModal("#groupModal"));

$("#groupAddByUsernameBtn").addEventListener("click", async () => {
  const uname = $("#groupAddByUsernameInput").value.trim();
  $("#groupAddByUsernameMsg").textContent = "";
  if (!uname) return;
  try {
    const user = await findUserByUsername(uname);
    if (!user) { $("#groupAddByUsernameMsg").textContent = "کاربری با این یوزرنیم پیدا نشد."; return; }
    if (user.uid === auth.currentUser.uid) { $("#groupAddByUsernameMsg").textContent = "این خودتی هست، نمی‌تونی خودت رو اضافه کنی."; return; }
    if (!pickableUsers.some(u => u.uid === user.uid)) pickableUsers.push(user);
    groupSelectedUids.add(user.uid);
    renderMemberPicker($("#groupMembersList"), pickableUsers, groupSelectedUids);
    $("#groupAddByUsernameInput").value = "";
  } catch (err) {
    $("#groupAddByUsernameMsg").textContent = err.message || "خطا در جستجو.";
  }
});

$("#joinGroupCodeBtn").addEventListener("click", async () => {
  const code = $("#joinGroupCodeInput").value.trim();
  if (!code) return;
  try {
    const group = await joinGroupByCode(code);
    closeModal("#groupModal");
    switchView("home");
    openGroupById(group.id);
    toast("به گروه پیوستی", "success");
  } catch (err) {
    $("#joinGroupMsg").textContent = err.message || "کد دعوت نامعتبر است.";
  }
});

$("#groupMembersList").addEventListener("change", e => {
  const cb = e.target.closest('input[type="checkbox"]');
  if (!cb) return;
  if (cb.checked) groupSelectedUids.add(cb.value);
  else groupSelectedUids.delete(cb.value);
});

$("#createGroupBtn").addEventListener("click", async () => {
  const name = $("#groupNameInput").value.trim();
  if (!name) { $("#groupModalError").textContent = "اسم گروه رو وارد کن."; return; }
  if (groupSelectedUids.size === 0) { $("#groupModalError").textContent = "حداقل یک عضو انتخاب کن."; return; }
  const members = pickableUsers.filter(u => groupSelectedUids.has(u.uid));
  const isPublic = $("#groupIsPublicInput").checked;
  const maxMembers = Number($("#groupMaxMembersInput").value) || null;
  try {
    const groupId = await createGroup(name, members, { isPublic, maxMembers });
    closeModal("#groupModal");
    switchView("home");
    openGroupById(groupId);
  } catch (err) {
    $("#groupModalError").textContent = "خطا در ساخت گروه.";
  }
});

/* ---------- کانال: جستجو + ساخت ---------- */

async function openChannelModal() {
  $("#channelModal").hidden = false;
  $("#channelModal").classList.add("open");
  $("#channelSearchInput").value = "";
  $("#createChannelForm").hidden = true;
  $("#channelModalError").textContent = "";
  await runChannelSearch("");
}
$("#closeChannelModal").addEventListener("click", () => closeModal("#channelModal"));
$("#showCreateChannelFormBtn").addEventListener("click", () => { $("#createChannelForm").hidden = false; });

async function runChannelSearch(term) {
  const results = await searchPublicChannels(term);
  const mySubs = new Set(latestChannels.map(c => c.id));
  renderChannelSearchResults($("#channelSearchResults"), results, mySubs, async (channelId, isSubbed) => {
    if (isSubbed) await unsubscribeChannel(channelId);
    else await subscribeChannel(channelId);
    runChannelSearch($("#channelSearchInput").value.trim());
  });
}
let channelSearchTimer = null;
$("#channelSearchInput").addEventListener("input", e => {
  clearTimeout(channelSearchTimer);
  channelSearchTimer = setTimeout(() => runChannelSearch(e.target.value.trim()), 350);
});

$("#createChannelBtn").addEventListener("click", async () => {
  const name = $("#channelNameInput").value.trim();
  if (!name) { $("#channelModalError").textContent = "اسم کانال رو وارد کن."; return; }
  const description = $("#channelDescInput").value.trim();
  const isPublic = $("#channelPublicCheck").checked;
  try {
    const channelId = await createChannel(name, description, isPublic);
    closeModal("#channelModal");
    switchView("home");
    openChannelById(channelId);
  } catch (err) {
    $("#channelModalError").textContent = "خطا در ساخت کانال.";
  }
});

/* ==================== ارسال پیام (متن) ==================== */

$("#messageInput").addEventListener("input", () => {
  if (currentEntity && currentEntity.mode !== "channel") currentTyping?.ping();
});

let lastSendAt = 0;
$("#composerForm").addEventListener("submit", async e => {
  e.preventDefault();
  const input = $("#messageInput");
  const text = input.value;
  if (!text.trim() || !currentEntity) return;
  if (currentEntity.mode === "private" && currentContactBlocked) {
    toast("این کاربر بلاک شده — نمی‌تونی پیام بفرستی");
    return;
  }
  // محدودیت سبک سمت کلاینت (ضد اسپم تصادفی) — این جایگزین محدودیت واقعی سمت سرور نیست
  if (Date.now() - lastSendAt < 400) return;
  lastSendAt = Date.now();
  input.value = "";
  saveDraft(currentEntity.id, "");
  const replyId = replyingTo?.id || null;
  clearReplyPreview();
  try {
    if (currentEntity.mode === "private") await sendTextMessage(currentEntity.id, text, replyId);
    else if (currentEntity.mode === "group") await sendGroupText(currentEntity.id, text, replyId);
    else if (currentEntity.mode === "channel") await postChannelText(currentEntity.id, text);
  } catch (err) { toast(friendlySendError(err), "error"); input.value = text; }
});

/* ==================== ریپلای روی پیام ==================== */

function quotePreviewFor(msg) {
  if (!msg) return "";
  if (msg.type === "image") return "📷 عکس";
  if (msg.type === "voice") return "🎙 پیام صوتی";
  if (msg.type === "sticker") return "🧩 استیکر";
  return msg.body || "";
}

function setReplyPreview(msgId) {
  const msg = lastMessagesCache.find(m => m.id === msgId);
  if (!msg) return;
  replyingTo = { id: msgId };
  $("#replyPreviewText").textContent = quotePreviewFor(msg);
  $("#replyPreviewBar").hidden = false;
  $("#messageInput").focus();
}
function clearReplyPreview() {
  replyingTo = null;
  $("#replyPreviewBar").hidden = true;
}
$("#replyCancelBtn").addEventListener("click", clearReplyPreview);

/* ==================== استیکر ==================== */

renderStickerPicker($("#stickerPicker"));
$("#stickerBtn").addEventListener("click", () => {
  $("#stickerPicker").hidden = !$("#stickerPicker").hidden;
});
$("#stickerPicker").addEventListener("click", async e => {
  const btn = e.target.closest("button[data-sticker]");
  if (!btn || !currentEntity) return;
  const sticker = btn.dataset.sticker;
  const replyId = replyingTo?.id || null;
  $("#stickerPicker").hidden = true;
  clearReplyPreview();
  try {
    if (currentEntity.mode === "private") await sendStickerMessage(currentEntity.id, sticker, replyId);
    else if (currentEntity.mode === "group") await sendGroupSticker(currentEntity.id, sticker, replyId);
  } catch (err) { toast(friendlySendError(err), "error"); }
});

/* ==================== ارسال عکس ==================== */
/* آپلود از طریق Supabase Storage (باکت‌های chat-media/group-media/channel-media)
   انجام می‌شود؛ اگر اسکریپت supabase/schema.sql را اجرا نکرده‌اید، بالای فایل
   MEDIA_UPLOADS_ENABLED را false کنید. */

$("#attachBtn").addEventListener("click", () => {
  if (!MEDIA_UPLOADS_ENABLED) { toast("زیرساخت ارسال عکس در حال تکمیل است — به‌زودی"); return; }
  $("#imageInput").click();
});
$("#imageInput").addEventListener("change", async e => {
  if (!MEDIA_UPLOADS_ENABLED) return;
  const file = e.target.files[0];
  if (!file || !currentEntity) return;
  /* HOVIYAT NEXT: عکس قبل از ارسال وارد ویرایشگر می‌شود؛ هسته ارسال دست‌نخورده می‌ماند. */
  if (window.HoviyatMediaEditor?.open) {
    window.HoviyatMediaEditor.open(file);
    e.target.value = "";
    return;
  }
  try {
    if (currentEntity.mode === "private") await sendImageMessage(currentEntity.id, file);
    else if (currentEntity.mode === "group") await sendGroupImage(currentEntity.id, file);
    else if (currentEntity.mode === "channel") await postChannelImage(currentEntity.id, file);
  } catch (err) { toast(friendlySendError(err), "error"); }
  e.target.value = "";
});

window.addEventListener("hoviyat:edited-media", async e => {
  const file=e.detail?.file;
  if(!file || !currentEntity) return;
  try {
    if (currentEntity.mode === "private") await sendImageMessage(currentEntity.id, file);
    else if (currentEntity.mode === "group") await sendGroupImage(currentEntity.id, file);
    else if (currentEntity.mode === "channel") await postChannelImage(currentEntity.id, file);
  } catch (err) { toast(friendlySendError(err), "error"); }
});

/* ==================== پیام صوتی (فقط چت خصوصی و گروه) ==================== */

$("#micBtn").addEventListener("click", async () => {
  if (!MEDIA_UPLOADS_ENABLED) { toast("زیرساخت ارسال پیام صوتی در حال تکمیل است — به‌زودی"); return; }
  if (isRecording || currentEntity?.mode === "channel") return;
  try {
    await recorder.start();
    isRecording = true;
    $("#voiceRecordBar").hidden = false;
    $("#composerForm").hidden = true;
  } catch (err) {
    toast("دسترسی به میکروفون داده نشد.");
  }
});

$("#voiceCancelBtn").addEventListener("click", () => {
  recorder.cancel();
  isRecording = false;
  $("#voiceRecordBar").hidden = true;
  $("#composerForm").hidden = false;
});

$("#voiceSendBtn").addEventListener("click", async () => {
  const result = await recorder.stop();
  isRecording = false;
  $("#voiceRecordBar").hidden = true;
  $("#composerForm").hidden = false;
  if (result && currentEntity) {
    try {
      if (currentEntity.mode === "private") await sendVoiceMessage(currentEntity.id, result.blob, result.durationSec, result.waveform);
      else if (currentEntity.mode === "group") await sendGroupVoice(currentEntity.id, result.blob, result.durationSec, result.waveform);
    } catch (err) { toast(friendlySendError(err), "error"); }
  }
});

/* ==================== پخش ویس + ری‌اکشن (رویدادهای تفویضی) ==================== */

$("#messagesHolder").addEventListener("click", e => {
  const img = e.target.closest(".bubble-image");
  if (img) { openLightbox(img.src); return; }

  const riskyLink = e.target.closest(".risky-link");
  if (riskyLink) { toast("این لینک مشکوک است. برای بازکردن، روی «با این حال باز کن» بزن.", "error"); return; }
  const openAnyway = e.target.closest(".link-risk-open-anyway");
  if (openAnyway) { window.open(openAnyway.dataset.url, "_blank", "noopener,noreferrer"); return; }

  const playBtn = e.target.closest(".voice-play-btn");
  if (playBtn) {
    const wrap = playBtn.closest(".bubble-voice");
    const audioEl = wrap.querySelector(".voice-audio-el");
    document.querySelectorAll(".voice-audio-el").forEach(a => {
      if (a !== audioEl && !a.paused) {
        a.pause();
        const otherBtn = a.closest(".bubble-voice")?.querySelector(".voice-play-btn");
        if (otherBtn) otherBtn.innerHTML = icon("play", { size: 16 });
      }
    });
    if (audioEl.paused) { audioEl.play(); playBtn.innerHTML = icon("pause", { size: 16 }); }
    else { audioEl.pause(); playBtn.innerHTML = icon("play", { size: 16 }); }
    audioEl.onended = () => { playBtn.innerHTML = icon("play", { size: 16 }); };
    return;
  }
});

let pressTimer = null;
$("#messagesHolder").addEventListener("pointerdown", e => {
  const row = e.target.closest(".bubble-row");
  if (!row || !currentEntity) return;
  pressTimer = setTimeout(() => {
    const bubble = row.querySelector(".bubble");
    const msgId = row.dataset.msgId;
    const msg = lastMessagesCache.find(m => m.id === msgId);
    const isMine = !!msg && msg.senderId === auth.currentUser.uid;
    const isChannel = currentEntity.mode === "channel";
    const canDelete = !!msg && (isMine
      || (currentEntity.mode === "group" && isGroupAdmin(currentEntity.data))
      || (isChannel && isChannelAdmin(currentEntity.data)));
    const canReport = !!msg && !isMine;
    const canPin = !!msg && currentEntity.mode === "group" && isGroupAdmin(currentEntity.data);
    const isPinned = canPin && currentEntity.data.pinnedMessageId === msgId;
    showReactionPicker(bubble, async action => {
      if (action.type === "reaction") {
        if (currentEntity.mode === "private") await toggleReaction(currentEntity.id, msgId, action.emoji);
        else if (currentEntity.mode === "group") await toggleGroupReaction(currentEntity.id, msgId, action.emoji);
      } else if (action.type === "reply") {
        setReplyPreview(msgId);
      } else if (action.type === "copy") {
        const text = msg?.type === "text" ? msg.body
          : msg?.type === "sticker" ? msg.body
          : msg?.type === "image" ? "📷 عکس" : msg?.type === "voice" ? "🎙 پیام صوتی" : "";
        try { await navigator.clipboard.writeText(text || ""); toast("متن کپی شد", "success"); }
        catch { toast("کپی انجام نشد"); }
      } else if (action.type === "pin") {
        try {
          await pinGroupMessage(currentEntity.id, msgId);
          currentEntity.data.pinnedMessageId = msgId;
          updatePinnedBar(currentEntity.data);
          toast("پیام سنجاق شد", "success");
        } catch (err) { toast(err.message || "خطا در سنجاق‌کردن پیام", "error"); }
      } else if (action.type === "unpin") {
        try {
          await unpinGroupMessage(currentEntity.id);
          currentEntity.data.pinnedMessageId = null;
          $("#pinnedBar").hidden = true;
          toast("سنجاق برداشته شد");
        } catch (err) { toast(err.message || "خطا در برداشتن سنجاق", "error"); }
      } else if (action.type === "report") {
        const reason = prompt("دلیل گزارش این پیام چیه؟ (اختیاری)") || "";
        try {
          if (currentEntity.mode === "private") await reportMessage(currentEntity.id, msg, reason);
          else if (currentEntity.mode === "group") await reportGroupMessage(currentEntity.id, msg, reason);
          else if (isChannel) await reportChannelPost(currentEntity.id, msg, reason);
          toast("گزارش ثبت شد، ممنون از توجهت", "success");
        } catch (err) { toast(err.message || "خطا در ثبت گزارش", "error"); }
      } else if (action.type === "delete") {
        try {
          if (currentEntity.mode === "private") await deleteMessage(currentEntity.id, msgId);
          else if (currentEntity.mode === "group") await deleteGroupMessage(currentEntity.id, msgId);
          else if (isChannel) await supabase.from("channel_posts").delete().eq("id", msgId).eq("channel_id", currentEntity.id);
        } catch (err) { toast(err.message || "خطا در حذف پیام", "error"); }
      }
    }, { canDelete, canReport, canPin, isPinned, hideReactions: isChannel, hideReply: isChannel });
  }, 420);
});
["pointerup", "pointerleave", "pointercancel"].forEach(evt => {
  $("#messagesHolder").addEventListener(evt, () => clearTimeout(pressTimer));
});

/* ==================== پیش‌نمایش تمام‌صفحه عکس ==================== */
function openLightbox(src) {
  $("#lightboxImg").src = src;
  $("#imageLightbox").hidden = false;
  requestAnimationFrame(() => $("#imageLightbox").classList.add("open"));
}
function closeLightbox() {
  $("#imageLightbox").classList.remove("open");
  setTimeout(() => { $("#imageLightbox").hidden = true; $("#lightboxImg").src = ""; }, 300);
}
$("#lightboxClose").addEventListener("click", closeLightbox);
$("#imageLightbox").addEventListener("click", e => { if (e.target.id === "imageLightbox") closeLightbox(); });
window.addEventListener("keydown", e => { if (e.key === "Escape" && $("#imageLightbox").classList.contains("open")) closeLightbox(); });

// عکس پروفایل/گروه/کانال هرجای اپ (کارت هویت خودت، پروفایل مخاطب، اطلاعات گروه/کانال)
// هم با تپ، تمام‌صفحه باز می‌شود — همان لایت‌باکس بالا را دوباره استفاده می‌کنیم
document.addEventListener("click", e => {
  const photo = e.target.closest(".idcard-photo img");
  if (photo) openLightbox(photo.src);
});

/* ==================== تنظیمات ==================== */

function renderTopbarAvatar(photoURL, name) {
  $("#profileBtn").innerHTML = photoURL
    ? `<img src="${escapeHtml(photoURL)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : `<span id="myAvatarInitial">${escapeHtml((name || "؟")[0])}</span>`;
}

function renderSettingsAvatar(photoURL, name) {
  const el = $("#settingsAvatarPreview");
  el.innerHTML = photoURL ? `<img src="${escapeHtml(photoURL)}">` : `<span>${escapeHtml((name || "؟")[0])}</span>`;
}

async function loadSettingsForm() {
  const d = (await getUserDoc(auth.currentUser.uid)) || {};
  $("#settingsDisplayName").value = d.displayName || "";
  $("#settingsBio").value = d.bio || "";
  $("#settingsPhone").value = d.phone || "";
  $("#settingsCity").value = d.weatherCity || "";
  renderSettingsAvatar(d.photoURL, d.displayName || d.username);
}

$("#settingsAvatarBtn").addEventListener("click", () => $("#settingsAvatarInput").click());
$("#settingsAvatarInput").addEventListener("change", async e => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  if (!MEDIA_UPLOADS_ENABLED) { toast("آپلود عکس هنوز فعال نیست."); return; }
  try {
    const url = await updateMyAvatar(file);
    renderSettingsAvatar(url);
    renderTopbarAvatar(url);
    toast("عکس پروفایل عوض شد", "success");
  } catch (err) {
    toast(err.message || "خطا در آپلود عکس.", "error");
  }
});

$("#saveSettingsBtn").addEventListener("click", async () => {
  await supabase.from("profiles").update({
    display_name: $("#settingsDisplayName").value.trim(),
    bio: $("#settingsBio").value.trim(),
    phone: $("#settingsPhone").value.trim(),
    weather_city: $("#settingsCity").value.trim() || "بیرجند",
  }).eq("id", auth.currentUser.uid);
  toast("ذخیره شد", "success");
});

$("#logoutBtn").addEventListener("click", async () => {
  await logOut();
});

/* ==================== حالت شب ==================== */

/** پیام خطای «حساب مسدود است» که تریگر دیتابیس با فرمت ACCOUNT_SUSPENDED|تاریخ|دلیل
 * می‌فرستد را به یک جمله فارسی قابل‌فهم تبدیل می‌کند؛ بقیه خطاها دست‌نخورده برمی‌گردند. */
function friendlySendError(err) {
  const msg = err?.message || "";
  if (msg.startsWith("ACCOUNT_SUSPENDED")) {
    const [, until, reason] = msg.split("|");
    const untilFa = until ? new Date(until).toLocaleDateString("fa-IR") : "";
    return `حساب شما تا ${untilFa} به دلیل «${reason || "نقض قوانین"}» مسدود است و نمی‌توانید پیام بفرستید.`;
  }
  return msg || "خطای غیرمنتظره‌ای رخ داد.";
}

/** بررسی وضعیت مسدودی خودم؛ اگر مسدودم، بنر قرمز بالای صفحه نشان می‌دهد.
 * برخلاف بنر اعلان سراسری، عمداً «دیدم/نبستمش» ندارد — چون تا وقتی واقعاً
 * مسدودیت تمام نشده، باید هر بار که اپ باز می‌شود دوباره دیده شود؛ فقط
 * برای همین نشست (تا رفرش بعدی) با دکمه ✕ قابل بستن است. */
async function checkSuspension() {
  try {
    const susp = await checkMySuspension();
    if (!susp) { $("#suspensionBanner").hidden = true; return; }
    const untilFa = new Date(susp.until).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" });
    $("#suspensionText").textContent = `به دلیل «${susp.reason}» تا ${untilFa} نمی‌تونی پیام بفرستی.`;
    $("#suspensionBanner").hidden = false;
    $("#suspensionDismiss").onclick = () => { $("#suspensionBanner").hidden = true; };
  } catch (e) { /* اگر خطا خورد، بی‌سروصدا رد شو — سرور به هر حال جلوی ارسال واقعی را می‌گیرد */ }
}

/** هر بار وضعیت مسدودی خودم عوض شد (ادمین همین الان مسدود/آزادم کرد)، بلافاصله بنر را به‌روز کن */
function watchMySuspension(uid) {
  supabase
    .channel(uniqueChannelName(`my-suspension-${uid}`))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${uid}` }, checkSuspension)
    .subscribe();
}

/** بررسی اعلان سراسری ادمین؛ فقط اگر جدیدتر از آخرین اعلانی باشد که کاربر دیده، نشان می‌دهد */
async function checkAnnouncement() {
  try {
    const { data } = await supabase.from("announcements").select("*").eq("id", "latest").maybeSingle();
    if (!data || !data.text) return;
    const seenAt = localStorage.getItem("hoviyat_announcement_seen");
    const updatedMs = data.updated_at ? new Date(data.updated_at).getTime() : 0;
    if (seenAt && Number(seenAt) >= updatedMs) return;
    $("#announcementText").textContent = data.text;
    $("#announcementBanner").hidden = false;
    $("#announcementDismiss").onclick = () => {
      $("#announcementBanner").hidden = true;
      localStorage.setItem("hoviyat_announcement_seen", String(updatedMs));
    };
  } catch (e) { /* اعلان اختیاری است، خطا نباید کل اپ را متوقف کند */ }
}

function loadThemePref() {
  const saved = localStorage.getItem("hoviyat_theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  $("#darkModeToggle").setAttribute("aria-pressed", String(saved === "dark"));
}
$("#darkModeToggle").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("hoviyat_theme", next);
  $("#darkModeToggle").setAttribute("aria-pressed", String(next === "dark"));
});

/* ==================== Service Worker (PWA) ==================== */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

/* ==================== مرکز امنیت حساب ==================== */

$("#openSecurityCenterBtn").addEventListener("click", async () => {
  switchView("security");
  try { await loadSecurityCenter(); } catch (err) { toast(friendlySecurityError(err)); }
});
$("#backFromSecurity").addEventListener("click", () => switchView("settings"));
$("#backFromGroupBlocked").addEventListener("click", () => switchView("home"));

async function loadSecurityCenter() {
  const settings = await security.getSecuritySettings();
  cachedSecuritySettings = settings;

  $("#appLockToggle").setAttribute("aria-pressed", String(!!settings.app_lock_enabled));
  $("#changePinBtn").hidden = !settings.app_lock_enabled;
  $("#biometricToggle").setAttribute("aria-pressed", String(!!settings.biometric_enabled));
  $("#twofaToggle").setAttribute("aria-pressed", String(!!settings.twofa_enabled));
  $("#blockForwardToggle").setAttribute("aria-pressed", String(settings.block_forwarding !== false));
  $("#screenshotShieldToggle").setAttribute("aria-pressed", String(!!settings.screenshot_shield));
  $("#autoDeleteSelect").value = String(settings.auto_delete_days || 0);
  $("#biometricToggle").parentElement.style.opacity = security.biometricSupported() ? "1" : "0.5";

  const sessions = await security.listMySessions();
  renderSecurityScore(settings, sessions.length);
  renderSessionsList(sessions);

  const events = await security.listMyLoginEvents();
  renderLoginEvents(events);
}

function renderSecurityScore(settings, sessionCount) {
  const { score, tips } = security.computeSecurityScore(settings, sessionCount);
  $("#securityScoreNum").textContent = score;
  $("#securityScoreRing").style.setProperty("--score", score);
  $("#securityTips").innerHTML = tips.length
    ? tips.map(t => `<li>${escapeHtml(t)}</li>`).join("")
    : `<li>${icon("check", { size: 13 })} عالیه! همه‌ی موارد پیشنهادی فعال است</li>`;
}

function renderSessionsList(sessions) {
  const holder = $("#sessionsListHolder");
  if (!sessions.length) { holder.innerHTML = `<p class="empty-hint">نشستی ثبت نشده.</p>`; return; }
  holder.innerHTML = sessions.map(s => `
    <div class="security-row">
      <div>
        <strong>${escapeHtml(s.device_label)}</strong>${s.isCurrent ? ' <span class="verified-badge">همین دستگاه</span>' : ""}
        <br><small>آخرین فعالیت: ${new Date(s.last_active_at).toLocaleString("fa-IR")}</small>
      </div>
      ${s.isCurrent ? "" : `<button class="btn-outline small danger revoke-session-btn" data-device="${escapeHtml(s.device_id)}">خروج از راه دور</button>`}
    </div>`).join("");
  holder.querySelectorAll(".revoke-session-btn").forEach(btn => {
    btn.onclick = async () => {
      try {
        await security.revokeSession(btn.dataset.device);
        toast("آن دستگاه خارج شد", "success");
        await loadSecurityCenter();
      } catch (err) { toast(friendlySecurityError(err)); }
    };
  });
}

function renderLoginEvents(events) {
  const holder = $("#loginEventsHolder");
  if (!events.length) { holder.innerHTML = `<p class="empty-hint">رویدادی ثبت نشده.</p>`; return; }
  holder.innerHTML = events.map(e => `
    <div class="security-row">
      <div>
        <strong>${escapeHtml(e.device_label)}</strong>${e.is_new_device ? ' <span class="badge-warn">دستگاه جدید</span>' : ""}
        <br><small>${new Date(e.created_at).toLocaleString("fa-IR")}</small>
      </div>
    </div>`).join("");
}

/** پیام خطا را برای کاربر «انسانی» می‌کند؛ متن خام دیتابیس فقط در کنسول می‌ماند. */
function friendlySecurityError(err) {
  console.error(err);
  const raw = err?.message || String(err || "");
  if (/gen_salt|pgp_sym|does not exist/i.test(raw)) return "یک مشکل فنی سمت سرور پیش آمد. اگر ادامه داشت، مطمئن شو migration_3 روی دیتابیس اجرا شده.";
  if (/عضو این گفتگو نیستید|ورود لازم است/i.test(raw)) return raw;
  if (/تعداد|صبر کنید/i.test(raw)) return raw; // پیام‌های نرخ‌محدودشده‌ی خودمان قابل‌فهم‌اند
  return "مشکلی پیش آمد، دوباره امتحان کن.";
}

/* ---- قفل برنامه: روشن/خاموش ---- */
$("#appLockToggle").addEventListener("click", async () => {
  const enabled = $("#appLockToggle").getAttribute("aria-pressed") === "true";
  if (enabled) {
    try {
      await security.disableAppLock();
      toast("قفل برنامه غیرفعال شد");
      await loadSecurityCenter();
    } catch (err) { toast(friendlySecurityError(err)); }
  } else {
    $("#setPinInput").value = "";
    $("#setPinMsg").textContent = "";
    $("#setPinModal").hidden = false;
    $("#setPinModal").classList.add("open");
  }
});
$("#closeSetPinModal").addEventListener("click", () => closeModal("#setPinModal"));
$("#changePinBtn").addEventListener("click", () => {
  $("#setPinInput").value = "";
  $("#setPinMsg").textContent = "";
  $("#setPinModal").hidden = false;
  $("#setPinModal").classList.add("open");
});
$("#confirmSetPinBtn").addEventListener("click", async () => {
  const pin = $("#setPinInput").value.trim();
  if (pin.length < 4) { $("#setPinMsg").textContent = "رمز باید حداقل ۴ رقم باشد."; return; }
  const wasEnabled = cachedSecuritySettings?.app_lock_enabled;
  try {
    await security.setAppLockPin(pin);
    closeModal("#setPinModal");
    toast(wasEnabled ? "رمز دوم تغییر کرد" : "قفل برنامه فعال شد", "success");
    await loadSecurityCenter();
  } catch (err) { $("#setPinMsg").textContent = friendlySecurityError(err); }
});

/* ---- بیومتریک ---- */
$("#biometricToggle").addEventListener("click", async () => {
  const enabled = $("#biometricToggle").getAttribute("aria-pressed") === "true";
  if (enabled) {
    try {
      await supabase.from("security_settings").update({ biometric_enabled: false }).eq("uid", auth.currentUser.uid);
      await loadSecurityCenter();
    } catch (err) { toast(friendlySecurityError(err)); }
    return;
  }
  if (!security.biometricSupported()) { toast("این دستگاه از بیومتریک پشتیبانی نمی‌کند."); return; }
  try {
    await security.enrollBiometric();
    toast("بیومتریک فعال شد", "success");
    await loadSecurityCenter();
  } catch (err) { toast(err.name === "NotAllowedError" ? "ثبت بیومتریک لغو شد." : friendlySecurityError(err)); }
});

/* ---- کد بازیابی ---- */
$("#genRecoveryCodeBtn").addEventListener("click", async () => {
  try {
    const code = security.generateRecoveryCode();
    await security.saveRecoveryCode(code);
    $("#recoveryCodeDisplay").textContent = code;
    $("#recoveryCodeModal").hidden = false;
    $("#recoveryCodeModal").classList.add("open");
  } catch (err) { toast(friendlySecurityError(err)); }
});
$("#closeRecoveryModal").addEventListener("click", () => closeModal("#recoveryCodeModal"));

/* ---- ۲مرحله‌ای (TOTP) ---- */
$("#twofaToggle").addEventListener("click", async () => {
  const enabled = $("#twofaToggle").getAttribute("aria-pressed") === "true";
  try {
    if (enabled) {
      await security.disableTwofa();
      $("#twofaSetupBox").hidden = true;
      toast("۲مرحله‌ای غیرفعال شد");
      await loadSecurityCenter();
      return;
    }
    const me = (await getUserDoc(auth.currentUser.uid)) || {};
    const { secret } = await security.beginTwofaSetup(me.username || me.email || "کاربر");
    $("#twofaSetupBox").hidden = false;
    $("#twofaSetupBox").innerHTML = `
      <p class="settings-hint">این کد را در اپلیکیشن Authenticator (مثل Google Authenticator) وارد کن:</p>
      <div class="recovery-code-display" dir="ltr">${escapeHtml(secret)}</div>
      <input id="twofaConfirmInput" type="text" inputmode="numeric" maxlength="6" placeholder="کد ۶ رقمی" style="margin-top:8px;">
      <p id="twofaConfirmMsg" class="auth-error"></p>
      <button id="twofaConfirmBtn" class="btn-primary full small" style="margin-top:6px;">تایید و فعال‌سازی</button>
    `;
    $("#twofaConfirmBtn").onclick = async () => {
      try {
        const code = $("#twofaConfirmInput").value.trim();
        const ok = await security.verifyTotp(secret, code);
        if (!ok) { $("#twofaConfirmMsg").textContent = "کد اشتباه است."; return; }
        await security.confirmTwofaEnable();
        $("#twofaSetupBox").hidden = true;
        toast("۲مرحله‌ای فعال شد", "success");
        await loadSecurityCenter();
      } catch (err) { $("#twofaConfirmMsg").textContent = friendlySecurityError(err); }
    };
  } catch (err) { toast(friendlySecurityError(err)); }
});

/* ---- حریم پیام‌ها ---- */
$("#blockForwardToggle").addEventListener("click", async () => {
  try {
    const enabled = $("#blockForwardToggle").getAttribute("aria-pressed") === "true";
    await security.setBlockForwarding(!enabled);
    await loadSecurityCenter();
  } catch (err) { toast(friendlySecurityError(err)); }
});
$("#screenshotShieldToggle").addEventListener("click", async () => {
  try {
    const enabled = $("#screenshotShieldToggle").getAttribute("aria-pressed") === "true";
    await security.setScreenshotShield(!enabled);
    document.body.classList.toggle("screenshot-shield-on", !enabled);
    await loadSecurityCenter();
  } catch (err) { toast(friendlySecurityError(err)); }
});
$("#autoDeleteSelect").addEventListener("change", async e => {
  try {
    await security.setAutoDeleteDays(e.target.value);
    toast("ذخیره شد", "success");
  } catch (err) { toast(friendlySecurityError(err)); }
});

/* ---- حالت ضد اسکرین‌شات: هنگام ترک اپ محو کن (best-effort، نه واقعاً ضد اسکرین‌شات) ---- */
document.addEventListener("visibilitychange", () => {
  if (!cachedSecuritySettings?.screenshot_shield) return;
  document.body.classList.toggle("screenshot-shield-active", document.hidden);
});

/* ==================== تماس صوتی/تصویری ==================== */

let callUiUnsub = null;

function initCallFeature() {
  callUiUnsub = callManager.initCallInbox({
    onIncomingCall: payload => showIncomingCallUI(payload),
    onConnected: () => showConnectedUI(),
    onEnded: reason => {
      const msg = {
        declined: "تماس رد شد", busy: "طرف مقابل مشغوله", "no-answer": "پاسخ داده نشد",
        timeout: "زمان تماس تموم شد", failed: "اتصال برقرار نشد", "remote-hangup": "تماس قطع شد",
      }[reason];
      hideCallUI(msg);
    },
    onLocalStream: stream => {
      const el = $("#callLocalVideo");
      el.srcObject = stream;
      el.hidden = !stream.getVideoTracks().length;
    },
    onRemoteStream: stream => {
      const el = $("#callRemoteVideo");
      el.srcObject = stream;
      el.hidden = !stream.getVideoTracks().length;
    },
  });
}

function callAvatarHtml(name, photoURL) {
  return photoURL ? `<img src="${escapeHtml(photoURL)}">` : (name || "؟").trim()[0] || "؟";
}

function showOutgoingCallUI(otherUser, video) {
  $("#callOverlay").hidden = false;
  $("#callAvatar").innerHTML = callAvatarHtml(otherUser.displayName || otherUser.username, otherUser.photoURL);
  $("#callName").textContent = otherUser.displayName || otherUser.username || "کاربر";
  $("#callStatus").textContent = "در حال زنگ‌زدن…";
  $("#callIncomingActions").hidden = true;
  $("#callInProgressActions").hidden = false;
  $("#callRemoteVideo").hidden = true;
  $("#callLocalVideo").hidden = !video;
}

function showIncomingCallUI(payload) {
  const info = payload.callerInfo || {};
  $("#callOverlay").hidden = false;
  $("#callAvatar").innerHTML = callAvatarHtml(info.displayName || info.username, info.photoURL);
  $("#callName").textContent = info.displayName || info.username || "کاربر";
  $("#callStatus").textContent = payload.video ? "تماس تصویری ورودی…" : "تماس صوتی ورودی…";
  $("#callIncomingActions").hidden = false;
  $("#callInProgressActions").hidden = true;
  $("#callAcceptBtn").onclick = async () => {
    try {
      await callManager.acceptCall(payload);
      $("#callIncomingActions").hidden = true;
      $("#callInProgressActions").hidden = false;
      $("#callStatus").textContent = "در حال اتصال…";
      $("#callLocalVideo").hidden = !payload.video;
    } catch (err) { hideCallUI(err.message || "خطا در پاسخ به تماس"); }
  };
  $("#callDeclineBtn").onclick = () => {
    callManager.declineIncoming(payload.callId, payload.callerUid);
    hideCallUI();
  };
}

function showConnectedUI() {
  $("#callStatus").textContent = "برقرار";
}

function hideCallUI(toastMsg) {
  $("#callOverlay").hidden = true;
  $("#callRemoteVideo").srcObject = null;
  $("#callLocalVideo").srcObject = null;
  if (toastMsg) toast(toastMsg);
}

$("#callHangupBtn").addEventListener("click", () => {
  callManager.hangup();
  hideCallUI();
});
$("#callMuteBtn").addEventListener("click", () => {
  const muted = callManager.toggleMute();
  $("#callMuteBtn").classList.toggle("active", muted);
});
$("#callCameraBtn").addEventListener("click", () => {
  const camOff = callManager.toggleCamera();
  $("#callCameraBtn").classList.toggle("active", camOff);
});

async function startOutgoingCall(video) {
  if (!currentEntity || currentEntity.mode !== "private") return;
  if (callManager.isInCall()) { toast("همین الان یه تماس دیگه فعاله"); return; }
  const otherUser = currentEntity.data;
  showOutgoingCallUI(otherUser, video);
  try {
    await callManager.startCall(currentEntity.otherUid, {
      displayName: myProfileCache.displayName, username: myProfileCache.username, photoURL: myProfileCache.photoURL,
    }, video);
  } catch (err) {
    hideCallUI(err.message || "خطا در برقراری تماس");
  }
}

/* ==================== گفتگوی مخفی (فضای جدا، E2E واقعی) ==================== */

function teardownSecretChat() {
  if (unsubSecretMessages) { unsubSecretMessages(); unsubSecretMessages = null; }
  if (secretCountdownTimer) { clearInterval(secretCountdownTimer); secretCountdownTimer = null; }
  currentSecretChat = null;
}

async function openSecretListView() {
  document.querySelectorAll(".view").forEach(v => v.hidden = true);
  $("#view-secretlist").hidden = false;
  teardownSecretChat();
  await runExpiredCleanup();
  if (unsubSecretList) { unsubSecretList(); unsubSecretList = null; }
  unsubSecretList = watchMySecretChats(async chats => {
    const myUid = auth.currentUser.uid;
    const missing = chats
      .map(c => (c.user_a === myUid ? c.user_b : c.user_a))
      .filter(uid => !secretOthersInfoCache[uid]);
    if (missing.length) {
      const { data } = await supabase.from("profiles").select("id, username, display_name, photo_url").in("id", [...new Set(missing)]);
      (data || []).forEach(row => {
        secretOthersInfoCache[row.id] = { username: row.username, displayName: row.display_name, photoURL: row.photo_url };
      });
    }
    renderSecretChatList($("#secretChatListHolder"), chats, myUid, secretOthersInfoCache, (chatId, otherUid) => {
      openSecretChatById(otherUid, secretOthersInfoCache[otherUid]);
    });
  });
}

async function openSecretChatById(otherUid, otherInfoHint) {
  const { chat, aesKey } = await openSecretChatWith(otherUid);
  teardownSecretChat();
  document.querySelectorAll(".view").forEach(v => v.hidden = true);
  $("#view-secretchat").hidden = false;

  let otherInfo = otherInfoHint;
  if (!otherInfo || (!otherInfo.displayName && !otherInfo.username)) {
    otherInfo = (await getUserDoc(otherUid)) || {};
  }
  secretOthersInfoCache[otherUid] = otherInfo;

  currentSecretChat = { id: chat.id, otherUid, aesKey };
  let lastMsgAt = chat.last_message_at;
  const renderSecretHeader = () => {
    $("#secretChatHeader").innerHTML = `
      <button id="secretChatBackBtn" class="icon-btn">${icon("chevronLeft")}</button>
      <div class="chat-header-info">
        <strong>${icon("lock", { size: 15 })} ${escapeHtml(otherInfo.displayName || otherInfo.username || "کاربر")}</strong>
        <div class="secret-expiry-hint">${secretCountdownText(lastMsgAt)}</div>
      </div>`;
    $("#secretChatBackBtn").onclick = () => openSecretListView();
  };
  renderSecretHeader();
  if (secretCountdownTimer) clearInterval(secretCountdownTimer);
  secretCountdownTimer = setInterval(renderSecretHeader, 30000);
  $("#secretMessageInput").value = "";

  unsubSecretMessages = watchSecretMessages(chat.id, aesKey, msgs => {
    if (msgs.length) lastMsgAt = msgs[msgs.length - 1].createdAt;
    renderSecretMessages($("#secretMessagesHolder"), msgs, auth.currentUser.uid);
    renderSecretHeader();
  });
}

$("#secretChatsBtn").addEventListener("click", () => openSecretListView());
$("#secretListBackBtn").addEventListener("click", () => { teardownSecretChat(); if (unsubSecretList) { unsubSecretList(); unsubSecretList = null; } switchView("home"); });

$("#secretComposerForm").addEventListener("submit", async e => {
  e.preventDefault();
  const input = $("#secretMessageInput");
  const text = input.value;
  if (!text.trim() || !currentSecretChat) return;
  input.value = "";
  try {
    await sendSecretText(currentSecretChat.id, currentSecretChat.aesKey, text);
  } catch (err) {
    toast(friendlySendError(err), "error");
    input.value = text;
  }
});
