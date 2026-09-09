import { supabase } from "./supabase-init.js";

const OAUTH = "ir.hoviyat.app://auth/oauth";

function isNative(){ return !!window.Capacitor?.isNativePlatform?.(); }
function parseUrl(raw){ try{return new URL(raw)}catch{return null} }
function tokens(url){ const q=url.searchParams; const hash=new URLSearchParams((url.hash||"").replace(/^#/,"")); return { access_token:q.get("access_token")||hash.get("access_token"), refresh_token:q.get("refresh_token")||hash.get("refresh_token"), error:q.get("error")||hash.get("error"), error_description:q.get("error_description")||hash.get("error_description") }; }
async function consume(raw){
  const url=parseUrl(raw); if(!url) return;
  if (url.protocol !== "ir.hoviyat.app:" || url.hostname !== "auth" || url.pathname !== "/oauth") return;
  const t=tokens(url);
  const code = url.searchParams.get("code");
  if(t.error){ window.dispatchEvent(new CustomEvent("hoviyat:auth-error",{detail:{message:t.error_description||t.error}})); return; }
  let error = null;
  if (code) {
    const result = await supabase.auth.exchangeCodeForSession(code);
    error = result.error;
  } else if (t.access_token && t.refresh_token) {
    const result = await supabase.auth.setSession({access_token:t.access_token,refresh_token:t.refresh_token});
    error = result.error;
  } else {
    return;
  }
  if(error){window.dispatchEvent(new CustomEvent("hoviyat:auth-error",{detail:{message:error.message}}));return;}
  try { window.history.replaceState({}, document.title, window.location.pathname); } catch {}
  try { await window.Capacitor?.Plugins?.Browser?.close?.(); } catch {}
  if(url.href.startsWith(OAUTH)){
    window.dispatchEvent(new CustomEvent("hoviyat:oauth-success"));
  }
}
export async function initNativeDeepLinks(){
  if(!isNative()) return ()=>{};
  const App = window.Capacitor?.Plugins?.App;
  if (!App) throw new Error("Capacitor App plugin is unavailable");
  const listener=await App.addListener("appUrlOpen",({url})=>consume(url).catch(console.error));
  const launch=await App.getLaunchUrl(); if(launch?.url) await consume(launch.url);
  return ()=>listener.remove();
}
