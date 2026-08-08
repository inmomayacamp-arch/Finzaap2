/* =========================================================
   views/account.js — pantalla "Cuenta"
   ========================================================= */

var AccountView = (function () {

  function code() { return App.session().code; }

  function render(container) {
    var session = App.session();
    var txs = Storage.transactions.list(code());
    var now = new Date();
    var key = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    var income = 0, expense = 0;
    txs.forEach(function (t) {
      if (t.date.slice(0, 7) !== key) return;
      if (t.type === "ingreso") income += t.amount; else expense += t.amount;
    });
    var balance = income - expense;

    var receivablesPending = Storage.receivables.list(code()).filter(function (r) { return r.status !== "paid"; });
    var payablesPending = Storage.payables.list(code()).filter(function (p) { return p.status !== "paid"; });
    var recurrentCount = Storage.recurringTransactions.list(code()).length +
      Storage.recurringReceivables.list(code()).length + Storage.recurringPayables.list(code()).length;
    var deposits = Storage.savingsDeposits.list(code());
    var savingsTotal = deposits.reduce(function (s, d) { return s + d.amount; }, 0);

    var wallet = txs.reduce(function (acc, t) { return acc + (t.type === "ingreso" ? t.amount : -t.amount); }, 0);
    var expectedFlow = wallet +
      receivablesPending.reduce(function (s, r) { return s + r.amount; }, 0) -
      payablesPending.reduce(function (s, p) { return s + p.amount; }, 0);

    var status = Storage.syncStatus();

    container.innerHTML =
      '<div class="page-header">' +
        '<div>' +
          '<div class="page-eyebrow">Mi</div>' +
          '<h1 class="page-title">Cuenta</h1>' +
        '</div>' +
      '</div>' +

      '<div class="profile-hero">' +
        '<div class="profile-hero-top">' +
          '<span class="avatar">' + Utils.initials(session.name) + '</span>' +
          '<div>' +
            '<div class="profile-hero-name">' + Utils.escapeHtml(session.name) + '</div>' +
            '<div class="profile-hero-sub">' + Utils.MONTHS_CAP[now.getMonth()].toLowerCase() + ' ' + now.getFullYear() + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="profile-stats">' +
          '<div class="profile-stat"><div class="p-label">Ingresos</div><div class="p-value">' + Utils.formatMoney(income) + '</div></div>' +
          '<div class="profile-stat"><div class="p-label">Egresos</div><div class="p-value">' + Utils.formatMoney(expense) + '</div></div>' +
          '<div class="profile-stat"><div class="p-label">Balance</div><div class="p-value">' + Utils.formatMoney(balance) + '</div></div>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-label-sm">' + Icons.get("users", 12) + ' Cuenta compartida</div>' +
        '<p style="font-size:13px;color:var(--text-muted);margin:6px 0 12px">Comparte este código con alguien más para sincronizar:</p>' +
        '<div class="share-row">' +
          '<span class="share-code">' + session.code + '</span>' +
          '<button class="btn btn-secondary btn-pill" id="btn-copy-code">' + Icons.get("copy", 14) + ' Copiar</button>' +
        '</div>' +
        '<div class="sync-status-text ' + (status === "ok" ? "ok" : "err") + '">' +
          Icons.get(status === "ok" ? "wifi" : "wifiOff", 14) + " " +
          syncStatusLabel(status) +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        statRow("repeat", "Transacciones", txs.length) +
        statRow("up", "Por pagar", payablesPending.length) +
        statRow("down", "Por cobrar", receivablesPending.length) +
        statRow("sync", "Recurrentes", recurrentCount) +
        statRow("piggy", "Ahorro total", Utils.formatMoney(savingsTotal)) +
        statRow("arrowUpRight", "Flujo esperado", Utils.formatMoney(expectedFlow)) +
      '</div>' +

      '<button class="btn btn-danger-solid" id="btn-logout" style="margin-top:6px">' + Icons.get("logout", 15) + ' Cerrar sesión</button>';

    attachEvents(container, session);
  }

  function syncStatusLabel(status) {
    if (!Storage.sync.isConfigured()) return "Guardado en este dispositivo";
    if (status === "ok") return "Sincronizado con la nube";
    if (status === "busy") return "Sincronizando…";
    return "Error de conexión con la nube";
  }

  function statRow(icon, label, value) {
    return (
      '<div class="stat-list-row">' +
        '<div class="stat-list-icon">' + Icons.get(icon, 17) + '</div>' +
        '<div class="stat-list-label">' + label + '</div>' +
        '<div class="stat-list-value">' + value + '</div>' +
      '</div>'
    );
  }

  function attachEvents(container, session) {
    container.querySelector("#btn-copy-code").addEventListener("click", function (e) {
      var btn = e.currentTarget;
      var restore = btn.innerHTML;
      var done = function () {
        btn.innerHTML = Icons.get("check", 14) + ' Copiado';
        setTimeout(function () { btn.innerHTML = restore; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(session.code).then(done).catch(function () { fallbackCopy(session.code, done); });
      } else {
        fallbackCopy(session.code, done);
      }
    });

    container.querySelector("#btn-logout").addEventListener("click", function () {
      if (confirm("¿Cerrar sesión en este dispositivo? Tus datos siguen guardados; podrás volver a entrar con el mismo código.")) {
        Storage.clearSession();
        App.showSetup();
      }
    });
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    done();
  }

  return { render: render };
})();
