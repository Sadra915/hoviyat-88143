/**
 * secret-crypto.js
 * رمزنگاری سرتاسر واقعی (E2E) برای گفتگوی مخفی، با Web Crypto API خودِ مرورگر
 * (بدون هیچ کتابخانه‌ی خارجی).
 *
 * روش کار:
 * - هر کاربر یک جفت کلید ECDH (P-256) دارد. کلید خصوصی فقط در localStorage
 *   همین مرورگر/دستگاه ذخیره می‌شود و هرگز جایی فرستاده نمی‌شود. کلید عمومی
 *   در profiles.secret_pubkey ذخیره می‌شود تا طرف مقابل بتواند آن را بخواند.
 * - وقتی دو نفر گفتگوی مخفی باز می‌کنند، هرکدام با «کلید خصوصی خودش + کلید
 *   عمومی طرف مقابل» یک کلید مشترک AES-GCM می‌سازند (ECDH) — این کلید هرگز
 *   از دستگاه خارج نمی‌شود و سرور هیچ‌وقت آن را نمی‌بیند.
 * - هر پیام قبل از ارسال با همین کلید مشترک رمز می‌شود؛ سرور فقط متن رمزشده
 *   (ciphertext) را ذخیره می‌کند، نه محتوای واقعی.
 *
 * محدودیت شناخته‌شده: چون کلید خصوصی فقط روی همین دستگاه است، اگر localStorage
 * پاک شود یا کاربر دستگاه عوض کند، پیام‌های قبلی برای همیشه غیرقابل‌رمزگشایی
 * می‌شوند — این رفتار عمدی و بخشی از تعریف E2E واقعی است، نه یک باگ.
 */

const KEY_STORAGE = "hoviyat_secret_keypair_v1";

async function generateAndStoreKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]
  );
  const priv = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const pub = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const record = { priv, pub };
  localStorage.setItem(KEY_STORAGE, JSON.stringify(record));
  return record;
}

/** اگه کلید روی این دستگاه نبود، الان می‌سازه؛ در غیر این‌صورت همون قبلی رو برمی‌گردونه */
export async function ensureKeyPair() {
  const stored = localStorage.getItem(KEY_STORAGE);
  if (stored) {
    try { return JSON.parse(stored); } catch { /* خراب بود، دوباره بساز */ }
  }
  return generateAndStoreKeyPair();
}

export async function getMyPublicKeyJwk() {
  const { pub } = await ensureKeyPair();
  return pub;
}

/** آیا این دستگاه اصلاً کلیدی برای گفتگوی مخفی ساخته؟ (بدون ساختن کلید جدید) */
export function hasLocalKeyPair() {
  return !!localStorage.getItem(KEY_STORAGE);
}

async function importPrivateKey(jwk) {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
}
async function importPublicKey(jwk) {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
}

/** ساخت کلید مشترک AES-GCM از کلید خصوصی خودم + کلید عمومی طرف مقابل */
export async function deriveSharedAesKey(otherPublicJwk) {
  const { priv } = await ensureKeyPair();
  const privateKey = await importPrivateKey(priv);
  const publicKey = await importPublicKey(otherPublicJwk);
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function toB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

export async function encryptText(aesKey, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoded);
  return { ciphertext: toB64(cipherBuf), iv: toB64(iv) };
}

export async function decryptText(aesKey, ciphertextB64, ivB64) {
  const iv = fromB64(ivB64);
  const cipherBuf = fromB64(ciphertextB64);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, cipherBuf);
  return new TextDecoder().decode(plainBuf);
}
