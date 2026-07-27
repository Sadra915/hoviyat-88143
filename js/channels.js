/**
 * channels.js
 * لایه داده کانال‌ها: ساخت کانال، عضویت/لغو عضویت، پست‌گذاری (فقط ادمین)، جستجوی کانال عمومی.
 */
import { auth, db, storage } from "./firebase-init.js";
import {
  doc, getDoc, addDoc, updateDoc, collection, query, where,
  orderBy, onSnapshot, serverTimestamp, limit, arrayUnion, arrayRemove, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

export async function createChannel(name, description, isPublic) {
  const me = auth.currentUser;
  const channelRef = await addDoc(collection(db, "channels"), {
    type: "channel",
    name: name.trim(),
    description: (description || "").trim(),
    photoURL: "",
    ownerId: me.uid,
    admins: [me.uid],
    subscribers: [me.uid],
    isPublic: !!isPublic,
    lastMessage: "کانال ساخته شد 📢",
    lastMessageAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return channelRef.id;
}

export function watchMyChannels(callback) {
  const me = auth.currentUser;
  const q = query(collection(db, "channels"), where("subscribers", "array-contains", me.uid), orderBy("lastMessageAt", "desc"));
  return onSnapshot(q, snap => {
    const channels = [];
    snap.forEach(d => channels.push({ id: d.id, kind: "channel", ...d.data() }));
    callback(channels);
  });
}

/** جستجوی کانال‌های عمومی بر اساس اسم (سمت کلاینت فیلتر می‌شود، برای اپ‌های بزرگ‌تر بعداً ایندکس جستجو لازم است) */
export async function searchPublicChannels(term) {
  const snap = await getDocs(query(collection(db, "channels"), where("isPublic", "==", true), limit(100)));
  const all = [];
  snap.forEach(d => all.push({ id: d.id, ...d.data() }));
  const t = term.trim().toLowerCase();
  return t ? all.filter(c => c.name.toLowerCase().includes(t)) : all;
}

export function watchChannelPosts(channelId, callback) {
  const q = query(collection(db, "channels", channelId, "posts"), orderBy("createdAt", "asc"), limit(300));
  return onSnapshot(q, snap => {
    const posts = [];
    snap.forEach(d => posts.push({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
    callback(posts);
  });
}

export async function postChannelText(channelId, text) {
  const body = text.trim();
  if (!body) return;
  await addDoc(collection(db, "channels", channelId, "posts"), {
    senderId: auth.currentUser.uid, type: "text", body, reactions: {}, createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "channels", channelId), { lastMessage: body.slice(0, 80), lastMessageAt: serverTimestamp() });
}

export async function postChannelImage(channelId, file) {
  const path = `channel_media/${channelId}/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  await addDoc(collection(db, "channels", channelId, "posts"), {
    senderId: auth.currentUser.uid, type: "image", mediaURL: url, reactions: {}, createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "channels", channelId), { lastMessage: "📷 عکس", lastMessageAt: serverTimestamp() });
}

export async function subscribeChannel(channelId) {
  await updateDoc(doc(db, "channels", channelId), { subscribers: arrayUnion(auth.currentUser.uid) });
}

export async function unsubscribeChannel(channelId) {
  await updateDoc(doc(db, "channels", channelId), {
    subscribers: arrayRemove(auth.currentUser.uid), admins: arrayRemove(auth.currentUser.uid),
  });
}

export async function promoteChannelAdmin(channelId, uid) {
  await updateDoc(doc(db, "channels", channelId), { admins: arrayUnion(uid) });
}

export function isChannelAdmin(channel) {
  return (channel.admins || []).includes(auth.currentUser?.uid);
}

export async function getChannel(channelId) {
  const snap = await getDoc(doc(db, "channels", channelId));
  return snap.exists() ? { id: channelId, ...snap.data() } : null;
}
