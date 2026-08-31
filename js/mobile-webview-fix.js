/* Hoviyat Android/WebView layout fix. Keeps phone UI in single-column mode
   even when a wrapper reports a desktop-sized CSS viewport. */
(function () {
  try {
    var ua = navigator.userAgent || '';
    var isPhone = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && Math.min(screen.width || 9999, screen.height || 9999) < 900);
    if (!isPhone) return;
    document.documentElement.classList.add('hv-phone-webview');
    document.body.classList.add('hv-phone-webview');
    function sync() {
      var vv = window.visualViewport;
      var h = vv && vv.height ? vv.height : window.innerHeight;
      var w = vv && vv.width ? vv.width : window.innerWidth;
      document.documentElement.style.setProperty('--hv-vw', w + 'px');
      document.documentElement.style.setProperty('--hv-vh', h + 'px');
    }
    sync();
    window.addEventListener('resize', sync, {passive:true});
    if (window.visualViewport) window.visualViewport.addEventListener('resize', sync, {passive:true});
  } catch (_) {}
})();
