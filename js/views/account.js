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

      installCardHTML() +

      '<div class="card">' +
        '<div class="card-label-sm">' + Icons.get("users", 12) + ' Tu código personal</div>' +
        '<p style="font-size:13px;color:var(--text-muted);margin:6px 0 12px">Compártelo con alguien que ya tenga su propia cuenta para conectarse contigo:</p>' +
        '<div class="share-row">' +
          '<span class="share-code">' + (session.inviteCode || session.code) + '</span>' +
          '<button class="btn btn-secondary btn-pill" id="btn-copy-code">' + Icons.get("copy", 14) + ' Copiar</button>' +
        '</div>' +
        '<div class="sync-status-text ' + (status === "ok" ? "ok" : "err") + '">' +
          Icons.get(status === "ok" ? "wifi" : "wifiOff", 14) + " " +
          syncStatusLabel(status) +
        '</div>' +
        (session.inviteCode && session.code !== session.inviteCode
          ? '<div class="sync-status-text ok" style="margin-top:4px">' + Icons.get("check", 14) + ' Conectado con otra cuenta (código ' + session.code + ')</div>'
          : '') +
      '</div>' +

      '<div class="card">' +
        '<div class="card-label-sm">' + Icons.get("repeat", 12) + ' Unirme a otra cuenta</div>' +
        '<p style="font-size:13px;color:var(--text-muted);margin:6px 0 12px">Escribe el código personal de alguien más para compartir su espacio financiero:</p>' +
        '<div style="display:flex;gap:10px">' +
          '<input type="text" id="input-join-code" class="input input-code" placeholder="XXXX-XXXX" maxlength="9" style="flex:1">' +
          '<button class="btn btn-primary btn-pill" id="btn-join-submit">Unirme</button>' +
        '</div>' +
        '<p class="field-error" id="join-code-error" hidden></p>' +
      '</div>' +

      '<div class="card">' +
        statRow("repeat", "Transacciones", txs.length) +
        statRow("up", "Por pagar", payablesPending.length) +
        statRow("down", "Por cobrar", receivablesPending.length) +
        statRow("sync", "Recurrentes", recurrentCount) +
        statRow("piggy", "Ahorro total", Utils.formatMoney(savingsTotal)) +
        statRow("arrowUpRight", "Flujo esperado", Utils.formatMoney(expectedFlow)) +
      '</div>' +

      '<button class="btn btn-danger-solid" id="btn-logout" style="margin-top:6px">' + Icons.get("logout", 15) + ' Cerrar sesión</button>' +
      '<button class="btn btn-danger-outline" id="btn-delete-data" style="margin-top:10px">' + Icons.get("trash", 15) + ' Eliminar todos mis datos</button>';

    attachEvents(container, session);
  }

  function installCardHTML() {
    if (typeof InstallPrompt === "undefined" || InstallPrompt.isStandalone()) return "";

    if (InstallPrompt.canPromptNatively()) {
      return (
        '<div class="card">' +
          '<div class="card-label-sm">' + Icons.get("plusCircle", 12) + ' Instalar app</div>' +
          '<p style="font-size:13px;color:var(--text-muted);margin:6px 0 12px">Agrégala a tu pantalla de inicio para abrirla como una app, sin el navegador.</p>' +
          '<button class="btn btn-primary" id="btn-install-app">' + Icons.get("plusCircle", 15) + ' Instalar app</button>' +
        '</div>'
      );
    }

    if (InstallPrompt.isIOS()) {
      return (
        '<div class="card">' +
          '<div class="card-label-sm">' + Icons.get("plusCircle", 12) + ' Instalar app</div>' +
          '<p style="font-size:13px;color:var(--text-muted);margin:6px 0 0">' +
            'Toca el botón <strong>compartir</strong> de Safari (el cuadrito con la flecha hacia arriba) y elige <strong>"Agregar a pantalla de inicio"</strong>.' +
          '</p>' +
        '</div>'
      );
    }

    return "";
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
    var installBtn = container.querySelector("#btn-install-app");
    if (installBtn) {
      installBtn.addEventListener("click", function () {
        InstallPrompt.prompt().then(function () { App.refresh(); });
      });
    }

    container.querySelector("#btn-copy-code").addEventListener("click", function (e) {
      var btn = e.currentTarget;
      var restore = btn.innerHTML;
      var codeToCopy = session.inviteCode || session.code;
      var done = function () {
        btn.innerHTML = Icons.get("check", 14) + ' Copiado';
        setTimeout(function () { btn.innerHTML = restore; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(codeToCopy).then(done).catch(function () { fallbackCopy(codeToCopy, done); });
      } else {
        fallbackCopy(codeToCopy, done);
      }
    });

    var joinInput = container.querySelector("#input-join-code");
    joinInput.addEventListener("input", function () {
      var pos = joinInput.selectionStart;
      var before = joinInput.value.length;
      joinInput.value = Utils.formatCode(joinInput.value);
      var after = joinInput.value.length;
      joinInput.setSelectionRange(pos + (after - before), pos + (after - before));
      container.querySelector("#join-code-error").hidden = true;
    });
    container.querySelector("#btn-join-submit").addEventListener("click", function () {
      joinHousehold(container, session, joinInput.value);
    });

    container.querySelector("#btn-logout").addEventListener("click", function () {
      if (confirm("¿Cerrar sesión? Tus datos siguen guardados en la nube; vuelve a entrar con tu correo cuando quieras.")) {
        Storage.sync.unsubscribe();
        Auth.signOut().then(function () { App.showSetup(); }).catch(function () { App.showSetup(); });
      }
    });

    container.querySelector("#btn-delete-data").addEventListener("click", function () {
      openDeleteDataModal(session);
    });
  }

  function openDeleteDataModal(session) {
    var shared = session.inviteCode && session.code !== session.inviteCode;
    var html =
      Modals.headerHTML({
        icon: "trash", theme: "expense",
        title: "Eliminar todos los datos",
        sub: "Esta acción no se puede deshacer"
      }) +
      '<p style="font-size:14px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px">' +
        'Se eliminarán <strong>todos</strong> tus ingresos, egresos, cobros, pagos, plantillas recurrentes y metas de ahorro, tanto de este dispositivo como de la nube.' +
      '</p>' +
      '<p style="font-size:14px;color:var(--text-secondary);line-height:1.5;margin-bottom:20px">' +
        (shared
          ? 'Tu cuenta está sincronizada con alguien más: <strong>esos datos también se eliminarán para esa persona</strong>, porque comparten el mismo espacio.'
          : 'Si en algún momento compartes tu código con alguien más, esta acción también borraría los datos que vean en ese espacio compartido.') +
      '</p>' +
      '<div class="detail-actions">' +
        '<button class="btn btn-secondary-outline" data-modal-close>Cancelar</button>' +
        '<button class="btn btn-danger-solid" id="btn-confirm-delete-data">Eliminar todo</button>' +
      '</div>';

    Modals.open({
      html: html,
      onMount: function (sheet) {
        sheet.querySelector("#btn-confirm-delete-data").addEventListener("click", function () {
          deleteAllData();
          Modals.close();
          App.refresh();
        });
      }
    });
  }

  function deleteAllData() {
    var acc = code();
    [
      Storage.transactions, Storage.recurringTransactions,
      Storage.receivables, Storage.payables,
      Storage.recurringReceivables, Storage.recurringPayables,
      Storage.savingsCategories, Storage.savingsDeposits
    ].forEach(function (api) {
      api.list(acc).forEach(function (item) { api.remove(acc, item.id); });
    });
  }

  function joinHousehold(container, session, rawCode) {
    var code = Utils.normalizeCode(rawCode);
    var errorEl = container.querySelector("#join-code-error");
    if (code.length !== 8) {
      errorEl.textContent = "Ingresa el código completo de 8 caracteres.";
      errorEl.hidden = false;
      return;
    }
    var formatted = code.slice(0, 4) + "-" + code.slice(4, 8);
    if (formatted === session.inviteCode) {
      errorEl.textContent = "Ese es tu propio código.";
      errorEl.hidden = false;
      return;
    }
    var btn = container.querySelector("#btn-join-submit");
    var original = btn.textContent;
    btn.textContent = "Uniendo…";
    btn.disabled = true;

    Auth.joinByCode(session.userId, formatted).then(function (target) {
      var newSession = Object.assign({}, session, { code: target.household_code });
      Storage.setSession(newSession);
      Storage.sync.unsubscribe();
      Storage.ensureAccount(newSession.code);
      return Storage.sync.pullAll(newSession.code).then(function () {
        Storage.sync.subscribe(newSession.code, App.refresh);
        App.refresh();
      });
    }).catch(function (err) {
      btn.textContent = original;
      btn.disabled = false;
      errorEl.textContent = err.message || String(err);
      errorEl.hidden = false;
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
