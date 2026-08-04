/**
 * chat.js
 * لایه داده گفتگوها: پیدا کردن کاربر با یوزرنیم، ساخت/باز کردن چت خصوصی،
 * لیست لحظه‌ای چت‌ها، ارسال پیام (متن/عکس/ویس)، ری‌اکشن.
 * (نسخه Supabase)
 */
import { supabase, auth, uniqueChannelName, waitForAuthReady } from "./supabase-init.js";
import { mapProfile } from "./auth.js";

/** شناسه قطعی و یکتای چت خصوصی بین دو کاربر (مستقل از ترتیب) — دقیقاً مثل نسخه قبلی */
function chatIdFor(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

/** نام فایل کاربر می‌تواند هر کاراکتری (فاصله، فارسی، #, ?, ٪ و...) داشته باشد که
 * می‌تواند مسیر Storage یا URL نهایی را خراب کند؛ اینجا به یک نام امن تبدیل می‌شود. */
function sanitizeFilename(name) {
  const cleaned = String(name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.slice(-60) || "file";
}

function mapMessage(row) {
  return {
    id: row.id, senderId: row.sender_id, type: row.type, body: row.body,
    mediaURL: row.media_url, duration: row.duration, waveform: row.waveform || [],
    reactions: row.reactions || {}, createdAt: row.created_at, replyTo: row.reply_to || null,
  };
}

function mapChat(row) {
  return {
    id: row.id, members: row.members, memberInfo: row.member_info,
    lastMessage: row.last_message, lastMessageAt: row.last_message_at,
    lastSenderId: row.last_sender_id, unreadCounts: row.unread_counts,
    lastRead: row.last_read || {}, createdAt: row.created_at,
  };
}

/**
 * امنیتی: دیگر هیچ راهی برای «لیست کردن همه کاربران» وجود ندارد — این دقیقاً
 * همان نشتی بود که هرکس بدون داشتن یوزرنیم/آیدی کسی می‌توانست پروفایل کامل
 * (شماره تلفن و...) هر کاربر دیگری را ببیند. به‌جایش دو راه امن وجود دارد:
 *  ۱) getMyContacts(): فقط کسانی که از قبل با آن‌ها چت خصوصی دارید (این داده
 *     از روی چت‌های خودتان می‌آید، نه از جدول profiles، پس هیچ خطری ندارد).
 *  ۲) findUserByUsername(): جستجوی دقیق با یوزرنیم، از طریق تابع سرور
 *     search_profile_by_username که فقط فیلدهای عمومی/بی‌خطر را برمی‌گرداند.
 */
export async function getMyContacts() {
  const me = auth.currentUser;
  const { data } = await supabase.from("chats").select("members, member_info").contains("members", [me.uid]);
  const seen = new Map();
  (data || []).forEach(row => {
    const otherUid = row.members.find(m => m !== me.uid);
    if (!otherUid || seen.has(otherUid)) return;
    const info = row.member_info?.[otherUid] || {};
    seen.set(otherUid, { uid: otherUid, username: info.username || "", displayName: info.displayName || "", photoURL: info.photoURL || "" });
  });
  return [...seen.values()];
}

export async function findUserByUsername(username) {
  const uname = username.trim().toLowerCase().replace(/^@/, "");
  const { data, error } = await supabase.rpc("search_profile_by_username", { p_username: uname });
  if (error) throw error;
  const row = data && data[0];
  return row ? mapProfile({ id: row.id, username: row.username, display_name: row.display_name, photo_url: row.photo_url, bio: row.bio, verified: row.verified, online: row.online, phone: "" }) : null;
}

/** باز کردن یا ساختن چت خصوصی با کاربر دیگر، برمی‌گرداند: chatId */
export async function openOrCreateChat(otherUser) {
  const me = auth.currentUser;
  const { data: myRow } = await supabase.from("profiles").select("*").eq("id", me.uid).maybeSingle();
  const myData = myRow || { username: "", display_name: "", photo_url: "" };
  const chatId = chatIdFor(me.uid, otherUser.uid);

  const { data: existing } = await supabase.from("chats").select("id").eq("id", chatId).maybeSingle();
  if (!existing) {
    const { error } = await supabase.from("chats").insert({
      id: chatId,
      members: [me.uid, otherUser.uid],
      member_info: {
        [me.uid]: { username: myData.username, displayName: myData.display_name, photoURL: myData.photo_url || "" },
        [otherUser.uid]: { username: otherUser.username, displayName: otherUser.displayName, photoURL: otherUser.photoURL || "" },
      },
      unread_counts: { [me.uid]: 0, [otherUser.uid]: 0 },
    });
    // اگر هم‌زمان تب دیگری همین چت را ساخت، خطای duplicate key بی‌اهمیت است
    if (error && error.code !== "23505") throw error;
  }
  return chatId;
}

/** گوش‌دادن لحظه‌ای به لیست چت‌های کاربر جاری، مرتب‌شده بر اساس آخرین پیام */
export function watchMyChats(callback) {
  const me = auth.currentUser;
  let stopped = false;

  async function refetch() {
    const { data } = await supabase.from("chats")
      .select("*")
      .contains("members", [me.uid])
      .order("last_message_at", { ascending: false });
    if (!stopped) callback((data || []).map(mapChat));
  }

  refetch();
  const channel = supabase
    .channel(uniqueChannelName(`chats-list-${me.uid}`))
    .on("postgres_changes", { event: "*", schema: "public", table: "chats" }, refetch)
    .subscribe();

  return () => { stopped = true; supabase.removeChannel(channel); };
}

/** گوش‌دادن به تغییرات یک ردیف چت مشخص (برای تیک آبی/خواندن لحظه‌ای) — فیلتر
 * روی id تک است، پس برخلاف watchMyChats نیازی به refetch کل لیست نیست. */
export function watchChatMeta(chatId, callback) {
  let stopped = false;

  async function refetch() {
    const { data } = await supabase.from("chats").select("*").eq("id", chatId).maybeSingle();
    if (!stopped && data) callback(mapChat(data));
  }

  refetch();
  const channel = supabase
    .channel(uniqueChannelName(`chat-meta-${chatId}`))
    .on("postgres_changes", { event: "*", schema: "public", table: "chats", filter: `id=eq.${chatId}` }, refetch)
    .subscribe();

  return () => { stopped = true; supabase.removeChannel(channel); };
}

export function watchMessages(chatId, callback) {
  let stopped = false;

  async function refetch() {
    // متن پیام‌ها در دیتابیس رمزنگاری‌شده ذخیره می‌شود؛ خواندن فقط از طریق این
    // تابع سرور ممکن است که هم عضویت را چک می‌کند و هم رمزگشایی را انجام می‌دهد.
    const { data, error } = await supabase.rpc("get_chat_messages", { p_chat_id: chatId });
    if (error) { console.error(error); return; }
    if (!stopped) callback((data || []).map(mapMessage));
  }

  refetch();
  const channel = supabase
    .channel(uniqueChannelName(`chat-messages-${chatId}`))
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `chat_id=eq.${chatId}` }, refetch)
    .subscribe();

  return () => { stopped = true; supabase.removeChannel(channel); };
}

