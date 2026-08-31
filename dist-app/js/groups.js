/**
 * groups.js
 * لایه داده گروه‌ها: ساخت گروه، عضویت/خروج، ارسال و دریافت پیام گروهی، مدیریت ادمین.
 * (نسخه Supabase — عملیات مرکب از طریق توابع RPC تعریف‌شده در supabase/schema.sql)
 */
import { supabase, auth, uniqueChannelName, waitForAuthReady } from "./supabase-init.js";

/** نام فایل کاربر می‌تواند کاراکترهای ناامن برای مسیر Storage داشته باشد؛ پاک‌سازی می‌شود. */
function sanitizeFilename(name) {
  const cleaned = String(name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.slice(-60) || "file";
}

const DEFAULT_GROUP_PERMISSIONS = {
  send_messages: true, forward: true, media: true, stickers_gifs: true,
  links: true, view_members: true, add_users: true,
};

function mapGroup(row) {
  return {
    id: row.id, kind: "group", type: "group", name: row.name, description: row.description || "",
    rules: row.rules || "", inviteCode: row.invite_code, maxMembers: row.max_members,
    isPublic: !!row.is_public, pinnedMessageId: row.pinned_message_id,
    photoURL: row.photo_url, permissions: { ...DEFAULT_GROUP_PERMISSIONS, ...(row.permissions || {}) },
    ownerId: row.owner_id, admins: row.admins || [], members: row.members || [],
    memberInfo: row.member_info || {}, unreadCounts: row.unread_counts || {},
    lastMessage: row.last_message, lastMessageAt: row.last_message_at,
    lastSenderId: row.last_sender_id, createdAt: row.created_at,
    isBlocked: !!row.is_blocked, blockedReason: row.blocked_reason || "", blockedAt: row.blocked_at,
  };
}

function mapMessage(row) {
  return {
    id: row.id, senderId: row.sender_id, senderName: row.sender_name, type: row.type,
    body: row.body, mediaURL: row.media_url, duration: row.duration, waveform: row.waveform || [],
    reactions: row.reactions || {}, createdAt: row.created_at, replyTo: row.reply_to || null,
  };
}

/** ساخت گروه جدید؛ سازنده به‌صورت خودکار ادمین و عضو می‌شود. برمی‌گرداند: groupId */
export async function createGroup(name, memberUsers, opts = {}) {
  const { data, error } = await supabase.rpc("create_group", {
    p_name: name.trim(), p_member_ids: memberUsers.map(u => u.uid),
  });
  if (error) throw error;
  if (opts.isPublic || opts.maxMembers) {
    const patch = {};
    if (opts.isPublic) patch.is_public = true;
    if (opts.maxMembers) patch.max_members = opts.maxMembers;
    await supabase.from("groups").update(patch).eq("id", data.id);
  }
  return data.id;
}

/** پیوستن به گروه با کد دعوت */
export async function joinGroupByCode(code) {
  const { data, error } = await supabase.rpc("join_group_by_code", { p_code: code.trim() });
  if (error) throw error;
  return mapGroup(data);
}

/** جستجوی گروه‌های عمومی (قابل جستجو برای همه، حتی غیرعضو) */
export async function searchPublicGroups(term) {
  let q = supabase.from("groups").select("*").eq("is_public", true).limit(20);
  if (term) q = q.ilike("name", `%${term}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapGroup);
}

export function watchMyGroups(callback) {
  const me = auth.currentUser;
  let stopped = false;

  async function refetch() {
    const { data } = await supabase.from("groups")
      .select("*").contains("members", [me.uid]).order("last_message_at", { ascending: false });
    if (!stopped) callback((data || []).map(mapGroup));
  }

  refetch();
  const channel = supabase
    .channel(uniqueChannelName(`groups-list-${me.uid}`))
    .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, refetch)
    .subscribe();

  return () => { stopped = true; supabase.removeChannel(channel); };
}

export function watchGroupMessages(groupId, callback) {
  let stopped = false;

  async function refetch() {
    const { data } = await supabase.from("group_messages")
      .select("*").eq("group_id", groupId).order("created_at", { ascending: true }).limit(300);
    if (!stopped) callback((data || []).map(mapMessage));
  }

  refetch();
  const channel = supabase
    .channel(uniqueChannelName(`group-messages-${groupId}`))
    .on("postgres_changes", { event: "*", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` }, refetch)
    .subscribe();

  return () => { stopped = true; supabase.removeChannel(channel); };
}

