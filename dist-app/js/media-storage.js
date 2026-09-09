/** Private media pipeline for Hoviyat.
 * Images are resized/re-encoded in-browser; videos are best-effort transcoded
 * with MediaRecorder and safely fall back to the original file when unsupported.
 * Private Storage objects are downloaded through authenticated Supabase calls
 * and exposed to the DOM only as short-lived object URLs.
 */
import { supabase, auth } from "./supabase-init.js";

const objectUrlCache = new Map();
const MAX_IMAGE_EDGE = 1920;
const MAX_VIDEO_BYTES = 45 * 1024 * 1024;

function safeName(name = "file") {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "file";
}

function extForMime(mime, fallback = "bin") {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/webm": "webm", "video/mp4": "mp4" })[mime] || fallback;
}

export async function compressImage(file) {
  if (!file?.type?.startsWith("image/") || file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.82));
  if (!blob || blob.size >= file.size * 0.97) return file;
  return new File([blob], `${safeName(file.name).replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp", lastModified: Date.now() });
}

function chooseVideoMime() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return candidates.find(x => window.MediaRecorder?.isTypeSupported?.(x)) || "";
}

export async function compressVideo(file) {
  if (!file?.type?.startsWith("video/")) return file;
  if (!window.MediaRecorder || !HTMLMediaElement.prototype.captureStream) return file;
  if (file.size < 3 * 1024 * 1024) return file;
  const mime = chooseVideoMime();
  if (!mime) return file;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url; video.muted = true; video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
    const stream = video.captureStream();
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_800_000, audioBitsPerSecond: 96_000 });
    const chunks = [];
    const done = new Promise((resolve, reject) => {
      recorder.ondataavailable = e => e.data?.size && chunks.push(e.data);
      recorder.onerror = () => reject(recorder.error || new Error("Video compression failed"));
      recorder.onstop = resolve;
    });
    recorder.start(1000);
    await video.play();
    await new Promise(resolve => { video.onended = resolve; });
    recorder.stop();
    await done;
    stream.getTracks().forEach(t => t.stop());
    const blob = new Blob(chunks, { type: mime.split(";")[0] });
    if (!blob.size || blob.size >= file.size * 0.92 || blob.size > MAX_VIDEO_BYTES) return file;
    return new File([blob], `${safeName(file.name).replace(/\.[^.]+$/, "")}.webm`, { type: blob.type, lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareMedia(file) {
  if (file?.type?.startsWith("image/")) return compressImage(file);
  if (file?.type?.startsWith("video/")) return compressVideo(file);
  return file;
}

export async function uploadPrivateMedia(bucket, scopeId, file, kind = "media") {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("ابتدا وارد شوید.");
  const prepared = await prepareMedia(file);
  const extension = extForMime(prepared.type, safeName(prepared.name).split(".").pop() || "bin");
  const stem = safeName(prepared.name).replace(/\.[^.]+$/, "");
  const path = `${scopeId}/${Date.now()}_${uid.slice(0, 8)}_${kind}_${stem}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, prepared, {
    cacheControl: "3600",
    contentType: prepared.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  return { path, ref: `storage://${bucket}/${path}`, file: prepared, compressed: prepared !== file };
}

export async function resolvePrivateMedia(ref) {
  if (!ref || !String(ref).startsWith("storage://")) return ref;
  if (objectUrlCache.has(ref)) return objectUrlCache.get(ref);
  const raw = String(ref).slice("storage://".length);
  const slash = raw.indexOf("/");
  if (slash <= 0) return "";
  const bucket = raw.slice(0, slash);
  const path = raw.slice(slash + 1);
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return "";
  const url = URL.createObjectURL(data);
  objectUrlCache.set(ref, url);
  return url;
}

export async function hydrateMediaMessages(messages = []) {
  const out = await Promise.all(messages.map(async m => {
    if (!m?.mediaURL || !String(m.mediaURL).startsWith("storage://")) return m;
    const mediaURL = await resolvePrivateMedia(m.mediaURL);
    return { ...m, mediaURL: mediaURL || m.mediaURL, storageRef: m.mediaURL };
  }));
  return out;
}

export function observePrivateMedia(root = document) {
  const hydrate = async node => {
    if (!node?.querySelectorAll) return;
    const elements = node.matches?.('[src^="storage://"],[data-audio-src^="storage://"]')
      ? [node, ...node.querySelectorAll('[src^="storage://"],[data-audio-src^="storage://"]')]
      : [...node.querySelectorAll('[src^="storage://"],[data-audio-src^="storage://"]')];
    for (const el of elements) {
      const ref = el.getAttribute('src') || el.getAttribute('data-audio-src');
      if (!ref?.startsWith('storage://')) continue;
      const url = await resolvePrivateMedia(ref);
      if (!url) continue;
      if (el.hasAttribute('src')) el.setAttribute('src', url);
      if (el.hasAttribute('data-audio-src')) el.setAttribute('data-audio-src', url);
    }
  };
  hydrate(root);
  const observer = new MutationObserver(mutations => mutations.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && hydrate(n))));
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
