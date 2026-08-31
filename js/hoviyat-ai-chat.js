
/* Hoviyat AI inside conversation. Optional endpoint; local deterministic fallback. */
(() => {
  "use strict";
  const qs = s => document.querySelector(s);
  function collectMessages(){
    return [...document.querySelectorAll("#messagesHolder .bubble, #messagesHolder .message-bubble, #messagesHolder .message")]
      .map(e=>(e.textContent||"").replace(/\s+/g," ").trim()).filter(Boolean).slice(-30);
  }
  function localSummary(items,mode){
    if(!items.length) return "هنوز پیامی برای خلاصه‌سازی در این گفتگو دیده نمی‌شود.";
    const u=[...new Set(items)];
    if(mode==="last") return "خلاصه پیام‌های اخیر:\n• "+u.slice(-8).join("\n• ");
    if(mode==="keypoints") return "نکات مهم احتمالی:\n• "+(u.filter(x=>x.length>=12).slice(-8).join("\n• ")||"مورد مشخصی پیدا نشد.");
    if(mode==="rewrite") return "آخرین متن:\n"+(u.at(-1)||"")+"\n\nبازنویسی پیشنهادی:\n"+(u.at(-1)||"");
    return "خلاصه گفتگو:\n• "+u.slice(-10).join("\n• ");
  }
  async function requestAI(items,mode){
    const endpoint=window.HOVIYAT_AI_ENDPOINT;
    if(!endpoint) return localSummary(items,mode);
    const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({mode,messages:items})});
    if(!r.ok) throw new Error("پاسخ سرویس AI دریافت نشد.");
    const d=await r.json(); return d?.text||d?.result||"پاسخ AI خالی بود.";
  }
  function install(){
    const btn=qs("#chatAiBtn"),panel=qs("#chatAiPanel"),result=qs("#chatAiResult");
    if(!btn||!panel||!result)return;
    btn.addEventListener("click",()=>{panel.hidden=!panel.hidden;if(!panel.hidden)panel.classList.add("ai-open")});
    qs("#chatAiClose")?.addEventListener("click",()=>panel.hidden=true);
    panel.querySelectorAll("[data-chat-ai]").forEach(b=>b.addEventListener("click",async()=>{
      panel.querySelectorAll("button").forEach(x=>x.disabled=true); result.textContent="در حال آماده‌سازی…";
      try{result.textContent=await requestAI(collectMessages(),b.dataset.chatAi)}catch(e){result.textContent="خطا: "+e.message}
      finally{panel.querySelectorAll("button").forEach(x=>x.disabled=false)}
    }));
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
  window.HoviyatChatAI={collectMessages,requestAI,localSummary};
})();
