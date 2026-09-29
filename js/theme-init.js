/* Loaded in <head>, before first paint, so a saved theme never flashes the wrong colors. */
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: fall back to the system setting */ }
})();
