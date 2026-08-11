/* =========================================================
   admin.js — panel de administrador

   La protección real no es esta pantalla de login: es que
   admin_stats()/admin_list_accounts() en la base de datos
   revisan is_admin() y truenan si quien las llama no está en la
   tabla `admins` (ver sql/admin_panel.sql). Cualquiera que abra
   /admin.html sin ser admin ve la pantalla de login y, si de
   algún modo llega a llamar las funciones, no obtiene datos.
   ========================================================= */

var AdminApp = (function () {

  var client = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

  function el(id) { return document.getElementById(id); }

  function showLogin(message) {
    el("admin-dashboard").hidden = true;
    el("admin-login").hidden = false;
    var err = el("admin-login-error");
    if (message) { err.textContent = message; err.hidden = false; }
    else { err.hidden = true; }
  }

  function showDashboard() {
    el("admin-login").hidden = true;
    el("admin-dashboard").hidden = false;
  }

  var DAY_MS = 86400000;

  // Cada tarjeta de estadística filtra la tabla de cuentas de abajo
  // al hacer click -- la condición aquí refleja lo más cerca posible
  // lo que la misma tarjeta cuenta en admin_stats().
  var STAT_FILTERS = {
    total: null,
    users: function (r) { return Number(r.member_count) > 0; },
    transactions: function (r) { return Number(r.transaction_count) > 0; },
    new7: function (r) { return Number(r.created_at) >= Date.now() - 7 * DAY_MS; },
    new30: function (r) { return Number(r.created_at) >= Date.now() - 30 * DAY_MS; },
    paying: function (r) { return r.sub_status === "active" || r.sub_status === "trialing"; },
    trial: function (r) { return !r.sub_status && r.has_access; },
    pastdue: function (r) { return r.sub_status === "past_due"; }
  };
  var activeFilterKey = null;

  function statCardHTML(label, value, key) {
    var active = key === activeFilterKey;
    return (
      '<button type="button" class="admin-stat-card' + (active ? " active" : "") + '" data-filter-key="' + key + '">' +
        '<div class="admin-stat-label">' + Utils.escapeHtml(label) + '</div>' +
        '<div class="admin-stat-value">' + value + '</div>' +
      '</button>'
    );
  }

  function renderStats(s) {
    el("admin-stats").innerHTML = !s ? "" : (
      statCardHTML("Cuentas totales", s.total_accounts, "total") +
      statCardHTML("Usuarios totales", s.total_users, "users") +
      statCardHTML("Movimientos totales", s.total_transactions, "transactions") +
      statCardHTML("Nuevas (7 días)", s.new_accounts_7d, "new7") +
      statCardHTML("Nuevas (30 días)", s.new_accounts_30d, "new30") +
      statCardHTML("Pagando", s.paying_accounts, "paying") +
      statCardHTML("En prueba", s.trial_accounts, "trial") +
      statCardHTML("Pago fallido", s.past_due_accounts, "pastdue")
    );
  }

  function planTagHTML(r) {
    if (r.sub_status === "active" || r.sub_status === "trialing") {
      var label = r.plan === "annual" ? "Anual" : r.plan === "monthly" ? "Mensual" : "Pagando";
      return '<span class="admin-plan-tag paid">' + label + "</span>";
    }
    if (r.sub_status === "past_due") return '<span class="admin-plan-tag past-due">Pago fallido</span>';
    if (r.sub_status === "grandfathered") return '<span class="admin-plan-tag paid">Exenta</span>';
    if (r.sub_status === "canceled" || r.sub_status === "unpaid") return '<span class="admin-plan-tag none">Cancelada</span>';
    if (r.has_access) return '<span class="admin-plan-tag trial">Prueba</span>';
    return '<span class="admin-plan-tag none">Sin plan</span>';
  }

  function fmtDate(ms) {
    if (!ms) return "—";
    var d = new Date(Number(ms));
    return d.toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" }) +
      " · " + d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  }

  var allAccounts = [];
  var lastStats = null;

  function accountRowHTML(r) {
    var empty = Number(r.member_count) === 0;
    return (
      '<tr class="' + (empty ? "admin-row-empty" : "") + '">' +
        '<td class="admin-code">' + Utils.escapeHtml(r.code) + (empty ? '<span class="admin-tag-empty">Vacía</span>' : "") + "</td>" +
        "<td>" + Utils.escapeHtml(r.members) + ' <span class="admin-muted">(' + r.member_count + ")</span></td>" +
        "<td>" + fmtDate(r.created_at) + "</td>" +
        "<td>" + r.transaction_count + "</td>" +
        "<td>" + fmtDate(r.last_activity) + "</td>" +
        "<td>" + planTagHTML(r) + "</td>" +
      "</tr>"
    );
  }

  function renderAccounts() {
    var showEmpty = el("admin-show-empty").checked;
    var filterFn = activeFilterKey && STAT_FILTERS[activeFilterKey];
    var visible = allAccounts
      .filter(function (r) { return showEmpty || Number(r.member_count) > 0; })
      .filter(function (r) { return !filterFn || filterFn(r); });
    var body = el("admin-accounts-body");

    body.innerHTML = !visible.length
      ? '<tr><td colspan="6" class="admin-empty">Sin cuentas para este filtro</td></tr>'
      : visible.map(accountRowHTML).join("");

    var emptyCount = allAccounts.length - allAccounts.filter(function (r) { return Number(r.member_count) > 0; }).length;
    el("admin-empty-count").textContent = emptyCount;
    el("admin-toggle-empty-wrap").hidden = emptyCount === 0;

    var clearBtn = el("admin-clear-filter");
    clearBtn.hidden = !activeFilterKey;
  }

  function wireStatFilters() {
    el("admin-stats").addEventListener("click", function (e) {
      var card = e.target.closest(".admin-stat-card");
      if (!card) return;
      var key = card.dataset.filterKey;
      activeFilterKey = (key === "total" || key === activeFilterKey) ? null : key;
      renderStats(lastStats);
      renderAccounts();
    });
    el("admin-clear-filter").addEventListener("click", function () {
      activeFilterKey = null;
      renderStats(lastStats);
      renderAccounts();
    });
  }

  function loadDashboard() {
    return Promise.all([
      client.rpc("admin_stats"),
      client.rpc("admin_list_accounts")
    ]).then(function (results) {
      var statsRes = results[0], accountsRes = results[1];
      if (statsRes.error) throw statsRes.error;
      if (accountsRes.error) throw accountsRes.error;
      lastStats = statsRes.data && statsRes.data[0];
      renderStats(lastStats);
      allAccounts = accountsRes.data || [];
      renderAccounts();
      showDashboard();
    }).catch(function (err) {
      showLogin("No tienes acceso al panel de administrador.");
      console.warn("Admin:", err && err.message);
    });
  }

  function wireLogin() {
    var btn = el("admin-login-btn");
    btn.addEventListener("click", function () {
      var email = el("admin-email").value.trim();
      var password = el("admin-password").value;
      if (!email || !password) return;
      btn.disabled = true;
      btn.textContent = "Entrando…";
      client.auth.signInWithPassword({ email: email, password: password })
        .then(function (res) {
          if (res.error) throw res.error;
          return loadDashboard();
        })
        .catch(function (err) {
          showLogin(err.message || "No se pudo iniciar sesión.");
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = "Entrar";
        });
    });

    el("admin-password").addEventListener("keydown", function (e) {
      if (e.key === "Enter") btn.click();
    });
  }

  function wireLogout() {
    el("admin-logout").addEventListener("click", function () {
      client.auth.signOut().then(function () { showLogin(); });
    });
  }

  function wireEmptyToggle() {
    el("admin-show-empty").addEventListener("change", renderAccounts);
  }

  function init() {
    wireLogin();
    wireLogout();
    wireEmptyToggle();
    wireStatFilters();
    // si ya iniciaste sesión en la app principal en este navegador,
    // supabase-js reutiliza esa misma sesión aquí.
    client.auth.getSession().then(function (res) {
      if (res.data && res.data.session) loadDashboard();
      else showLogin();
    });
  }

  return { init: init };
})();

document.addEventListener("DOMContentLoaded", AdminApp.init);
