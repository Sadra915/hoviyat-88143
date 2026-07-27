/**
 * app.js
 * نقطه ورود و هماهنگ‌کننده اصلی هویت — گفتگوی خصوصی، گروه، کانال.
 */
import { auth, db, ADMIN_UID } from "./firebase-init.js";
import { doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signUp, logIn, logOut, watchAuth, validateUsername } from "./auth.js";
import {
  findUserByUsername, listAllUsers, openOrCreateChat, watchMyChats, watchMessages,
  sendTextMessage, sendImageMessage, sendVoiceMessage, toggleReaction, markChatRead,
} from "./chat.js";
import {
  createGroup, watchMyGroups, watchGroupMessages, sendGroupText, sendGroupImage,
  sendGroupVoice, toggleGroupReaction, markGroupRead, addGroupMember, removeGroupMember,
  leaveGroup, promoteGroupAdmin, isGroupAdmin,
} from "./groups.js";
import {
  createChannel, watchMyChannels, searchPublicChannels, watchChannelPosts,
  postChannelText, postChannelImage, subscribeChannel, unsubscribeChannel,
  promoteChannelAdmin, isChannelAdmin, getChannel,
} from "./channels.js";
import {
  renderChatList, renderChatHeader, renderMessages, showReactionPicker, escapeHtml,
  renderContactProfile, renderMemberPicker, renderGroupInfo, renderChannelInfo,
  renderChannelSearchResults,
} from "./ui.js";
import { renderIdentityCard, stopIdentityCard, toast } from "./identity.js";
import { renderSmartSpace } from "./smartspace.js";
import { isAdmin, renderAdminPanel } from "./admin.js";
import { createVoiceRecorder } from "./voice.js";

const $ = sel => document.querySelector(sel);

let currentEntity = null; // { mode: 'private'|'group'|'channel', id, otherUid?, data }
let unsubChats = null, unsubGroups = null, unsubChannels = null, unsubMessages = null;
let latestChats = [], latestGroups = [], latestChannels = [];
const presenceMap = {};
const presenceUnsubs = {};
const recorder = createVoiceRecorder();
let isRecording = false;
let currentFilter = "all";
let allUsersCache = null;
const groupSelectedUids = new Set();

/* ==================== احراز هویت ==================== */

watchAuth(async user => {
  $("#bootScreen").classList.add("hide");
  if (user) {
    await enterApp(user);
  } else {
    exitToAuth();
  }
});

function exitToAuth() {
  $("#appShell").hidden = true;
  $("#view-auth").hidden = false;
  if (unsubChats) { unsubChats(); unsubChats = null; }
  if (unsubGroups) { unsubGroups(); unsubGroups = null; }
  if (unsubChannels) { unsubChannels(); unsubChannels = null; }
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  Object.values(presenceUnsubs).forEach(u => u());
  Object.keys(presenceUnsubs).forEach(k => delete presenceUnsubs[k]);
}

async function enterApp(user) {
  $("#view-auth").hidden = true;
  $("#appShell").hidden = false;

  const userDoc = await getDoc(doc(db, "users", user.uid));
  const myData = userDoc.exists() ? userDoc.data() : {};
  $("#myAvatarInitial").textContent = (myData.displayName || myData.username || "؟")[0];
  document.querySelector(".admin-only").hidden = !isAdmin();

  loadThemePref();
  renderSmartSpace($("#smartSpaceHolder"));

  unsubChats = watchMyChats(chats => {
    latestChats = chats.map(c => ({ ...c, kind: "private" }));
    ensurePresenceSubs(latestChats, user.uid);
    renderList();
  });
  unsubGroups = watchMyGroups(groups => { latestGroups = groups; renderList(); });
  unsubChannels = watchMyChannels(channels => { latestChannels = channels; renderList(); });

  switchView("home");
}

function ensurePresenceSubs(chats, myUid) {
  chats.forEach(chat => {
    const otherUid = chat.members.find(m => m !== myUid);
    if (otherUid && !presenceUnsubs[otherUid]) {
      presenceUnsubs[otherUid] = onSnapshot(doc(db, "users", otherUid), snap => {
        presenceMap[otherUid] = !!snap.data()?.online;
        renderList();
      });
    }
  });
}

