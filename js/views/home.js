/* =========================================================
   views/home.js — pantalla Inicio (Mi Cartera)
   ========================================================= */

var HomeView = (function () {

  function code() { return App.session().code; }

  function computeWallet(list) {
    var card = 0, cash = 0;
    list.forEach(function (t) {
      var signed = t.type === "ingreso" ? t.amount : -t.amount;
      if (t.method === "tarjeta") card += signed; else cash += signed;
    });
    return { card: card, cash: cash, total: card + cash };
  }

  function monthKey(iso) { return iso.slice(0, 7); }

  function computeMonthSummary(list, year, monthIdx) {
    var key = year + "-" + String(monthIdx + 1).padStart(2, "0");
    var income = 0, expense = 0;
    list.forEach(function (t) {
      if (monthKey(t.date) !== key) return;
      if (t.type === "ingreso") income += t.amount; else expense += t.amount;
    });
    return { income: income, expense: expense, balance: income - expense };
  }

  function pendingCount() {
    var rec = Storage.receivables.list(code()).filter(function (r) { return r.status !== "paid"; });
    var pay = Storage.payables.list(code()).filter(function (p) { return p.status !== "paid"; });
    return rec.length + pay.length;
  }

  function render(container) {
    var acc = code();
    var txs = Storage.transactions.list(acc);
    var wallet = computeWallet(txs);
    var now = new Date();
    var thisMonth = computeMonthSummary(txs, now.getFullYear(), now.getMonth());
    var prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var prevMonth = computeMonthSummary(txs, prevDate.getFullYear(), prevDate.getMonth());
    var hasPrevData = txs.some(function (t) { return monthKey(t.date) === (prevDate.getFullYear() + "-" + String(prevDate.getMonth() + 1).padStart(2, "0")); });

    var recent = txs.slice().sort(sortByDateDesc).slice(0, 5);
    var dues = buildDues();

    container.innerHTML =
      '<div class="page-header">' +
        '<div>' +
          '<div class="page-eyebrow">' + Utils.MONTHS_CAP[now.getMonth()] + ' ' + now.getFullYear() + '</div>' +
          '<h1 class="page-title">Mi Cartera</h1>' +
        '</div>' +
        '<div class="home-topbar">' +
          syncBadgeHTML() +
          '<button class="avatar" id="home-avatar-btn" style="background:' + App.session().color + '" title="Ir a Cuenta">' + Utils.initials(App.session().name) + '</button>' +
        '</div>' +
      '</div>' +

      '<div class="home-grid">' +
        '<div class="home-col-left">' +

          '<div class="action-tiles">' +
            '<button class="action-tile income" id="btn-add-income">' +
              '<span class="tile-icon">' + Icons.get("arrowUpRight", 18) + '</span>' +
              '<span><span class="tile-title">Agregar Ingreso</span><br><span class="tile-sub">Registrar entrada</span></span>' +
            '</button>' +
            '<button class="action-tile expense" id="btn-add-expense">' +
              '<span class="tile-icon">' + Icons.get("arrowDownRight", 18) + '</span>' +
              '<span><span class="tile-title">Agregar Egreso</span><br><span class="tile-sub">Registrar salida</span></span>' +
            '</button>' +
          '</div>' +

          '<div class="card">' +
            '<div class="card-label-sm">Saldo disponible</div>' +
            '<div class="balance-split" style="margin-top:10px">' +
              '<div class="balance-mini">' +
                '<div class="mini-label">' + Icons.get("card", 13) + ' Tarjeta</div>' +
                '<div class="mini-value card-account">' + Utils.formatMoneyAbs(wallet.card) + '</div>' +
              '</div>' +
              '<div class="balance-mini">' +
                '<div class="mini-label">' + Icons.get("cash", 13) + ' Efectivo</div>' +
                '<div class="mini-value cash-account">' + Utils.formatMoneyAbs(wallet.cash) + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="balance-total">' +
              '<span class="label">Total</span>' +
              '<span class="value positive">' + Utils.formatMoneyAbs(wallet.total) + '</span>' +
            '</div>' +
          '</div>' +

          '<div class="card stat-card">' +
            '<div class="stat-card-row">' +
              '<div class="stat-card-main">' +
                '<div class="stat-label">Balance del mes</div>' +
                '<div class="stat-value ' + (thisMonth.balance < 0 ? "negative" : "positive") + '">' + Utils.formatMoney(thisMonth.balance) + '</div>' +
              '</div>' +
              '<div class="stat-card-breakdown">' +
                '<div class="stat-line in">+' + Utils.formatMoney(thisMonth.income) + ' <span class="lbl">ingresos</span></div>' +
                '<div class="stat-line out">-' + Utils.formatMoney(thisMonth.expense) + ' <span class="lbl">egresos</span></div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="card stat-card">' +
            (hasPrevData ?
              ('<div class="stat-card-row">' +
                '<div class="stat-card-main">' +
                  '<div class="stat-label">Mes anterior · ' + Utils.MONTHS_CAP[prevDate.getMonth()] + ' de ' + prevDate.getFullYear() + '</div>' +
                  '<div class="stat-value ' + (prevMonth.balance < 0 ? "negative" : "positive") + '">' + Utils.formatMoney(prevMonth.balance) + '</div>' +
                '</div>' +
                '<div class="stat-card-breakdown">' +
                  '<div class="stat-line in">+' + Utils.formatMoney(prevMonth.income) + ' <span class="lbl">ingresos</span></div>' +
                  '<div class="stat-line out">-' + Utils.formatMoney(prevMonth.expense) + ' <span class="lbl">egresos</span></div>' +
                '</div>' +
              '</div>')
              : ('<div class="stat-label">Mes anterior · ' + Utils.MONTHS_CAP[prevDate.getMonth()] + ' de ' + prevDate.getFullYear() + '</div>' +
                 '<div class="stat-value neutral">—</div>')) +
          '</div>' +

        '</div>' +

        '<div class="home-col-right">' +
          '<div class="card">' +
            '<div class="section-title" style="margin-bottom:8px">Últimos movimientos</div>' +
            '<div class="tx-list">' + (recent.length ? recent.map(txRowHTML).join("") : emptyStateHTML("🗒️", "Aún no hay movimientos")) + '</div>' +
          '</div>' +

          (dues.length ? (
            '<div class="card">' +
              '<div class="section-title" style="margin-bottom:4px">Próximos vencimientos</div>' +
              dues.map(dueGroupHTML).join("") +
            '</div>'
          ) : "") +
        '</div>' +
      '</div>';

    attachEvents(container);
  }

  function sortByDateDesc(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  }

  function syncBadgeHTML() {
    var status = Storage.syncStatus();
    var cls = status === "ok" ? "ok" : status === "busy" ? "busy" : "err";
    var icon = status === "ok" ? "wifi" : status === "busy" ? "sync" : "wifiOff";
    return '<span class="sync-dot ' + cls + '" title="Sincronización">' + Icons.get(icon, 18) + '</span>';
  }

  function txRowHTML(t) {
    var sign = t.type === "ingreso" ? "+" : "-";
    var amountClass = t.type === "ingreso" ? "positive" : "negative";
    return (
      '<div class="tx-row" data-tx-id="' + t.id + '">' +
        '<div class="tx-icon">' + Icons.categoryEmoji(t.category) + '</div>' +
        '<div class="tx-body">' +
          '<div class="tx-title">' +
            '<span class="tx-title-text">' + Utils.escapeHtml(t.description || "Sin descripción") + '</span>' +
            (t.recurrent ? '<span class="tag tag-recurrent">Recurrente</span>' : "") +
            (t.edited ? '<span class="tag tag-edited">Modificado</span>' : "") +
          '</div>' +
          '<div class="tx-meta">' + Utils.escapeHtml(t.category || "General") + ' · ' + t.date +
            (t.author ? ' · <span style="color:' + t.authorColor + ';font-weight:700">' + Utils.escapeHtml(t.author) + '</span>' : "") +
          '</div>' +
        '</div>' +
        '<div class="tx-amount ' + amountClass + '">' + sign + Utils.formatMoney(t.amount) + '</div>' +
        '<button class="icon-btn danger tx-delete" data-remove-tx="' + t.id + '" title="Eliminar">' + Icons.get("close", 13) + '</button>' +
      '</div>'
    );
  }

  function emptyStateHTML(emoji, text) {
    return '<div class="empty-state"><span class="empty-emoji">' + emoji + '</span>' + text + '</div>';
  }

  function buildDues() {
    var payables = Storage.payables.list(code()).filter(function (p) { return p.status !== "paid"; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(0, 2);
    var receivables = Storage.receivables.list(code()).filter(function (r) { return r.status !== "paid"; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(0, 2);

    var groups = [];
    if (payables.length) groups.push({ label: "Por pagar", theme: "pay", items: payables });
    if (receivables.length) groups.push({ label: "Por cobrar", theme: "collect", items: receivables });
    return groups;
  }

  function dueGroupHTML(group) {
    return (
      '<div class="due-group-label">' + group.label + '</div>' +
      group.items.map(function (item) {
        var days = Utils.daysUntil(item.date);
        var urgent = days <= 3;
        return (
          '<div class="due-item">' +
            '<div class="due-badge ' + group.theme + '">' + Icons.get(group.theme === "pay" ? "up" : "down", 16) + '</div>' +
            '<div>' +
              '<div class="due-title">' + Utils.escapeHtml(item.description || "Sin descripción") + '</div>' +
              '<div class="due-date' + (urgent ? " urgent" : "") + '">' + Utils.humanDueLabel(item.date) + '</div>' +
            '</div>' +
            '<div class="due-amount ' + group.theme + '">' + Utils.formatMoney(item.amount) + '</div>' +
          '</div>'
        );
      }).join("")
    );
  }

  function attachEvents(container) {
    container.querySelector("#btn-add-income").addEventListener("click", function () { openTransactionModal("ingreso"); });
    container.querySelector("#btn-add-expense").addEventListener("click", function () { openTransactionModal("egreso"); });
    container.querySelector("#home-avatar-btn").addEventListener("click", function () { App.navigate("cuenta"); });

    container.querySelectorAll("[data-remove-tx]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        Storage.transactions.remove(code(), btn.getAttribute("data-remove-tx"));
        App.refresh();
      });
    });

    container.querySelectorAll(".tx-row[data-tx-id]").forEach(function (row) {
      row.addEventListener("click", function (e) {
        if (e.target.closest("[data-remove-tx]")) return;
        var tx = Storage.transactions.list(code()).find(function (t) { return t.id === row.getAttribute("data-tx-id"); });
        if (tx) openTransactionModal(tx.type, tx);
      });
    });
  }

  // ---------------- Modal: agregar ingreso / egreso ----------------

  function openTransactionModal(type, existing) {
    var isIncome = type === "ingreso";
    var isEdit = !!existing;
    var theme = isIncome ? "income" : "expense";
    var templates = isEdit ? [] : Storage.recurringTransactions.list(code()).filter(function (r) { return r.type === type; });
    var initialMethod = isEdit ? existing.method : "efectivo";

    var html =
      Modals.headerHTML({
        icon: isIncome ? "arrowUpRight" : "arrowDownRight",
        theme: theme,
        title: (isEdit ? "Editar " : "Nuevo ") + (isIncome ? "Ingreso" : "Egreso"),
        sub: isEdit ? "Modifica el movimiento" : "Registra el movimiento",
        headerRight:
          (isEdit ? "" : '<button class="recurring-toggle-btn theme-' + (isIncome ? "green" : "red") + '" id="toggle-recurring">' + Icons.get("repeat", 14) + ' Recurrentes</button>') +
          '<button class="icon-btn danger" data-modal-close style="margin-left:6px">' + Icons.get("close", 16) + '</button>'
      }) +
      '<div id="recurring-picker-slot"></div>' +
      '<div class="field-group">' +
        '<label class="field-label">Monto (MXN)</label>' +
        '<div class="amount-field ' + theme + '">' +
          '<span class="curr-sign">$</span>' +
          '<input type="number" inputmode="decimal" id="f-amount" placeholder="0" min="0" step="0.01" value="' + (isEdit ? existing.amount : "") + '">' +
        '</div>' +
      '</div>' +
      '<div class="field-textline">' +
        '<input type="text" id="f-description" class="plain-input-underline" placeholder="Concepto" value="' + (isEdit ? Utils.escapeHtml(existing.description || "") : "") + '">' +
      '</div>' +
      '<div class="field-textline">' +
        '<input type="text" id="f-category" class="plain-input-underline" placeholder="Categoría (ej. Trabajo, Alimentación)" value="' + (isEdit ? Utils.escapeHtml(existing.category || "") : "") + '">' +
      '</div>' +
      '<div class="field-textline">' +
        '<input type="text" id="f-note" class="plain-input-underline" placeholder="Nota o comentario (opcional)" value="' + (isEdit ? Utils.escapeHtml(existing.note || "") : "") + '">' +
      '</div>' +
      '<div class="field-group">' +
        '<label class="field-label">Fecha</label>' +
        '<input type="date" id="f-date" class="input" value="' + (isEdit ? existing.date : Utils.todayISO()) + '">' +
      '</div>' +
      '<div class="field-group">' +
        '<label class="field-label">Método</label>' +
        '<div class="method-row">' +
          '<button type="button" class="method-btn' + (initialMethod === "tarjeta" ? " selected " + theme : "") + '" data-method="tarjeta">' + Icons.get("card", 15) + ' Tarjeta</button>' +
          '<button type="button" class="method-btn' + (initialMethod === "efectivo" ? " selected " + theme : "") + '" data-method="efectivo">' + Icons.get("cash", 15) + ' Efectivo</button>' +
        '</div>' +
      '</div>' +
      (isEdit ? "" :
        '<div class="field-group">' +
          '<label class="checkbox-row">' +
            '<input type="checkbox" id="f-save-recurrent">' +
            '<span><span class="cb-title">Guardar como recurrente</span><br><span class="cb-sub">Lo podrás reutilizar rápidamente</span></span>' +
          '</label>' +
        '</div>') +
      '<button class="btn ' + (isIncome ? "btn-success" : "btn-danger-solid") + ' modal-footer-btn" id="f-submit">' +
        (isEdit ? "Guardar cambios" : "Guardar " + (isIncome ? "Ingreso" : "Egreso")) +
      '</button>';

    Modals.open({
      html: html,
      onMount: function (sheet) {
        var method = initialMethod;
        sheet.querySelectorAll("[data-method]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            method = btn.getAttribute("data-method");
            sheet.querySelectorAll("[data-method]").forEach(function (b) { b.classList.remove("selected", theme); });
            btn.classList.add("selected", theme);
          });
        });

        var pickerOpen = false;
        var pickerSlot = sheet.querySelector("#recurring-picker-slot");
        var toggleBtn = sheet.querySelector("#toggle-recurring");
        if (toggleBtn) {
          toggleBtn.addEventListener("click", function () {
            pickerOpen = !pickerOpen;
            toggleBtn.classList.toggle("active", pickerOpen);
            pickerSlot.innerHTML = pickerOpen ? recurringPickerHTML(templates) : "";
            if (pickerOpen) {
              pickerSlot.querySelectorAll("[data-template-id]").forEach(function (row) {
                row.addEventListener("click", function () {
                  var tpl = templates.find(function (t) { return t.id === row.getAttribute("data-template-id"); });
                  if (!tpl) return;
                  sheet.querySelector("#f-amount").value = tpl.amount;
                  sheet.querySelector("#f-description").value = tpl.description;
                  sheet.querySelector("#f-category").value = tpl.category || "";
                  sheet.querySelector("#f-note").value = tpl.note || "";
                  method = tpl.method || "tarjeta";
                  sheet.querySelectorAll("[data-method]").forEach(function (b) {
                    b.classList.toggle("selected", b.getAttribute("data-method") === method);
                    b.classList.toggle(theme, b.getAttribute("data-method") === method);
                  });
                  pickerOpen = false;
                  toggleBtn.classList.remove("active");
                  pickerSlot.innerHTML = "";
                });
              });
            }
          });
        }

        sheet.querySelector("#f-submit").addEventListener("click", function () {
          var amount = parseFloat(sheet.querySelector("#f-amount").value);
          if (!amount || amount <= 0) { sheet.querySelector("#f-amount").focus(); return; }
          var description = sheet.querySelector("#f-description").value.trim() || (isIncome ? "Ingreso" : "Egreso");
          var category = sheet.querySelector("#f-category").value.trim() || "General";
          var note = sheet.querySelector("#f-note").value.trim();
          var date = sheet.querySelector("#f-date").value || Utils.todayISO();
          var session = App.session();

          if (isEdit) {
            Storage.transactions.update(code(), existing.id, {
              amount: amount, description: description, category: category,
              note: note, date: date, method: method, edited: true
            });
            Modals.close();
            App.refresh();
            return;
          }

          var saveRecurrent = sheet.querySelector("#f-save-recurrent").checked;
          var tx = {
            id: Utils.uid(),
            type: type,
            amount: amount,
            description: description,
            category: category,
            note: note,
            date: date,
            method: method,
            recurrent: saveRecurrent,
            author: session.name,
            authorColor: session.color,
            createdAt: Date.now()
          };
          Storage.transactions.add(code(), tx);

          if (saveRecurrent) {
            Storage.recurringTransactions.add(code(), {
              id: Utils.uid(), type: type, description: description, category: category,
              amount: amount, method: method, note: note
            });
          }

          Modals.close();
          App.refresh();
        });
      }
    });
  }

  function recurringPickerHTML(templates) {
    if (!templates.length) return '<div class="recurring-picker"><div class="empty-state" style="padding:14px">Sin plantillas guardadas</div></div>';
    return (
      '<div class="recurring-picker">' +
        '<div class="field-label" style="margin-bottom:8px">Seleccionar recurrente</div>' +
        templates.map(function (t) {
          return (
            '<div class="recurring-picker-item" data-template-id="' + t.id + '">' +
              '<div><div class="rp-name">' + Utils.escapeHtml(t.description) + '</div>' +
              '<div class="rp-meta">' + Utils.escapeHtml(t.category || "General") + ' · ' + t.method + '</div></div>' +
              '<div class="rp-amount">' + Utils.formatMoney(t.amount) + '</div>' +
            '</div>'
          );
        }).join("") +
      '</div>'
    );
  }

  return {
    render: render,
    openTransactionModal: openTransactionModal,
    txRowHTML: txRowHTML,
    emptyStateHTML: emptyStateHTML,
    recurringPickerHTML: recurringPickerHTML
  };
})();
