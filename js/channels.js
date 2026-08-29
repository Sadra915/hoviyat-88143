/**
 * channels.js
 * لایه داده کانال‌ها: ساخت کانال، عضویت/لغو عضویت، پست‌گذاری (فقط ادمین)، جستجوی کانال عمومی.
 * (نسخه Supabase)
 */
import { supabase, auth, uniqueChannelName } from "./supabase-init.js";

/** نام فایل کاربر می‌تواند کاراکترهای ناامن برای مسیر Storage داشته باشد؛ پاک‌سازی می‌شود. */
function sanitizeFilename(name) {
  const cleaned = String(name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.slice(-60) || "file";
}

function mapChannel(row) {
  return {
    id: row.id, kind: "channel", type: "channel", name: row.name, description: row.description,
    photoURL: row.photo_url, ownerId: row.owner_id, admins: row.admins || [],
    subscribers: row.subscribers || [], isPublic: row.is_public, verified: !!row.verified,
    lastMessage: row.last_message, lastMessageAt: row.last_message_at, createdAt: row.created_at,
  };
}

function mapPost(row) {
  return {
    id: row.id, senderId: row.sender_id, type: row.type, body: row.body,
    mediaURL: row.media_url, reactions: row.reactions || {}, createdAt: row.created_at,
  };
}

export async function createChannel(name, description, isPublic) {
  const me = auth.currentUser;
  const { data, error } = await supabase.from("channels").insert({
    name: name.trim(), description: (description || "").trim(),
    owner_id: me.uid, admins: [me.uid], subscribers: [me.uid], is_public: !!isPublic,
    last_message: "کانال ساخته شد 📢",
  }).select().single();
  if (error) throw error;
  return data.id;
}

export function watchMyChannels(callback) {
  const me = auth.currentUser;
  let stopped = false;

  async function refetch() {
    const { data } = await supabase.from("channels")
      .select("*").contains("subscribers", [me.uid]).order("last_message_at", { ascending: false });
    if (!stopped) callback((data || []).map(mapChannel));
  }

  refetch();
  const channel = supabase
    .channel(uniqueChannelName(`channels-list-${me.uid}`))
    .on("postgres_changes", { event: "*", schema: "public", table: "channels" }, refetch)
    .subscribe();

  return () => { stopped = true; supabase.removeChannel(channel); };
}

/** جستجوی کانال‌های عمومی بر اساس اسم (سمت کلاینت فیلتر می‌شود، برای اپ‌های بزرگ‌تر بعداً ایندکس جستجو لازم است) */
export async function searchPublicChannels(term) {
  const { data } = await supabase.from("channels").select("*").eq("is_public", true).limit(100);
  const all = (data || []).map(mapChannel);
  const t = term.trim().toLowerCase();
  return t ? all.filter(c => c.name.toLowerCase().includes(t)) : all;
}

export function watchChannelPosts(channelId, callback) {
  let stopped = false;

  async function refetch() {
    const { data } = await supabase.from("channel_posts")
      .select("*").eq("channel_id", channelId).order("created_at", { ascending: true }).limit(300);
    if (!stopped) callback((data || []).map(mapPost));
  }

  refetch();
  const channel = supabase
    .channel(uniqueChannelName(`channel-posts-${channelId}`))
    .on("postgres_changes", { event: "*", schema: "public", table: "channel_posts", filter: `channel_id=eq.${channelId}` }, refetch)
    .subscribe();

  return () => { stopped = true; supabase.removeChannel(channel); };
}

export async function postChannelText(channelId, text) {
  const body = text.trim();
  if (!body) return;
  const { error } = await supabase.rpc("post_channel_message", { p_channel_id: channelId, p_type: "text", p_body: body });
  if (error) throw error;
}

export async function postChannelImage(channelId, file) {
  const path = `${channelId}/${Date.now()}_${sanitizeFilename(file.name)}`;
  const { error: upErr } = await supabase.storage.from("channel-media").upload(path, file);
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from("channel-media").getPublicUrl(path);
  const { error } = await supabase.rpc("post_channel_message", { p_channel_id: channelId, p_type: "image", p_media_url: pub.publicUrl });
  if (error) throw error;
}

export async function subscribeChannel(channelId) {
  const { error } = await supabase.rpc("subscribe_channel", { p_channel_id: channelId });
  if (error) throw error;
}

export async function unsubscribeChannel(channelId) {
  const { error } = await supabase.rpc("unsubscribe_channel", { p_channel_id: channelId });
  if (error) throw error;
}

export async function promoteChannelAdmin(channelId, uid) {
  const { error } = await supabase.rpc("promote_channel_admin", { p_channel_id: channelId, p_uid: uid });
  if (error) throw error;
}

export function isChannelAdmin(channel) {
  return (channel.admins || []).includes(auth.currentUser?.uid);
}

export async function getChannel(channelId) {
  const { data } = await supabase.from("channels").select("*").eq("id", channelId).maybeSingle();
  return data ? mapChannel(data) : null;
}

/** ویرایش نام/توضیحات کانال — فقط ادمین‌ها اجازه دارند (توسط تریگر _channels_guard چک می‌شود) */
export async function updateChannelInfo(channelId, { name, description }) {
  const patch = {};
  if (name !== undefined) patch.name = name.trim();
  if (description !== undefined) patch.description = description.trim();
  const { error } = await supabase.from("channels").update(patch).eq("id", channelId);
  if (error) throw error;
}

/** حذف کامل کانال (فقط سازنده/owner) */
export async function deleteChannel(channelId) {
  const { error } = await supabase.from("channels").delete().eq("id", channelId);
  if (error) throw error;
}

/** آپلود عکس پروفایل کانال — فقط ادمین (سیاست insert باکت channel-media همین الان هم فقط ادمین‌ها را مجاز می‌داند) */
export async function updateChannelPhoto(channelId, file) {
  const path = `${channelId}/avatar_${Date.now()}_${sanitizeFilename(file.name)}`;
  const { error: upErr } = await supabase.storage.from("channel-media").upload(path, file);
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from("channel-media").getPublicUrl(path);
  const { error } = await supabase.from("channels").update({ photo_url: pub.publicUrl }).eq("id", channelId);
  if (error) throw error;
  return pub.publicUrl;
}

/** گزارش یک پست کانال به پنل ادمین */
export async function reportChannelPost(channelId, post, reason) {
  const { error } = await supabase.from("reports").insert({
    reporter_id: auth.currentUser.uid,
    reason: reason || "بدون دلیل مشخص",
    target_type: "channel_post",
    target_id: post.id,
    context_id: channelId,
    content_preview: (post.type === "text" ? post.body : `[${post.type}]`)?.slice(0, 200),
  });
  if (error) throw error;
}

/** درخواست تیک آبی برای یک کانال — فقط ادمین‌های همان کانال می‌توانند بفرستند */
export async function requestChannelVerification(channelId, message) {
  const { error } = await supabase.rpc("submit_verification_request", {
    p_target_type: "channel", p_target_id: channelId, p_message: message,
  });
  if (error) throw error;
}
