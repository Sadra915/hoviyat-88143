/* HOVIYAT NEXT: UI orchestration. No backend rewrite. */
const HV_KEY="hoviyat-next-preferences";
const defaults={theme:"classic",effects:"full",power:"normal",wallpaper:"hoviyat",glass:"balanced",language:"fa",downloads:"wifi",folderSort:"recent",notifications:"smart"};
const qs=s=>document.querySelector(s);
const qsa=s=>[...document.querySelectorAll(s)];
function load(){try{return {...defaults,...JSON.parse(localStorage.getItem(HV_KEY)||"{}")}}catch{return {...defaults}}}
let prefs=load();
function save(){localStorage.setItem(HV_KEY,JSON.stringify(prefs))}
function apply(){
  const html=document.documentElement;
  html.dataset.effects=prefs.effects;html.dataset.power=prefs.power;
  html.dataset.motion=prefs.effects==="minimal"?"reduced":"full";
  html.style.setProperty("--hv-blur",prefs.glass==="strong"?"24px":prefs.glass==="minimal"?"8px":"18px");
  if(prefs.wallpaper==="none") html.classList.add("hv-no-wallpaper"); else html.classList.remove("hv-no-wallpaper");
}
function makeAtmosphere(){
  const chat=qs("#view-chat"); if(!chat||qs("#hvAtmosphere")) return;
  const g=document.createElement("div");g.id="hvAtmosphere";g.className="hv-gradient-atmosphere";g.setAttribute("aria-hidden","true");chat.prepend(g);
}
function makeLatest(){
  const chat=qs("#view-chat"); if(!chat||qs("#hvLatestButton")) return;
  const b=document.createElement("button");b.id="hvLatestButton";b.className="hv-latest";b.hidden=true;b.textContent="↓ پیام‌های جدید";
  b.onclick=()=>{const area=chat.querySelector(".messages-area,.messages-list,.chat-messages");if(area) area.scrollTo({top:area.scrollHeight,behavior:"smooth"});b.hidden=true};chat.appendChild(b);
}
function observeMessages(){
  const holder=qs("#messagesHolder")||qs("#messagesListHolder")||qs(".messages-holder"); if(!holder||holder.dataset.hvObserved)return;
  holder.dataset.hvObserved="1";
  let first=true,lastSender=null;
  const paint=()=>{qsa("#messagesHolder .message-row,#messagesHolder .message,.messages-list .message-row,.messages-list .message").forEach((el,i)=>{
    if(!el.dataset.hvPainted){el.dataset.hvPainted="1";el.classList.add("hv-enter");setTimeout(()=>el.classList.remove("hv-enter"),300)}
    const sender=el.dataset.sender||el.getAttribute("data-sender-id")||"";
    if(sender&&sender===lastSender)el.classList.add("hv-grouped");else if(i)el.classList.add("hv-group-break");
    if(sender)lastSender=sender;
  })};
  new MutationObserver(paint).observe(holder,{childList:true,subtree:true});paint();
}
function scrollPolish(){
  const area=qs("#messagesHolder")||qs(".messages-list"); if(!area||area.dataset.hvScroll)return;
  area.dataset.hvScroll="1";makeLatest();
  area.addEventListener("scroll",()=>{const near=area.scrollHeight-area.scrollTop-area.clientHeight<160;const b=qs("#hvLatestButton");if(b)b.hidden=near}, {passive:true});
}
function presence(){
  const header=qs("#chatHeader")||qs(".chat-header");if(!header||qs("#hvPresence"))return;
  const p=document.createElement("div");p.id="hvPresence";p.className="hv-presence";p.setAttribute("aria-live","polite");header.appendChild(p);
  window.addEventListener("hoviyat:presence",e=>{const d=e.detail||{};p.textContent=d.text||"";p.className="hv-presence "+(d.type||"")});
}
function settingCard(id,title,desc){return `<button class="hv-setting-card" data-hv-panel="${id}"><b>${title}</b><span>${desc}</span></button>`}
function addSettingsHub(){
  const view=qs("#view-settings"),list=view?.querySelector(".settings-list");if(!view||!list||qs("#hvSettingsHub"))return;
  const wrap=document.createElement("div");wrap.id="hvSettingsHub";
  wrap.innerHTML=`<div class="settings-divider"></div><h3 class="settings-subhead">مرکز تنظیمات هویت</h3><div class="hv-settings-grid">
  ${settingCard("appearance","ظاهر و گفتگو","تم، پس‌زمینه، شیشه‌ای و انیمیشن‌ها")}${settingCard("notifications","اعلان‌ها و صدا","پیام، تماس، لرزش و پیش‌نمایش")}
  ${settingCard("data","داده و ذخیره‌سازی","دانلود خودکار، کش و ذخیره انرژی")}${settingCard("folders","پوشه‌های گفتگو","مرتب‌سازی و فیلتر گفتگوها")}
  ${settingCard("privacy","حریم خصوصی","آخرین بازدید، تماس، پیام و رسانه")}${settingCard("devices","دستگاه‌ها","نشست‌ها و خروج از دستگاه‌های دیگر")}
  ${settingCard("language","زبان","فارسی و تنظیمات محلی")}${settingCard("accessibility","دسترسی‌پذیری","حرکت کمتر و کنتراست بهتر")}
  </div><div id="hvSettingsPanel" class="hv-settings-panel" hidden></div>`;
  list.appendChild(wrap);
  wrap.addEventListener("click",e=>{const card=e.target.closest("[data-hv-panel]");if(card)renderPanel(card.dataset.hvPanel)});
}
function renderPanel(type){
  const p=qs("#hvSettingsPanel");if(!p)return;p.hidden=false;
  const options={
    appearance:`<h3>ظاهر و گفتگو</h3><div class="hv-choice"><span>تم</span><select class="hv-select" data-pref="theme"><option value="classic">Classic</option><option value="midnight">Midnight</option><option value="ocean">Ocean</option><option value="forest">Forest</option><option value="sunset">Sunset</option><option value="lavender">Lavender</option><option value="mono">Mono</option></select></div><div class="hv-choice"><span>پس‌زمینه گفتگو</span><select class="hv-select" data-pref="wallpaper"><option value="hoviyat">Hoviyat Atmosphere</option><option value="gradient">Gradient</option><option value="classic">Classic</option><option value="none">خاموش</option></select></div><div class="hv-choice"><span>افکت‌ها</span><select class="hv-select" data-pref="effects"><option value="full">کامل</option><option value="reduced">کاهش‌یافته</option><option value="minimal">حداقل</option></select></div><div class="hv-choice"><span>شدت شیشه</span><select class="hv-select" data-pref="glass"><option value="strong">زیاد</option><option value="balanced">متعادل</option><option value="minimal">کم</option></select></div>`,
    notifications:`<h3>اعلان‌ها و صدا</h3><div class="hv-choice"><span>اعلان هوشمند</span><select class="hv-select" data-pref="notifications"><option value="smart">هوشمند</option><option value="all">همه</option><option value="mentions">فقط مهم‌ها</option><option value="off">خاموش</option></select></div><div class="hv-choice"><span>پیش‌نمایش متن</span><button class="toggle-switch" data-local-toggle="preview" aria-pressed="true"><span class="knob"></span></button></div><div class="hv-choice"><span>صدای ارسال</span><button class="toggle-switch" data-local-toggle="sendSound" aria-pressed="true"><span class="knob"></span></button></div>`,
    data:`<h3>داده و ذخیره‌سازی</h3><div class="hv-choice"><span>دانلود خودکار</span><select class="hv-select" data-pref="downloads"><option value="wifi">فقط Wi‑Fi</option><option value="all">Wi‑Fi و داده همراه</option><option value="off">خاموش</option></select></div><div class="hv-choice"><span>حالت ذخیره انرژی</span><select class="hv-select" data-pref="power"><option value="normal">عادی</option><option value="saving">ذخیره انرژی</option></select></div><div class="hv-choice"><span>پاک‌سازی کش</span><button class="btn-outline small" id="hvClearCache">پاک‌سازی</button></div>`,
    folders:`<h3>پوشه‌های گفتگو</h3><div class="hv-choice"><span>مرتب‌سازی</span><select class="hv-select" data-pref="folderSort"><option value="recent">جدیدترین</option><option value="unread">خوانده‌نشده</option><option value="name">نام</option><option value="custom">سفارشی</option></select></div><p class="settings-hint">پوشه‌ها و فیلترهای نمایشی این نسخه روی دستگاه ذخیره می‌شوند و به هسته پیام‌رسان دست نمی‌زنند.</p>`,
    privacy:`<h3>حریم خصوصی</h3><p class="settings-hint">کنترل‌های امنیتی واقعی در «مرکز امنیت حساب» قرار دارند. این صفحه فقط میانبرهای نمایشی و ترجیحات محلی را مدیریت می‌کند.</p><button class="btn-outline full" id="hvOpenSecurity">باز کردن مرکز امنیت</button>`,
    devices:`<h3>دستگاه‌ها</h3><p class="settings-hint">نشست‌های فعال، دستگاه‌های دیگر و تاریخچه ورود را در مرکز امنیت ببین و نشست‌های غیرضروری را پایان بده.</p><button class="btn-outline full" id="hvOpenSecurity2">مدیریت دستگاه‌ها</button>`,
    language:`<h3>زبان</h3><div class="hv-choice"><span>زبان برنامه</span><select class="hv-select"><option selected>فارسی</option><option disabled>English، به‌زودی</option></select></div>`,
    accessibility:`<h3>دسترسی‌پذیری</h3><div class="hv-choice"><span>حرکت کمتر</span><button class="toggle-switch" data-motion-toggle aria-pressed="false"><span class="knob"></span></button></div><p class="settings-hint">تنظیم سیستم‌عامل «Reduce Motion» نیز به‌صورت خودکار رعایت می‌شود.</p>`
  };
  p.innerHTML=options[type]||"";
  p.querySelectorAll("[data-pref]").forEach(el=>{el.value=prefs[el.dataset.pref]||el.value;el.onchange=()=>{prefs[el.dataset.pref]=el.value;save();apply();}});
  p.querySelector("#hvClearCache")?.addEventListener("click",async()=>{try{if("caches"in window){for(const k of await caches.keys())await caches.delete(k)};localStorage.removeItem("hoviyat-ui-cache");alert("کش محلی پاک شد.")}catch{alert("پاک‌سازی کامل انجام نشد.")}});
  p.querySelector("#hvOpenSecurity")?.addEventListener("click",()=>qs("#openSecurityCenterBtn")?.click());p.querySelector("#hvOpenSecurity2")?.addEventListener("click",()=>qs("#openSecurityCenterBtn")?.click());
  p.querySelector("[data-motion-toggle]")?.addEventListener("click",e=>{const on=e.currentTarget.getAttribute("aria-pressed")==="true";e.currentTarget.setAttribute("aria-pressed",String(!on));document.documentElement.dataset.motion=!on?"reduced":"full"});
}
function bindTheme(){
  const original=window.setTheme; if(typeof original!=="function")return;
  /* no override: existing app theme remains authoritative */
}
function boot(){prefs=load();apply();makeAtmosphere();makeLatest();observeMessages();scrollPolish();presence();addSettingsHub();bindTheme();}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
window.HoviyatNext={prefs,save,apply,renderPanel};
