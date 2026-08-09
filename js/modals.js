/* =========================================================
   modals.js — sistema genérico de modales (hoja inferior en
   móvil, diálogo centrado en escritorio vía CSS)
   ========================================================= */

var Modals = (function () {

  var root = null;
  var activeOnClose = null;

  function el() {
    if (!root) root = document.getElementById("modal-root");
    return root;
  }

  function open(opts) {
    close(); // asegura que no haya otro modal abierto
    activeOnClose = opts.onClose || null;

    var backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML =
      '<div class="modal-sheet" role="dialog" aria-modal="true">' +
        '<div class="modal-grabber"></div>' +
        opts.html +
      '</div>';

    backdrop.addEventListener("mousedown", function (e) {
      if (e.target === backdrop) close();
    });

    el().appendChild(backdrop);
    document.body.style.overflow = "hidden";

    backdrop.querySelectorAll("[data-modal-close]").forEach(function (btn) {
      btn.addEventListener("click", function () { close(); });
    });

    if (opts.onMount) opts.onMount(backdrop.querySelector(".modal-sheet"));

    // permite cerrar con ESC
    document.addEventListener("keydown", escHandler);

    // asegura que el boton atras (fisico o del navegador) cierre este
    // modal en vez de salir de la app
    if (typeof App !== "undefined" && App.syncBackGuard) App.syncBackGuard();

    return backdrop;
  }

  function isOpen() {
    var node = el();
    return !!(node && node.firstChild);
  }

  function escHandler(e) {
    if (e.key === "Escape") close();
  }

  function close() {
    var node = el();
    if (node.firstChild) {
      node.innerHTML = "";
      document.body.style.overflow = "";
      document.removeEventListener("keydown", escHandler);
      if (activeOnClose) { var cb = activeOnClose; activeOnClose = null; cb(); }
    }
  }

  function headerHTML(opts) {
    // opts: { icon, theme, title, sub }
    return (
      '<div class="modal-head">' +
        '<div class="modal-head-left">' +
          '<div class="modal-head-icon ' + opts.theme + '">' + Icons.get(opts.icon, 20) + '</div>' +
          '<div>' +
            '<div class="modal-title">' + opts.title + '</div>' +
            (opts.sub ? '<div class="modal-sub">' + opts.sub + '</div>' : '') +
          '</div>' +
        '</div>' +
        (opts.headerRight || '<button class="icon-btn danger" data-modal-close>' + Icons.get("close", 16) + '</button>') +
      '</div>'
    );
  }

  return { open: open, close: close, isOpen: isOpen, headerHTML: headerHTML };
})();