export async function sendGroupText(groupId, text, replyTo = null) {
  const body = text.trim();
  if (!body) return;
  const { error } = await supabase.rpc("send_group_message", {
    p_group_id: groupId, p_type: "text", p_body: body, p_reply_to: replyTo,
  });
  if (error) throw error;
}

export async function sendGroupSticker(groupId, sticker, replyTo = null) {
  const { error } = await supabase.rpc("send_group_message", {
    p_group_id: groupId, p_type: "sticker", p_body: sticker, p_reply_to: replyTo,
  });
  if (error) throw error;
}

export async function deleteGroupMessage(groupId, messageId) {
  const { error } = await supabase.from("group_messages").delete().eq("id", messageId).eq("group_id", groupId);
  if (error) throw error;
}

export async function sendGroupImage(groupId, file) {
  const path = `${groupId}/${Date.now()}_${sanitizeFilename(file.name)}`;
  const { error: upErr } = await supabase.storage.from("group-media").upload(path, file);
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from("group-media").getPublicUrl(path);
  const { error } = await supabase.rpc("send_group_message", { p_group_id: groupId, p_type: "image", p_media_url: pub.publicUrl });
  if (error) throw error;
}

export async function sendGroupVoice(groupId, blob, durationSec, waveform) {
  const path = `${groupId}/voice_${Date.now()}.webm`;
  const { error: upErr } = await supabase.storage.from("group-media").upload(path, blob);
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from("group-media").getPublicUrl(path);
  const { error } = await supabase.rpc("send_group_message", {
    p_group_id: groupId, p_type: "voice", p_media_url: pub.publicUrl,
    p_duration: durationSec, p_waveform: waveform || [],
  });
  if (error) throw error;
}

export async function toggleGroupReaction(groupId, messageId, emoji) {
  await supabase.rpc("toggle_group_reaction", { p_group_id: groupId, p_message_id: messageId, p_emoji: emoji });
}

export async function markGroupRead(groupId) {
  await supabase.rpc("mark_group_read", { p_group_id: groupId });
}

export async function addGroupMember(groupId, user) {
  const { error } = await supabase.rpc("add_group_member", { p_group_id: groupId, p_uid: user.uid });
  if (error) throw error;
}

export async function removeGroupMember(groupId, uid) {
  const { error } = await supabase.rpc("remove_group_member", { p_group_id: groupId, p_uid: uid });
  if (error) throw error;
}

export async function leaveGroup(groupId) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("ابتدا وارد حساب شوید.");
  return removeGroupMember(groupId, uid);
}

export async function promoteGroupAdmin(groupId, uid) {
  const { error } = await supabase.rpc("promote_group_admin", { p_group_id: groupId, p_uid: uid });
  if (error) throw error;
}

export function isGroupAdmin(group) {
  return (group.admins || []).includes(auth.currentUser?.uid);
}

export async function getGroup(groupId) {
  const { data } = await supabase.from("groups").select("*").eq("id", groupId).maybeSingle();
  return data ? mapGroup(data) : null;
}

/** ویرایش نام/توضیحات گروه — فقط ادمین‌ها اجازه دارند (توسط تریگر _groups_guard در دیتابیس چک می‌شود) */
export async function updateGroupInfo(groupId, { name, description, rules }) {
  const patch = {};
  if (name !== undefined) patch.name = name.trim();
  if (description !== undefined) patch.description = description.trim();
  if (rules !== undefined) patch.rules = rules.trim();
  const { error } = await supabase.from("groups").update(patch).eq("id", groupId);
  if (error) throw error;
}

