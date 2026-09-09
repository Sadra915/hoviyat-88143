import { supabase, auth } from './supabase-init.js';
import { uploadPrivateMedia, resolvePrivateMedia } from './media-storage.js';
import { assertActionAllowed } from './restrictions.js';

let state = { stories: [], profiles: {}, currentIndex: 0, openUser: null };
let unsub = null;
const $ = (s, r=document) => r.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nameOf = p => p?.display_name || p?.username || 'کاربر';

export async function loadStories(holder) {
  if (!holder || !auth.currentUser?.uid) return;
  const { data, error } = await supabase.from('stories').select('id,user_id,media_url,media_type,caption,created_at,expires_at,author_name,author_username,author_photo_url,author_verified').gt('expires_at', new Date().toISOString()).is('archived_at', null).order('created_at', { ascending: true }).limit(300);
  if (error) throw error;
  state.stories = data || [];
  const ids = [...new Set([...state.stories.map(s => s.user_id), auth.currentUser?.uid].filter(Boolean))];
  if (ids.length) {
    const { data: profiles } = await supabase.from('profiles').select('id,username,display_name,photo_url,verified').in('id', ids);
    state.profiles = Object.fromEntries((profiles || []).map(p => [p.id, p]));
  }
  renderRail(holder);
  return state.stories;
}

