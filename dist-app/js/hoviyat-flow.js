/* HOVIYAT FLOW: centralized frontend motion, responsive shell and keyboard affordances.
   No backend dependency. */
const root = document.documentElement;
const shell = () => document.getElementById('appShell');
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)');

function loadPrefs(){
  try { return JSON.parse(localStorage.getItem('hoviyat-flow-prefs') || '{}'); }
  catch { return {}; }
}
function apply(){
  const p=loadPrefs();
  root.dataset.hvMotion = prefersReduced.matches ? 'reduced' : (p.motion || 'full');
  root.dataset.hvPower = p.power || 'balanced';
  document.body.dataset.hvDensity = p.density || 'comfortable';
}
function setMotion(mode){
  const value = ['full','reduced','off'].includes(mode) ? mode : 'full';
  const p=loadPrefs(); p.motion=value; localStorage.setItem('hoviyat-flow-prefs',JSON.stringify(p)); apply();
}
function setPower(mode){
  const value = ['high','balanced','saving'].includes(mode) ? mode : 'balanced';
  const p=loadPrefs(); p.power=value; localStorage.setItem('hoviyat-flow-prefs',JSON.stringify(p)); apply();
}
function syncShell(){
  const s=shell(); if(!s) return;
  const hasChat=!!document.querySelector('#view-chat:not([hidden])');
  const desktop=matchMedia('(min-width: 901px)').matches;
  // Keep the shell state truthful on both desktop and mobile/WebView.
  // The chat view owns the bottom edge, so floating global controls must yield to it.
  s.dataset.chatOpen = hasChat ? '1' : '0';
  if(desktop && hasChat){
    const home=document.getElementById('view-home');
    if(home) home.hidden=false;
  }
}
function enhancedQuickActions(){
  document.addEventListener('click', e=>{
    const b=e.target.closest('[data-hv-action]'); if(!b) return;
    const action=b.dataset.hvAction;
    if(action==='search') document.getElementById('chatSearchInput')?.focus();
    if(action==='new-chat') document.getElementById('fabNewChat')?.click();
  });
}
function announce(text){
  let live=document.getElementById('hvAriaLive');
  if(!live){ live=document.createElement('div'); live.id='hvAriaLive'; live.setAttribute('aria-live','polite'); live.setAttribute('aria-atomic','true'); live.className='sr-only'; document.body.appendChild(live); }
  live.textContent=text; setTimeout(()=>{live.textContent=''},900);
}
function keyboard(){
  document.addEventListener('keydown', e=>{
    if(e.key==='/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){e.preventDefault();document.getElementById('chatSearchInput')?.focus();announce('جستجو فعال شد');}
    if(e.key==='Escape') document.querySelector('.modal.open .modal-head .icon-btn, .modal.open .icon-btn[aria-label], #view-chat:not([hidden]) #chatBackBtn')?.click();
  });
}
prefersReduced.addEventListener?.('change',apply);
window.addEventListener('resize',syncShell,{passive:true});
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{apply();enhancedQuickActions();keyboard();syncShell()});
else {apply();enhancedQuickActions();keyboard();syncShell()}
window.HoviyatFlow={apply,setMotion,setPower,syncShell,announce};
