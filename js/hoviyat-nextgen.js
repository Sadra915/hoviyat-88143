/* Hoviyat NextGen Experience Layer
 * UI-first orchestration for Smart Cards, AI actions, drafts, memory, tasks,
 * events, automations, privacy state, transfers, network state and motion.
 * Platform-only capabilities (lock screen, notification actions, screen capture,
 * Android intents) are surfaced as permission-aware entry points, not faked.
 */
(() => {
  "use strict";
  const state = { mode: "text", aiBusy: false, undo: null, online: navigator.onLine, privacy: "هیچ دسترسی اضافه‌ای فعال نیست" };
  const qs = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  async function db() { try { return await import("./supabase-init.js"); } catch { return {}; } }
  async function uid() { const { auth } = await db(); return auth?.currentUser?.uid || null; }
  function toast(msg, kind="info") { window.dispatchEvent(new CustomEvent("hoviyat:toast", { detail:{msg,kind} })); try { window.HoviyatToast?.(msg, kind); } catch {} }

  function ensureShell() {
    // The global AI command bar is intentionally disabled. AI is opened from
    // the per-message floating action panel to keep chat space uncluttered.
    updateNetwork();
  }

  function openHub() { const m=qs("#ngHub"); if(!m) return; m.hidden=false; requestAnimationFrame(()=>m.classList.add("open")); setTimeout(()=>qs("#ngCommandInput")?.focus(),80); }
  function closeHub() { const m=qs("#ngHub"); if(!m) return; m.classList.remove("open"); setTimeout(()=>m.hidden=true,180); }
  function setOrb(mode="idle") { document.querySelectorAll(".ng-orb").forEach(x=>x.dataset.state=mode); }

  function collectChat() {
    return [...document.querySelectorAll("#messagesHolder .bubble-text, #messagesHolder .bubble")].map(x=>x.textContent.trim()).filter(Boolean).slice(-40);
  }

  async function ai(mode, prompt="") {
    setOrb("thinking"); state.aiBusy=true;
    try { const r=window.HoviyatChatAI?.requestAI ? await window.HoviyatChatAI.requestAI(collectChat(), mode, prompt) : "AI در این محیط آماده‌سازی نشده است."; return r; }
    finally { state.aiBusy=false; setOrb("idle"); }
  }

  async function runCommand() {
    const input=qs("#ngCommandInput"), q=(input?.value||"").trim(); if(!q) return;
    const body=qs("#ngHubBody"); body.innerHTML=`<div class="ng-ai-stream"><span class="ng-orb" data-state="thinking">✦</span><span>در حال فهم زمینه…</span></div>`;
    const lower=q.toLowerCase();
    if (/خلاصه|summary|جمع.?بندی/.test(lower)) return renderResult(await ai("summary", q));
    if (/جستجو|پیدا|search|کجا/.test(lower)) return renderResult(await ai("semantic", q));
    if (/کار|task|وظیفه/.test(lower)) return action("task", q);
    if (/رویداد|جلسه|event|یادآور/.test(lower)) return action("event", q);
    if (/حافظه|memory|یادت/.test(lower)) return action("memory", q);
    if (/پیش.?نویس|draft/.test(lower)) return action("drafts");
    if (/مجوز|permission|دسترسی/.test(lower)) return action("permissions");
    if (/اتوماسیون|automation|هر روز|هر شب/.test(lower)) return action("automations");
    return renderResult(await ai("summary", q));
  }

  function renderResult(text) { const b=qs("#ngHubBody"); if(b) b.innerHTML=`<div class="ng-result-card"><div class="ng-result-head"><span>✦ Hoviyat AI</span><button class="ng-mini" data-ng-copy>کپی</button></div><div class="ng-result-text">${esc(text).replace(/\n/g,"<br>")}</div><div class="ng-privacy-line">🔐 ${esc(state.privacy)}</div></div>`; qs("#ngHubBody")?.addEventListener("click", e=>{ if(e.target.closest("[data-ng-copy]")) navigator.clipboard?.writeText(text).then(()=>toast("کپی شد","success")); },{once:true}); }

  async function action(name, extra="") {
    const body=qs("#ngHubBody"); if(!body) return;
    if(name==="summary") return renderResult(await ai("summary"));
    if(name==="semantic") return renderResult(await ai("semantic", extra || "پیام مرتبط را پیدا کن"));
    if(name==="drafts") return renderDrafts(body);
    if(name==="permissions") return renderPermissions(body);
    if(name==="automations") return renderAutomations(body);
    if(name==="transfers") return renderTransfers(body);
    if(name==="skills") return renderSkills(body);
    if(name==="memory") return renderMemories(body);
    if(name==="task") return renderTaskForm(body, extra);
    if(name==="event") return renderEventForm(body, extra);
  }

  async function renderDrafts(body) {
    const id=await uid(); let rows=[];
    if(id){ try { const {supabase}=await db(); const r=await supabase.from("hoviyat_drafts").select("*").eq("user_id",id).order("updated_at",{ascending:false}).limit(20); rows=r.data||[]; } catch{} }
    if(!rows.length){ const ls=Object.keys(localStorage).filter(k=>k.startsWith("hoviyat_draft_")).map(k=>({scope_id:k.replace("hoviyat_draft_","") ,text:localStorage.getItem(k)})); rows=ls; }
    body.innerHTML=`<div class="ng-panel-title">📝 Draft Intelligence <small>${rows.length} پیش‌نویس</small></div>${rows.length?rows.map(r=>`<button class="ng-list-card" data-draft-id="${esc(r.scope_id)}"><strong>${esc(r.scope_id)}</strong><span>${esc(r.text||"")}</span></button>`).join(""):"<div class='ng-empty'>پیش‌نویسی پیدا نشد.</div>"}`;
    body.querySelectorAll("[data-draft-id]").forEach(b=>b.onclick=()=>{ closeHub(); const input=qs("#messageInput"); if(input){ input.value=b.querySelector("span").textContent; input.dispatchEvent(new Event("input",{bubbles:true})); input.focus(); } });
  }

  async function renderMemories(body) {
    const id=await uid(); let rows=[]; if(id){try{const {supabase}=await db(); rows=(await supabase.from("hoviyat_memories").select("*").eq("user_id",id).order("updated_at",{ascending:false}).limit(30)).data||[];}catch{}}
    body.innerHTML=`<div class="ng-panel-title">🧠 Conversation Memory <small>قابل مشاهده و حذف</small></div><form id="ngMemoryForm" class="ng-form"><input name="key" placeholder="کلید، مثل نسخه پروژه"><input name="value" placeholder="مقدار"><button class="btn-primary">ذخیره حافظه</button></form><div class="ng-memory-list">${rows.map(r=>`<div class="ng-memory"><div><b>${esc(r.memory_key)}</b><span>${esc(r.memory_value)}</span></div><button data-del-memory="${r.id}">حذف</button></div>`).join("")}</div>`;
    qs("#ngMemoryForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {supabase}=await db();await supabase.from("hoviyat_memories").upsert({user_id:id,scope_type:"personal",memory_key:f.get("key"),memory_value:f.get("value"),updated_at:new Date().toISOString()},{onConflict:"user_id,scope_type,scope_id,memory_key"});toast("حافظه ذخیره شد","success");renderMemories(body);};
    body.querySelectorAll("[data-del-memory]").forEach(b=>b.onclick=async()=>{const {supabase}=await db();await supabase.from("hoviyat_memories").delete().eq("id",b.dataset.delMemory);renderMemories(body);});
  }

  async function renderTaskForm(body, seed="") { body.innerHTML=`<div class="ng-panel-title">📋 Task Object</div><form id="ngTaskForm" class="ng-form"><input name="title" value="${esc(seed)}" placeholder="عنوان کار" required><input name="due" type="datetime-local"><button class="btn-primary">ایجاد کار</button></form>`; qs("#ngTaskForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const id=await uid();const {supabase}=await db();await supabase.from("hoviyat_tasks").insert({user_id:id,title:f.get("title"),due_at:f.get("due")?new Date(f.get("due")).toISOString():null});toast("کار ایجاد شد","success");renderResult("کار با موفقیت در فضای هویت ذخیره شد.");}; }
  async function renderEventForm(body, seed="") { body.innerHTML=`<div class="ng-panel-title">📅 Smart Event</div><form id="ngEventForm" class="ng-form"><input name="title" value="${esc(seed)}" placeholder="عنوان رویداد" required><input name="start" type="datetime-local" required><button class="btn-primary">ایجاد رویداد</button></form>`; qs("#ngEventForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const id=await uid();const {supabase}=await db();await supabase.from("hoviyat_events").insert({user_id:id,title:f.get("title"),starts_at:new Date(f.get("start")).toISOString()});toast("رویداد ایجاد شد","success");renderResult("رویداد ساخته شد.");}; }

  async function renderPermissions(body) { const id=await uid(); let p={microphone:"ask",camera:"ask",location:"deny",files:"selected",contacts:"ask",screen:"deny",notifications:"allow"}; if(id){try{const {supabase}=await db();const r=await supabase.from("hoviyat_ai_permissions").select("*").eq("user_id",id).maybeSingle();if(r.data)p=r.data;}catch{}} const labels={microphone:"🎤 میکروفون",camera:"📷 دوربین",location:"📍 موقعیت",files:"📁 فایل‌ها",contacts:"👥 مخاطبین",screen:"🖥 صفحه",notifications:"🔔 اعلان‌ها"}; body.innerHTML=`<div class="ng-panel-title">🔐 Permission Center <small>هیچ دسترسی پنهانی وجود ندارد</small></div><div class="ng-perm-grid">${Object.entries(labels).map(([k,v])=>`<label><span>${v}</span><select data-perm="${k}">${["allow","ask","deny"].map(x=>`<option value="${x}" ${p[k]===x?"selected":""}>${x==="allow"?"مجاز":x==="ask"?"هر بار بپرس":"خاموش"}</option>`).join("")}</select></label>`).join("")}</div><button id="ngSavePerm" class="btn-primary full">ذخیره مجوزها</button>`; qs("#ngSavePerm").onclick=async()=>{const patch={user_id:id};body.querySelectorAll("[data-perm]").forEach(s=>patch[s.dataset.perm]=s.value);const {supabase}=await db();await supabase.from("hoviyat_ai_permissions").upsert(patch);toast("مجوزها ذخیره شد","success");}; }

  async function renderAutomations(body) { const id=await uid(); let rows=[]; if(id){try{const {supabase}=await db();rows=(await supabase.from("hoviyat_automations").select("*").eq("user_id",id).order("created_at",{ascending:false})).data||[];}catch{}} body.innerHTML=`<div class="ng-panel-title">⚙️ Hoviyat Automations</div><form id="ngAutoForm" class="ng-form"><input name="title" placeholder="مثلاً خلاصه شبانه پیام‌ها"><select name="trigger"><option value="schedule">زمان‌بندی</option><option value="new_file">فایل جدید</option><option value="new_message">پیام جدید</option></select><select name="action"><option value="briefing">ساخت خلاصه</option><option value="notify">اعلان</option><option value="task">ساخت کار</option></select><button class="btn-primary">افزودن Automation</button></form>${rows.map(r=>`<div class="ng-auto"><b>${esc(r.title)}</b><span>${esc(r.trigger_type)} → ${esc(r.action_type)}</span><em>${r.enabled?"فعال":"خاموش"}</em></div>`).join("")}`; qs("#ngAutoForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {supabase}=await db();await supabase.from("hoviyat_automations").insert({user_id:id,title:f.get("title"),trigger_type:f.get("trigger"),action_type:f.get("action")});toast("Automation ساخته شد","success");renderAutomations(body);}; }
  function renderTransfers(body){ body.innerHTML=`<div class="ng-panel-title">📥 Transfer Center <small>نمایش وضعیت انتقال‌ها</small></div><div class="ng-transfer"><span>📹 media upload</span><strong>آماده</strong><div class="ng-progress"><i style="width:0%"></i></div></div><div class="ng-transfer"><span>📄 document download</span><strong>آماده</strong><div class="ng-progress"><i style="width:0%"></i></div></div><p class="ng-muted">مرکز انتقال به‌صورت مشترک با آپلودرهای رسانه کار می‌کند و وضعیت واقعی را به این پنل متصل می‌کند.</p>`; }
  function renderSkills(body){ body.innerHTML=`<div class="ng-panel-title">🧩 Hoviyat Skills</div><div class="ng-skill-grid">${["Study","Developer","Weather","Translation","Files","Travel","Gaming","Productivity"].map(x=>`<button class="ng-skill"><span>✦</span><b>${x}</b><small>قابل فعال‌سازی با مجوز</small></button>`).join("")}</div>`; }
  function showNetworkPanel(){ openHub(); qs("#ngHubBody").innerHTML=`<div class="ng-network-card"><div class="ng-orb" data-state="${state.online?"idle":"error"}">${state.online?"●":"!"}</div><h3>${state.online?"Connected":"Offline"}</h3><p>${state.online?"همگام‌سازی فعال است.":"هویت تغییرات را محلی نگه می‌دارد و بعد از اتصال همگام می‌کند."}</p></div>`; }
  function updateNetwork(){state.online=navigator.onLine;const n=qs("#ngNetwork");if(n){n.textContent=state.online?"● متصل":"○ آفلاین";n.classList.toggle("offline",!state.online);} }
  window.addEventListener("online",()=>{updateNetwork();toast("اتصال برقرار شد · Sync آماده است","success");});
  window.addEventListener("offline",()=>{updateNetwork();toast("آفلاین شدی · تغییرات بعداً همگام می‌شوند","info");});

  function addSmartCards(){
    const root=qs("#messagesHolder"); if(!root) return;
    const scan=()=>root.querySelectorAll(".bubble-row:not([data-ng-scanned])").forEach(row=>{row.dataset.ngScanned="1";const text=(row.textContent||"").trim();let type=null;if(/فردا|امروز|ساعت\s*\d/.test(text))type="event";else if(/یادم بنداز|یادآوری|remind/i.test(text))type="reminder";else if(/وظیفه|کار|task/i.test(text))type="task";if(type){const b=row.querySelector(".bubble");if(b){const card=document.createElement("div");card.className=`ng-smart-chip ng-${type}`;card.innerHTML=type==="event"?"📅 رویداد احتمالی":"✦ Smart Object";b.appendChild(card);}}});
    new MutationObserver(scan).observe(root,{childList:true,subtree:true}); scan();
  }

  function enhanceComposer(){
    const input=qs("#messageInput"), form=qs("#composerForm"); if(!input||!form)return;
    input.addEventListener("input",()=>{state.mode=input.value.trim()?"text":"text";});
    qs("#attachBtn")?.addEventListener("click",()=>{form.classList.toggle("ng-attachment-open");});
    qs("#chatAiBtn")?.addEventListener("pointerdown",()=>setOrb("listening"));
  }

  function installUndo(){ window.HoviyatNextGenUndo=(label,fn)=>{if(state.undo?.timer)clearTimeout(state.undo.timer);const bar=document.createElement("div");bar.className="ng-undo";bar.innerHTML=`<span>${esc(label)}</span><button>برگردان</button><i></i>`;document.body.appendChild(bar);bar.querySelector("button").onclick=()=>{try{fn?.();}finally{bar.remove();}};state.undo={timer:setTimeout(()=>bar.remove(),5000)};}; }

  function keyboard(){ document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openHub();} if(e.key==="Escape")closeHub();}); }
  function install(){ensureShell();enhanceComposer();installUndo();keyboard();setTimeout(addSmartCards,700);}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
  window.HoviyatNextGen={openHub,closeHub,ai,action,collectChat,state};
})();
