/* Hoviyat AI: compact contextual assistant opened from the chat header. */
(() => {
  "use strict";
  const qs = (s) => document.querySelector(s);

  function collectMessages() {
    return [...document.querySelectorAll("#messagesHolder .bubble, #messagesHolder .message-bubble, #messagesHolder .message")]
      .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean).slice(-30);
  }

  function localSummary(items, mode) {
    if (!items.length) return "هنوز پیامی برای تحلیل در این گفتگو دیده نمی‌شود.";
    const u = [...new Set(items)];
    if (mode === "last") return "خلاصه پیام‌های اخیر:\n• " + u.slice(-8).join("\n• ");
    if (mode === "keypoints") return "نکات مهم احتمالی:\n• " + (u.filter((x) => x.length >= 12).slice(-8).join("\n• ") || "مورد مشخصی پیدا نشد.");
    if (mode === "rewrite") return "بازنویسی پیشنهادی:\n" + (u.at(-1) || "");
    return "خلاصه گفتگو:\n• " + u.slice(-10).join("\n• ");
  }

  async function requestAI(items, mode, prompt = "") {
    try {
      const { supabase } = await import("./supabase-init.js");
      const { assertActionAllowed } = await import("./restrictions.js");
      await assertActionAllowed("ai");
      const { data, error } = await supabase.functions.invoke("hoviyat-ai", { body: { mode, messages: items, prompt } });
      if (error) throw error;
      return data?.text || localSummary(items, mode);
    } catch (error) {
      console.warn("Hoviyat AI fallback:", error);
      return localSummary(items, mode);
    }
  }

  function removePanel() { document.querySelectorAll(".floating-ai-panel").forEach(x => x.remove()); }

  async function blobToBase64(blob) {
    const buffer = await blob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  async function recordVoiceAssistant() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("دستگاه شما ضبط صوت را پشتیبانی نمی‌کند.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"].find(x => MediaRecorder.isTypeSupported(x)) || "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    const chunks = [];
    return await new Promise((resolve, reject) => {
      recorder.ondataavailable = e => e.data?.size && chunks.push(e.data);
      recorder.onerror = () => reject(new Error("ضبط صدا ناموفق بود."));
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        try {
          const blob = new Blob(chunks, { type: mime });
          const { supabase } = await import("./supabase-init.js");
          const { data, error } = await supabase.functions.invoke("hoviyat-voice", { body: { audio: await blobToBase64(blob), mimeType: mime } });
          if (error) throw error;
          resolve(data);
        } catch (e) { reject(e); }
      };
      recorder.start();
      setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, 12000);
      window.__HOVIYAT_VOICE_RECORDER = recorder;
    });
  }

  function showPanel(anchor) {
    removePanel();
    const panel = document.createElement("div");
    panel.className = "floating-ai-panel glass";
    panel.innerHTML = `
      <div class="floating-ai-head"><span>✦ هویت AI</span><button type="button" data-ai-close aria-label="بستن">×</button></div>
      <div class="floating-ai-actions">
        <button data-ai-action="summary">🧠 خلاصه</button>
        <button data-ai-action="keypoints">📌 نکات</button>
        <button data-ai-action="last">📝 اخیر</button>
        <button data-ai-action="rewrite">✍️ بازنویسی</button>
        <button data-ai-action="voice">🎙 دستیار صوتی</button>
      </div>
      <div class="floating-ai-result" aria-live="polite">یک قابلیت را انتخاب کن.</div>`;
    document.body.appendChild(panel);
    const r = anchor?.getBoundingClientRect?.() || { left: innerWidth / 2, top: innerHeight - 100, bottom: innerHeight - 60, right: innerWidth / 2 };
    const w = Math.min(330, innerWidth - 16);
    let left = Math.max(8, Math.min(innerWidth - w - 8, r.left));
    let top = r.top - 126;
    if (top < 8) top = Math.min(innerHeight - 150, r.bottom + 8);
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.max(8, top)}px`;
    requestAnimationFrame(() => panel.classList.add("show"));
    panel.querySelector("[data-ai-close]").onclick = removePanel;
    panel.addEventListener("click", async e => {
      const action = e.target.closest("[data-ai-action]");
      if (!action) return;
      const result = panel.querySelector(".floating-ai-result");
      panel.querySelectorAll("button").forEach(b => b.disabled = true);
      result.textContent = action.dataset.aiAction === "voice" ? "🎙 در حال گوش‌دادن… حداکثر ۱۲ ثانیه" : "هویت AI در حال تحلیل است…";
      try {
        window.HoviyatNextGen?.setAIState?.("thinking");
        if (action.dataset.aiAction === "voice") {
          const data = await recordVoiceAssistant();
          result.innerHTML = `<b>گفتار:</b><br>${String(data?.transcript||"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}<br><br><b>پاسخ:</b><br>${String(data?.answer||data?.error||"پاسخی دریافت نشد.").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}`;
          if (data?.answer && "speechSynthesis" in window) { window.speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(data.answer); u.lang="fa-IR"; window.speechSynthesis.speak(u); }
        } else {
          result.textContent = await requestAI(collectMessages(), action.dataset.aiAction);
        }
      } catch (err) { result.textContent = err?.message || "هویت AI فعلاً پاسخ نداد."; }
      finally { panel.querySelectorAll("button").forEach(b => b.disabled = false); window.HoviyatNextGen?.setAIState?.("idle"); }
    });
    setTimeout(() => document.addEventListener("pointerdown", function outside(e) {
      if (!panel.contains(e.target) && !anchor?.contains?.(e.target)) { removePanel(); document.removeEventListener("pointerdown", outside, true); }
    }, true), 0);
  }

  function secretChatIsVisible() {
    const v = document.getElementById("view-secretchat");
    return !!v && !v.hidden && v.getAttribute("aria-hidden") !== "true";
  }

  function enforceSecretChatIsolation() {
    const secret = secretChatIsVisible();
    if (secret) removePanel();
    document.documentElement.toggleAttribute("data-hoviyat-secret-chat", secret);
    document.body?.toggleAttribute("data-hoviyat-secret-chat", secret);
  }

  // The AI panel lives under <body>, so CSS-only hiding is not enough on every WebView.
  // Watch the view's hidden/aria state and physically remove the panel while Secret Chat is open.
  const secretView = document.getElementById("view-secretchat");
  if (secretView && "MutationObserver" in window) {
    const observer = new MutationObserver(enforceSecretChatIsolation);
    observer.observe(secretView, { attributes: true, attributeFilter: ["hidden", "aria-hidden", "class", "style"] });
    window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
  }
  enforceSecretChatIsolation();

  document.addEventListener("click", e => {
    const ai = e.target.closest("#chatAiHeaderBtn");
    if (!ai) return;
    if (secretChatIsVisible()) { e.preventDefault(); e.stopPropagation(); removePanel(); return; }
    e.preventDefault(); e.stopPropagation();
    showPanel(ai);
  }, true);

  window.HoviyatChatAI = { collectMessages, requestAI, localSummary, open: showPanel, close: removePanel };
})();
