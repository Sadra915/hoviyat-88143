/**
 * chat.js
 * لایه داده گفتگوها: پیدا کردن کاربر با یوزرنیم، ساخت/باز کردن چت خصوصی،
 * لیست لحظه‌ای چت‌ها، ارسال پیام (متن/عکس/ویس)، ری‌اکشن.
 */
import { auth, db, storage } from "./firebase-init.js";
import {
  doc, getDoc, getDocs, setDoc, addDoc, updateDoc, collection, query, where,
  orderBy, onSnapshot, serverTimestamp, limit, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/** شناسه قطعی و یکتای چت خصوصی بین دو کاربر (مستقل از ترتیب) */
function chatIdFor(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

/** لیست کاربران برای انتخاب عضو گروه؛ برای اپ‌های بزرگ‌تر بعداً باید صفحه‌بندی/جستجوی سمت سرور اضافه شود */
export async function listAllUsers() {
  const snap = await getDocs(collection(db, "users"));
  const users = [];
  snap.forEach(d => { if (d.id !== auth.currentUser.uid) users.push({ uid: d.id, ...d.data() }); });
  return users;
}

export async function findUserByUsername(username) {
  const uname = username.trim().toLowerCase().replace(/^@/, "");
  const unameSnap = await getDoc(doc(db, "usernames", uname));
  if (!unameSnap.exists()) return null;
  const uid = unameSnap.data().uid;
  const userSnap = await getDoc(doc(db, "users", uid));
  return userSnap.exists() ? { uid, ...userSnap.data() } : null;
}

/** باز کردن یا ساختن چت خصوصی با کاربر دیگر، برمی‌گرداند: chatId */
export async function openOrCreateChat(otherUser) {
  const me = auth.currentUser;
  const myDoc = await getDoc(doc(db, "users", me.uid));
  const myData = myDoc.data();
  const chatId = chatIdFor(me.uid, otherUser.uid);
  const chatRef = doc(db, "chats", chatId);
  const chatSnap = await getDoc(chatRef);

  if (!chatSnap.exists()) {
    await setDoc(chatRef, {
      members: [me.uid, otherUser.uid],
      memberInfo: {
        [me.uid]: { username: myData.username, displayName: myData.displayName, photoURL: myData.photoURL || "" },
        [otherUser.uid]: { username: otherUser.username, displayName: otherUser.displayName, photoURL: otherUser.photoURL || "" },
      },
      lastMessage: "", lastMessageAt: serverTimestamp(), lastSenderId: "",
      unreadCounts: { [me.uid]: 0, [otherUser.uid]: 0 },
      createdAt: serverTimestamp(),
    });
  }
  return chatId;
}

/** گوش‌دادن لحظه‌ای به لیست چت‌های کاربر جاری، مرتب‌شده بر اساس آخرین پیام */
export function watchMyChats(callback) {
  const me = auth.currentUser;
  const q = query(
    collection(db, "chats"),
    where("members", "array-contains", me.uid),
    orderBy("lastMessageAt", "desc")
  );
  return onSnapshot(q, snap => {
    const chats = [];
    snap.forEach(d => chats.push({ id: d.id, ...d.data() }));
    callback(chats);
  });
}

export function watchMessages(chatId, callback) {
  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt", "asc"),
    limit(200)
  );
  return onSnapshot(q, snap => {
    const msgs = [];
    snap.forEach(d => msgs.push({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
    callback(msgs);
  });
}

async function bumpChatMeta(chatId, lastMessage) {
  const chatSnap = await getDoc(doc(db, "chats", chatId));
  const members = chatSnap.data()?.members || [];
  const otherUid = members.find(m => m !== auth.currentUser.uid);
  const update = {
    lastMessage, lastMessageAt: serverTimestamp(), lastSenderId: auth.currentUser.uid,
  };
  if (otherUid) update[`unreadCounts.${otherUid}`] = increment(1);
  await updateDoc(doc(db, "chats", chatId), update);
}

/** صفر کردن تعداد پیام‌های نخوانده برای کاربر جاری، هنگام باز کردن یک چت */
export async function markChatRead(chatId) {
  const uid = auth.currentUser.uid;
  await updateDoc(doc(db, "chats", chatId), { [`unreadCounts.${uid}`]: 0 }).catch(() => {});
}

export async function sendTextMessage(chatId, text) {
  const body = text.trim();
  if (!body) return;
  await addDoc(collection(db, "chats", chatId, "messages"), {
    senderId: auth.currentUser.uid, type: "text", body,
    reactions: {}, createdAt: serverTimestamp(),
  });
  await bumpChatMeta(chatId, body.slice(0, 80));
}

export async function sendImageMessage(chatId, file) {
  const path = `chat_media/${chatId}/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  await addDoc(collection(db, "chats", chatId, "messages"), {
    senderId: auth.currentUser.uid, type: "image", mediaURL: url,
    reactions: {}, createdAt: serverTimestamp(),
  });
  await bumpChatMeta(chatId, "📷 عکس");
}

/** آپلود پیام صوتی + موج صدای واقعی (آرایه دامنه‌ها که هنگام ضبط استخراج شده) */
export async function sendVoiceMessage(chatId, blob, durationSec, waveform) {
  const path = `chat_media/${chatId}/voice_${Date.now()}.webm`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  const url = await getDownloadURL(storageRef);
  await addDoc(collection(db, "chats", chatId, "messages"), {
    senderId: auth.currentUser.uid, type: "voice", mediaURL: url,
    duration: durationSec, waveform: waveform || [],
    reactions: {}, createdAt: serverTimestamp(),
  });
  await bumpChatMeta(chatId, "🎙 پیام صوتی");
}

export async function toggleReaction(chatId, messageId, emoji) {
  const uid = auth.currentUser.uid;
  const msgRef = doc(db, "chats", chatId, "messages", messageId);
  const snap = await getDoc(msgRef);
  if (!snap.exists()) return;
  const reactions = { ...(snap.data().reactions || {}) };
  if (reactions[uid] === emoji) delete reactions[uid]; // دوباره زدن همان ایموجی = حذف ری‌اکشن
  else reactions[uid] = emoji;
  await updateDoc(msgRef, { reactions });
}

export { chatIdFor };