export function watchStories(holder, onChange) {
  if (unsub) unsub();
  const channel = supabase.channel(`stories-live-${auth.currentUser?.uid || 'guest'}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, async () => { try { await loadStories(holder); onChange?.(state.stories); } catch {} })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'story_reactions' }, async () => { if (state.openUser) renderViewerStats().catch(()=>{}); })
    .subscribe();
  unsub = () => { try { channel.unsubscribe(); } catch {} };
  return unsub;
}

function storyAvatar(p, ring=true) {
  const media = p?.photo_url ? `<img src="${esc(p.photo_url)}" alt="">` : `<span>${esc(nameOf(p).trim().slice(0,1) || '؟')}</span>`;
  return `<div class="story-avatar ${ring ? 'has-story' : ''}">${media}</div>`;
}

function renderRail(holder) {
  const uid = auth.currentUser?.uid;
  const grouped = [];
  const byUser = new Map();
  for (const s of state.stories) {
    if (!byUser.has(s.user_id)) { byUser.set(s.user_id, []); grouped.push({ userId: s.user_id, stories: [] }); }
    byUser.get(s.user_id).push(s);
  }
  grouped.sort((a,b) => (a.userId === uid ? -1 : 0) - (b.userId === uid ? -1 : 0));
  holder.innerHTML = `
    <div class="stories-head"><div><strong>استوری‌ها</strong><small>عکس و ویدیوهای ۲۴ ساعته</small></div><button id="addStoryBtn" class="story-add-btn">＋ استوری من</button></div>
    <div class="stories-rail">
      <button class="story-create-card" id="storyCreateCard">${storyAvatar(state.profiles[uid], false)}<span>استوری من</span><b>＋</b></button>
      ${grouped.filter(x => x.userId !== uid).map(x => {
        const latest = x.stories[x.stories.length - 1] || {}; const p = state.profiles[x.userId] || {display_name:latest.author_name, username:latest.author_username, photo_url:latest.author_photo_url, verified:latest.author_verified};
        return `<button class="story-user-card" data-story-user="${esc(x.userId)}">${storyAvatar(p)}<span>${esc(nameOf(p))}</span><small>${x.stories.length} استوری</small></button>`;
      }).join('')}
    </div>`;
  holder.querySelector('#addStoryBtn')?.addEventListener('click', openComposer);
  holder.querySelector('#storyCreateCard')?.addEventListener('click', () => {
    if (byUser.has(uid)) openViewer(uid, 0); else openComposer();
  });
  holder.querySelectorAll('[data-story-user]').forEach(btn => btn.addEventListener('click', () => openViewer(btn.dataset.storyUser, 0)));
}

function getUserStories(uid) { return state.stories.filter(s => s.user_id === uid); }

async function markViewed(story) {
  const uid = auth.currentUser?.uid;
  if (!uid || !story || story.user_id === uid) return;
  await supabase.from('story_views').upsert({ story_id: story.id, user_id: uid, viewed_at: new Date().toISOString() }, { onConflict: 'story_id,user_id' });
}

async function openViewer(uid, index=0) {
  const stories = getUserStories(uid);
  if (!stories.length) return;
  state.openUser = uid;
  state.currentIndex = Math.max(0, Math.min(index, stories.length - 1));
  const modal = $('#storyViewerModal');
  modal.hidden = false;
  await renderViewer();
}

async function renderViewer() {
  const uid = state.openUser;
  const stories = getUserStories(uid);
  const story = stories[state.currentIndex];
  if (!story) return closeViewer();
  const currentStory = stories[state.currentIndex];
  const p = state.profiles[uid] || {display_name:currentStory?.author_name, username:currentStory?.author_username, photo_url:currentStory?.author_photo_url, verified:currentStory?.author_verified};
  const viewer = $('#storyViewerModal');
  const media = story.media_type === 'video'
    ? `<video id="storyViewerMedia" src="" autoplay playsinline controls></video>`
    : story.media_type === 'image'
      ? `<img id="storyViewerMedia" src="" alt="${esc(story.caption || 'استوری')}" loading="eager">`
      : `<div id="storyViewerMedia" class="story-text-stage">${esc(story.caption || '')}</div>`;
  viewer.querySelector('.story-viewer-content').innerHTML = `
    <div class="story-progress">${stories.map((_,i)=>`<i class="${i <= state.currentIndex ? 'done' : ''}"></i>`).join('')}</div>
    <header class="story-viewer-head">${storyAvatar(p,false)}<div><strong>${esc(nameOf(p))}</strong><small>${new Date(story.created_at).toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'})}</small></div><button id="storyCloseBtn" class="icon-btn">×</button></header>
    <div class="story-stage"><button id="storyPrevBtn" class="story-nav prev">‹</button>${media}<button id="storyNextBtn" class="story-nav next">›</button></div>
    ${story.caption ? `<p class="story-caption">${esc(story.caption)}</p>` : ''}
    <div class="story-actions" id="storyActions"></div>
    <div class="story-reply-row" ${uid === auth.currentUser?.uid ? 'hidden' : ''}><input id="storyReplyInput" maxlength="1000" placeholder="پاسخ به استوری…"><button id="storyReplyBtn" class="btn-primary small">ارسال</button></div>
    <div id="storyStats" class="story-stats"></div>`;
  const mediaEl = viewer.querySelector('#storyViewerMedia');
  const resolved = await resolvePrivateMedia(story.media_url);
  if (resolved && mediaEl && 'src' in mediaEl) mediaEl.src = resolved;
  viewer.querySelector('#storyCloseBtn').onclick = closeViewer;
  viewer.querySelector('#storyPrevBtn').onclick = () => move(-1);
  viewer.querySelector('#storyNextBtn').onclick = () => move(1);
  viewer.querySelector('#storyReplyBtn')?.addEventListener('click', sendReply);
  viewer.querySelector('#storyReplyInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendReply(); } });
  await markViewed(story);
  await renderViewerStats();
}

async function renderViewerStats() {
  const holder = $('#storyStats');
  if (!holder || !state.openUser) return;
  const story = getUserStories(state.openUser)[state.currentIndex];
  if (!story) return;
  const [{ data: reactions }, { data: views }] = await Promise.all([
    supabase.from('story_reactions').select('user_id,reaction').eq('story_id', story.id).order('created_at', { ascending: true }),
    supabase.from('story_views').select('user_id').eq('story_id', story.id),
  ]);
  const liked = (reactions || []).some(r => r.user_id === auth.currentUser?.uid);
  const mine = state.openUser === auth.currentUser?.uid;
  holder.innerHTML = mine
    ? `<div class="story-owner-stats"><button id="storyLikesBtn">❤️ ${reactions?.length || 0} لایک</button><button id="storyViewsBtn">👁 ${views?.length || 0} بازدید</button></div>`
    : `<button id="storyLikeBtn" class="story-like-btn ${liked ? 'liked' : ''}">${liked ? '❤️ لایک شد' : '♡ لایک'} <span>${reactions?.length || 0}</span></button>`;
  $('#storyLikesBtn')?.addEventListener('click', () => openPeopleList('لایک‌کنندگان', reactions?.map(x => x.user_id) || []));
  $('#storyViewsBtn')?.addEventListener('click', () => openPeopleList('بازدیدکنندگان', views?.map(x => x.user_id) || []));
  $('#storyLikeBtn')?.addEventListener('click', async () => {
    const current = (reactions || []).find(r => r.user_id === auth.currentUser?.uid);
    if (current) await supabase.from('story_reactions').delete().eq('story_id', story.id).eq('user_id', auth.currentUser.uid);
    else await supabase.from('story_reactions').insert({ story_id: story.id, user_id: auth.currentUser.uid, reaction: '❤️' });
    await renderViewerStats();
  });
}

async function sendReply() {
  const input = $('#storyReplyInput');
  const body = input?.value.trim();
  const story = getUserStories(state.openUser)[state.currentIndex];
  if (!body || !story || !auth.currentUser) return;
  const { error } = await supabase.from('story_replies').insert({ story_id: story.id, sender_id: auth.currentUser.uid, body });
  if (error) { alert(error.message); return; }
  input.value = '';
  input.placeholder = 'پاسخ ارسال شد ✓';
}

async function openPeopleList(title, ids) {
  const uniq = [...new Set(ids)];
  const modal = $('#storyPeopleModal');
  modal.hidden = false;
  const holder = $('#storyPeopleHolder');
  if (!uniq.length) { holder.innerHTML = '<p class="story-empty">هنوز کسی نیست.</p>'; return; }
  const current = getUserStories(state.openUser)[state.currentIndex];
  const reactions = title.includes('لایک') ? (await supabase.from('story_reactions').select('user_id,actor_name,actor_username,actor_photo_url').eq('story_id', current.id)).data || [] : [];
  const views = title.includes('بازدید') ? (await supabase.from('story_views').select('user_id,actor_name,actor_username,actor_photo_url').eq('story_id', current.id)).data || [] : [];
  const source = title.includes('لایک') ? reactions : views;
  const map = Object.fromEntries(source.map(p => [p.user_id,{display_name:p.actor_name,username:p.actor_username,photo_url:p.actor_photo_url}]));
  holder.innerHTML = `<h3>${esc(title)}</h3>` + uniq.map(id => {
    const p = map[id] || {};
    return `<div class="story-person">${storyAvatar(p,false)}<div><strong>${esc(nameOf(p))}</strong><small>@${esc(p.username || 'user')}</small></div></div>`;
  }).join('');
}

function move(delta) {
  const stories = getUserStories(state.openUser);
  const next = state.currentIndex + delta;
  if (next < 0 || next >= stories.length) return closeViewer();
  state.currentIndex = next;
  renderViewer();
}
function closeViewer() { $('#storyViewerModal').hidden = true; state.openUser = null; }

function openComposer() {
  const modal = $('#storyComposerModal');
  if (!modal) return;
  modal.hidden = false;
  modal.classList.add('open');
  $('#storyMediaInput').value = '';
  $('#storyCaptionInput').value = '';
  setTimeout(() => $('#storyCaptionInput')?.focus(), 80);
}

function closeComposer() {
  const modal = $('#storyComposerModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.hidden = true;
}

async function createStory() {
  const file = $('#storyMediaInput').files?.[0] || null;
  const caption = $('#storyCaptionInput').value.trim();
  await assertActionAllowed('story');
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  if (!file && !caption) return alert('برای استوری، عکس، ویدیو یا متن وارد کن.');
  if (file && !file.type.startsWith('image/') && !file.type.startsWith('video/')) return alert('فقط عکس یا ویدیو مجاز است.');
  const btn = $('#storyPublishBtn'); btn.disabled = true; btn.textContent = 'در حال انتشار…';
  try {
    const me = state.profiles[uid] || {};
    const mediaType = file ? (file.type.startsWith('video/') ? 'video' : 'image') : 'text';
    const storyId = crypto.randomUUID();
    let mediaRef = '';
    if (file) {
      const upload = await uploadPrivateMedia('story-media', `${uid}/${storyId}`, file, mediaType);
      mediaRef = upload.ref;
    }
    const { error } = await supabase.from('stories').insert({ id: storyId, user_id: uid, author_name: nameOf(me), author_username: me.username || '', author_photo_url: me.photo_url || '', author_verified: !!me.verified, media_type: mediaType, caption, media_url: mediaRef }).select('id').single();
    if (error) {
      if (mediaRef) {
        try { await supabase.storage.from('story-media').remove([mediaRef.replace('storage://story-media/','')]); } catch {}
      }
      throw error;
    }
    closeComposer();
    await loadStories($('#storiesHolder'));
  } catch (err) { alert(err.message || 'انتشار استوری ناموفق بود.'); }
  finally { btn.disabled = false; btn.textContent = 'انتشار استوری'; }
}

export async function initStories() {
  const holder = $('#storiesHolder');
  if (!holder) return;
  try { await loadStories(holder); } catch (e) { console.warn('Stories unavailable', e); renderRail(holder); }
  watchStories(holder);
  $('#storyMediaPickerBtn')?.addEventListener('click', () => $('#storyMediaInput')?.click());
  $('#storyPublishBtn')?.addEventListener('click', createStory);
  $('#storyComposerClose')?.addEventListener('click', closeComposer);
  $('#storyComposerModal')?.addEventListener('click', e => { if (e.target.id === 'storyComposerModal') closeComposer(); });
  $('#storyMediaInput')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    const picker = e.target.closest('.story-file-picker');
    if (picker && file) {
      picker.classList.add('has-file');
      const label = picker.querySelector('strong');
      if (label) label.textContent = file.name;
    }
  });
  $('#storyPeopleClose')?.addEventListener('click', () => $('#storyPeopleModal').hidden = true);
  $('#storyViewerModal')?.addEventListener('click', e => { if (e.target.id === 'storyViewerModal') closeViewer(); });
}

export async function loadNotifications(holder) {
  if (!holder || !auth.currentUser) return;
  const { data, error } = await supabase.from('notifications').select('id,type,target_id,metadata,read_at,created_at,actor_id').order('created_at',{ascending:false}).limit(60);
  if (error) throw error;
  const ids = [...new Set((data||[]).map(n=>n.actor_id).filter(Boolean))];
  let map = {};
  if (ids.length) { const {data: p} = await supabase.from('profiles').select('id,display_name,username,photo_url').in('id',ids); map = Object.fromEntries((p||[]).map(x=>[x.id,x])); }
  const unread = (data||[]).filter(n => !n.read_at).length;
  const badge = document.querySelector('#notificationBadge'); if (badge) { badge.textContent = unread > 99 ? '99+' : String(unread); badge.hidden = unread === 0; }
  holder.innerHTML = (data||[]).map(n => {
    const actor = map[n.actor_id]; const icon = n.type==='story_like'?'❤️':n.type==='story_reply'?'💬':n.type==='story_view'?'👁':'🔔';
    const text = n.type==='story_like' ? `${nameOf(actor)} استوری‌ات را لایک کرد` : n.type==='story_reply' ? `${nameOf(actor)} به استوری‌ات پاسخ داد: ${n.metadata?.preview||''}` : n.type==='story_view' ? `${nameOf(actor)} استوری‌ات را دید` : (n.metadata?.text||'اعلان جدید');
    return `<button class="notification-row ${n.read_at?'read':''}" data-notification="${esc(n.id)}" data-story="${esc(n.target_id||'')}"><b>${icon}</b><span><strong>${esc(text)}</strong><small>${new Date(n.created_at).toLocaleString('fa-IR')}</small></span></button>`;
  }).join('') || '<p class="story-empty">اعلان جدیدی نداری.</p>';
  holder.querySelectorAll('[data-notification]').forEach(b => b.addEventListener('click', async () => {
    await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('id',b.dataset.notification);
    const sid=b.dataset.story; if(sid) { const sIndex=state.stories.findIndex(s=>s.id===sid); if(sIndex>=0) openViewer(state.stories[sIndex].user_id,sIndex); }
    b.classList.add('read');
  }));
}

export function cleanupStories() { unsub?.(); unsub = null; }
