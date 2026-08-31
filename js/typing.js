/**
 * typing.js
 * نشانگر «در حال تایپ...» با Supabase Realtime Broadcast — یک کانال سبک و لحظه‌ای
 * که هیچ‌چیزی در دیتابیس ذخیره نمی‌کند (فقط یک پیام کوتاه بین کاربران باز این
 * گفتگو رد و بدل می‌شود)، پس نیازی به تغییر schema یا RLS نداشت.
 */
import { supabase, auth } from "./supabase-init.js";

const SEND_THROTTLE_MS = 2500;   // حداکثر هر چند وقت یک‌بار پینگ «در حال تایپ» بفرست
const STOP_AFTER_MS = 3000;      // اگر ۳ ثانیه پینگ جدیدی نیامد، یعنی طرف مقابل دست از تایپ کشیده

function topicFor(kind, id) {
  return `typing:${kind}:${id}`;
}

/**
 * وصل‌شدن به کانال تایپِ یک گفتگوی خصوصی/گروهی. onTyping(true/false) صدا زده می‌شود.
 * خروجی یک آبجکت با دو متد است: ping() برای اعلام «من دارم تایپ می‌کنم» و stop() برای قطع اتصال.
 */
export function watchTyping(kind, id, onTyping) {
  const myUid = auth.currentUser?.uid;
  const channel = supabase.channel(topicFor(kind, id), { config: { broadcast: { self: false } } });
  let hideTimer = null;

  channel
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      if (!payload || payload.uid === myUid) return;
      onTyping(true);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => onTyping(false), STOP_AFTER_MS);
    })
    .subscribe();

  let lastSentAt = 0;
  function ping() {
    const now = Date.now();
    if (now - lastSentAt < SEND_THROTTLE_MS) return;
    lastSentAt = now;
    channel.send({ type: "broadcast", event: "typing", payload: { uid: myUid } });
  }

  function stop() {
    clearTimeout(hideTimer);
    supabase.removeChannel(channel);
  }

  return { ping, stop };
}
