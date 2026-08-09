/* =========================================================
   app.js — enrutador de pestañas, navegación y arranque
   ========================================================= */

var App = (function () {

  var TABS = [
    { id: "inicio", label: "Inicio", icon: "home", view: null },
    { id: "cobrar", label: "Por Cobrar", icon: "down", view: null },
    { id: "pagar", label: "Por Pagar", icon: "up", view: null },
    { id: "reporte", label: "Reporte", icon: "report", view: null },
    { id: "ahorro", label: "Ahorro", icon: "piggy", view: null },
    { id: "cuenta", label: "Cuenta", icon: "user", view: null }
  ];

  var currentTab = "inicio";

  function wireViews() {
    TABS[0].view = HomeView;
    TABS[1].view = ReceivablesView;
    TABS[2].view = PayablesView;
    TABS[3].view = ReportView;
    TABS[4].view = SavingsView;
    TABS[5].view = AccountView;
  }

  function session() {
    return Storage.getSession();
  }

  function navItemHTML(tab) {
    return (
      '<button class="nav-item' + (tab.id === currentTab ? " active" : "") + '" data-tab="' + tab.id + '">' +
        Icons.get(tab.icon, 21) +
        '<span>' + tab.label + '</span>' +
      '</button>'
    );
  }

  function renderNav() {
    var bottom = document.getElementById("bottom-nav");
    var sidebar = document.getElementById("sidebar-nav");
    var html = TABS.map(navItemHTML).join("");
    bottom.innerHTML = html;
    sidebar.innerHTML = html;

    [bottom, sidebar].forEach(function (nav) {
      nav.querySelectorAll("[data-tab]").forEach(function (btn) {
        btn.addEventListener("click", function () { navigate(btn.getAttribute("data-tab")); });
      });
    });

    var s = session();
    document.getElementById("sidebar-avatar").textContent = Utils.initials(s.name);
    document.getElementById("sidebar-avatar").style.background = s.color;
    document.getElementById("sidebar-username").textContent = s.name;
  }

  function navigate(tabId) {
    currentTab = tabId;
    renderNav();
    renderCurrentView();
    document.getElementById("main-content").scrollTop = 0;
    window.scrollTo(0, 0);
    syncHistory(tabId);
  }

  // Mantiene como mucho UNA entrada extra de historial por encima de
  // "inicio": así, sin importar cuántas secciones se visiten, el botón
  // atrás siempre regresa directo a Inicio en un solo paso (en vez de
  // salir de la app), y desde Inicio el atrás vuelve a comportarse normal.
  function syncHistory(tabId) {
    if (typeof history === "undefined" || !history.pushState) return;
    var onExtraEntry = history.state && history.state.tab && history.state.tab !== "inicio";
    if (tabId === "inicio") {
      if (onExtraEntry) history.replaceState({ tab: "inicio" }, "");
    } else if (onExtraEntry) {
      history.replaceState({ tab: tabId }, "");
    } else {
      history.pushState({ tab: tabId }, "");
    }
  }

  function handlePopState() {
    if (currentTab !== "inicio") navigate("inicio");
  }

  function renderCurrentView() {
    var tab = TABS.find(function (t) { return t.id === currentTab; });
    var container = document.getElementById("main-content");
    tab.view.render(container);
  }

  function refresh() {
    renderCurrentView();
  }

  function boot() {
    wireViews();
    document.getElementById("view-setup").hidden = true;
    document.getElementById("view-main").hidden = false;
    document.getElementById("sidebar-account-btn").addEventListener("click", function () { navigate("cuenta"); }, { once: true });
    currentTab = "inicio";
    renderNav();
    renderCurrentView();
    if (typeof history !== "undefined" && history.replaceState) history.replaceState({ tab: "inicio" }, "");

    if (Storage.sync.isConfigured()) {
      var code = session().code;
      Storage.sync.pullAll(code).then(function () { refresh(); });
      Storage.sync.subscribe(code, refresh);
    }
  }

  function showSetup() {
    Storage.sync.unsubscribe();
    Storage.clearSession();
    document.getElementById("view-main").hidden = true;
    document.getElementById("view-setup").hidden = false;
    ["step-signup", "step-check-email", "step-forgot", "step-reset"].forEach(function (id) {
      document.getElementById(id).hidden = true;
    });
    document.getElementById("step-login").hidden = false;
    document.getElementById("login-email").value = "";
    document.getElementById("login-password").value = "";
  }

  function init() {
    SetupView.init();

    if (!Storage.sync.isConfigured()) return; // sin Supabase no hay como iniciar sesion

    var recoveryHandled = false;
    Auth.onAuthEvent(function (event) {
      if (event === "PASSWORD_RECOVERY") {
        recoveryHandled = true;
        SetupView.showRecoveryStep();
      }
    });

    setTimeout(function () {
      if (recoveryHandled) return; // ya se esta mostrando la pantalla de nueva contraseña
      Auth.getSessionUser().then(function (user) {
        if (!user) return;
        return Auth.loadOrCreateProfile(user.id).then(function (profile) {
          Storage.setSession({
            userId: profile.id, name: profile.name, code: profile.householdCode,
            inviteCode: profile.inviteCode, color: Utils.colorForAuthor(profile.name)
          });
          boot();
        });
      }).catch(function (e) { console.warn("Auth init:", e.message); });
    }, 60); // le da chance al listener de recovery a disparar primero si aplica
  }

  window.addEventListener("popstate", handlePopState);

  return { session: session, navigate: navigate, refresh: refresh, boot: boot, showSetup: showSetup, init: init };
})();

document.addEventListener("DOMContentLoaded", App.init);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").catch(function (e) {
      console.warn("Service worker no se pudo registrar:", e.message);
    });
  });
}
