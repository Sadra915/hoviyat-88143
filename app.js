/**
 * app.js
 * نقطه ورود و هماهنگ‌کننده اصلی هویت.
 */
import { auth, db } from "./firebase-init.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signUp, logIn, logOut, watchAuth, validateUsername } from "./auth.js";
import {
  findUserByUsername, openOrCreateChat, watchMyChats, watchMessages,
  sendTextMessage, sendImageMessage, sendVoiceMessage, toggleReaction,
} from "./chat.js";
import { renderChatList, renderChatHeader, renderMessages, showReactionPicker, escapeHtml } from "./ui.js";
import { renderIdentityCard, stopIdentityCard, toast } from "./identity.js";
import { renderSmartSpace } from "./smartspace.js";
import { isAdmin, renderAdminPanel } from "./admin.js";
import { createVoiceRecorder } from "./voice.js";

const $ = sel => document.querySelector(sel);

let currentChatId = null;
let currentOtherUser = null;
let unsubChats = null;
let unsubMessages = null;
const recorder = createVoiceRecorder();
let isRecording = false;

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
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
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
  unsubChats = watchMyChats(chats => renderChatList($("#chatListHolder"), chats, user.uid));
  switchView("home");
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
  document.querySelectorAll(".view").forEach(v => v.hidden = true);
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  if (view === "chatsearch") { openNewChatModal(); return; }
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

/* ==================== باز کردن یک گفتگو ==================== */

$("#chatListHolder").addEventListener("click", e => {
  const card = e.target.closest(".chat-card");
  if (!card) return;
  openChatById(card.dataset.chatId, card.dataset.otherUid);
});

async function openChatById(chatId, otherUid) {
  currentChatId = chatId;
  const otherSnap = await getDoc(doc(db, "users", otherUid));
  currentOtherUser = otherSnap.exists() ? { uid: otherUid, ...otherSnap.data() } : { displayName: "کاربر" };

  renderChatHeader($("#chatHeader"), currentOtherUser);
  document.querySelectorAll(".view").forEach(v => v.hidden = true);
  $("#view-chat").hidden = false;

  if (unsubMessages) unsubMessages();
  unsubMessages = watchMessages(chatId, msgs => renderMessages($("#messagesHolder"), msgs, auth.currentUser.uid));
}

$("#chatHeader").addEventListener("click", e => {
  if (e.target.closest("#chatBackBtn")) {
    if (unsubMessages) { unsubMessages(); unsubMessages = null; }
    switchView("home");
  }
});

/* ==================== گفتگوی جدید (جستجوی یوزرنیم) ==================== */

function openNewChatModal() {
  $("#newChatModal").classList.add("open");
  $("#newChatUsernameInput").value = "";
  $("#newChatError").textContent = "";
  $("#newChatResult").innerHTML = "";
  $("#newChatUsernameInput").focus();
}
$("#closeNewChat").addEventListener("click", () => $("#newChatModal").classList.remove("open"));
$("#newChatBtn").addEventListener("click", openNewChatModal);
$("#fabNewChat").addEventListener("click", openNewChatModal);

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
      $("#newChatModal").classList.remove("open");
      switchView("home");
      openChatById(chatId, user.uid);
    };
  }, 400);
});

/* ==================== ارسال پیام (متن) ==================== */

$("#composerForm").addEventListener("submit", async e => {
  e.preventDefault();
  const input = $("#messageInput");
  const text = input.value;
  if (!text.trim() || !currentChatId) return;
  input.value = "";
  try { await sendTextMessage(currentChatId, text); }
  catch (err) { toast("خطا در ارسال پیام"); }
});

/* ==================== ارسال عکس ==================== */

$("#attachBtn").addEventListener("click", () => $("#imageInput").click());
$("#imageInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file || !currentChatId) return;
  try { await sendImageMessage(currentChatId, file); }
  catch (err) { toast("خطا در ارسال عکس"); }
  e.target.value = "";
});

/* ==================== پیام صوتی ==================== */

$("#micBtn").addEventListener("click", async () => {
  if (isRecording) return;
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
  if (result && currentChatId) {
    try { await sendVoiceMessage(currentChatId, result.blob, result.durationSec, result.waveform); }
    catch (err) { toast("خطا در ارسال پیام صوتی"); }
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
  if (!row) return;
  pressTimer = setTimeout(() => {
    const bubble = row.querySelector(".bubble");
    showReactionPicker(bubble, async emoji => {
      await toggleReaction(currentChatId, row.dataset.msgId, emoji);
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
  $("#settingsCity").value = d.weatherCity || "";
}

$("#saveSettingsBtn").addEventListener("click", async () => {
  await setDoc(doc(db, "users", auth.currentUser.uid), {
    displayName: $("#settingsDisplayName").value.trim(),
    bio: $("#settingsBio").value.trim(),
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