/** ترکیب چت/گروه/کانال، اعمال فیلتر و مرتب‌سازی بر اساس آخرین پیام، سپس رندر */
function renderList() {
  const myUid = auth.currentUser?.uid;
  if (!myUid) return;
  const chatsWithPresence = latestChats.map(c => ({ ...c, _online: presenceMap[c.members.find(m => m !== myUid)] }));
  let merged = [...chatsWithPresence, ...latestGroups, ...latestChannels];

  if (currentFilter === "unread") {
    merged = merged.filter(item => (item.unreadCounts?.[myUid] || 0) > 0);
  } else if (currentFilter === "groups") {
    merged = merged.filter(item => item.kind === "group");
  } else if (currentFilter === "channels") {
    merged = merged.filter(item => item.kind === "channel");
  }

  merged.sort((a, b) => (b.lastMessageAt?.toMillis?.() || 0) - (a.lastMessageAt?.toMillis?.() || 0));
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

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("#loginError").textContent = "";
  try {
    await logIn($("#loginEmail").value.trim(), $("#loginPassword").value);
  } catch (err) {
    $("#loginError").textContent = translateAuthError(err);
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
  try {
    await signUp({
      email: $("#signupEmail").value.trim(),
      password: $("#signupPassword").value,
      username, displayName: $("#signupName").value.trim(),
    });
  } catch (err) {
    $("#signupError").textContent = translateAuthError(err);
  }
});

function translateAuthError(err) {
  const map = {
    "auth/email-already-in-use": "این ایمیل قبلاً ثبت شده است.",
    "auth/invalid-email": "ایمیل معتبر نیست.",
    "auth/weak-password": "رمز عبور باید حداقل ۶ کاراکتر باشد.",
    "auth/user-not-found": "کاربری با این ایمیل پیدا نشد.",
    "auth/wrong-password": "رمز عبور اشتباه است.",
    "auth/invalid-credential": "ایمیل یا رمز عبور اشتباه است.",
  };
  return map[err.code] || err.message;
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
  if (view === "admin") renderAdminPanel($("#adminHolder"));
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

async function openChatById(chatId, otherUid) {
  currentEntity = { mode: "private", id: chatId, otherUid };
  const otherSnap = await getDoc(doc(db, "users", otherUid));
  const otherUser = otherSnap.exists() ? { uid: otherUid, ...otherSnap.data() } : { displayName: "کاربر" };
  currentEntity.data = otherUser;

  renderChatHeader($("#chatHeader"), {
    mode: "private", displayName: otherUser.displayName || otherUser.username,
    photoURL: otherUser.photoURL, online: otherUser.online,
  });
  setComposerMode(true);
  showChatView();

  if (unsubMessages) unsubMessages();
  unsubMessages = watchMessages(chatId, msgs => renderMessages($("#messagesHolder"), msgs, auth.currentUser.uid, false));
  markChatRead(chatId);
}

async function openGroupById(groupId) {
  const snap = await getDoc(doc(db, "groups", groupId));
  if (!snap.exists()) return;
  const group = { id: groupId, ...snap.data() };
  currentEntity = { mode: "group", id: groupId, data: group };

  renderChatHeader($("#chatHeader"), {
    mode: "group", displayName: group.name, photoURL: group.photoURL, memberCount: group.members.length,
  });
  setComposerMode(true);
  showChatView();

  if (unsubMessages) unsubMessages();
  unsubMessages = watchGroupMessages(groupId, msgs => renderMessages($("#messagesHolder"), msgs, auth.currentUser.uid, true));
  markGroupRead(groupId);
}

async function openChannelById(channelId) {
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

  if (unsubMessages) unsubMessages();
  unsubMessages = watchChannelPosts(channelId, posts => renderMessages($("#messagesHolder"), posts, auth.currentUser.uid, false));
}

function setComposerMode(canPost) {
  $("#composerForm").hidden = !canPost;
  $("#channelViewOnlyBar").hidden = canPost;
  $("#voiceRecordBar").hidden = true;
}

$("#chatHeader").addEventListener("click", e => {
  if (e.target.closest("#chatBackBtn")) {
    if (unsubMessages) { unsubMessages(); unsubMessages = null; }
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
      else { await navigator.clipboard.writeText(shareUrl); toast("لینک کپی شد ✅"); }
    },
    onSoon: () => toast("این قابلیت به‌زودی اضافه می‌شود 🚧"),
  });
}