export async function pinGroupMessage(groupId, messageId) {
  const { error } = await supabase.from("groups").update({ pinned_message_id: messageId }).eq("id", groupId);
  if (error) throw error;
}
export async function unpinGroupMessage(groupId) {
  const { error } = await supabase.from("groups").update({ pinned_message_id: null }).eq("id", groupId);
  if (error) throw error;
}

/** ساخت یه کد دعوت تازه (کد قبلی دیگه کار نمی‌کنه) */
export async function regenerateInviteCode(groupId) {
  const code = Math.random().toString(36).slice(2, 10);
  const { error } = await supabase.from("groups").update({ invite_code: code }).eq("id", groupId);
  if (error) throw error;
  return code;
}

/** گزارش خودِ گروه (نه یه پیام خاص) به پنل ادمین */
export async function reportGroup(groupId, groupName, reason) {
  await waitForAuthReady();
  const { error } = await supabase.from("reports").insert({
    reporter_id: auth.currentUser?.uid,
    reason: reason || "بدون دلیل مشخص",
    target_type: "group",
    target_id: groupId,
    content_preview: groupName,
  });
  if (error) throw error;
}

/** گزارش یک پیام گروهی به پنل ادمین */
export async function reportGroupMessage(groupId, message, reason) {
  await waitForAuthReady();
  const { error } = await supabase.from("reports").insert({
    reporter_id: auth.currentUser?.uid,
    reason: reason || "بدون دلیل مشخص",
    target_type: "group_message",
    target_id: message.id,
    context_id: groupId,
    content_preview: (message.type === "text" ? message.body : `[${message.type}]`)?.slice(0, 200),
  });
  if (error) throw error;
}

/** آمار ساده‌ی گروه: تعداد پیام‌ها (برای نمایش در اطلاعات گروه) */
export async function getGroupMessageCount(groupId) {
  const { count } = await supabase.from("group_messages")
    .select("id", { count: "exact", head: true }).eq("group_id", groupId);
  return count || 0;
}

/** حذف کامل گروه (فقط سازنده/owner — چک واقعی در سیاست حذف دیتابیس است) */
export async function deleteGroup(groupId) {
  const { error } = await supabase.from("groups").delete().eq("id", groupId);
  if (error) throw error;
}

/** ذخیره‌ی تنظیمات دسترسی اعضا — فقط ادمین (چک واقعی در تریگر _groups_guard) */
export async function updateGroupPermissions(groupId, permissions) {
  const { error } = await supabase.from("groups").update({ permissions }).eq("id", groupId);
  if (error) throw error;
}

/** آپلود عکس پروفایل گروه و ذخیره‌ی آدرسش — فقط ادمین */
export async function updateGroupPhoto(groupId, file) {
  const path = `${groupId}/avatar_${Date.now()}_${sanitizeFilename(file.name)}`;
  const { error: upErr } = await supabase.storage.from("group-media").upload(path, file);
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from("group-media").getPublicUrl(path);
  const { error } = await supabase.from("groups").update({ photo_url: pub.publicUrl }).eq("id", groupId);
  if (error) throw error;
  return pub.publicUrl;
}

/** فقط برای پنل ادمین: همه‌ی گروه‌ها (نه فقط گروه‌هایی که خودش عضو است) */
export async function adminListAllGroups() {
  const { data, error } = await supabase.from("groups").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data || []).map(mapGroup);
}

/** مسدود/آزاد کردن یک گروه — فقط ادمین (چک واقعی سمت سرور در تابع RPC است) */
export async function adminSetGroupBlocked(groupId, blocked, reason) {
  const { error } = await supabase.rpc("admin_set_group_blocked", { p_group_id: groupId, p_blocked: blocked, p_reason: reason || null });
  if (error) throw error;
}

export { mapGroup };
