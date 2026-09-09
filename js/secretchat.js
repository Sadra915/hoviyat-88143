/**
 * secretchat.js
 * لایه‌ی داده‌ی گفتگوی مخفی: جدا از جدول‌های چت اصلی (secret_chats /
 * secret_chat_messages)، با رمزنگاری E2E واقعی (secret-crypto.js) —
 * سرور فقط متن رمزشده را ذخیره می‌کند.
 */
import { supabase, auth, uniqueChannelName } from "./supabase-init.js";
import { assertActionAllowed } from './restrictions.js';
import { ensureKeyPair, getMyPublicKeyJwk, deriveSharedSecret, encryptText, decryptText, getKeyFingerprint, SECRET_CRYPTO_VERSION } from "./secret-crypto.js";

const keyCache = {}; // otherUid -> CryptoKey مشترک (برای این‌که هر پیام دوباره از صفر مشتق نشه)

/** باید یک‌بار بعد از لاگین صدا زده شود: کلید عمومی این دستگاه را (اگر لازم بود) در پروفایل ثبت می‌کند */
export async function ensureMyPublicKeyPublished() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("جلسه کاربر آماده نیست.");
  await ensureKeyPair(uid);
  const pub = await getMyPublicKeyJwk(uid);
  const { data } = await supabase.from("profiles").select("secret_pubkey").eq("id", uid).maybeSingle();
  const already = data?.secret_pubkey;
  if (already && JSON.stringify(already) === JSON.stringify(pub)) return; // از قبل ثبته
  await supabase.from("profiles").update({ secret_pubkey: pub }).eq("id", uid);
}

/** کلید عمومی طرف مقابل رو می‌گیره؛ اگه هنوز گفتگوی مخفی رو باز نکرده باشه، null برمی‌گردونه */
export async function getOtherPublicKey(otherUid) {
  const { data } = await supabase.from("profiles").select("secret_pubkey").eq("id", otherUid).maybeSingle();
  return data?.secret_pubkey || null;
}

async function getSharedKey(otherUid, otherPubJwk) {
  if (keyCache[otherUid]) return keyCache[otherUid];
  const myUid = auth.currentUser?.uid;
  if (!myUid) throw new Error("جلسه کاربر آماده نیست.");
  const key = await deriveSharedSecret(otherPubJwk, myUid);
  keyCache[otherUid] = key;
  return key;
}

/** ساخت/بازکردن گفتگوی مخفی با یه کاربر؛ برمی‌گردونه { chat, aesKey } یا خطا اگه طرف مقابل هنوز کلید نداره */
export async function openSecretChatWith(otherUid) {
  await assertActionAllowed('secret_chat');
  await ensureMyPublicKeyPublished();
  const otherPub = await getOtherPublicKey(otherUid);
  if (!otherPub) {
    throw new Error("این کاربر هنوز گفتگوی مخفی رو روی دستگاهش فعال نکرده. وقتی وارد این بخش بشه، می‌تونی باهاش گفتگوی مخفی بسازی.");
  }
  const { data, error } = await supabase.rpc("get_or_create_secret_chat", { p_other_uid: otherUid });
  if (error) throw error;
  const aesKey = await getSharedKey(otherUid, otherPub);
  return { chat: data, aesKey };
}

export function watchMySecretChats(callback) {
  const myUid = auth.currentUser?.uid;
  if (!myUid) return () => {};
  let stopped = false;

  async function refetch() {
    const { data } = await supabase.from("secret_chats")
      .select("*").or(`user_a.eq.${myUid},user_b.eq.${myUid}`).order("last_message_at", { ascending: false });
    if (!stopped) callback(data || []);
  }

  refetch();
  const channel = supabase
    .channel(uniqueChannelName(`secret-chats-${myUid}`))
    .on("postgres_changes", { event: "*", schema: "public", table: "secret_chats" }, refetch)
    .subscribe();

  return () => { stopped = true; supabase.removeChannel(channel); };
}