/** صفر کردن تعداد پیام‌های نخوانده برای کاربر جاری، هنگام باز کردن یک چت */
export async function markChatRead(chatId) {
  await supabase.rpc("mark_chat_read", { p_chat_id: chatId });
}

export async function sendTextMessage(chatId, text, replyTo = null) {
  const body = text.trim();
  if (!body) return;
  const { error } = await supabase.rpc("send_chat_message", {
    p_chat_id: chatId, p_type: "text", p_body: body, p_reply_to: replyTo,
  });
  if (error) throw error;
}

export async function sendStickerMessage(chatId, sticker, replyTo = null) {
  const { error } = await supabase.rpc("send_chat_message", {
    p_chat_id: chatId, p_type: "sticker", p_body: sticker, p_reply_to: replyTo,
  });
  if (error) throw error;
}

export async function deleteMessage(chatId, messageId) {
  const { error } = await supabase.from("chat_messages").delete().eq("id", messageId).eq("chat_id", chatId);
  if (error) throw error;
}

export async function sendImageMessage(chatId, file) {
  const path = `${chatId}/${Date.now()}_${sanitizeFilename(file.name)}`;
  const { error: upErr } = await supabase.storage.from("chat-media").upload(path, file);
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from("chat-media").getPublicUrl(path);
  const { error } = await supabase.rpc("send_chat_message", { p_chat_id: chatId, p_type: "image", p_media_url: pub.publicUrl });
  if (error) throw error;
}

/** آپلود پیام صوتی + موج صدای واقعی (آرایه دامنه‌ها که هنگام ضبط استخراج شده) */
export async function sendVoiceMessage(chatId, blob, durationSec, waveform) {
  const path = `${chatId}/voice_${Date.now()}.webm`;
  const { error: upErr } = await supabase.storage.from("chat-media").upload(path, blob);
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from("chat-media").getPublicUrl(path);
  const { error } = await supabase.rpc("send_chat_message", {
    p_chat_id: chatId, p_type: "voice", p_media_url: pub.publicUrl,
    p_duration: durationSec, p_waveform: waveform || [],
  });
  if (error) throw error;
}

export async function toggleReaction(chatId, messageId, emoji) {
  await supabase.rpc("toggle_chat_reaction", { p_chat_id: chatId, p_message_id: messageId, p_emoji: emoji });
}

/** حذف کامل گفتگوی خصوصی (برای هر دو طرف — چون خود گفتگو حذف می‌شود، پیام‌ها هم به‌خاطر cascade پاک می‌شوند) */
export async function deleteChat(chatId) {
  const { error } = await supabase.from("chats").delete().eq("id", chatId);
  if (error) throw error;
}

/** گزارش یک پیام خصوصی به پنل ادمین */
export async function reportMessage(chatId, message, reason) {
  await waitForAuthReady();
  const { error } = await supabase.from("reports").insert({
    reporter_id: auth.currentUser.uid,
    reason: reason || "بدون دلیل مشخص",
    target_type: "chat_message",
    target_id: message.id,
    context_id: chatId,
    content_preview: (message.type === "text" ? message.body : `[${message.type}]`)?.slice(0, 200),
  });
  if (error) throw error;
}

export async function blockUser(otherUid) {
  const { error } = await supabase.from("blocked_users").insert({
    blocker_id: auth.currentUser.uid, blocked_id: otherUid,
  });
  if (error) throw error;
}
export async function unblockUser(otherUid) {
  const { error } = await supabase.from("blocked_users")
    .delete().eq("blocker_id", auth.currentUser.uid).eq("blocked_id", otherUid);
  if (error) throw error;
}
export async function isUserBlocked(otherUid) {
  const { data } = await supabase.from("blocked_users").select("blocked_id")
    .eq("blocker_id", auth.currentUser.uid).eq("blocked_id", otherUid).maybeSingle();
  return !!data;
}

export { chatIdFor };
