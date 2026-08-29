/* HOVIYAT ULTIMATE 4.0
 * Additive UX layer: preserves existing Hoviyat modules and adds a self-contained
 * AI/Secret/Experience control center plus 40 feature surfaces and 20 motion presets.
 * No existing message/auth/database functions are replaced.
 */
(() => {
  'use strict';
  const KEY='hoviyat-ultimate-prefs';
  const qs=s=>document.querySelector(s);
  const qsa=s=>[...document.querySelectorAll(s)];
  const defaults={theme:'classic',motion:'full',glass:'balanced',aiEnabled:true,aiAnimation:true,secretAutoDelete:'off',secretBlur:true,emojiMotion:true,power:'normal'};
  let prefs={...defaults};
  try{prefs={...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{}
  const save=()=>localStorage.setItem(KEY,JSON.stringify(prefs));


  const EXTRA_STICKERS=[
    '🫡','🫶','🤌','🤝','🫠','🫣','🫢','🫡','🥹','😶‍🌫️','😮‍💨','🤗','🫡','😈','👻','💀','🤖','👽','🦊','🐼',
    '🐱','🐶','🦁','🐯','🐸','🐵','🦄','🐝','🦋','🌸','🌻','🌙','⭐','🌟','☀️','🌧️','❄️','🔥','💎','🎯',
    '🚀','✈️','🚗','🏆','🥇','🎮','🎧','🎵','🎬','📸','💡','⚡','💯','✅','❌','❗','❓','💬','🧿','🪄'
  ];
  const EXTRA_MOTIONS={
    badgeBounce(el){return el.animate([{transform:'translateY(0)'},{transform:'translateY(-5px)'},{transform:'translateY(0)'}],{duration:420,fill:'both'})},
    softFade(el){return el.animate([{opacity:0},{opacity:1}],{duration:320,fill:'both'})},
    slideUp(el){return el.animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],{duration:360,easing:'ease-out',fill:'both'})},
    slideDown(el){return el.animate([{opacity:0,transform:'translateY(-14px)'},{opacity:1,transform:'translateY(0)'}],{duration:360,easing:'ease-out',fill:'both'})},
    slideLeft(el){return el.animate([{transform:'translateX(12px)',opacity:0},{transform:'translateX(0)',opacity:1}],{duration:340,fill:'both'})},
    slideRight(el){return el.animate([{transform:'translateX(-12px)',opacity:0},{transform:'translateX(0)',opacity:1}],{duration:340,fill:'both'})},
    pulseSoft(el){return el.animate([{transform:'scale(1)'},{transform:'scale(1.035)'},{transform:'scale(1)'}],{duration:600,fill:'both'})},
    rotateIn(el){return el.animate([{opacity:0,transform:'rotate(-5deg) scale(.96)'},{opacity:1,transform:'rotate(0) scale(1)'}],{duration:400,fill:'both'})},
    rotateOut(el){return el.animate([{opacity:1,transform:'rotate(0)'},{opacity:0,transform:'rotate(4deg) scale(.98)'}],{duration:300,fill:'both'})},
    heartBeat(el){return el.animate([{transform:'scale(1)'},{transform:'scale(1.15)'},{transform:'scale(1)'},{transform:'scale(1.08)'},{transform:'scale(1)'}],{duration:700,fill:'both'})},
    sparkle(el){return el.animate([{filter:'brightness(1)'},{filter:'brightness(1.7)'},{filter:'brightness(1)'}],{duration:520,fill:'both'})},
    shakeSoft(el){return el.animate([{transform:'translateX(0)'},{transform:'translateX(-3px)'},{transform:'translateX(3px)'},{transform:'translateX(0)'}],{duration:300,fill:'both'})},
    hoverLift(el){return el.animate([{transform:'translateY(0)'},{transform:'translateY(-3px)'},{transform:'translateY(0)'}],{duration:380,fill:'both'})},
    scaleIn(el){return el.animate([{opacity:0,transform:'scale(.92)'},{opacity:1,transform:'scale(1)'}],{duration:300,fill:'both'})},
    scaleOut(el){return el.animate([{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.94)'}],{duration:260,fill:'both'})},
    elasticIn(el){return el.animate([{transform:'scale(.75)',opacity:0},{transform:'scale(1.08)',opacity:1},{transform:'scale(1)'}],{duration:520,easing:'cubic-bezier(.2,1.4,.4,1)',fill:'both'})},
    glowPulse(el){return el.animate([{boxShadow:'0 0 0 rgba(255,255,255,0)'},{boxShadow:'0 0 18px rgba(255,255,255,.28)'},{boxShadow:'0 0 0 rgba(255,255,255,0)'}],{duration:850,fill:'both'})},
    notificationJiggle(el){return el.animate([{transform:'rotate(0)'},{transform:'rotate(-3deg)'},{transform:'rotate(3deg)'},{transform:'rotate(0)'}],{duration:360,fill:'both'})},
    progressSweep(el){return el.animate([{transform:'translateX(-4px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],{duration:500,fill:'both'})},
    focusRing(el){return el.animate([{outlineOffset:'0px'},{outlineOffset:'4px'},{outlineOffset:'0px'}],{duration:500,fill:'both'})},
    chatNudge(el){return el.animate([{transform:'translateX(0)'},{transform:'translateX(2px)'},{transform:'translateX(0)'}],{duration:260,fill:'both'})}
  };

  const FEATURES=[
    ['ai-chat','🤖','دستیار هوشمند Hoviyat','گفت‌وگوی مستقل با AI و پاسخ‌های استریم‌شونده','AI'],
    ['ai-reply','💬','پیشنهاد پاسخ','پیشنهادهای کوتاه و اختیاری هنگام پاسخ‌دادن','AI'],
    ['ai-summary','🧠','خلاصه‌سازی گفتگو','خلاصه محتوای انتخاب‌شده، بدون دسترسی پیش‌فرض AI به چت','AI'],
    ['ai-rewrite','✍️','بازنویسی متن','رسمی، دوستانه، کوتاه و واضح','AI'],
    ['ai-translate','🌐','ترجمه هوشمند','ترجمه متن انتخاب‌شده','AI'],
    ['ai-extract','🔎','استخراج اطلاعات','لینک‌ها، نکات و موارد مهم','AI'],
    ['ai-history','🗃️','تاریخچه AI','مدیریت و پاک‌سازی تاریخچه دستیار','AI'],
    ['ai-privacy','🛡️','حریم خصوصی AI','ارسال محتوا به AI فقط با اقدام صریح کاربر','AI'],
    ['secret-center','🔐','مرکز گفت‌وگوی مخفی','صفحه مستقل برای تنظیمات و وضعیت امنیتی Secret Chat','Secret'],
    ['secret-timer','⏱️','پیام‌های ناپدیدشونده','مدت‌زمان قابل تنظیم برای Secret Chat','Secret'],
    ['secret-lock','🔒','قفل گفت‌وگوی مخفی','لایه UI برای re-authentication و قفل محلی','Secret'],
    ['secret-media','🖼️','مدیریت رسانه مخفی','کنترل ذخیره و انقضای رسانه','Secret'],
    ['secret-theme','🌑','تم Secret Chat','ظاهر جداگانه و کم‌نور برای فضای مخفی','Secret'],
    ['emoji-burst','✨','Emoji Burst','انفجار ظریف ایموجی هنگام واکنش','Motion'],
    ['emoji-float','🎈','Emoji Float','حرکت شناور ایموجی‌های انتخاب‌شده','Motion'],
    ['emoji-pop','💥','Emoji Pop','ورود/خروج فنری برای ایموجی','Motion'],
    ['message-flow','🫧','Message Flow','ورود نرم پیام‌ها','Motion'],
    ['reaction-spring','❤️','Reaction Spring','انیمیشن فنری واکنش‌ها','Motion'],
    ['typing-orbit','⌨️','Typing Orbit','نشانگر تایپینگ پویا','Motion'],
    ['send-trail','🚀','Send Trail','رد نور بسیار ظریف هنگام ارسال','Motion'],
    ['search-morph','🔍','Search Morph','تبدیل نرم نوار جستجو','Motion'],
    ['modal-spring','🪟','Modal Spring','بازشدن نرم پنجره‌ها','Motion'],
    ['tab-slide','↔️','Tab Slide','جابجایی نرم بین تب‌ها','Motion'],
    ['theme-breathe','🌈','Theme Breathe','تنفس بسیار آرام گرادیان','Motion'],
    ['glass-shimmer','🪟','Glass Shimmer','بازتاب کوتاه روی سطوح Glass','Motion'],
    ['scroll-reactive','📜','Scroll Reactive','واکنش بسیار ظریف پس‌زمینه به اسکرول','Motion'],
    ['presence-pulse','🟢','Presence Pulse','نشانگر حضور زنده','Motion'],
    ['recording-wave','🎙️','Recording Wave','موج ضبط صدا','Motion'],
    ['download-progress','📥','Download Motion','حرکت نرم پیشرفت دانلود','Motion'],
    ['media-lightbox','🖼️','Media Lightbox','نمایش رسانه با ورود نرم','UX'],
    ['message-bookmarks','🔖','Message Bookmarks','ذخیره و دسترسی سریع به پیام‌ها','UX'],
    ['advanced-search','🧭','جستجوی پیشرفته','فیلتر متن، فرستنده، تاریخ و نوع محتوا','UX'],
    ['jump-date','📅','Jump to Date','پرش سریع به تاریخ گفتگو','UX'],
    ['unread-separator','🔵','Unread Separator','جداکننده پیام‌های خوانده‌نشده','UX'],
    ['multi-select','☑️','Multi Select','انتخاب و عملیات گروهی پیام‌ها','UX'],
    ['drafts','📝','Drafts','ذخیره خودکار پیش‌نویس','UX'],
    ['storage-center','💾','Storage Center','نمایش و مدیریت مصرف رسانه','Data'],
    ['notification-center','🔔','Notification Center','تجمیع اعلان‌های مرتبط','Data'],
    ['power-profile','🔋','Power Profiles','Normal / Balanced / Saving / Adaptive','Performance'],
    ['accessibility','♿','Accessibility Center','Reduced Motion، اندازه متن و کنتراست','Performance']
  ];

  const MOTIONS={
    emojiBurst(el){return el.animate([{transform:'scale(.65) rotate(-8deg)',opacity:0},{transform:'scale(1.22) rotate(4deg)',opacity:1},{transform:'scale(1) rotate(0)',opacity:1}],{duration:520,easing:'cubic-bezier(.2,.9,.2,1)',fill:'both'});},
    emojiFloat(el){return el.animate([{transform:'translateY(8px)',opacity:0},{transform:'translateY(-4px)',opacity:1},{transform:'translateY(0)',opacity:1}],{duration:650,easing:'ease-out',fill:'both'});},
    emojiPop(el){return el.animate([{transform:'scale(0)'},{transform:'scale(1.18)'},{transform:'scale(1)'}],{duration:420,easing:'cubic-bezier(.16,1.4,.4,1)',fill:'both'});},
    messageFlow(el){return el.animate([{opacity:0,transform:'translateY(8px) scale(.985)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:280,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'});},
    reactionSpring(el){return el.animate([{transform:'scale(.8)'},{transform:'scale(1.3)'},{transform:'scale(.95)'},{transform:'scale(1)'}],{duration:480,easing:'ease-out',fill:'both'});},
    typingOrbit(el){return el.animate([{transform:'translateX(-3px)'},{transform:'translateX(3px)'},{transform:'translateX(-3px)'}],{duration:900,iterations:Infinity,easing:'ease-in-out'});},
    sendTrail(el){return el.animate([{transform:'translateX(0)',opacity:.35},{transform:'translateX(8px)',opacity:1},{transform:'translateX(0)',opacity:.8}],{duration:360,easing:'ease-out'});},
    searchMorph(el){return el.animate([{transform:'scaleX(.96)',opacity:.75},{transform:'scaleX(1)',opacity:1}],{duration:220,easing:'ease-out'});},
    modalSpring(el){return el.animate([{opacity:0,transform:'translateY(10px) scale(.97)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:260,easing:'cubic-bezier(.2,.9,.2,1)',fill:'both'});},
    tabSlide(el){return el.animate([{transform:'translateX(5px)',opacity:.7},{transform:'translateX(0)',opacity:1}],{duration:220,easing:'ease-out',fill:'both'});},
    themeBreathe(el){return el.animate([{opacity:.78},{opacity:1},{opacity:.78}],{duration:4200,iterations:Infinity,easing:'ease-in-out'});},
    glassShimmer(el){return el.animate([{backgroundPosition:'-120% 0'},{backgroundPosition:'120% 0'}],{duration:1200,easing:'ease-in-out'});},
    scrollReactive(el){return el.animate([{transform:'translateY(0)'},{transform:'translateY(2px)'},{transform:'translateY(0)'}],{duration:500,easing:'ease-out'});},
    presencePulse(el){return el.animate([{transform:'scale(1)',opacity:.65},{transform:'scale(1.18)',opacity:1},{transform:'scale(1)',opacity:.65}],{duration:1500,iterations:Infinity});},
    recordingWave(el){return el.animate([{transform:'scaleY(.75)'},{transform:'scaleY(1.15)'},{transform:'scaleY(.75)'}],{duration:620,iterations:Infinity,easing:'ease-in-out'});},
    downloadProgress(el){return el.animate([{transform:'scaleX(.98)'},{transform:'scaleX(1)'},{transform:'scaleX(.98)'}],{duration:900,iterations:Infinity,easing:'ease-in-out'});},
    mediaLightbox(el){return el.animate([{opacity:0,transform:'scale(.96)'},{opacity:1,transform:'scale(1)'}],{duration:300,easing:'ease-out',fill:'both'});},
    notificationRise(el){return el.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:280,easing:'ease-out',fill:'both'});},
    fabSpin(el){return el.animate([{transform:'rotate(0deg) scale(.9)'},{transform:'rotate(90deg) scale(1)'},{transform:'rotate(0deg) scale(1)'}],{duration:420,easing:'ease-out'});},
    cardLift(el){return el.animate([{transform:'translateY(0)'},{transform:'translateY(-3px)'},{transform:'translateY(0)'}],{duration:260,easing:'ease-out'});},
  };

  function motionAllowed(){return prefs.motion!=='off' && !matchMedia('(prefers-reduced-motion: reduce)').matches;}
  function play(name,el){if(!motionAllowed()||!MOTIONS[name]||!el)return; try{MOTIONS[name](el)}catch{}}

  function injectStyles(){
    if(qs('#hvUltimateStyle'))return;
    const s=document.createElement('style');s.id='hvUltimateStyle';s.textContent=`
      #hvUltimateBtn{position:fixed;right:18px;bottom:86px;z-index:1200;border:1px solid color-mix(in srgb,var(--accent,#6d5dfc) 40%,transparent);background:color-mix(in srgb,var(--surface,#fff) 82%,transparent);backdrop-filter:blur(16px);border-radius:18px;padding:10px 13px;box-shadow:0 12px 34px #0002;cursor:pointer;font:inherit;color:inherit}
      #hvUltimateOverlay{position:fixed;inset:0;z-index:1300;background:#0007;display:grid;place-items:center;padding:18px}
      #hvUltimatePanel{width:min(980px,100%);max-height:min(850px,92vh);overflow:auto;border:1px solid #ffffff35;border-radius:28px;background:color-mix(in srgb,var(--surface,#fff) 94%,transparent);backdrop-filter:blur(26px);box-shadow:0 30px 90px #0005;padding:18px}
      .hvU-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.hvU-head h2{margin:0}.hvU-close{border:0;background:transparent;font-size:24px;cursor:pointer}.hvU-tabs{display:flex;gap:7px;overflow:auto;margin:14px 0}.hvU-tab{border:1px solid #8883;border-radius:12px;padding:9px 12px;background:transparent;cursor:pointer;white-space:nowrap}.hvU-tab.active{background:var(--accent,#6d5dfc);color:#fff}.hvU-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.hvU-card{border:1px solid #8882;border-radius:17px;padding:13px;background:#ffffff0a;text-align:right;cursor:pointer}.hvU-card:hover{transform:translateY(-2px)}.hvU-card b{display:block}.hvU-card span{display:block;opacity:.7;font-size:12px;margin-top:4px}.hvU-section{padding:10px 2px}.hvU-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #8882}.hvU-btn{border:1px solid #8884;border-radius:12px;padding:8px 12px;background:transparent;cursor:pointer}.hvU-input,.hvU-select{border:1px solid #8884;border-radius:12px;padding:9px;background:transparent;color:inherit;font:inherit}.hvU-ai{display:flex;flex-direction:column;gap:10px}.hvU-ai-log{min-height:240px;border:1px solid #8882;border-radius:18px;padding:12px;overflow:auto}.hvU-bubble{padding:10px 12px;border-radius:15px;margin:7px 0;max-width:88%}.hvU-bubble.user{margin-right:auto;background:#6d5dfc18}.hvU-bubble.ai{margin-left:auto;background:#00a88418}.hvU-ai-compose{display:flex;gap:8px}.hvU-ai-compose input{flex:1}.hvU-emoji{font-size:38px;display:inline-block}.hvU-secret-banner{border:1px solid #8a6cff45;border-radius:18px;padding:14px;background:linear-gradient(135deg,#6d5dfc12,#00bcd412)}
      @media(max-width:600px){#hvUltimatePanel{border-radius:20px;padding:13px}#hvUltimateBtn{right:12px;bottom:76px}.hvU-grid{grid-template-columns:1fr}}
      @media(prefers-reduced-motion:reduce){#hvUltimateBtn,#hvUltimatePanel,.hvU-card{transition:none!important;animation:none!important}}
    `;document.head.appendChild(s);
  }

  function makeButton(){
    if(qs('#hvUltimateBtn'))return;
    const b=document.createElement('button');b.id='hvUltimateBtn';b.innerHTML='✨ Hoviyat Studio';b.title='Hoviyat Ultimate';b.onclick=openPanel;document.body.appendChild(b);
  }

  function openPanel(){
    if(qs('#hvUltimateOverlay'))return;
    const o=document.createElement('div');o.id='hvUltimateOverlay';o.innerHTML=`<div id="hvUltimatePanel" role="dialog" aria-modal="true" aria-label="Hoviyat Studio"><div class="hvU-head"><h2>✨ Hoviyat Studio</h2><button class="hvU-close" aria-label="بستن">×</button></div><div class="hvU-tabs"><button class="hvU-tab active" data-tab="features">۴۰ قابلیت</button><button class="hvU-tab" data-tab="ai">🤖 هوش مصنوعی</button><button class="hvU-tab" data-tab="secret">🔐 گفت‌وگوی مخفی</button><button class="hvU-tab" data-tab="motion">🎞️ انیمیشن‌ها</button><button class="hvU-tab" data-tab="settings">⚙️ تنظیمات</button></div><div id="hvUContent"></div></div>`;
    document.body.appendChild(o);o.querySelector('.hvU-close').onclick=()=>o.remove();o.addEventListener('click',e=>{if(e.target===o)o.remove()});
    o.querySelectorAll('.hvU-tab').forEach(t=>t.onclick=()=>{o.querySelectorAll('.hvU-tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');renderTab(t.dataset.tab)});
    renderTab('features');play('modalSpring',o.querySelector('#hvUltimatePanel'));
  }

  function renderTab(tab){
    const c=qs('#hvUContent');if(!c)return;
    if(tab==='features'){
      c.innerHTML=`<div class="hvU-grid">${FEATURES.map((f,i)=>`<button class="hvU-card" data-feature="${f[0]}"><b>${f[1]} ${f[2]}</b><span>${f[3]}</span><small>${f[4]}</small></button>`).join('')}</div>`;
      qsa('.hvU-card').forEach((el,i)=>{el.onclick=()=>{play(i<20?Object.keys(MOTIONS)[i]: 'cardLift',el);toast(`قابلیت «${el.querySelector('b').textContent}» در معماری Ultimate ثبت شده.`)}});
    } else if(tab==='motion'){
      c.innerHTML=`<div class="hvU-grid">${Object.keys(MOTIONS).map((m,i)=>`<button class="hvU-card" data-motion="${m}"><b>🎞️ ${i+1}. ${m}</b><span>Motion preset مستقل و قابل خاموش‌کردن</span></button>`).join('')}</div><p class="settings-hint">انیمیشن‌ها با Web Animations API طراحی شده‌اند و Reduced Motion را رعایت می‌کنند.</p>`;
      qsa('[data-motion]').forEach(el=>el.onclick=()=>play(el.dataset.motion,el));
    } else if(tab==='ai') renderAI(c); else if(tab==='secret') renderSecret(c); else renderSettings(c);
  }

  function renderAI(c){
    c.innerHTML=`<div class="hvU-section"><div class="hvU-secret-banner">🤖 <b>Hoviyat AI 2.0</b><br><span>AI اختیاری است. محتوای چت خصوصی بدون انتخاب صریح کاربر ارسال نمی‌شود.</span></div><div class="hvU-ai"><div class="hvU-ai-log" id="hvUAILog"><div class="hvU-bubble ai">سلام! من لایه هوشمند Hoviyat هستم. می‌توانم روی متنی که خودت انتخاب می‌کنی خلاصه، ترجمه یا بازنویسی انجام بدهم.</div></div><div class="hvU-ai-compose"><input id="hvUAIInput" class="hvU-input" placeholder="درخواست آزمایشی..." maxlength="500"><button id="hvUAIButton" class="hvU-btn">ارسال</button></div><div style="display:flex;gap:7px;flex-wrap:wrap"><button class="hvU-btn" data-ai="summary">خلاصه</button><button class="hvU-btn" data-ai="rewrite">بازنویسی</button><button class="hvU-btn" data-ai="translate">ترجمه</button><button class="hvU-btn" data-ai="extract">استخراج نکات</button></div></div></div>`;
    const log=qs('#hvUAILog');const input=qs('#hvUAIInput');
    const send=(text)=>{if(!text)return;const u=document.createElement('div');u.className='hvU-bubble user';u.textContent=text;log.appendChild(u);const a=document.createElement('div');a.className='hvU-bubble ai';a.textContent='در این بسته، رابط و معماری AI آماده است؛ اتصال به provider واقعی باید با کلید/سرور خود پروژه انجام شود. برای حفظ حریم خصوصی، این لایه به‌طور پیش‌فرض متن چت را خودکار ارسال نمی‌کند.';log.appendChild(a);play('typingOrbit',a);log.scrollTop=log.scrollHeight;};
    qs('#hvUAIButton').onclick=()=>{send(input.value.trim());input.value=''};input.onkeydown=e=>{if(e.key==='Enter')qs('#hvUAIButton').click()};qsa('[data-ai]').forEach(b=>b.onclick=()=>send(`حالت AI: ${b.dataset.ai}`));
  }

  function renderSecret(c){
    c.innerHTML=`<div class="hvU-section"><div class="hvU-secret-banner">🔐 <b>Secret Chat 2.0</b><br><span>تنظیمات ظاهری و محلی این بخش مستقل شده‌اند؛ هسته رمزنگاری فعلی دست‌نخورده باقی می‌ماند.</span></div><div class="hvU-row"><span>پیام‌های ناپدیدشونده</span><select id="hvSecretTimer" class="hvU-select"><option value="off">خاموش</option><option value="30s">۳۰ ثانیه</option><option value="1m">۱ دقیقه</option><option value="5m">۵ دقیقه</option><option value="1h">۱ ساعت</option><option value="1d">۱ روز</option><option value="1w">۱ هفته</option></select></div><div class="hvU-row"><span>تاریك‌سازی پس‌زمینه</span><button class="hvU-btn" id="hvSecretBlur">روشن/خاموش</button></div><div class="hvU-row"><span>انیمیشن Secret</span><button class="hvU-btn" id="hvSecretMotion">Full / Reduced / Off</button></div><div class="hvU-row"><span>مدیریت امنیت</span><button class="hvU-btn" id="hvOpenExistingSecurity">مرکز امنیت موجود</button></div></div>`;
    const sel=qs('#hvSecretTimer');sel.value=prefs.secretAutoDelete;sel.onchange=()=>{prefs.secretAutoDelete=sel.value;save();};qs('#hvSecretBlur').onclick=()=>{prefs.secretBlur=!prefs.secretBlur;save();document.documentElement.classList.toggle('hv-secret-soft',prefs.secretBlur)};qs('#hvSecretMotion').onclick=()=>{prefs.motion=prefs.motion==='full'?'reduced':prefs.motion==='reduced'?'off':'full';save()};qs('#hvOpenExistingSecurity').onclick=()=>qs('#openSecurityCenterBtn')?.click();
  }

  function renderSettings(c){
    c.innerHTML=`<div class="hvU-section"><div class="hvU-row"><span>AI</span><button class="hvU-btn" id="hvAIEnable">${prefs.aiEnabled?'روشن':'خاموش'}</button></div><div class="hvU-row"><span>Motion</span><select id="hvMotion" class="hvU-select"><option value="full">Full</option><option value="reduced">Reduced</option><option value="off">Off</option></select></div><div class="hvU-row"><span>Glass</span><select id="hvGlass" class="hvU-select"><option value="balanced">Balanced</option><option value="strong">Strong</option><option value="minimal">Minimal</option></select></div><div class="hvU-row"><span>Power profile</span><select id="hvPower" class="hvU-select"><option value="normal">Normal</option><option value="balanced">Balanced</option><option value="saving">Power Saving</option><option value="adaptive">Adaptive</option></select></div><div class="hvU-row"><span>اعلان‌ها</span><button class="hvU-btn" id="hvNotifToggle">تنظیمات اعلان</button></div><div class="hvU-row"><span>صداهای رابط</span><button class="hvU-btn" id="hvSoundToggle">روشن</button></div><div class="hvU-row"><span>پخش خودکار رسانه</span><button class="hvU-btn" id="hvAutoplayToggle">روشن</button></div><div class="hvU-row"><span>حجم فونت</span><select id="hvFontScale" class="hvU-select"><option value="small">کوچک</option><option value="normal">عادی</option><option value="large">بزرگ</option><option value="xlarge">خیلی بزرگ</option></select></div><div class="hvU-row"><span>کنتراست</span><select id="hvContrast" class="hvU-select"><option value="normal">عادی</option><option value="high">بالا</option></select></div><div class="hvU-row"><span>حریم خصوصی پیش‌نمایش</span><button class="hvU-btn" id="hvPreviewToggle">محافظت</button></div><div class="hvU-row"><span>تنظیمات</span><button class="hvU-btn" id="hvReset">بازنشانی Ultimate</button></div></div>`;
    const m=qs('#hvMotion'),g=qs('#hvGlass'),p=qs('#hvPower');m.value=prefs.motion;g.value=prefs.glass;p.value=prefs.power;m.onchange=()=>{prefs.motion=m.value;save()};g.onchange=()=>{prefs.glass=g.value;save();document.documentElement.style.setProperty('--hv-blur',g.value==='strong'?'24px':g.value==='minimal'?'8px':'18px')};p.onchange=()=>{prefs.power=p.value;save();document.documentElement.dataset.power=p.value};qs('#hvAIEnable').onclick=()=>{prefs.aiEnabled=!prefs.aiEnabled;save();qs('#hvAIEnable').textContent=prefs.aiEnabled?'روشن':'خاموش'};const boolKeys=[['hvNotifToggle','notificationsEnabled'],['hvSoundToggle','uiSounds'],['hvAutoplayToggle','mediaAutoplay'],['hvPreviewToggle','privacyPreview']]; boolKeys.forEach(([id,k])=>{if(prefs[k]===undefined)prefs[k]=true;const b=qs('#'+id);b.textContent=prefs[k]?'روشن':'خاموش';b.onclick=()=>{prefs[k]=!prefs[k];save();b.textContent=prefs[k]?'روشن':'خاموش';}}); const fs=qs('#hvFontScale');fs.value=prefs.fontScale||'normal';fs.onchange=()=>{prefs.fontScale=fs.value;save();document.documentElement.dataset.fontScale=fs.value}; const ct=qs('#hvContrast');ct.value=prefs.contrast||'normal';ct.onchange=()=>{prefs.contrast=ct.value;save();document.documentElement.dataset.contrast=ct.value}; qs('#hvNotifToggle').onclick=()=>{prefs.notificationsEnabled=!prefs.notificationsEnabled;save();qs('#hvNotifToggle').textContent=prefs.notificationsEnabled?'روشن':'خاموش'}; qs('#hvReset').onclick=()=>{prefs={...defaults};save();renderSettings(c)};
  }

  Object.assign(MOTIONS, EXTRA_MOTIONS);
  FEATURES.push(...EXTRA_STICKERS.map((x,i)=>['sticker-'+i,x,'استیکر و ایموجی '+(i+1),'بستهٔ واکنش و استیکر جدید برای چت','Media']));

  function toast(text){
    const t=document.createElement('div');t.textContent=text;t.style.cssText='position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:1500;padding:10px 14px;border-radius:14px;background:#111;color:#fff;box-shadow:0 10px 30px #0004;font:14px Vazirmatn,sans-serif';document.body.appendChild(t);play('notificationRise',t);setTimeout(()=>t.remove(),2200);
  }

  function installEmojiMotion(){
    document.addEventListener('click',e=>{const el=e.target.closest('.emoji,.reaction,.sticker,.message-reaction,[data-emoji]');if(el){play('emojiPop',el);play('emojiBurst',el)}} ,true);
  }
  function installMessageMotion(){
    const paint=()=>qsa('.message-row,.message,.chat-message').forEach(el=>{if(el.dataset.hvUltimateMotion)return;el.dataset.hvUltimateMotion='1';play('messageFlow',el)});
    const ob=new MutationObserver(paint);ob.observe(document.body,{childList:true,subtree:true});paint();
  }
  function boot(){injectStyles();makeButton();installEmojiMotion();installMessageMotion();document.documentElement.dataset.power=prefs.power;document.documentElement.style.setProperty('--hv-blur',prefs.glass==='strong'?'24px':prefs.glass==='minimal'?'8px':'18px');}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.HoviyatUltimate={FEATURES,MOTIONS,prefs,save,openPanel,play};
})();
