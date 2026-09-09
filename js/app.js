/**
 * app.js
 * نقطه ورود و هماهنگ‌کننده اصلی هویت — گفتگوی خصوصی، گروه، کانال.
 */
import { supabase, auth, ADMIN_UID, uniqueChannelName } from "./supabase-init.js";
import { signUp, logIn, logOut, watchAuth, validateUsername, getUserDoc, mapProfile, updateMyAvatar, checkMySuspension, signInWithGoogle } from "./auth.js";
import {
  findUserByUsername, getMyContacts, openOrCreateChat, watchMyChats, watchMessages, watchChatMeta,
  sendTextMessage, sendImageMessage, sendVideoMessage, sendVoiceMessage, toggleReaction, markChatRead, deleteChat,
  sendStickerMessage, deleteMessage, reportMessage, blockUser, unblockUser, isUserBlocked,
} from "./chat.js";
import {
  createGroup, watchMyGroups, watchGroupMessages, sendGroupText, sendGroupImage, sendGroupVideo,
  sendGroupVoice, toggleGroupReaction, markGroupRead, addGroupMember, removeGroupMember,
  leaveGroup, promoteGroupAdmin, isGroupAdmin, getGroup, updateGroupInfo, deleteGroup,
  updateGroupPermissions, updateGroupPhoto, sendGroupSticker, deleteGroupMessage, reportGroupMessage,
  joinGroupByCode, searchPublicGroups, pinGroupMessage, unpinGroupMessage, regenerateInviteCode,
  reportGroup, getGroupMessageCount,
} from "./groups.js";
import {
  createChannel, watchMyChannels, searchPublicChannels, watchChannelPosts,
  postChannelText, postChannelImage, postChannelVideo, subscribeChannel, unsubscribeChannel,
  promoteChannelAdmin, isChannelAdmin, getChannel, updateChannelInfo, deleteChannel,
  updateChannelPhoto, reportChannelPost,
} from "./channels.js";
import {
  renderChatList, renderChatHeader, renderMessages, showReactionPicker, closeReactionPickers, escapeHtml,
  renderContactProfile, renderMemberPicker, renderGroupInfo, renderChannelInfo,
  renderChannelSearchResults, renderStickerPicker, renderSecretChatList, renderSecretMessages,
  fmtCountdown as secretCountdownText,
} from "./ui.js";
import { renderIdentityCard, stopIdentityCard, toast } from "./identity.js";
import { renderSmartSpace } from "./smartspace.js";
import { createVoiceRecorder } from "./voice.js";
import { icon } from "./icons.js";
import { observePrivateMedia } from "./media-storage.js";
import { watchTyping } from "./typing.js";
import * as security from "./security.js";
import {
  ensureMyPublicKeyPublished, openSecretChatWith, watchMySecretChats, checkOtherKeyChange,
  watchSecretMessages, sendSecretText, deleteSecretChat, runExpiredCleanup,
} from "./secretchat.js";
import * as callManager from "./call.js";
import { initStories, loadNotifications, cleanupStories } from "./stories.js";
import { initSavedMessages, loadSavedMessages, saveMessage } from "./saved.js";
import { loadMyRestrictions, assertActionAllowed } from "./restrictions.js";
import { initNativeDeepLinks } from "./native-deeplink.js";

const $ = sel => document.querySelector(sel);
initNativeDeepLinks().catch(console.error);
window.addEventListener("hoviyat:auth-error",e=>toast(e.detail?.message||"احراز هویت ناموفق بود.","error"));

const stopPrivateMediaObserver = observePrivateMedia(document.body);

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
  if (user && !auth.currentUser?.uid) { try { await Promise.race([auth.ready, new Promise(r => setTimeout(r, 1500))]); } catch {} }
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
  if (unsubSecretMessages) { unsubSecretMessages(); unsubSecretMessages = null; }
  if (unsubSecretList) { unsubSecretList(); unsubSecretList = null; }
  if (secretCountdownTimer) { clearInterval(secretCountdownTimer); secretCountdownTimer = null; }
  if (callUiUnsub) { callUiUnsub(); callUiUnsub = null; }
  if (callManager.isInCall()) callManager.hangup();
  cleanupStories();
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
  initStories().catch(err => console.warn("stories init", err));
  loadMyRestrictions(true).catch(err => console.warn("restrictions init", err));
  initSavedMessages();
  loadNotifications($("#notificationsHolder")).catch(() => {});

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

/* ==================== ورود / ثبت‌نام ==================== */
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("#loginError").textContent = "";
  try { await logIn($("#loginEmail").value.trim(), $("#loginPassword").value); }
  catch (err) { $("#loginError").textContent = translateAuthError(err); }
});

