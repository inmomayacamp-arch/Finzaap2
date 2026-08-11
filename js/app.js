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
  var booted = false; // true solo entre boot() y showSetup(): antes de eso
  // (p.ej. en la pantalla de login) tab.view sigue siendo null porque
  // wireViews() aun no corre, y refrescar la vista revienta.

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

  // Cache compartido de "con quién más comparto este espacio" (nombre +
  // iniciales), para no re-consultar Supabase en cada render. Se llena
  // una vez por household_code y se refresca la UI cuando llega.
  var membersCache = {};

  function householdMembers(s) {
    var list = membersCache[s.code];
    return (list || []).filter(function (m) { return m.id !== s.userId; });
  }

  function invalidateHouseholdMembers(code) {
    delete membersCache[code];
  }

  function ensureHouseholdMembersLoaded(s) {
    if (membersCache[s.code] || typeof Auth === "undefined" || !Storage.sync.isConfigured()) return;
    membersCache[s.code] = [];
    Auth.listHouseholdMembers(s.code).then(function (members) {
      membersCache[s.code] = members;
      refresh();
    }).catch(function () {});
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
    syncBackGuard();
  }

  // Cada "cosa que se puede deshacer con el botón atrás" suma un nivel
  // de profundidad en el historial: estar en otra sección (no Inicio)
  // cuenta 1, y tener un modal abierto encima cuenta 1 más. Así, un
  // atrás con un modal abierto SOLO cierra el modal y te deja en la
  // sección donde estabas; y un atrás sin modal (estando en otra
  // sección) te regresa directo a Inicio. Sin nada abierto y en
  // Inicio, atrás vuelve a comportarse normal (sale de la app). Se
  // llama tanto al cambiar de pestaña como al abrir un modal (ver
  // Modals.open en modals.js).
  function neededBackDepth() {
    var d = currentTab !== "inicio" ? 1 : 0;
    if (typeof Modals !== "undefined" && Modals.isOpen && Modals.isOpen()) d++;
    return d;
  }

  function syncBackGuard() {
    if (typeof history === "undefined" || !history.pushState) return;
    var needed = neededBackDepth();
    var have = (history.state && history.state.depth) || 0;
    while (have < needed) {
      have++;
      history.pushState({ depth: have }, "");
    }
  }

  function handlePopState() {
    var modalWasOpen = typeof Modals !== "undefined" && Modals.isOpen && Modals.isOpen();
    if (modalWasOpen) {
      Modals.close();
      return; // solo cierra el modal, se queda en la seccion actual
    }
    if (currentTab !== "inicio") navigate("inicio");
  }

  function renderCurrentView() {
    var tab = TABS.find(function (t) { return t.id === currentTab; });
    var container = document.getElementById("main-content");
    tab.view.render(container);
  }

  function refresh() {
    if (!booted) return;
    renderCurrentView();
  }

  function boot() {
    wireViews();
    booted = true;
    document.getElementById("view-setup").hidden = true;
    document.getElementById("view-main").hidden = false;
    document.getElementById("sidebar-account-btn").addEventListener("click", function () { navigate("cuenta"); }, { once: true });
    currentTab = "inicio";
    renderNav();
    renderCurrentView();
    if (typeof history !== "undefined" && history.replaceState) history.replaceState({ depth: 0 }, "");

    if (Storage.sync.isConfigured()) {
      var code = session().code;
      Storage.sync.pullAll(code).then(function () { refresh(); });
      Storage.sync.subscribe(code, refresh);
    }

    maybeShowPushPrompt();
  }

  // Aviso proactivo, una vez arrancada la app, para que activar
  // recordatorios no dependa de que alguien lo encuentre en Cuenta.
  function maybeShowPushPrompt() {
    if (typeof Push === "undefined" || typeof Modals === "undefined" || !Push.shouldPrompt()) return;

    setTimeout(function () {
      if (!Push.shouldPrompt()) return; // pudo activarlo/rechazarlo por otro lado mientras tanto
      var s = session();

      Modals.open({
        html:
          Modals.headerHTML({ icon: "bell", theme: "collect", title: "Activar recordatorios", sub: "Pagos, gastos del día y tu reporte semanal" }) +
          '<p style="font-size:14px;color:var(--text-secondary);line-height:1.5;margin-bottom:20px">' +
            'Te avisamos si tienes un pago por vencer, si no has registrado nada en el día, y cada domingo con tu reporte semanal.' +
          '</p>' +
          '<div class="detail-actions">' +
            '<button class="btn btn-secondary-outline" id="btn-push-later">Ahora no</button>' +
            '<button class="btn btn-primary" id="btn-push-yes">Activar</button>' +
          '</div>',
        onMount: function (sheet) {
          sheet.querySelector("#btn-push-later").addEventListener("click", function () {
            Push.dismissPrompt();
            Modals.close();
          });
          sheet.querySelector("#btn-push-yes").addEventListener("click", function () {
            var btn = sheet.querySelector("#btn-push-yes");
            btn.disabled = true;
            Push.subscribe(s.userId).then(function () {
              Modals.close();
            }).catch(function () {
              Push.dismissPrompt();
              Modals.close();
            });
          });
        }
      });
    }, 1200);
  }

  function showSetup() {
    booted = false;
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

  return {
    session: session, navigate: navigate, refresh: refresh, boot: boot, showSetup: showSetup, init: init, syncBackGuard: syncBackGuard,
    householdMembers: householdMembers, ensureHouseholdMembersLoaded: ensureHouseholdMembersLoaded,
    invalidateHouseholdMembers: invalidateHouseholdMembers
  };
})();

document.addEventListener("DOMContentLoaded", App.init);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").catch(function (e) {
      console.warn("Service worker no se pudo registrar:", e.message);
    });
  });
}
