/**
 * groups.js
 * لایه داده گروه‌ها: ساخت گروه، عضویت/خروج، ارسال و دریافت پیام گروهی، مدیریت ادمین.
 */
import { auth, db, storage } from "./firebase-init.js";
import {
  doc, getDoc, setDoc, addDoc, updateDoc, collection, query, where,
  orderBy, onSnapshot, serverTimestamp, limit, arrayUnion, arrayRemove, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/** ساخت گروه جدید؛ سازنده به‌صورت خودکار ادمین و عضو می‌شود. برمی‌گرداند: groupId */
export async function createGroup(name, memberUsers) {
  const me = auth.currentUser;
  const myDoc = await getDoc(doc(db, "users", me.uid));
  const myData = myDoc.data();

  const members = [me.uid, ...memberUsers.map(u => u.uid)];
  const memberInfo = { [me.uid]: { username: myData.username, displayName: myData.displayName, photoURL: myData.photoURL || "" } };
  memberUsers.forEach(u => {
    memberInfo[u.uid] = { username: u.username, displayName: u.displayName, photoURL: u.photoURL || "" };
  });
  const unreadCounts = {};
  members.forEach(uid => { unreadCounts[uid] = 0; });

  const groupRef = await addDoc(collection(db, "groups"), {
    type: "group",
    name: name.trim(),
    photoURL: "",
    ownerId: me.uid,
    admins: [me.uid],
    members,
    memberInfo,
    unreadCounts,
    lastMessage: "گروه ساخته شد 🎉",
    lastMessageAt: serverTimestamp(),
    lastSenderId: me.uid,
    createdAt: serverTimestamp(),
  });
  return groupRef.id;
}

export function watchMyGroups(callback) {
  const me = auth.currentUser;
  const q = query(collection(db, "groups"), where("members", "array-contains", me.uid), orderBy("lastMessageAt", "desc"));
  return onSnapshot(q, snap => {
    const groups = [];
    snap.forEach(d => groups.push({ id: d.id, kind: "group", ...d.data() }));
    callback(groups);
  });
}

export function watchGroupMessages(groupId, callback) {
  const q = query(collection(db, "groups", groupId, "messages"), orderBy("createdAt", "asc"), limit(300));
  return onSnapshot(q, snap => {
    const msgs = [];
    snap.forEach(d => msgs.push({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
    callback(msgs);
  });
}

async function bumpGroupMeta(groupId, lastMessage) {
  const me = auth.currentUser;
  const groupSnap = await getDoc(doc(db, "groups", groupId));
  const members = groupSnap.data()?.members || [];
  const update = { lastMessage, lastMessageAt: serverTimestamp(), lastSenderId: me.uid };
  members.filter(uid => uid !== me.uid).forEach(uid => { update[`unreadCounts.${uid}`] = increment(1); });
  await updateDoc(doc(db, "groups", groupId), update);
}

export async function sendGroupText(groupId, text) {
  const body = text.trim();
  if (!body) return;
  const me = auth.currentUser;
  const myDoc = await getDoc(doc(db, "users", me.uid));
  await addDoc(collection(db, "groups", groupId, "messages"), {
    senderId: me.uid, senderName: myDoc.data()?.displayName || "کاربر",
    type: "text", body, reactions: {}, createdAt: serverTimestamp(),
  });
  await bumpGroupMeta(groupId, `${myDoc.data()?.displayName}: ${body.slice(0, 60)}`);
}

export async function sendGroupImage(groupId, file) {
  const me = auth.currentUser;
  const myDoc = await getDoc(doc(db, "users", me.uid));
  const path = `group_media/${groupId}/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  await addDoc(collection(db, "groups", groupId, "messages"), {
    senderId: me.uid, senderName: myDoc.data()?.displayName || "کاربر",
    type: "image", mediaURL: url, reactions: {}, createdAt: serverTimestamp(),
  });
  await bumpGroupMeta(groupId, `${myDoc.data()?.displayName}: 📷 عکس`);
}

export async function sendGroupVoice(groupId, blob, durationSec, waveform) {
  const me = auth.currentUser;
  const myDoc = await getDoc(doc(db, "users", me.uid));
  const path = `group_media/${groupId}/voice_${Date.now()}.webm`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  const url = await getDownloadURL(storageRef);
  await addDoc(collection(db, "groups", groupId, "messages"), {
    senderId: me.uid, senderName: myDoc.data()?.displayName || "کاربر",
    type: "voice", mediaURL: url, duration: durationSec, waveform: waveform || [],
    reactions: {}, createdAt: serverTimestamp(),
  });
  await bumpGroupMeta(groupId, `${myDoc.data()?.displayName}: 🎙 پیام صوتی`);
}

export async function toggleGroupReaction(groupId, messageId, emoji) {
  const uid = auth.currentUser.uid;
  const msgRef = doc(db, "groups", groupId, "messages", messageId);
  const snap = await getDoc(msgRef);
  if (!snap.exists()) return;
  const reactions = { ...(snap.data().reactions || {}) };
  if (reactions[uid] === emoji) delete reactions[uid];
  else reactions[uid] = emoji;
  await updateDoc(msgRef, { reactions });
}

export async function markGroupRead(groupId) {
  const uid = auth.currentUser.uid;
  await updateDoc(doc(db, "groups", groupId), { [`unreadCounts.${uid}`]: 0 }).catch(() => {});
}

export async function addGroupMember(groupId, user) {
  await updateDoc(doc(db, "groups", groupId), {
    members: arrayUnion(user.uid),
    [`memberInfo.${user.uid}`]: { username: user.username, displayName: user.displayName, photoURL: user.photoURL || "" },
    [`unreadCounts.${user.uid}`]: 0,
  });
}

export async function removeGroupMember(groupId, uid) {
  await updateDoc(doc(db, "groups", groupId), { members: arrayRemove(uid), admins: arrayRemove(uid) });
}

export async function leaveGroup(groupId) {
  return removeGroupMember(groupId, auth.currentUser.uid);
}

export async function promoteGroupAdmin(groupId, uid) {
  await updateDoc(doc(db, "groups", groupId), { admins: arrayUnion(uid) });
}

export function isGroupAdmin(group) {
  return (group.admins || []).includes(auth.currentUser?.uid);
}
