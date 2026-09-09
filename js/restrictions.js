import { supabase, auth } from './supabase-init.js';

const DEFAULTS = {
  send_messages: true, send_media: true, send_voice: true, react: true,
  call: true, video_call: true, create_group: true, create_channel: true,
  story: true, forward: true, edit_messages: true, delete_messages: true,
  secret_chat: true, ai: true, add_users: true, profile_edit: true,
  save_messages: true, notifications: true,
};

let cached = { ...DEFAULTS };
let meta = { preset: 'custom', reason: '', expires_at: null, active: false };
let loadedFor = null;

export const RESTRICTION_LABELS = {
  send_messages: 'ارسال پیام', send_media: 'ارسال عکس، ویدیو و فایل', send_voice: 'پیام صوتی',
  react: 'واکنش‌ها', call: 'تماس صوتی', video_call: 'تماس تصویری', create_group: 'ساخت گروه',
  create_channel: 'ساخت کانال', story: 'استوری', forward: 'فوروارد', edit_messages: 'ویرایش پیام',
  delete_messages: 'حذف پیام', secret_chat: 'گفتگوی مخفی', ai: 'Hoviyat AI', add_users: 'دعوت کاربران',
  profile_edit: 'ویرایش پروفایل', save_messages: 'ذخیره پیام', notifications: 'اعلان‌ها',
};

export async function loadMyRestrictions(force = false) {
  const uid = auth.currentUser?.uid;
  if (!uid) return { restrictions: { ...DEFAULTS }, ...meta };
  if (!force && loadedFor === uid) return { restrictions: { ...cached }, ...meta };
  const { data, error } = await supabase.rpc('get_my_restrictions');
  if (error) throw error;
  const row = data || {};
  cached = { ...DEFAULTS, ...(row.restrictions || {}) };
  meta = { preset: row.preset || 'custom', reason: row.reason || '', expires_at: row.expires_at || null, active: !!row.active };
  loadedFor = uid;
  window.dispatchEvent(new CustomEvent('hoviyat:restrictions-changed', { detail: { restrictions: { ...cached }, ...meta } }));
  return { restrictions: { ...cached }, ...meta };
}

export function isActionAllowed(action) {
  return cached[action] !== false;
}

export async function assertActionAllowed(action) {
  try { await loadMyRestrictions(); } catch { /* server remains authoritative */ }
  if (!isActionAllowed(action)) {
    const label = RESTRICTION_LABELS[action] || 'این قابلیت';
    const err = new Error(`${label} برای این حساب توسط مدیریت محدود شده است.`);
    err.code = 'USER_RESTRICTED';
    err.action = action;
    throw err;
  }
}

export function getRestrictionState() {
  return { restrictions: { ...cached }, ...meta };
}

export function clearRestrictionCache() {
  loadedFor = null;
  cached = { ...DEFAULTS };
  meta = { preset: 'custom', reason: '', expires_at: null, active: false };
}
