/* =========================================================
   views/payables.js — pantalla "Por Pagar"
   ========================================================= */

var PayablesView = (function () {

  var monthOffset = 0;

  function code() { return App.session().code; }

  function monthAt(offset) {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + offset, 1);
  }
  function monthKeyOf(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
  }

  function render(container) {
    var all = Storage.payables.list(code()).filter(function (p) { return p.status !== "paid"; });
    var selected = monthAt(monthOffset);
    var selectedKey = monthKeyOf(selected);
    var itemsInMonth = all.filter(function (p) { return p.date.slice(0, 7) === selectedKey; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var total = itemsInMonth.reduce(function (s, p) { return s + p.amount; }, 0);
    var templates = Storage.recurringPayables.list(code());

    container.innerHTML =
      '<div class="page-header">' +
        '<div>' +
          '<div class="page-eyebrow">Compromisos</div>' +
          '<h1 class="page-title">Por Pagar</h1>' +
        '</div>' +
      '</div>' +

      '<div class="month-strip" id="month-strip">' + monthStripHTML(all) + '</div>' +

      '<div class="card total-month-card with-action">' +
        '<div>' +
          '<div class="card-label-sm">Total del mes</div>' +
          '<div class="total-value theme-indigo">-' + Utils.formatMoney(total) + '</div>' +
        '</div>' +
        '<button class="btn btn-indigo btn-pill" id="btn-add-payable">' + Icons.get("plus", 15) + ' Agregar</button>' +
      '</div>' +

      '<div class="card">' +
        (itemsInMonth.length ? '<div class="tx-list">' + itemsInMonth.map(dueRowHTML).join("") : HomeView.emptyStateHTML("✅", "Nada por pagar este mes")) +
        (itemsInMonth.length ? '</div>' : '') +
      '</div>' +

      '<div class="card">' +
        '<div class="recurring-panel">' +
          '<div class="section-title">' + Icons.get("repeat", 15) + ' Pagos recurrentes <span class="recurring-count">' + templates.length + ' guardados</span></div>' +
          '<button class="btn btn-indigo btn-pill" id="btn-add-template">' + Icons.get("plus", 14) + ' Agregar</button>' +
        '</div>' +
        (templates.length ? templates.map(templateRowHTML).join("") : '<div class="empty-state" style="padding:16px 0">Sin pagos recurrentes guardados</div>') +
      '</div>';

    attachEvents(container);
  }

  function monthStripHTML(all) {
    var html = "";
    for (var i = -3; i <= 3; i++) {
      var d = monthAt(i);
      var key = monthKeyOf(d);
      var items = all.filter(function (p) { return p.date.slice(0, 7) === key; });
      var sum = items.reduce(function (s, p) { return s + p.amount; }, 0);
      var active = i === monthOffset;
      html +=
        '<button class="month-chip' + (active ? " active theme-indigo" : "") + '" data-offset="' + i + '">' +
          '<div class="m-label">' + Utils.MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear() + '</div>' +
          '<div class="m-value">' + (items.length ? Utils.formatMoney(sum) : "—") + '</div>' +
          (items.length ? '<div class="m-count">' + items.length + ' pago' + (items.length > 1 ? "s" : "") + '</div>' : "") +
        '</button>';
    }
    return html;
  }

  function dueRowHTML(item) {
    var days = Utils.daysUntil(item.date);
    var urgent = days <= 3;
    return (
      '<div class="tx-row" data-item-id="' + item.id + '">' +
        '<div class="tx-icon theme-indigo">' + Icons.get("up", 18) + '</div>' +
        '<div class="tx-body">' +
          '<div class="tx-title">' +
            '<span class="tx-title-text">' + Utils.escapeHtml(item.description || "Sin descripción") + '</span>' +
            (item.reminder ? '<span title="Tiene recordatorio">' + Icons.get("bell", 12) + '</span>' : "") +
            (item.edited ? '<span class="tag tag-edited">Modificado</span>' : "") +
          '</div>' +
          '<div class="tx-meta"><span style="' + (urgent ? "color:var(--red-500);font-weight:700" : "") + '">' + item.date + ' · ' + Utils.humanDueLabel(item.date) + '</span></div>' +
        '</div>' +
        '<div class="tx-amount" style="color:var(--indigo-500)">-' + Utils.formatMoney(item.amount) + '</div>' +
      '</div>'
    );
  }

  function templateRowHTML(tpl) {
    return (
      '<div class="recurring-template-row">' +
        '<div class="tx-icon theme-indigo">' + Icons.get("repeat", 16) + '</div>' +
        '<div class="tx-body">' +
          '<div class="tx-title">' + Utils.escapeHtml(tpl.description) + '</div>' +
          '<div class="tx-meta">' + Utils.escapeHtml(tpl.note || "Recurrente") + '</div>' +
        '</div>' +
        '<div class="tx-amount" style="color:var(--indigo-500)">-' + Utils.formatMoney(tpl.amount) + '</div>' +
        '<div class="tx-actions">' +
          '<button class="icon-btn add-tpl theme-indigo" data-use-template="' + tpl.id + '" title="Crear pago con esta plantilla">' + Icons.get("plus", 16) + '</button>' +
          '<button class="icon-btn danger" data-remove-template="' + tpl.id + '" title="Eliminar plantilla">' + Icons.get("close", 13) + '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function attachEvents(container) {
    container.querySelectorAll("[data-offset]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        monthOffset = parseInt(btn.getAttribute("data-offset"), 10);
        App.refresh();
      });
    });

    container.querySelector("#btn-add-payable").addEventListener("click", function () { openAddModal(); });
    container.querySelector("#btn-add-template").addEventListener("click", function () { openTemplateModal(); });

    container.querySelectorAll(".tx-row[data-item-id]").forEach(function (row) {
      row.addEventListener("click", function () {
        var item = Storage.payables.list(code()).find(function (p) { return p.id === row.getAttribute("data-item-id"); });
        if (item) openDetailModal(item);
      });
    });
    container.querySelectorAll("[data-use-template]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tpl = Storage.recurringPayables.list(code()).find(function (t) { return t.id === btn.getAttribute("data-use-template"); });
        if (!tpl) return;
        var session = App.session();
        Storage.payables.add(code(), {
          id: Utils.uid(), description: tpl.description, amount: tpl.amount, note: tpl.note || "",
          date: Utils.todayISO(), reminder: null, status: "pending", recurrent: true,
          author: session.name, authorColor: session.color, createdAt: Date.now()
        });
        App.refresh();
      });
    });
    container.querySelectorAll("[data-remove-template]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        Storage.recurringPayables.remove(code(), btn.getAttribute("data-remove-template"));
        App.refresh();
      });
    });
  }

  function openConfirmPayModal(item) {
    var html =
      Modals.headerHTML({ icon: "check", theme: "pay", title: "Confirmar pago", sub: Utils.escapeHtml(item.description || "Sin descripción") }) +
      '<div class="detail-amount negative">-' + Utils.formatMoney(item.amount) + '</div>' +
      '<p style="font-size:14px;color:var(--text-secondary);line-height:1.5;margin-bottom:16px">Esto se <strong>descontará</strong> de tu saldo disponible.</p>' +
      '<div class="field-group">' +
        '<label class="field-label">¿Con qué método pagaste?</label>' +
        '<div class="method-row">' +
          '<button type="button" class="method-btn" data-method="tarjeta">' + Icons.get("card", 15) + ' Tarjeta</button>' +
          '<button type="button" class="method-btn selected pay" data-method="efectivo">' + Icons.get("cash", 15) + ' Efectivo</button>' +
        '</div>' +
      '</div>' +
      '<div class="detail-actions">' +
        '<button class="btn btn-secondary-outline" data-modal-close>Cancelar</button>' +
        '<button class="btn btn-indigo" id="btn-confirm-pay">Confirmar pago</button>' +
      '</div>';

    Modals.open({
      html: html,
      onMount: function (sheet) {
        var method = "efectivo";
        sheet.querySelectorAll("[data-method]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            method = btn.getAttribute("data-method");
            sheet.querySelectorAll("[data-method]").forEach(function (b) { b.classList.remove("selected", "pay"); });
            btn.classList.add("selected", "pay");
          });
        });
        sheet.querySelector("#btn-confirm-pay").addEventListener("click", function () {
          var session = App.session();
          Storage.transactions.add(code(), {
            id: Utils.uid(), type: "egreso", amount: item.amount, description: item.description || "Pago", category: "Por pagar",
            note: item.note || "", date: Utils.todayISO(), method: method, recurrent: false,
            author: session.name, authorColor: session.color, createdAt: Date.now()
          });
          Storage.payables.remove(code(), item.id);
          Modals.close();
          App.refresh();
        });
      }
    });
  }

  function openDetailModal(item) {
    var rows = [
      { label: "Concepto", value: Utils.escapeHtml(item.description || "Sin descripción") },
      { label: "Vence", value: item.date + " · " + Utils.humanDueLabel(item.date) }
    ];
    if (item.reminder) rows.push({ label: "Recordatorio", value: item.reminder });
    if (item.note) rows.push({ label: "Nota", value: Utils.escapeHtml(item.note) });
    if (item.author) rows.push({ label: "Registró", value: '<span style="color:' + Utils.escapeHtml(item.authorColor) + ';font-weight:700">' + Utils.escapeHtml(item.author) + '</span>' });

    var tags = "";
    if (item.recurrent) tags += '<span class="tag tag-recurrent">Recurrente</span>';
    if (item.edited) tags += '<span class="tag tag-edited">Modificado</span>';

    var html =
      Modals.headerHTML({ icon: "up", theme: "pay", title: "Por pagar", sub: "Detalle del pago" }) +
      '<div class="detail-amount negative">-' + Utils.formatMoney(item.amount) + '</div>' +
      (tags ? '<div class="detail-tags" style="justify-content:flex-start;margin-bottom:16px">' + tags + '</div>' : "") +
      '<div class="detail-list">' +
        rows.map(function (r) { return '<div class="detail-row"><span class="dr-label">' + r.label + '</span><span class="dr-value">' + r.value + '</span></div>'; }).join("") +
      '</div>' +
      '<div class="detail-actions">' +
        '<button class="btn btn-indigo" id="btn-confirm-item">' + Icons.get("check", 15) + ' Confirmar pago</button>' +
      '</div>' +
      '<div class="detail-actions">' +
        '<button class="btn btn-secondary-outline" id="btn-edit-item">Editar</button>' +
        '<button class="btn btn-danger-outline" id="btn-delete-item">Eliminar</button>' +
      '</div>';

    Modals.open({
      html: html,
      onMount: function (sheet) {
        sheet.querySelector("#btn-confirm-item").addEventListener("click", function () {
          Modals.close();
          openConfirmPayModal(item);
        });
        sheet.querySelector("#btn-edit-item").addEventListener("click", function () {
          Modals.close();
          openAddModal(item);
        });
        sheet.querySelector("#btn-delete-item").addEventListener("click", function () {
          Storage.payables.remove(code(), item.id);
          Modals.close();
          App.refresh();
        });
      }
    });
  }

  function openAddModal(existing) {
    var isEdit = !!existing;
    var templates = isEdit ? [] : Storage.recurringPayables.list(code());
    var html =
      Modals.headerHTML({ icon: "up", theme: "pay", title: isEdit ? "Editar pago" : "Pago por hacer", sub: isEdit ? "Modifica el movimiento" : "Registra un compromiso",
        headerRight: (isEdit ? "" : '<button class="recurring-toggle-btn theme-indigo" id="toggle-recurring">' + Icons.get("repeat", 14) + ' Recurrentes</button>') +
          '<button class="icon-btn danger" data-modal-close style="margin-left:6px">' + Icons.get("close", 16) + '</button>' }) +
      '<div id="recurring-picker-slot"></div>' +
      '<div class="field-group">' +
        '<label class="field-label">Monto (MXN)</label>' +
        '<div class="amount-field pay"><span class="curr-sign">$</span><input type="number" inputmode="decimal" id="f-amount" placeholder="0" min="0" step="0.01" value="' + (isEdit ? existing.amount : "") + '"></div>' +
      '</div>' +
      '<div class="field-textline"><input type="text" id="f-description" class="plain-input-underline" placeholder="Concepto" value="' + (isEdit ? Utils.escapeHtml(existing.description || "") : "") + '"></div>' +
      '<div class="field-textline"><input type="text" id="f-note" class="plain-input-underline" placeholder="Nota o comentario (opcional)" value="' + (isEdit ? Utils.escapeHtml(existing.note || "") : "") + '"></div>' +
      '<div class="field-group"><label class="field-label">Fecha de vencimiento</label><input type="date" id="f-date" class="input" value="' + (isEdit ? existing.date : Utils.todayISO()) + '"></div>' +
      '<div class="field-group"><label class="field-label">' + Icons.get("bell", 12) + ' Recordatorio (opcional)</label><input type="date" id="f-reminder" class="input" value="' + (isEdit ? (existing.reminder || "") : "") + '"></div>' +
      (isEdit ? "" :
        '<div class="field-group"><label class="checkbox-row"><input type="checkbox" id="f-save-recurrent">' +
          '<span><span class="cb-title">Guardar como recurrente</span><br><span class="cb-sub">Lo podrás reutilizar la próxima vez</span></span></label></div>') +
      '<button class="btn btn-indigo modal-footer-btn" id="f-submit">' + (isEdit ? "Guardar cambios" : "Guardar") + '</button>';

    Modals.open({
      html: html,
      onMount: function (sheet) {
        if (!isEdit) {
          bindRecurringPicker(sheet, templates, function (tpl) {
            sheet.querySelector("#f-amount").value = tpl.amount;
            sheet.querySelector("#f-description").value = tpl.description;
            sheet.querySelector("#f-note").value = tpl.note || "";
          });
        }

        sheet.querySelector("#f-submit").addEventListener("click", function () {
          var amount = parseFloat(sheet.querySelector("#f-amount").value);
          if (!amount || amount <= 0) { sheet.querySelector("#f-amount").focus(); return; }
          var description = sheet.querySelector("#f-description").value.trim() || "Por pagar";
          var note = sheet.querySelector("#f-note").value.trim();
          var date = sheet.querySelector("#f-date").value || Utils.todayISO();
          var reminder = sheet.querySelector("#f-reminder").value || null;

          if (isEdit) {
            Storage.payables.update(code(), existing.id, { amount: amount, description: description, note: note, date: date, reminder: reminder, edited: true });
            Modals.close();
            App.refresh();
            return;
          }

          var saveRecurrent = sheet.querySelector("#f-save-recurrent").checked;
          var session = App.session();

          Storage.payables.add(code(), {
            id: Utils.uid(), description: description, amount: amount, note: note, date: date, reminder: reminder,
            status: "pending", recurrent: saveRecurrent, author: session.name, authorColor: session.color, createdAt: Date.now()
          });
          if (saveRecurrent) {
            Storage.recurringPayables.add(code(), { id: Utils.uid(), description: description, amount: amount, note: note });
          }
          Modals.close();
          App.refresh();
        });
      }
    });
  }

  function bindRecurringPicker(sheet, templates, onPick) {
    var toggleBtn = sheet.querySelector("#toggle-recurring");
    var slot = sheet.querySelector("#recurring-picker-slot");
    if (!toggleBtn) return;
    var open = false;
    toggleBtn.addEventListener("click", function () {
      open = !open;
      toggleBtn.classList.toggle("active", open);
      slot.innerHTML = open ? HomeView.recurringPickerHTML(templates) : "";
      if (open) {
        slot.querySelectorAll("[data-template-id]").forEach(function (row) {
          row.addEventListener("click", function () {
            var tpl = templates.find(function (t) { return t.id === row.getAttribute("data-template-id"); });
            if (tpl) onPick(tpl);
            open = false;
            toggleBtn.classList.remove("active");
            slot.innerHTML = "";
          });
        });
      }
    });
  }

  function openTemplateModal() {
    var html =
      Modals.headerHTML({ icon: "repeat", theme: "pay", title: "Nuevo recurrente", sub: "Plantilla de pago" }) +
      '<div class="field-group"><label class="field-label">Monto (MXN)</label>' +
      '<div class="amount-field pay"><span class="curr-sign">$</span><input type="number" inputmode="decimal" id="f-amount" placeholder="0" min="0" step="0.01"></div></div>' +
      '<div class="field-textline"><input type="text" id="f-description" class="plain-input-underline" placeholder="Concepto"></div>' +
      '<div class="field-textline"><input type="text" id="f-note" class="plain-input-underline" placeholder="Nota (opcional)"></div>' +
      '<button class="btn btn-indigo modal-footer-btn" id="f-submit">Guardar plantilla</button>';

    Modals.open({
      html: html,
      onMount: function (sheet) {
        sheet.querySelector("#f-submit").addEventListener("click", function () {
          var amount = parseFloat(sheet.querySelector("#f-amount").value);
          if (!amount || amount <= 0) { sheet.querySelector("#f-amount").focus(); return; }
          var description = sheet.querySelector("#f-description").value.trim() || "Recurrente";
          var note = sheet.querySelector("#f-note").value.trim();
          Storage.recurringPayables.add(code(), { id: Utils.uid(), description: description, amount: amount, note: note });
          Modals.close();
          App.refresh();
        });
      }
    });
  }

  return { render: render };
})();