/** واچ پیام‌های یه گفتگوی مخفی خاص؛ خودش رمزگشایی هم می‌کنه، فقط متن ساده به callback می‌ده */
export function watchSecretMessages(secretChatId, aesKey, callback) {
  let stopped = false;

  async function decryptAll(rows) {
    const out = [];
    for (const row of rows) {
      try {
        const body = await decryptText(aesKey, row.ciphertext, row.iv, row.salt, { chatId: secretChatId, senderId: row.sender_id });
        out.push({ id: row.id, senderId: row.sender_id, body, createdAt: row.created_at });
      } catch {
        out.push({ id: row.id, senderId: row.sender_id, body: "⚠️ این پیام قابل رمزگشایی نیست", createdAt: row.created_at, broken: true });
      }
    }
    return out;
  }

  async function refetch() {
    const { data } = await supabase.from("secret_chat_messages")
      .select("*").eq("secret_chat_id", secretChatId).order("created_at", { ascending: true }).limit(500);
    if (stopped) return;
    const decrypted = await decryptAll(data || []);
    if (!stopped) callback(decrypted);
  }

  refetch();
  const channel = supabase
    .channel(uniqueChannelName(`secret-messages-${secretChatId}`))
    .on("postgres_changes", { event: "*", schema: "public", table: "secret_chat_messages", filter: `secret_chat_id=eq.${secretChatId}` }, refetch)
    .subscribe();

  return () => { stopped = true; supabase.removeChannel(channel); };
}

export async function sendSecretText(secretChatId, aesKey, text) {
  await assertActionAllowed('secret_chat');
  const body = text.trim().slice(0, 2000);
  if (!body) return;
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("جلسه کاربر آماده نیست.");
  const { ciphertext, iv, cryptoVersion, salt } = await encryptText(aesKey, body, { chatId: secretChatId, senderId: uid });
  const { error } = await supabase.rpc("send_secret_message", {
    p_secret_chat_id: secretChatId, p_ciphertext: ciphertext, p_iv: iv, p_crypto_version: cryptoVersion, p_salt: salt,
  });
  if (error) throw error;
}

export async function deleteSecretChat(secretChatId) {
  const { error } = await supabase.from("secret_chats").delete().eq("id", secretChatId);
  if (error) throw error;
}

/** پشتیبان پاک‌سازی خودکار — چون معلوم نیست pg_cron روی پروژه فعال باشه یا نه،
 * هر بار که کاربر لیست گفتگوهای مخفی رو باز می‌کنه، این تابع رو هم صدا می‌زنیم. */
export async function runExpiredCleanup() {
  try { await supabase.rpc("cleanup_expired_secret_chats"); } catch { /* بی‌اهمیت، دفعه‌ی بعد امتحان می‌شه */ }
}


export async function getMySecretFingerprint() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("جلسه کاربر آماده نیست.");
  return getKeyFingerprint(await getMyPublicKeyJwk(uid));
}

export async function getOtherSecretFingerprint(otherUid) {
  const pub = await getOtherPublicKey(otherUid);
  return pub ? getKeyFingerprint(pub) : null;
}

export async function checkOtherKeyChange(otherUid) {
  const myUid = auth.currentUser?.uid;
  if (!myUid || !otherUid) return { changed: false, fingerprint: null };
  const fingerprint = await getOtherSecretFingerprint(otherUid);
  if (!fingerprint) return { changed: false, fingerprint: null };
  const key = `hoviyat-secret-peer-fp-v1:${myUid}:${otherUid}`;
  const previous = localStorage.getItem(key);
  localStorage.setItem(key, fingerprint);
  return { changed: Boolean(previous && previous !== fingerprint), fingerprint, previous };
}

export const SECRET_CHAT_CRYPTO_VERSION = SECRET_CRYPTO_VERSION;
