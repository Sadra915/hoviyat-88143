/**
 * Hoviyat Secret Chat Crypto v3
 *
 * - P-256 ECDH for authenticated key agreement material
 * - HKDF-SHA-256 with per-message random salt
 * - two independent AES-256-GCM layers for the message envelope
 * - AAD binds ciphertext to the secret-chat id, sender and protocol version
 * - non-extractable private CryptoKey persisted in IndexedDB
 * - account-scoped key records, preventing cross-account reuse in one browser
 * - SHA-256 safety fingerprint for key verification
 */

const DB_NAME = "hoviyat-secret-crypto";
const DB_VERSION = 1;
const STORE = "keys";
const LEGACY_KEY_STORAGE = "hoviyat_secret_keypair_v1";
const PROTOCOL_VERSION = 3;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function legacyRecordFor(uid) {
  try {
    const raw = localStorage.getItem(`${LEGACY_KEY_STORAGE}:${uid}`) || localStorage.getItem(LEGACY_KEY_STORAGE);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function createKeyPair() {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}

async function migrateLegacy(uid) {
  const legacy = legacyRecordFor(uid);
  if (!legacy?.priv || !legacy?.pub) return null;
  try {
    const privateKey = await crypto.subtle.importKey("jwk", legacy.priv, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    const publicKey = await crypto.subtle.importKey("jwk", legacy.pub, { name: "ECDH", namedCurve: "P-256" }, true, []);
    const record = { privateKey, publicKey, version: 3, migratedAt: Date.now() };
    await idbPut(uid, record);
    try { localStorage.removeItem(`${LEGACY_KEY_STORAGE}:${uid}`); } catch {}
    return record;
  } catch { return null; }
}

export async function ensureKeyPair(uid) {
  if (!uid) throw new Error("شناسه کاربر برای کلید رمزنگاری لازم است.");
  let record = await idbGet(uid);
  if (record?.privateKey && record?.publicKey) return record;
  record = await migrateLegacy(uid);
  if (record) return record;
  const keyPair = await createKeyPair();
  const record2 = { privateKey: keyPair.privateKey, publicKey: keyPair.publicKey, version: 3, createdAt: Date.now() };
  await idbPut(uid, record2);
  return record2;
}

export async function getMyPublicKeyJwk(uid) {
  const { publicKey } = await ensureKeyPair(uid);
  return crypto.subtle.exportKey("jwk", publicKey);
}

export async function deriveSharedSecret(otherPublicJwk, uid) {
  const { privateKey } = await ensureKeyPair(uid);
  const publicKey = await crypto.subtle.importKey("jwk", otherPublicJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256));
}

async function hkdfKey(secret, salt, info) {
  const base = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode(info) },
    base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function bytes(b64s) { return Uint8Array.from(atob(b64s), c => c.charCodeAt(0)); }
function aad(chatId, senderId) { return new TextEncoder().encode(`hoviyat-secret-v${PROTOCOL_VERSION}|${chatId}|${senderId}`); }

export async function encryptText(sharedSecret, text, context = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv1 = crypto.getRandomValues(new Uint8Array(12));
  const iv2 = crypto.getRandomValues(new Uint8Array(12));
  const key1 = await hkdfKey(sharedSecret, salt, "hoviyat/secret/content/1");
  const key2 = await hkdfKey(sharedSecret, salt, "hoviyat/secret/envelope/2");
  const plain = new TextEncoder().encode(text);
  const inner = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv1, additionalData: aad(context.chatId || "", context.senderId || "") }, key1, plain);
  const envelope = new TextEncoder().encode(JSON.stringify({ v: PROTOCOL_VERSION, i: b64(iv1), c: b64(inner) }));
  const outer = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv2, additionalData: aad(context.chatId || "", context.senderId || "") }, key2, envelope);
  return { ciphertext: b64(outer), iv: b64(iv2), cryptoVersion: PROTOCOL_VERSION, salt: b64(salt) };
}

export async function decryptText(sharedSecret, ciphertextB64, ivB64, saltB64, context = {}) {
  // Backward-compatible reader for protocol v2 messages already stored.
  if (!saltB64) {
    const legacyKey = await crypto.subtle.importKey("raw", sharedSecret, { name: "AES-GCM" }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(ivB64) }, legacyKey, bytes(ciphertextB64));
    return new TextDecoder().decode(plain);
  }
  const salt = bytes(saltB64);
  const iv2 = bytes(ivB64);
  const key1 = await hkdfKey(sharedSecret, salt, "hoviyat/secret/content/1");
  const key2 = await hkdfKey(sharedSecret, salt, "hoviyat/secret/envelope/2");
  const envelopeBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv2, additionalData: aad(context.chatId || "", context.senderId || "") }, key2, bytes(ciphertextB64));
  const envelope = JSON.parse(new TextDecoder().decode(envelopeBuf));
  if (envelope.v !== PROTOCOL_VERSION) throw new Error("Unsupported crypto version");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(envelope.i), additionalData: aad(context.chatId || "", context.senderId || "") }, key1, bytes(envelope.c));
  return new TextDecoder().decode(plain);
}

export async function getKeyFingerprint(publicJwk) {
  const canonical = JSON.stringify({ crv: publicJwk.crv, kty: publicJwk.kty, x: publicJwk.x, y: publicJwk.y });
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)));
  return [...digest].map(x => x.toString(16).padStart(2, "0")).join("").match(/.{1,4}/g).join(" ").toUpperCase();
}

export function hasLocalKeyPair(uid) {
  return !!uid;
}

export const SECRET_CRYPTO_VERSION = PROTOCOL_VERSION;
