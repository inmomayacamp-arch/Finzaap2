/* =========================================================
   install.js — captura el prompt nativo de "instalar app"
   (Android/Chrome/Edge) para poder ofrecerlo con un botón
   propio dentro de la app, en vez de que el usuario tenga que
   buscarlo en el menú del navegador.

   En iOS Safari este evento nunca existe (Apple no lo permite):
   ahí solo podemos mostrar instrucciones, nunca instalar solas.
   ========================================================= */

var InstallPrompt = (function () {
  var deferredEvent = null;

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredEvent = e;
    if (typeof App !== "undefined" && App.refresh) App.refresh();
  });

  window.addEventListener("appinstalled", function () {
    deferredEvent = null;
    if (typeof App !== "undefined" && App.refresh) App.refresh();
  });

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  }

  function canPromptNatively() {
    return deferredEvent !== null;
  }

  function prompt() {
    if (!deferredEvent) return Promise.resolve(null);
    var evt = deferredEvent;
    deferredEvent = null;
    evt.prompt();
    return evt.userChoice;
  }

  return {
    isStandalone: isStandalone,
    isIOS: isIOS,
    canPromptNatively: canPromptNatively,
    prompt: prompt
  };
})();
