/* =========================================================
   views/receivables.js — pantalla "Por Cobrar"
   ========================================================= */

var ReceivablesView = (function () {

  var monthOffset = 0; // 0 = mes actual

  function code() { return App.session().code; }

  function monthAt(offset) {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + offset, 1);
  }

  function monthKeyOf(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
  }

  function render(container) {
    var all = Storage.receivables.list(code()).filter(function (r) { return r.status !== "paid"; });
    var selected = monthAt(monthOffset);
    var selectedKey = monthKeyOf(selected);
    var itemsInMonth = all.filter(function (r) { return r.date.slice(0, 7) === selectedKey; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var total = itemsInMonth.reduce(function (s, r) { return s + r.amount; }, 0);
    var templates = Storage.recurringReceivables.list(code());

    container.innerHTML =
      '<div class="page-header">' +
        '<div>' +
          '<div class="page-eyebrow">Esperados</div>' +
          '<h1 class="page-title">Por Cobrar</h1>' +
        '</div>' +
        '<button class="btn btn-amber btn-pill" id="btn-add-receivable">' + Icons.get("plus", 15) + ' Agregar</button>' +
      '</div>' +

      '<div class="month-strip" id="month-strip">' + monthStripHTML(all) + '</div>' +

      '<div class="card total-month-card">' +
        '<div class="card-label-sm">Total del mes</div>' +
        '<div class="total-value theme-amber">' + Utils.formatMoney(total) + '</div>' +
      '</div>' +

      '<div class="card">' +
        (itemsInMonth.length ? '<div class="tx-list">' + itemsInMonth.map(dueRowHTML).join("") + '</div>' : HomeView.emptyStateHTML("💤", "Nada por cobrar este mes")) +
      '</div>' +

      '<div class="card">' +
        '<div class="recurring-panel">' +
          '<div class="section-title">' + Icons.get("repeat", 15) + ' Ingresos recurrentes <span class="recurring-count">' + templates.length + ' guardados</span></div>' +
          '<button class="btn btn-amber btn-pill" id="btn-add-template">' + Icons.get("plus", 14) + ' Agregar</button>' +
        '</div>' +
        (templates.length ? templates.map(templateRowHTML).join("") : '<div class="empty-state" style="padding:16px 0">Sin ingresos recurrentes guardados</div>') +
      '</div>';

    attachEvents(container);
  }

  function monthStripHTML(all) {
    var html = "";
    for (var i = -3; i <= 3; i++) {
      var d = monthAt(i);
      var key = monthKeyOf(d);
      var items = all.filter(function (r) { return r.date.slice(0, 7) === key; });
      var sum = items.reduce(function (s, r) { return s + r.amount; }, 0);
      var active = i === monthOffset;
      html +=
        '<button class="month-chip' + (active ? " active theme-amber" : "") + '" data-offset="' + i + '">' +
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
        '<div class="tx-icon theme-amber">' + Icons.get("down", 18) + '</div>' +
        '<div class="tx-body">' +
          '<div class="tx-title">' +
            '<span class="tx-title-text">' + Utils.escapeHtml(item.description || "Sin descripción") + '</span>' +
            (item.edited ? '<span class="tag tag-edited">Modificado</span>' : "") +
          '</div>' +
          '<div class="tx-meta' + (urgent ? "" : "") + '">' +
            '<span style="' + (urgent ? "color:var(--red-500);font-weight:700" : "") + '">' + item.date + ' · ' + Utils.humanDueLabel(item.date) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="tx-amount" style="color:var(--amber-500)">' + Utils.formatMoney(item.amount) + '</div>' +
        '<div class="tx-actions">' +
          '<button class="icon-btn confirm" data-mark-paid="' + item.id + '" title="Marcar como cobrado">' + Icons.get("check", 14) + '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function templateRowHTML(tpl) {
    return (
      '<div class="recurring-template-row">' +
        '<div class="tx-icon theme-amber">' + Icons.get("repeat", 16) + '</div>' +
        '<div class="tx-body">' +
          '<div class="tx-title">' + Utils.escapeHtml(tpl.description) + '</div>' +
          '<div class="tx-meta">' + Utils.escapeHtml(tpl.note || "Recurrente") + '</div>' +
        '</div>' +
        '<div class="tx-amount" style="color:var(--amber-500)">' + Utils.formatMoney(tpl.amount) + '</div>' +
        '<div class="tx-actions">' +
          '<button class="icon-btn add-tpl theme-amber" data-use-template="' + tpl.id + '" title="Crear cobro con esta plantilla">' + Icons.get("plus", 16) + '</button>' +
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

    container.querySelector("#btn-add-receivable").addEventListener("click", function () { openAddModal(); });
    container.querySelector("#btn-add-template").addEventListener("click", function () { openTemplateModal(); });

    container.querySelectorAll("[data-mark-paid]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        Storage.receivables.remove(code(), btn.getAttribute("data-mark-paid"));
        App.refresh();
      });
    });
    container.querySelectorAll(".tx-row[data-item-id]").forEach(function (row) {
      row.addEventListener("click", function (e) {
        if (e.target.closest("[data-mark-paid]")) return;
        var item = Storage.receivables.list(code()).find(function (r) { return r.id === row.getAttribute("data-item-id"); });
        if (item) openDetailModal(item);
      });
    });
    container.querySelectorAll("[data-use-template]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tpl = Storage.recurringReceivables.list(code()).find(function (t) { return t.id === btn.getAttribute("data-use-template"); });
        if (!tpl) return;
        var session = App.session();
        Storage.receivables.add(code(), {
          id: Utils.uid(), description: tpl.description, amount: tpl.amount, note: tpl.note || "",
          date: Utils.todayISO(), status: "pending", recurrent: true,
          author: session.name, authorColor: session.color, createdAt: Date.now()
        });
        App.refresh();
      });
    });
    container.querySelectorAll("[data-remove-template]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        Storage.recurringReceivables.remove(code(), btn.getAttribute("data-remove-template"));
        App.refresh();
      });
    });
  }

  function openDetailModal(item) {
    var rows = [
      { label: "Concepto", value: Utils.escapeHtml(item.description || "Sin descripción") },
      { label: "Vence", value: item.date + " · " + Utils.humanDueLabel(item.date) }
    ];
    if (item.note) rows.push({ label: "Nota", value: Utils.escapeHtml(item.note) });
    if (item.author) rows.push({ label: "Registró", value: '<span style="color:' + item.authorColor + ';font-weight:700">' + Utils.escapeHtml(item.author) + '</span>' });

    var tags = "";
    if (item.recurrent) tags += '<span class="tag tag-recurrent">Recurrente</span>';
    if (item.edited) tags += '<span class="tag tag-edited">Modificado</span>';

    var html =
      Modals.headerHTML({ icon: "down", theme: "collect", title: "Por cobrar", sub: "Detalle del cobro" }) +
      '<div class="detail-amount neutral">' + Utils.formatMoney(item.amount) + '</div>' +
      (tags ? '<div class="detail-tags" style="justify-content:flex-start;margin-bottom:16px">' + tags + '</div>' : "") +
      '<div class="detail-list">' +
        rows.map(function (r) { return '<div class="detail-row"><span class="dr-label">' + r.label + '</span><span class="dr-value">' + r.value + '</span></div>'; }).join("") +
      '</div>' +
      '<div class="detail-actions">' +
        '<button class="btn btn-danger-outline" id="btn-delete-item">Eliminar</button>' +
        '<button class="btn btn-amber" id="btn-edit-item">Editar</button>' +
      '</div>';

    Modals.open({
      html: html,
      onMount: function (sheet) {
        sheet.querySelector("#btn-edit-item").addEventListener("click", function () {
          Modals.close();
          openAddModal(item);
        });
        sheet.querySelector("#btn-delete-item").addEventListener("click", function () {
          Storage.receivables.remove(code(), item.id);
          Modals.close();
          App.refresh();
        });
      }
    });
  }

  function openAddModal(existing) {
    var isEdit = !!existing;
    var templates = isEdit ? [] : Storage.recurringReceivables.list(code());
    var html =
      Modals.headerHTML({ icon: "down", theme: "collect", title: isEdit ? "Editar cobro" : "Pago por cobrar", sub: isEdit ? "Modifica el movimiento" : "Registra lo que te deben",
        headerRight: (isEdit ? "" : '<button class="recurring-toggle-btn theme-amber" id="toggle-recurring">' + Icons.get("repeat", 14) + ' Recurrentes</button>') +
          '<button class="icon-btn danger" data-modal-close style="margin-left:6px">' + Icons.get("close", 16) + '</button>' }) +
      '<div id="recurring-picker-slot"></div>' +
      '<div class="field-group">' +
        '<label class="field-label">Monto (MXN)</label>' +
        '<div class="amount-field collect"><span class="curr-sign">$</span><input type="number" inputmode="decimal" id="f-amount" placeholder="0" min="0" step="0.01" value="' + (isEdit ? existing.amount : "") + '"></div>' +
      '</div>' +
      '<div class="field-textline"><input type="text" id="f-description" class="plain-input-underline" placeholder="Concepto" value="' + (isEdit ? Utils.escapeHtml(existing.description || "") : "") + '"></div>' +
      '<div class="field-textline"><input type="text" id="f-note" class="plain-input-underline" placeholder="Nota o comentario (opcional)" value="' + (isEdit ? Utils.escapeHtml(existing.note || "") : "") + '"></div>' +
      '<div class="field-group"><label class="field-label">Fecha de vencimiento</label><input type="date" id="f-date" class="input" value="' + (isEdit ? existing.date : Utils.todayISO()) + '"></div>' +
      (isEdit ? "" :
        '<div class="field-group"><label class="checkbox-row"><input type="checkbox" id="f-save-recurrent">' +
          '<span><span class="cb-title">Guardar como recurrente</span><br><span class="cb-sub">Lo podrás reutilizar la próxima vez</span></span></label></div>') +
      '<button class="btn btn-amber modal-footer-btn" id="f-submit">' + (isEdit ? "Guardar cambios" : "Guardar") + '</button>';

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
          var description = sheet.querySelector("#f-description").value.trim() || "Por cobrar";
          var note = sheet.querySelector("#f-note").value.trim();
          var date = sheet.querySelector("#f-date").value || Utils.todayISO();

          if (isEdit) {
            Storage.receivables.update(code(), existing.id, { amount: amount, description: description, note: note, date: date, edited: true });
            Modals.close();
            App.refresh();
            return;
          }

          var saveRecurrent = sheet.querySelector("#f-save-recurrent").checked;
          var session = App.session();

          Storage.receivables.add(code(), {
            id: Utils.uid(), description: description, amount: amount, note: note, date: date,
            status: "pending", recurrent: saveRecurrent, author: session.name, authorColor: session.color, createdAt: Date.now()
          });
          if (saveRecurrent) {
            Storage.recurringReceivables.add(code(), { id: Utils.uid(), description: description, amount: amount, note: note });
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
      Modals.headerHTML({ icon: "repeat", theme: "collect", title: "Nuevo recurrente", sub: "Plantilla de cobro" }) +
      '<div class="field-group"><label class="field-label">Monto (MXN)</label>' +
      '<div class="amount-field collect"><span class="curr-sign">$</span><input type="number" inputmode="decimal" id="f-amount" placeholder="0" min="0" step="0.01"></div></div>' +
      '<div class="field-textline"><input type="text" id="f-description" class="plain-input-underline" placeholder="Concepto"></div>' +
      '<div class="field-textline"><input type="text" id="f-note" class="plain-input-underline" placeholder="Nota (opcional)"></div>' +
      '<button class="btn btn-amber modal-footer-btn" id="f-submit">Guardar plantilla</button>';

    Modals.open({
      html: html,
      onMount: function (sheet) {
        sheet.querySelector("#f-submit").addEventListener("click", function () {
          var amount = parseFloat(sheet.querySelector("#f-amount").value);
          if (!amount || amount <= 0) { sheet.querySelector("#f-amount").focus(); return; }
          var description = sheet.querySelector("#f-description").value.trim() || "Recurrente";
          var note = sheet.querySelector("#f-note").value.trim();
          Storage.recurringReceivables.add(code(), { id: Utils.uid(), description: description, amount: amount, note: note });
          Modals.close();
          App.refresh();
        });
      }
    });
  }

  return { render: render };
})();