function openGroupInfoView() {
  document.querySelectorAll(".view").forEach(v => v.hidden = true);
  $("#view-groupinfo").hidden = false;
  renderGroupInfoNow();
}
async function renderGroupInfoNow() {
  const snap = await getDoc(doc(db, "groups", currentEntity.id));
  const group = { id: currentEntity.id, ...snap.data() };
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
      toast("عضو جدید اضافه شد ✅");
      renderGroupInfoNow();
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
      toast("ادمین جدید اضافه شد ✅");
      renderChannelInfoNow();
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
  $(sel).classList.remove("open");
  $(sel).hidden = true;
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
    const myUname = (await getDoc(doc(db, "users", auth.currentUser.uid))).data()?.username;
    if (val.replace(/^@/, "").toLowerCase() === myUname) {
      $("#newChatError").textContent = "این شناسه کاربری خودت است.";
      return;
    }
    const user = await findUserByUsername(val);
    if (!user) { $("#newChatError").textContent = "کاربری با این شناسه پیدا نشد."; return; }
    $("#newChatResult").innerHTML = `
      <div class="found-user-card">
        <div class="chat-avatar">${user.photoURL ? `<img src="${user.photoURL}">` : `<span>${(user.displayName || user.username)[0]}</span>`}</div>
        <div><strong>${escapeHtml(user.displayName)}</strong><br><small>@${escapeHtml(user.username)}</small></div>
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
  groupSelectedUids.clear();
  if (!allUsersCache) allUsersCache = await listAllUsers();
  renderMemberPicker($("#groupMembersList"), allUsersCache, groupSelectedUids);
}
$("#closeGroupModal").addEventListener("click", () => closeModal("#groupModal"));

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
  const members = allUsersCache.filter(u => groupSelectedUids.has(u.uid));
  try {
    const groupId = await createGroup(name, members);
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

$("#composerForm").addEventListener("submit", async e => {
  e.preventDefault();
  const input = $("#messageInput");
  const text = input.value;
  if (!text.trim() || !currentEntity) return;
  input.value = "";
  try {
    if (currentEntity.mode === "private") await sendTextMessage(currentEntity.id, text);
    else if (currentEntity.mode === "group") await sendGroupText(currentEntity.id, text);
    else if (currentEntity.mode === "channel") await postChannelText(currentEntity.id, text);
  } catch (err) { toast("خطا در ارسال پیام"); }
});

/* ==================== ارسال عکس ==================== */

$("#attachBtn").addEventListener("click", () => $("#imageInput").click());
$("#imageInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file || !currentEntity) return;
  try {
    if (currentEntity.mode === "private") await sendImageMessage(currentEntity.id, file);
    else if (currentEntity.mode === "group") await sendGroupImage(currentEntity.id, file);
    else if (currentEntity.mode === "channel") await postChannelImage(currentEntity.id, file);
  } catch (err) { toast("خطا در ارسال عکس"); }
  e.target.value = "";
});

/* ==================== پیام صوتی (فقط چت خصوصی و گروه) ==================== */

$("#micBtn").addEventListener("click", async () => {
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
    } catch (err) { toast("خطا در ارسال پیام صوتی"); }
  }
});

/* ==================== پخش ویس + ری‌اکشن (رویدادهای تفویضی) ==================== */

$("#messagesHolder").addEventListener("click", e => {
  const playBtn = e.target.closest(".voice-play-btn");
  if (playBtn) {
    const wrap = playBtn.closest(".bubble-voice");
    const audioEl = wrap.querySelector(".voice-audio-el");
    document.querySelectorAll(".voice-audio-el").forEach(a => { if (a !== audioEl) a.pause(); });
    if (audioEl.paused) { audioEl.play(); playBtn.textContent = "⏸️"; }
    else { audioEl.pause(); playBtn.textContent = "▶️"; }
    audioEl.onended = () => { playBtn.textContent = "▶️"; };
    return;
  }
});

let pressTimer = null;
$("#messagesHolder").addEventListener("pointerdown", e => {
  const row = e.target.closest(".bubble-row");
  if (!row || !currentEntity || currentEntity.mode === "channel") return;
  pressTimer = setTimeout(() => {
    const bubble = row.querySelector(".bubble");
    showReactionPicker(bubble, async emoji => {
      if (currentEntity.mode === "private") await toggleReaction(currentEntity.id, row.dataset.msgId, emoji);
      else if (currentEntity.mode === "group") await toggleGroupReaction(currentEntity.id, row.dataset.msgId, emoji);
    });
  }, 420);
});
["pointerup", "pointerleave", "pointercancel"].forEach(evt => {
  $("#messagesHolder").addEventListener(evt, () => clearTimeout(pressTimer));
});

/* ==================== تنظیمات ==================== */

async function loadSettingsForm() {
  const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
  const d = snap.data() || {};
  $("#settingsDisplayName").value = d.displayName || "";
  $("#settingsBio").value = d.bio || "";
  $("#settingsPhone").value = d.phone || "";
  $("#settingsCity").value = d.weatherCity || "";
}

$("#saveSettingsBtn").addEventListener("click", async () => {
  await setDoc(doc(db, "users", auth.currentUser.uid), {
    displayName: $("#settingsDisplayName").value.trim(),
    bio: $("#settingsBio").value.trim(),
    phone: $("#settingsPhone").value.trim(),
    weatherCity: $("#settingsCity").value.trim() || "بیرجند",
  }, { merge: true });
  toast("ذخیره شد ✅");
});

$("#logoutBtn").addEventListener("click", async () => {
  await logOut();
});

/* ==================== حالت شب ==================== */

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
