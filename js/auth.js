/**
 * auth.js
 * ثبت‌نام/ورود با ایمیل و رمز عبور + رزرو یوزرنیم یکتا + وضعیت آنلاین/آخرین بازدید
 */
import { auth, db } from "./firebase-init.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, setDoc, getDoc, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function validateUsername(u) {
  return USERNAME_RE.test(u);
}

/** ثبت‌نام: ابتدا یوزرنیم را با تراکنش رزرو می‌کند تا یکتایی تضمین شود، سپس کاربر Auth و سند users را می‌سازد */
export async function signUp({ email, password, username, displayName }) {
  const uname = username.trim().toLowerCase();
  if (!validateUsername(uname)) {
    throw new Error("شناسه کاربری باید ۳ تا ۲۰ حرف/عدد انگلیسی کوچک یا _ باشد.");
  }

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;

  try {
    await runTransaction(db, async (tx) => {
      const unameRef = doc(db, "usernames", uname);
      const unameSnap = await tx.get(unameRef);
      if (unameSnap.exists()) throw new Error("این شناسه کاربری قبلاً گرفته شده است.");
      tx.set(unameRef, { uid, createdAt: serverTimestamp() });
      tx.set(doc(db, "users", uid), {
        uid, username: uname, displayName: displayName || uname,
        bio: "", phone: "", verified: false, photoURL: "", weatherCity: "بیرجند",
        createdAt: serverTimestamp(), lastSeenAt: serverTimestamp(), online: true,
      });
    });
  } catch (err) {
    // اگر رزرو یوزرنیم شکست خورد، کاربر Auth ساخته‌شده را برای جلوگیری از حساب یتیم پاک می‌کنیم
    await cred.user.delete().catch(() => {});
    throw err;
  }

  await updateProfile(cred.user, { displayName: displayName || uname }).catch(() => {});
  return cred.user;
}

export async function logIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "users", cred.user.uid), { online: true, lastSeenAt: serverTimestamp() }, { merge: true });
  return cred.user;
}

export async function logOut() {
  const uid = auth.currentUser?.uid;
  if (uid) {
    await setDoc(doc(db, "users", uid), { online: false, lastSeenAt: serverTimestamp() }, { merge: true }).catch(() => {});
  }
  await signOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function getUserDoc(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

// هنگام بستن تب/از دست رفتن اتصال، وضعیت را آفلاین علامت بزن (best-effort سمت کلاینت)
window.addEventListener("beforeunload", () => {
  const uid = auth.currentUser?.uid;
  if (uid) {
    setDoc(doc(db, "users", uid), { online: false, lastSeenAt: serverTimestamp() }, { merge: true }).catch(() => {});
  }
});
