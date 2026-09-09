/* HOVIYAT Motion Engine v1
   Frontend-only micro-interactions. It observes dynamically rendered UI so
   chat rows/messages created by existing modules get the same motion language. */
(() => {
  "use strict";
  const root = document.documentElement;
  const reduce = () => window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || root.dataset.motion === "reduced";
  const powerSave = () => root.dataset.power === "saving";
  let serial = 0;

  const mark = (el, cls, delay = 0) => {
    if (!el || reduce() || powerSave()) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.style.setProperty("--hv-delay", `${delay}ms`);
    el.classList.add(cls);
  };

  const animateCollection = (selector, max = 14) => {
    if (reduce() || powerSave()) return;
    document.querySelectorAll(selector).forEach((el, i) => {
      if (el.dataset.hvMotionSeen === "1") return;
      el.dataset.hvMotionSeen = "1";
      mark(el, "hv-stagger", Math.min(i, max) * 22);
    });
  };

  const press = e => {
    const target = e.target.closest("button,.chat-card,.bubble,.settings-item,.option-row,.contact-action");
    if (!target || target.disabled || reduce()) return;
    target.classList.add("hv-pressing");
    const release = () => target.classList.remove("hv-pressing");
    target.addEventListener("pointerup", release, {once:true});
    target.addEventListener("pointercancel", release, {once:true});
    target.addEventListener("pointerleave", release, {once:true});
  };

  const bubbleObserver = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        const bubbles = node.matches?.(".bubble-row,.message-row") ? [node] : [...node.querySelectorAll?.(".bubble-row,.message-row") || []];
        bubbles.slice(-10).forEach((el, i) => {
          if (el.dataset.hvMotionSeen === "1") return;
          el.dataset.hvMotionSeen = "1";
          mark(el, "hv-pop", Math.min(i, 5) * 18);
        });
      }
    }
  });

  const observe = () => {
    const app = document.querySelector("#appShell");
    if (!app) return false;
    bubbleObserver.observe(app, {childList:true, subtree:true});
    return true;
  };

  document.addEventListener("pointerdown", press, {passive:true});
  document.addEventListener("click", e => {
    const target = e.target.closest(".send-btn,.fab,.welcome-logo,.chat-header-avatar,.topbar-avatar");
    if (!target || reduce() || powerSave()) return;
    mark(target, "hv-soft-in");
  }, {passive:true});

  const listSweep = () => {
    animateCollection("#chatListHolder .chat-card", 12);
    animateCollection("#secretChatListHolder .chat-card", 8);
    animateCollection("#view-home .filter-tab", 4);
  };

  const boot = () => {
    observe();
    listSweep();
    setTimeout(listSweep, 260);
    setTimeout(listSweep, 900);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, {once:true});
  else boot();

  /* Tiny, deterministic attention cue for incoming unread badges. */
  const unreadObserver = new MutationObserver(records => {
    if (reduce() || powerSave()) return;
    records.forEach(r => {
      if (r.type !== "childList" && r.type !== "attributes") return;
      const el = r.target instanceof Element ? r.target.closest?.(".chat-card") : null;
      if (!el) return;
      if (el.querySelector(".unread-badge,[data-unread='true']")) mark(el, "hv-soft-in");
    });
  });
  const waitForApp = setInterval(() => {
    const app = document.querySelector("#appShell");
    if (!app) return;
    clearInterval(waitForApp);
    unreadObserver.observe(app, {subtree:true, childList:true, attributes:true, attributeFilter:["class","data-unread"]});
  }, 200);
})();
