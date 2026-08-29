const KEY = "hoviyat.control.preferences.v2";
const defaults = {
  theme:"classic", animations:"full", glass:"medium", atmosphere:true, reactiveGradient:true,
  wallpaper:"hoviyat", density:"comfortable", autoplay:true, power:"balanced", language:"fa"
};
const load = () => { try { return {...defaults,...JSON.parse(localStorage.getItem(KEY)||"{}")} } catch { return {...defaults}; } };
const save = p => localStorage.setItem(KEY, JSON.stringify(p));

function ensurePanel(){
  const settings = document.getElementById("view-settings"); if(!settings || document.getElementById("hoviyatControlPanel")) return;
  const wrap=document.createElement("div"); wrap.id="hoviyatControlPanel"; wrap.className="control-center-card glass";
  wrap.innerHTML=`<div class="control-center-head"><div><span class="settings-eyebrow">HOVIYAT EXPERIENCE</span><h3>مرکز شخصی‌سازی</h3><p>ظاهر، حرکت، پس‌زمینه و مصرف انرژی را از یک‌جا تنظیم کن.</p></div></div>
  <div class="control-grid">
    <label>تم<select data-pref="theme"><option value="classic">Classic</option><option value="midnight">Midnight</option><option value="ocean">Ocean</option><option value="forest">Forest</option><option value="sunset">Sunset</option><option value="lavender">Lavender</option><option value="mono">Mono</option></select></label>
    <label>انیمیشن<select data-pref="animations"><option value="full">کامل</option><option value="reduced">کاهش‌یافته</option><option value="off">خاموش</option></select></label>
    <label>Glass<select data-pref="glass"><option value="off">خاموش</option><option value="low">کم</option><option value="medium">متوسط</option><option value="high">زیاد</option></select></label>
    <label>تراکم رابط<select data-pref="density"><option value="compact">فشرده</option><option value="comfortable">راحت</option><option value="spacious">باز</option></select></label>
    <label>پس‌زمینه<select data-pref="wallpaper"><option value="none">هیچ</option><option value="classic">کلاسیک</option><option value="hoviyat">Hoviyat</option><option value="gradient">Gradient</option><option value="pattern">Pattern</option></select></label>
    <label>مصرف انرژی<select data-pref="power"><option value="full">Full</option><option value="balanced">Balanced</option><option value="saving">Power Saving</option></select></label>
  </div>
  <div class="control-toggles"><button type="button" data-toggle="atmosphere">🌌 Atmosphere</button><button type="button" data-toggle="reactiveGradient">🌈 Gradient واکنشی</button><button type="button" data-toggle="autoplay">▶️ پخش خودکار رسانه</button></div>`;
  settings.querySelector(".settings-list").appendChild(wrap);
  const prefs=load(); apply(prefs);
  wrap.querySelectorAll("select[data-pref]").forEach(el=>{el.value=prefs[el.dataset.pref];el.onchange=()=>{const p=load();p[el.dataset.pref]=el.value;save(p);apply(p);}});
  wrap.querySelectorAll("button[data-toggle]").forEach(el=>el.onclick=()=>{const p=load();p[el.dataset.toggle]=!p[el.dataset.toggle];save(p);apply(p);});
}
function apply(p){
  document.documentElement.dataset.hoviyatTheme=p.theme;
  document.documentElement.dataset.animations=p.animations;
  document.documentElement.dataset.glass=p.glass;
  document.documentElement.dataset.density=p.density;
  document.documentElement.dataset.wallpaper=p.wallpaper;
  document.documentElement.dataset.power=p.power;
  document.documentElement.classList.toggle("hoviyat-atmosphere-off",!p.atmosphere);
  document.documentElement.classList.toggle("hoviyat-reactive-gradient-off",!p.reactiveGradient);
  document.documentElement.classList.toggle("hoviyat-autoplay-off",!p.autoplay);
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",ensurePanel); else ensurePanel();
window.HoviyatControlCenter={load,save,apply};