$("#signupForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("#signupError").textContent = "";
  const username = $("#signupUsername").value.trim().toLowerCase();
  if (!validateUsername(username)) { $("#signupError").textContent = "شناسه کاربری باید ۳ تا ۲۰ حرف/عدد انگلیسی کوچک یا _ باشد."; return; }
  try { await signUp({ email: $("#signupEmail").value.trim(), password: $("#signupPassword").value, username, displayName: $("#signupName").value.trim() }); }
  catch (err) { $("#signupError").textContent = translateAuthError(err); }
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
  try { closeReactionPickers(); } catch {}
  try { window.HoviyatChatAI?.close?.(); } catch {}
  if (view === "chatsearch") { openNewChatOptions(); return; }
  const target = document.getElementById(`view-${view}`);
  if (!target) {
    console.warn("[HOVIYAT] view not found:", view);
    return;
  }
  document.querySelectorAll(".view").forEach(v => {
    const active = v === target;
    v.hidden = !active;
    v.setAttribute("aria-hidden", active ? "false" : "true");
  });
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  const navBtn = document.querySelector(`.nav-btn[data-view="${view}"]`);
  if (navBtn) navBtn.classList.add("active");
  const shell = document.getElementById("appShell");
  if (shell) {
    shell.dataset.chatOpen = (view === "chat" || view === "secretchat") ? "1" : "0";
    shell.dataset.secretChatOpen = view === "secretchat" ? "1" : "0";
  }
  // Hard-stop any body-level overlay when entering Secret Chat.
  if (view === "secretchat") {
    try { window.HoviyatChatAI?.close?.(); } catch {}
    document.documentElement.setAttribute("data-hoviyat-secret-chat", "true");
    document.body?.setAttribute("data-hoviyat-secret-chat", "true");
  } else {
    document.documentElement.removeAttribute("data-hoviyat-secret-chat");
    document.body?.removeAttribute("data-hoviyat-secret-chat");
  }
  if (view === "identity") renderIdentityCard($("#identityHolder"));
  else stopIdentityCard();
  if (view === "settings") { loadSettingsForm(); initSettingsDashboard(); }
  if (view === "saved") loadSavedMessages().catch(err => toast(err.message || "پیام‌های ذخیره‌شده در دسترس نیستند."));
  const aiPanel = $("#chatAiPanel");
  if (aiPanel && view !== "chat") aiPanel.hidden = true;
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
window.addEventListener("hoviyat:open-chat", e => {
  const d = e.detail || {};
  const kind = d.kind;
  const id = d.id;
  const otherUid = d.otherUid || "";
  if (!id) return;

  console.log("[HOVIYAT] opening conversation", { kind, id, otherUid });

  try {
    teardownConversation();
    currentEntity = {
      mode: kind === "group" ? "group" : kind === "channel" ? "channel" : "private",
      id, otherUid: otherUid || null, data: null
    };
    showChatView();
    $("#chatHeader").innerHTML = `
      <button id="chatBackBtn" class="icon-btn" aria-label="بازگشت">${icon("chevronLeft")}</button>
      <div class="chat-header-profile-area">
        <div class="chat-header-avatar"><span>…</span></div>
        <div class="chat-header-info"><strong>در حال بارگذاری…</strong><span>اتصال به گفتگو…</span></div>
      </div>`;
    $("#messagesHolder").innerHTML = `<div class="empty-state"><p>در حال بارگذاری گفتگو…</p></div>`;
  } catch (err) {
    console.error("[HOVIYAT] immediate view error", err);
  }

  Promise.resolve(
    kind === "private" ? openChatById(id, otherUid)
      : kind === "group" ? openGroupById(id)
      : openChannelById(id)
  ).catch(err => {
    console.error("[HOVIYAT] conversation load error", err);
    toast("خطا در بارگذاری گفتگو.", "error");
  });
});



$("#chatListHolder").addEventListener("click", e => {
  const card = e.target.closest(".chat-card");
  if (!card || !$("#chatListHolder").contains(card)) return;
  if (card.dataset.openBound === "1") return;

  const kind = card.dataset.kind;
  const id = card.dataset.id;
  const otherUid = card.dataset.otherUid;

  if (!id) {
    console.error("Chat card has no data-id:", card);
    toast("شناسه گفتگو پیدا نشد.", "error");
    return;
  }

  // ورود به صفحه گفتگو را مستقل از درخواست شبکه انجام بده.
  // این بخش عمداً قبل از هر await اجرا می‌شود تا کندی/خطای Supabase
  // مانع تغییر صفحه نشود.
  try {
    teardownConversation();
    currentEntity = { mode: kind === "group" ? "group" : kind === "channel" ? "channel" : "private",
      id, otherUid: otherUid || null, data: null };
    showChatView();
    $("#chatHeader").innerHTML = `
      <div class="chat-header-avatar">${avatarHtml("", "…")}</div>
      <div class="chat-header-info"><strong>در حال بارگذاری…</strong><span id="chatHeaderSubtitle">اتصال به گفتگو…</span></div>`;
    $("#messagesHolder").innerHTML = `<div class="empty-state"><p>در حال بارگذاری پیام‌ها…</p></div>`;
  } catch (err) {
    console.error("Immediate chat view failed:", err);
  }

  // ادامهٔ بارگذاری جداگانه؛ خطا نباید صفحه را برگرداند.
  Promise.resolve(
    kind === "private" ? openChatById(id, otherUid)
      : kind === "group" ? openGroupById(id)
      : openChannelById(id)
  ).catch(err => {
    console.error("Open conversation failed:", err);
    toast("باز کردن گفتگو با خطا مواجه شد.", "error");
  });
});

function showChatView() {
  const desktop = window.matchMedia("(min-width: 901px)").matches && !document.documentElement.classList.contains("hv-phone-webview");
  const chat = $("#view-chat");
  if (!chat) throw new Error("view-chat element not found");

  document.querySelectorAll(".view").forEach(v => {
    const keepHome = desktop && v.id === "view-home";
    const active = v === chat || keepHome;
    v.hidden = !active;
    v.setAttribute("aria-hidden", active ? "false" : "true");
  });

  chat.hidden = false;
  chat.setAttribute("aria-hidden", "false");
  const shell = $("#appShell");
  if (shell) shell.dataset.chatOpen = "1";

  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
}


/** پاک‌سازی مشترک قبل از باز کردن هر گفتگوی جدید یا برگشت به لیست */
function teardownConversation() {
  try { closeReactionPickers(); } catch {}
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
  if (!chatId) throw new Error("missing chatId");
  teardownConversation();
  currentEntity = { mode: "private", id: chatId, otherUid, data: { uid: otherUid, displayName: "در حال بارگذاری…" } };

  // صفحه قبلاً توسط click-handler باز شده؛ اینجا فقط header و داده‌ها را تکمیل می‌کنیم.
  try {
    const otherUser = otherUid ? ((await getUserDoc(otherUid)) || { uid: otherUid, displayName: "کاربر" }) : { displayName: "کاربر" };
    currentEntity.data = otherUser;
    currentContactBlocked = otherUid ? await isUserBlocked(otherUid).catch(() => false) : false;
    renderChatHeader($("#chatHeader"), {
      mode: "private", displayName: otherUser.displayName || otherUser.username || "کاربر",
      photoURL: otherUser.photoURL, online: otherUser.online, verified: otherUser.verified,
    });
  } catch (err) {
    console.error("Private chat profile load failed:", err);
    renderChatHeader($("#chatHeader"), {
      mode: "private", displayName: "کاربر",
      photoURL: "", online: false, verified: false,
    });
  }

  setComposerMode(true);
  showChatView();
  restoreDraft(chatId);
  $("#pinnedBar").hidden = true;

  unsubMessages = watchMessages(chatId, msgs => {
    lastMessagesCache = msgs;
    renderMessages($("#messagesHolder"), msgs, auth.currentUser?.uid, false, chatId, otherLastRead);
  });
  currentTyping = watchTyping("private", chatId, setTypingUI);
  unsubChatMeta = watchChatMeta(chatId, meta => {
    otherLastRead = meta.lastRead?.[otherUid] || null;
    renderMessages($("#messagesHolder"), lastMessagesCache, auth.currentUser?.uid, false, chatId, otherLastRead);
  });
  markChatRead(chatId);
}

async function openGroupById(groupId) {
  if (!groupId) throw new Error("missing groupId");
  teardownConversation();

  let group;
  try {
    group = await getGroup(groupId);
  } catch (err) {
    console.error("getGroup failed:", err);
    toast("اطلاعات گروه دریافت نشد.", "error");
    return;
  }
  if (!group) {
    toast("این گروه دیگر در دسترس نیست.", "error");
    return;
  }

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
    renderMessages($("#messagesHolder"), msgs, auth.currentUser?.uid, true, groupId, undefined, verifiedMap);
  });
  currentTyping = watchTyping("group", groupId, setTypingUI);
  markGroupRead(groupId);
}

