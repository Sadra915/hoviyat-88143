/** HOVIYAT Saved Messages */
import { supabase, auth, uniqueChannelName } from './supabase-init.js';
import { toast } from './identity.js';
import { resolvePrivateMedia } from './media-storage.js';
import { assertActionAllowed } from './restrictions.js';

const $ = s => document.querySelector(s);
let stopRealtime = null;
let cache = [];

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function kindLabel(k) { return k === 'group' ? 'گروه' : k === 'channel' ? 'کانال' : 'گفتگوی خصوصی'; }
function preview(row) {
  if (row.message_type === 'image') return '📷 عکس';
  if (row.message_type === 'video') return '🎬 ویدیو';
  if (row.message_type === 'voice') return '🎙 پیام صوتی';
  if (row.message_type === 'sticker') return '🧩 استیکر';
  return row.body || 'پیام ذخیره‌شده';
}

export async function saveMessage(sourceType, sourceId, messageId, note = '') {
  await assertActionAllowed('save_messages');
  const { error } = await supabase.rpc('save_message', {
    p_source_type: sourceType, p_source_id: String(sourceId), p_message_id: messageId, p_note: note,
  });
  if (error) throw error;
  toast('پیام در پیام‌های ذخیره‌شده قرار گرفت ✓');
  if (!$('#view-saved')?.hidden) await loadSavedMessages();
}

export async function unsaveMessage(row) {
  const { error } = await supabase.rpc('unsave_message', {
    p_source_type: row.source_type, p_source_id: row.source_id, p_message_id: row.message_id,
  });
  if (error) throw error;
  cache = cache.filter(x => x.id !== row.id);
  renderSavedList();
  toast('از پیام‌های ذخیره‌شده حذف شد.');
}

async function hydrateMedia(row) {
  if (!row?.media_url || !row.media_url.startsWith('storage://')) return row;
  try { return { ...row, resolved_media_url: await resolvePrivateMedia(row.media_url) }; }
  catch { return row; }
}

export async function loadSavedMessages() {
  if (!auth.currentUser) return;
  const { data, error } = await supabase.rpc('get_saved_messages', { p_limit: 500 });
  if (error) throw error;
  cache = await Promise.all((data || []).map(hydrateMedia));
  renderSavedList();
}

function renderSavedList() {
  const holder = $('#savedMessagesHolder');
  if (!holder) return;
  const query = ($('#savedSearchInput')?.value || '').trim().toLowerCase();
  const rows = cache.filter(r => !query || [r.body, r.note, r.sender_name, kindLabel(r.source_type)].some(v => String(v || '').toLowerCase().includes(query)));
  holder.innerHTML = rows.length ? rows.map(row => {
    const media = row.resolved_media_url || row.media_url || '';
    let content = `<div class="saved-message-text">${esc(preview(row))}</div>`;
    if (row.message_type === 'image' && media) content = `<img class="saved-media" src="${esc(media)}" alt="عکس ذخیره‌شده" loading="lazy">`;
    else if (row.message_type === 'video' && media) content = `<video class="saved-media" src="${esc(media)}" controls playsinline preload="metadata"></video>`;
    else if (row.message_type === 'voice' && media) content = `<audio class="saved-audio" src="${esc(media)}" controls preload="none"></audio>`;
    return `<article class="saved-card" data-saved-id="${esc(row.id)}">
      <div class="saved-card-head"><div><strong>${esc(row.sender_name || 'کاربر')}</strong><span>${kindLabel(row.source_type)} · ${new Date(row.created_at).toLocaleString('fa-IR')}</span></div><button class="icon-btn saved-remove" title="حذف از ذخیره‌ها" aria-label="حذف" data-id="${esc(row.id)}">×</button></div>
      <div class="saved-card-content">${content}</div>
      ${row.note ? `<div class="saved-note">📝 ${esc(row.note)}</div>` : ''}
      <div class="saved-card-foot"><span>ذخیره شده ${new Date(row.created_at).toLocaleDateString('fa-IR')}</span><button class="btn-outline tiny saved-remove-text" data-id="${esc(row.id)}">حذف</button></div>
    </article>`;
  }).join('') : `<div class="saved-empty"><div class="saved-empty-icon">🔖</div><strong>${query ? 'نتیجه‌ای پیدا نشد' : 'هنوز پیامی ذخیره نکرده‌ای'}</strong><span>${query ? 'عبارت دیگری را امتحان کن.' : 'روی یک پیام نگه‌دار و «ذخیره» را بزن.'}</span></div>`;
  holder.querySelectorAll('.saved-remove,.saved-remove-text').forEach(btn => btn.addEventListener('click', async () => {
    const row = cache.find(x => x.id === btn.dataset.id);
    if (!row) return;
    btn.disabled = true;
    try { await unsaveMessage(row); } catch (e) { btn.disabled = false; toast(e.message || 'حذف ناموفق بود.'); }
  }));
}

export function initSavedMessages() {
  $('#savedSearchInput')?.addEventListener('input', renderSavedList);
  $('#savedRefreshBtn')?.addEventListener('click', () => loadSavedMessages().catch(e => toast(e.message || 'بارگذاری ناموفق بود.')));
  if (stopRealtime) stopRealtime();
  const uid = auth.currentUser?.uid;
  if (uid) {
    const ch = supabase.channel(uniqueChannelName(`saved-${uid}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_messages', filter: `user_id=eq.${uid}` }, () => loadSavedMessages().catch(()=>{}))
      .subscribe();
    stopRealtime = () => supabase.removeChannel(ch);
  }
  return () => { stopRealtime?.(); stopRealtime = null; };
}