async function openChannelById(channelId) {
  if (!channelId) throw new Error("missing channelId");
  teardownConversation();

  let channel;
  try {
    channel = await getChannel(channelId);
  } catch (err) {
    console.error("getChannel failed:", err);
    toast("اطلاعات کانال دریافت نشد.", "error");
    return;
  }
  if (!channel) {
    toast("این کانال دیگر در دسترس نیست.", "error");
    return;
  }

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

  unsubMessages = watchChannelPosts(channelId, posts => {
    lastMessagesCache = posts;
    renderMessages($("#messagesHolder"), posts, auth.currentUser?.uid, false, channelId);
  });
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
  if (e.target.closest("#chatCallBtn")) { startOutgoingCall(false); return; }
  if (e.target.closest("#chatVideoBtn")) { startOutgoingCall(true); return; }
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
  renderGroupInfo($("#groupInfoHolder"), group, auth.currentUser?.uid, {
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
  renderChannelInfo($("#channelInfoHolder"), channel, auth.currentUser?.uid, {
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
    const myUname = (await getUserDoc(auth.currentUser?.uid))?.username;
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
    if (user.uid === auth.currentUser?.uid) { $("#groupAddByUsernameMsg").textContent = "این خودتی هست، نمی‌تونی خودت رو اضافه کنی."; return; }
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
  /* فقط عکس وارد ویرایشگر می‌شود؛ ویدیو مستقیماً وارد فشرده‌سازی می‌شود. */
  if (file.type.startsWith("image/") && window.HoviyatMediaEditor?.open) {
    window.HoviyatMediaEditor.open(file);
    e.target.value = "";
    return;
  }
  try {
    if (file.type.startsWith("video/")) {
      if (currentEntity.mode === "private") await sendVideoMessage(currentEntity.id, file);
      else if (currentEntity.mode === "group") await sendGroupVideo(currentEntity.id, file);
      else if (currentEntity.mode === "channel") await postChannelVideo(currentEntity.id, file);
      toast("ویدیو فشرده شد و ارسال شد.", "success");
    } else {
      if (currentEntity.mode === "private") await sendImageMessage(currentEntity.id, file);
      else if (currentEntity.mode === "group") await sendGroupImage(currentEntity.id, file);
      else if (currentEntity.mode === "channel") await postChannelImage(currentEntity.id, file);
    }
  } catch (err) { toast(friendlySendError(err), "error"); }
  e.target.value = "";
});

window.addEventListener("hoviyat:edited-media", async e => {
  const file=e.detail?.file;
  const asSticker=!!e.detail?.asSticker;
  if(!file || !currentEntity) return;
  try {
    if (file.type.startsWith("video/")) {
      if (currentEntity.mode === "private") await sendVideoMessage(currentEntity.id, file);
      else if (currentEntity.mode === "group") await sendGroupVideo(currentEntity.id, file);
      else if (currentEntity.mode === "channel") await postChannelVideo(currentEntity.id, file);
      toast("ویدیو فشرده شد و ارسال شد.", "success");
    } else {
      if (currentEntity.mode === "private") await sendImageMessage(currentEntity.id, file);
      else if (currentEntity.mode === "group") await sendGroupImage(currentEntity.id, file);
      else if (currentEntity.mode === "channel") await postChannelImage(currentEntity.id, file);
    }
    if(asSticker) toast("استیکر ساخته شد و به‌صورت رسانه ارسال شد.", "success");
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
    const activeUid = auth.currentUser?.uid;
    const isMine = !!msg && !!activeUid && msg.senderId === activeUid;
    const isChannel = currentEntity.mode === "channel";
    const canDelete = !!msg && (isMine
      || (currentEntity.mode === "group" && isGroupAdmin(currentEntity.data))
      || (isChannel && isChannelAdmin(currentEntity.data)));
    const canReport = !!msg && !isMine;
    const canPin = !!msg && currentEntity.mode === "group" && isGroupAdmin(currentEntity.data);
    const isPinned = canPin && currentEntity.data.pinnedMessageId === msgId;
    showReactionPicker(bubble, async action => {
      if (action.type === "save") {
        try {
          const sourceType = currentEntity.mode === "private" ? "private" : currentEntity.mode === "group" ? "group" : "channel";
          await saveMessage(sourceType, currentEntity.id, msgId);
        } catch (err) { toast(err.message || "ذخیره پیام ناموفق بود."); }
        return;
      }
      if (action.type === "reaction") {
        if (currentEntity.mode === "private") await toggleReaction(currentEntity.id, msgId, action.emoji);
        else if (currentEntity.mode === "group") await toggleGroupReaction(currentEntity.id, msgId, action.emoji);
      } else if (action.type === "reply") {
        setReplyPreview(msgId);
      } else if (action.type === "copy") {
        const text = msg?.type === "text" ? msg.body
          : msg?.type === "sticker" ? msg.body
          : msg?.type === "image" ? "عکس" : msg?.type === "video" ? "ویدیو" : msg?.type === "voice" ? "پیام صوتی" : "";
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
    }, { canDelete, canReport, canPin, isPinned, canSave: true, hideReactions: isChannel, hideReply: isChannel });
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

async function handleGoogleAuth(){
  try {
    document.querySelectorAll("#googleLoginBtn,#googleSignupBtn").forEach(b=>{b.disabled=true;b.classList.add("loading")});
    await signInWithGoogle();
  } catch(err){
    toast(err?.message||"ورود با Google ناموفق بود.","error");
  } finally { document.querySelectorAll("#googleLoginBtn,#googleSignupBtn").forEach(b=>{b.disabled=false;b.classList.remove("loading")}); }
}
$("#googleLoginBtn")?.addEventListener("click",handleGoogleAuth);
$("#googleSignupBtn")?.addEventListener("click",handleGoogleAuth);

/* ==================== تنظیمات نسل جدید ==================== */

const SETTINGS_INDEX = [
  ["account","حساب","پروفایل، ایمیل و مدیریت حساب"],["security","امنیت","Security Center و نشست‌ها"],["privacy","حریم خصوصی","دیدپذیری، پیام و استوری"],["devices","دستگاه‌ها و نشست‌ها","نشست‌های واقعی"],["storage","فضای ذخیره‌سازی","مصرف رسانه و پاک‌سازی"],["ai","هوش مصنوعی","AI، Voice و کنترل داده"],["notifications","اعلان‌ها","پیام، تماس، استوری و امنیت"],["appearance","ظاهر","تم، متن و حرکت"],["chat","گفتگو","Bubble، Enter و حذف خودکار"],["network","داده و شبکه","Data Saver و کیفیت رسانه"],["about","درباره هویت","نسخه و اطلاعات محصول"]
];

function settingsEsc(v){ return escapeHtml(String(v ?? "")); }
async function getAppPrefs(){
  const uid=auth.currentUser?.uid; if(!uid) return {};
  const {data}=await supabase.from("hoviyat_app_preferences").select("*").eq("uid",uid).maybeSingle();
  return data||{};
}
async function saveAppPrefs(patch){
  const uid=auth.currentUser?.uid; if(!uid) throw new Error("ابتدا وارد شوید.");
  const {error}=await supabase.from("hoviyat_app_preferences").upsert({uid,...patch,updated_at:new Date().toISOString()},{onConflict:"uid"});
  if(error) throw error;
}
async function loadPrivacyPrefs(){
  const uid=auth.currentUser?.uid; if(!uid) return {};
  const {data,error}=await supabase.from("hoviyat_privacy_preferences").select("*").eq("uid",uid).maybeSingle();
  if(error) throw error; return data||{};
}
async function savePrivacyPrefs(patch){
  const uid=auth.currentUser?.uid; if(!uid) throw new Error("ابتدا وارد شوید.");
  const {error}=await supabase.from("hoviyat_privacy_preferences").upsert({uid,...patch,updated_at:new Date().toISOString()},{onConflict:"uid"});
  if(error) throw error;
}

async function renderSettingsDetail(key){
  const box=$("#settingsDetail"); if(!box) return; box.hidden=false;
  let html=`<div class="settings-detail-head"><button type="button" class="icon-btn" id="settingsDetailBack">‹</button><div><span class="hv-kicker">HOVIYAT SETTINGS</span><h3>${settingsEsc(SETTINGS_INDEX.find(x=>x[0]===key)?.[1]||"تنظیمات")}</h3></div></div>`;
  try {
    if(key==="account"){
      const d=(await getUserDoc(auth.currentUser?.uid))||{}; const email=auth.currentUser?.email||"—";
      html+=`<div class="settings-form-grid"><div class="settings-item"><label>نام نمایشی</label><input id="detailDisplayName" value="${settingsEsc(d.displayName)}"></div><div class="settings-item"><label>Username</label><input value="@${settingsEsc(d.username)}" disabled dir="ltr"></div><div class="settings-item"><label>ایمیل</label><input value="${settingsEsc(email)}" disabled dir="ltr"></div><div class="settings-item"><label>بیو</label><input id="detailBio" value="${settingsEsc(d.bio)}"></div></div><button class="btn-primary full" id="saveAccountDetail">ذخیره اطلاعات حساب</button>`;
    } else if(key==="privacy"){
      const p=await loadPrivacyPrefs();
      html+=`<div class="settings-detail-grid">
      ${settingSelect("profile_visibility","نمایش پروفایل",p.profile_visibility||"contacts",[["everyone","همه"],["contacts","مخاطبان"],["nobody","هیچ‌کس"]])}
      ${settingSelect("message_permission","چه کسانی پیام بدهند",p.message_permission||"everyone",[["everyone","همه"],["contacts","مخاطبان"],["nobody","هیچ‌کس"]])}
      ${settingSelect("call_permission","چه کسانی تماس بگیرند",p.call_permission||"contacts",[["everyone","همه"],["contacts","مخاطبان"],["nobody","هیچ‌کس"]])}
      ${settingSelect("story_visibility","نمایش استوری",p.story_visibility||"contacts",[["everyone","همه"],["contacts","مخاطبان"],["close_friends","دوستان نزدیک"],["nobody","هیچ‌کس"]])}
      ${settingSelect("last_seen_visibility","آخرین بازدید",p.last_seen_visibility||"contacts",[["everyone","همه"],["contacts","مخاطبان"],["nobody","هیچ‌کس"]])}
      ${settingToggle("online_status","وضعیت آنلاین",p.online_status!==false)}${settingToggle("read_receipts","رسید خواندن",p.read_receipts!==false)}${settingToggle("typing_indicator","نمایش در حال تایپ",p.typing_indicator!==false)}${settingToggle("story_replies","پاسخ به استوری",p.story_replies!==false)}${settingToggle("ai_data_usage","استفاده از داده گفتگو برای AI",p.ai_data_usage===true)}
      </div><button class="btn-primary full" id="savePrivacyDetail">ذخیره حریم خصوصی</button>`;
    } else if(key==="devices"){
      html+=`<div id="settingsDevicesHolder" class="security-list"><p class="empty-hint">در حال دریافت نشست‌ها…</p></div><button class="btn-outline full" id="logoutOtherDevicesBtn">خروج از همه دستگاه‌های دیگر</button>`;
    } else if(key==="storage"){
      html+=`<div class="storage-summary" id="storageSummary"><p>در حال محاسبه…</p></div><button class="btn-outline full" id="clearCacheBtn">پاک‌سازی Cache محلی</button>`;
    } else if(key==="ai"){
      const p=await getAppPrefs();
      html+=`<div class="settings-detail-grid">${settingToggle("ai_chat_enabled","AI Chat",p.ai_chat_enabled!==false)}${settingToggle("ai_voice_enabled","Voice Assistant",p.ai_voice_enabled!==false)}${settingToggle("ai_summaries_enabled","AI Summaries",p.ai_summaries_enabled!==false)}${settingToggle("ai_suggestions_enabled","AI Suggestions",p.ai_suggestions_enabled!==false)}</div><div class="settings-api-status"><b>API</b><span id="aiApiStatus">در حال بررسی…</span></div><button class="btn-primary full" id="saveAiDetail">ذخیره تنظیمات AI</button>`;
    } else if(key==="notifications"){
      const p=await getAppPrefs(); const n=p.notification_preferences||{};
      html+=`<div class="settings-detail-grid">${settingToggle("n_messages","پیام‌ها",n.messages!==false)}${settingToggle("n_calls","تماس‌ها",n.calls!==false)}${settingToggle("n_stories","Stories",n.stories!==false)}${settingToggle("n_reactions","واکنش‌ها",n.reactions!==false)}${settingToggle("n_mentions","Mentions",n.mentions!==false)}${settingToggle("n_ai","AI",n.ai!==false)}${settingToggle("n_security","اعلان‌های امنیتی",n.security!==false)}${settingToggle("quiet_hours_enabled","Quiet Hours",p.quiet_hours_enabled===true)}</div><button class="btn-primary full" id="saveNotificationsDetail">ذخیره اعلان‌ها</button>`;
    } else if(key==="appearance"){
      const p=await getAppPrefs();
      html+=`${settingSelect("theme","تم برنامه",document.documentElement.dataset.theme||"system",[["light","روشن"],["dark","تیره"],["system","سیستم"]])}${settingSelect("font_scale","اندازه متن",p.font_scale||"normal",[["small","کوچک"],["normal","عادی"],["large","بزرگ"],["xlarge","خیلی بزرگ"]])}${settingSelect("motion","حرکت",p.animation_pack||"mega",[["mega","کامل"],["reduced","کاهش‌یافته"],["off","خاموش"]])}<button class="btn-primary full" id="saveAppearanceDetail">ذخیره ظاهر</button>`;
    } else if(key==="chat"){
      const p=await getAppPrefs(); html+=`${settingToggle("enter_to_send","Enter برای ارسال",p.enter_to_send!==false)}${settingToggle("media_autoplay","پخش خودکار رسانه",p.media_autoplay!==false)}${settingSelect("bubble_style","سبک Bubble",p.bubble_style||"rounded",[["rounded","گرد"],["soft","نرم"],["compact","فشرده"]])}${settingSelect("chat_wallpaper","پس‌زمینه چت",p.chat_wallpaper||"default",[["default","پیش‌فرض"],["plain","ساده"],["soft","ملایم"],["night","شب"]])}<button class="btn-primary full" id="saveChatDetail">ذخیره گفتگو</button>`;
    } else if(key==="network"){
      const p=await getAppPrefs(); html+=`${settingToggle("data_saver","Data Saver",p.data_saver===true)}${settingSelect("media_quality","کیفیت رسانه",p.media_quality||"auto",[["low","کم"],["standard","استاندارد"],["high","بالا"],["auto","خودکار"]])}<div class="settings-info">برای Auto Download پیش‌فرض امن‌تر انتخاب شده تا مصرف اینترنت کنترل شود.</div><button class="btn-primary full" id="saveNetworkDetail">ذخیره شبکه</button>`;
    } else if(key==="about"){
      html+=`<div class="about-release"><b>هویت</b><span>Release 2026</span><small>Supabase + Capacitor • UI Design System 2026</small><small>قابلیت‌هایی که هنوز API یا زیرساخت لازم ندارند در UI به‌عنوان فعال نمایش داده نمی‌شوند.</small></div>`;
    } else if(key==="security"){
      html+=`<div class="settings-info">مرکز امنیتی کامل در صفحه Security Center قرار دارد.</div><button class="btn-primary full" id="openSecurityFromDetail">باز کردن Security Center</button>`;
    }
  } catch(e){ html+=`<div class="settings-info error">${settingsEsc(e.message||"خطا در دریافت تنظیمات")}</div>`; }
  box.innerHTML=html;
  $("#settingsDetailBack")?.addEventListener("click",()=>{box.hidden=true;box.innerHTML="";});
  bindSettingsDetail(key);
}
function settingToggle(id,label,on){return `<label class="settings-item toggle-item detail-toggle"><span>${settingsEsc(label)}</span><button type="button" class="toggle-switch" data-detail-toggle="${id}" aria-pressed="${!!on}"><span class="knob"></span></button></label>`}
function settingSelect(id,label,value,options){return `<div class="settings-item"><label>${settingsEsc(label)}</label><select id="detail_${settingsEsc(id)}">${options.map(([v,l])=>`<option value="${v}" ${v===value?'selected':''}>${settingsEsc(l)}</option>`).join("")}</select></div>`}
async function bindSettingsDetail(key){
  document.querySelectorAll("[data-detail-toggle]").forEach(btn=>btn.addEventListener("click",()=>btn.setAttribute("aria-pressed",String(btn.getAttribute("aria-pressed")!=="true"))));
  if(key==="account") $("#saveAccountDetail")?.addEventListener("click",async()=>{const uid=auth.currentUser?.uid;const {error}=await supabase.from("profiles").update({display_name:$("#detailDisplayName").value.trim(),bio:$("#detailBio").value.trim()}).eq("id",uid);if(error)throw error;toast("حساب ذخیره شد","success");});
  if(key==="privacy") $("#savePrivacyDetail")?.addEventListener("click",async()=>{const patch={};["online_status","read_receipts","typing_indicator","story_replies","ai_data_usage"].forEach(id=>patch[id]=$("[data-detail-toggle='"+id+"']").getAttribute("aria-pressed")==="true");["profile_visibility","message_permission","call_permission","story_visibility","last_seen_visibility"].forEach(id=>patch[id]=$("#detail_"+id).value);await savePrivacyPrefs(patch);toast("حریم خصوصی ذخیره شد","success");});
  if(key==="devices"){const sessions=await security.listMySessions();const h=$("#settingsDevicesHolder");h.innerHTML=sessions.length?sessions.map(s=>`<div class="security-row"><div><strong>${settingsEsc(s.device_label)}</strong>${s.isCurrent?' <span class="verified-badge">دستگاه فعلی</span>':''}<br><small>${new Date(s.last_active_at).toLocaleString("fa-IR")}</small></div>${s.isCurrent?'':`<button class="btn-outline small danger" data-revoke="${settingsEsc(s.device_id)}">خروج</button>`}</div>`).join(""):`<p class="empty-hint">نشستی ثبت نشده.</p>`;h.querySelectorAll("[data-revoke]").forEach(b=>b.addEventListener("click",async()=>{await security.revokeSession(b.dataset.revoke);await renderSettingsDetail("devices");}));$("#logoutOtherDevicesBtn")?.addEventListener("click",async()=>{for(const s of sessions.filter(x=>!x.isCurrent))await security.revokeSession(s.device_id);toast("از دستگاه‌های دیگر خارج شدی","success");await renderSettingsDetail("devices");});}
  if(key==="storage"){const {data,error}=await supabase.rpc("get_my_storage_usage");const h=$("#storageSummary");if(error)h.innerHTML=`<p class="settings-info">${settingsEsc(error.message)}</p>`;else{const fmt=n=>{n=Number(n||0);if(n<1024*1024)return `${Math.round(n/1024)} KB`;if(n<1024**3)return `${(n/1024**2).toFixed(1)} MB`;return `${(n/1024**3).toFixed(2)} GB`};h.innerHTML=`<div class="storage-total"><b>${fmt(data?.total_bytes)}</b><span>${data?.items||0} فایل/رسانه</span></div><div class="storage-bars"><span>تصویر ${fmt(data?.images_bytes)}</span><span>ویدئو ${fmt(data?.videos_bytes)}</span><span>صدا ${fmt(data?.audio_bytes)}</span><span>فایل ${fmt(data?.files_bytes)}</span></div>`;}$("#clearCacheBtn")?.addEventListener("click",async()=>{try{const keys=Object.keys(localStorage).filter(k=>!k.startsWith("sb-"));keys.forEach(k=>localStorage.removeItem(k));if("caches" in window){for(const k of await caches.keys())await caches.delete(k);}toast("Cache محلی پاک شد","success");}catch{toast("پاک‌سازی Cache کامل نشد","error");}});}
  if(key==="ai"){const status=$("#aiApiStatus");try{const {data}=await supabase.functions.invoke("hoviyat-ai",{body:{mode:"last",messages:[]}});status.textContent=data?.configured===false?"API Secret تنظیم نشده، fallback فعال است":"متصل";}catch{status.textContent="در دسترس نیست"}$("#saveAiDetail")?.addEventListener("click",async()=>{const p={};["ai_chat_enabled","ai_voice_enabled","ai_summaries_enabled","ai_suggestions_enabled"].forEach(id=>p[id]=$("[data-detail-toggle='"+id+"']").getAttribute("aria-pressed")==="true");await saveAppPrefs(p);toast("تنظیمات AI ذخیره شد","success");});}
  if(key==="notifications")$("#saveNotificationsDetail")?.addEventListener("click",async()=>{const n={};["messages","calls","stories","reactions","mentions","ai","security"].forEach(k=>n[k]=$("[data-detail-toggle='n_"+k+"']").getAttribute("aria-pressed")==="true");const p={notification_preferences:n,quiet_hours_enabled:$("[data-detail-toggle='quiet_hours_enabled']").getAttribute("aria-pressed")==="true"};await saveAppPrefs(p);toast("اعلان‌ها ذخیره شد","success");});
  if(key==="appearance")$("#saveAppearanceDetail")?.addEventListener("click",async()=>{const theme=$("#detail_theme").value;const scale=$("#detail_font_scale").value;const motion=$("#detail_motion").value;await saveAppPrefs({font_scale:scale,animation_pack:motion});if(theme!=="system")document.documentElement.dataset.theme=theme;else document.documentElement.dataset.theme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";toast("ظاهر ذخیره شد","success");});
  if(key==="chat")$("#saveChatDetail")?.addEventListener("click",async()=>{const p={enter_to_send:$("[data-detail-toggle='enter_to_send']").getAttribute("aria-pressed")==="true",media_autoplay:$("[data-detail-toggle='media_autoplay']").getAttribute("aria-pressed")==="true",bubble_style:$("#detail_bubble_style").value,chat_wallpaper:$("#detail_chat_wallpaper").value};await saveAppPrefs(p);toast("تنظیمات گفتگو ذخیره شد","success");});
  if(key==="network")$("#saveNetworkDetail")?.addEventListener("click",async()=>{await saveAppPrefs({data_saver:$("[data-detail-toggle='data_saver']").getAttribute("aria-pressed")==="true",media_quality:$("#detail_media_quality").value});toast("تنظیمات شبکه ذخیره شد","success");});
  $("#openSecurityFromDetail")?.addEventListener("click",()=>switchView("security"));
}

function initSettingsDashboard(){
  if(window.__HOVIYAT_SETTINGS_INIT) return; window.__HOVIYAT_SETTINGS_INIT=true;
  document.querySelectorAll("[data-settings-open]").forEach(b=>b.addEventListener("click",()=>renderSettingsDetail(b.dataset.settingsOpen)));
  const input=$("#settingsSearchInput"); const results=$("#settingsSearchResults");
  input?.addEventListener("input",()=>{const q=input.value.trim().toLowerCase();if(!q){results.hidden=true;return;}const hits=SETTINGS_INDEX.filter(x=>x.join(" ").toLowerCase().includes(q));results.innerHTML=hits.length?hits.map(x=>`<button type="button" data-search-open="${x[0]}"><b>${settingsEsc(x[1])}</b><small>${settingsEsc(x[2])}</small></button>`).join(""):`<div class="settings-info">تنظیمی با این عبارت پیدا نشد.</div>`;results.hidden=false;results.querySelectorAll("[data-search-open]").forEach(b=>b.onclick=()=>{results.hidden=true;input.value="";renderSettingsDetail(b.dataset.searchOpen);});});
}

/* ==================== تنظیمات ==================== */

function renderTopbarAvatar(photoURL, name) {
  $("#profileBtn").innerHTML = photoURL
    ? `<img src="${escapeHtml(photoURL)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : `<span id="myAvatarInitial">${escapeHtml((name || "؟")[0])}</span>`;
}

async function loadSettingsForm(){
  const d=(await getUserDoc(auth.currentUser?.uid))||{};
  renderTopbarAvatar(d.photoURL,d.displayName||d.username);
  try{
    const sessions=await security.listMySessions();
    const el=$("#settingsSessionsCount"); if(el) el.textContent=String(sessions.length);
  }catch{}
  try{
    const {data}=await supabase.rpc("get_my_storage_usage");
    const el=$("#settingsStorageStatus"); if(el){const n=Number(data?.total_bytes||0);el.textContent=n>=1024**3?`${(n/1024**3).toFixed(1)} GB`:n>=1024**2?`${(n/1024**2).toFixed(0)} MB`:`${Math.round(n/1024)} KB`;}
  }catch{}
  try{
    const settings=await security.getSecuritySettings();
    const sessions=await security.listMySessions();
    const score=security.computeSecurityScore(settings,sessions.length)?.score ?? 0;
    const el=$("#settingsSecurityStatus"); if(el) el.textContent=score>=80?"Good":score>=60?"Needs attention":"Review";
  }catch{}
}

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
  $("#darkModeToggle")?.setAttribute("aria-pressed", String(saved === "dark"));
}
$("#darkModeToggle")?.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("hoviyat_theme", next);
  $("#darkModeToggle")?.setAttribute("aria-pressed", String(next === "dark"));
});

/* ==================== Service Worker (PWA) ==================== */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

/* ==================== مرکز امنیت حساب ==================== */

$("#openSecurityCenterBtn")?.addEventListener("click", async () => {
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
      await supabase.from("security_settings").update({ biometric_enabled: false }).eq("uid", auth.currentUser?.uid);
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
    const me = (await getUserDoc(auth.currentUser?.uid)) || {};
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
$("#callSwitchCameraBtn")?.addEventListener("click", async () => { try { const ok=await callManager.switchCamera(); if(!ok) toast("دوربین دیگری پیدا نشد."); } catch(e){ toast("تعویض دوربین ناموفق بود.","error"); } });
$("#callSpeakerBtn")?.addEventListener("click", async () => { const v=$("#callRemoteVideo"); if(!v?.setSinkId){toast("کنترل بلندگو روی این دستگاه در دسترس نیست.");return;} try{const current=v.dataset.speaker==="1"?"":"default";await v.setSinkId(current);v.dataset.speaker=current?"1":"0";$("#callSpeakerBtn").classList.toggle("active",!!current);}catch{toast("تغییر خروجی صدا ناموفق بود.","error");} });

async function startOutgoingCall(video) {
  try { await assertActionAllowed(video ? 'video_call' : 'call'); } catch (err) { toast(err.message); return; }
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
  switchView("secretlist");
  teardownSecretChat();
  await runExpiredCleanup();
  if (unsubSecretList) { unsubSecretList(); unsubSecretList = null; }
  unsubSecretList = watchMySecretChats(async chats => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;
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
  switchView("secretchat");
  const { chat, aesKey } = await openSecretChatWith(otherUid);
  const keyStatus = await checkOtherKeyChange(otherUid);
  teardownSecretChat();
  switchView("secretchat");

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
        <div class="secret-expiry-hint">${secretCountdownText(lastMsgAt)}${keyStatus.changed ? ' · ⚠️ کلید امنیتی تغییر کرده' : ' · 🔐 E2E'}</div>
      </div>`;
    $("#secretChatBackBtn").onclick = () => openSecretListView();
  };
  renderSecretHeader();
  if (secretCountdownTimer) clearInterval(secretCountdownTimer);
  secretCountdownTimer = setInterval(renderSecretHeader, 30000);
  $("#secretMessageInput").value = "";

  unsubSecretMessages = watchSecretMessages(chat.id, aesKey, msgs => {
    if (msgs.length) lastMsgAt = msgs[msgs.length - 1].createdAt;
    renderSecretMessages($("#secretMessagesHolder"), msgs, auth.currentUser?.uid);
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


/* ==================== اعلان‌های اجتماعی ==================== */
$("#notificationsBtn")?.addEventListener("click", async () => {
  const modal = $("#notificationsModal");
  modal.hidden = false;
  try { await loadNotifications($("#notificationsHolder")); } catch (e) { $("#notificationsHolder").innerHTML = `<p class="story-empty">${escapeHtml(e.message || "اعلان‌ها در دسترس نیستند")}</p>`; }
});
$("#notificationsClose")?.addEventListener("click", () => $("#notificationsModal").hidden = true);
$("#notificationsModal")?.addEventListener("click", e => { if (e.target.id === "notificationsModal") e.currentTarget.hidden = true; });
