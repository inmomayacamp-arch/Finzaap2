/* =========================================================
   views/savings.js — pantalla "Ahorro"
   ========================================================= */

var SavingsView = (function () {

  var EMOJI_OPTIONS = ["🛡️","✈️","🚗","🏠","🎓","💍","🎉","📱","💻","🏥","🐾","👶","🎸","🏝️","💰","🧧","🎁","🚲","⛺","🩺","🛠️"];

  function code() { return App.session().code; }

  // saldo disponible en la billetera (ingresos - egresos) para un metodo dado,
  // igual al calculo de "Saldo disponible" en Inicio
  function availableBalance(method) {
    return Storage.transactions.list(code()).reduce(function (sum, t) {
      if (t.method !== method) return sum;
      return sum + (t.type === "ingreso" ? t.amount : -t.amount);
    }, 0);
  }

  // crea el movimiento espejo en Inicio/Reporte para que ahorrar salga
  // realmente del saldo disponible (y retirar regrese a el)
  function pushLinkedTransaction(type, description, amount, method, date) {
    var session = App.session();
    var tx = {
      id: Utils.uid(), type: type, amount: amount, description: description, category: "Ahorro",
      note: "", date: date, method: method, recurrent: false,
      author: session.name, authorColor: session.color, createdAt: Date.now()
    };
    Storage.transactions.add(code(), tx);
    return tx.id;
  }

  function render(container) {
    var categories = Storage.savingsCategories.list(code());
    var deposits = Storage.savingsDeposits.list(code());

    var totalCard = 0, totalCash = 0;
    deposits.forEach(function (d) { if (d.method === "tarjeta") totalCard += d.amount; else totalCash += d.amount; });
    var totalAll = totalCard + totalCash;

    container.innerHTML =
      '<div class="page-header">' +
        '<div>' +
          '<div class="page-eyebrow">Independiente</div>' +
          '<h1 class="page-title">Ahorro</h1>' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn btn-indigo btn-pill" id="btn-add-category">+ Agregar Meta</button>' +
          '<button class="btn btn-amber btn-pill" id="btn-add-deposit">+ Agregar</button>' +
        '</div>' +
      '</div>' +

      '<div class="savings-hero">' +
        '<div class="card-label-sm">Total ahorrado</div>' +
        '<div class="total-value">' + Utils.formatMoney(totalAll) + '</div>' +
        '<div class="split-row">' +
          '<div class="split-item"><div class="lbl">' + Icons.get("card", 12) + ' Tarjeta</div><div class="val">' + Utils.formatMoney(totalCard) + '</div></div>' +
          '<div class="split-item"><div class="lbl">' + Icons.get("cash", 12) + ' Efectivo</div><div class="val">' + Utils.formatMoney(totalCash) + '</div></div>' +
        '</div>' +
      '</div>' +

      (categories.length
        ? categories.map(function (cat) { return goalCardHTML(cat, deposits.filter(function (d) { return d.categoryId === cat.id; })); }).join("")
        : '<div class="card">' + HomeView.emptyStateHTML("🐷", "Crea tu primera meta de ahorro") + '</div>');

    attachEvents(container);
  }

  function goalCardHTML(cat, deposits) {
    var total = deposits.reduce(function (s, d) { return s + d.amount; }, 0);
    var pct = cat.goal > 0 ? Utils.clamp(Math.round((total / cat.goal) * 100), 0, 100) : null;
    var sorted = deposits.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    return (
      '<div class="card goal-card" data-category-id="' + cat.id + '">' +
        '<div class="goal-head">' +
          '<div class="goal-emoji">' + Utils.escapeHtml(cat.icon) + '</div>' +
          '<div>' +
            '<div class="goal-name">' + Utils.escapeHtml(cat.name) + '</div>' +
            (cat.goal > 0 ? '<div class="goal-meta">Meta: ' + Utils.formatMoney(cat.goal) + '</div>' : '<div class="goal-meta">Sin meta definida</div>') +
          '</div>' +
          '<div class="goal-amounts">' +
            '<div class="cur">' + Utils.formatMoney(total) + '</div>' +
            (pct !== null ? '<div class="pct">' + pct + '%</div>' : '') +
          '</div>' +
          '<button class="icon-btn" data-edit-category="' + cat.id + '" title="Editar meta" style="margin-left:6px">' + Icons.get("edit", 13) + '</button>' +
        '</div>' +
        (cat.goal > 0 ? '<div class="progress-track"><div class="progress-fill' + (pct >= 100 ? " complete" : "") + '" style="width:' + pct + '%"></div></div>' : '') +
        (sorted.length
          ? sorted.map(function (d) {
              var isWithdraw = d.amount < 0;
              return '<div class="deposit-row" data-deposit-id="' + d.id + '">' +
                '<div class="dep-date">' + d.date + ' · ' + (d.method === "tarjeta" ? "Tarjeta" : "Efectivo") + (d.note ? " · " + Utils.escapeHtml(d.note) : "") + '</div>' +
                (d.edited ? '<span class="tag tag-edited">Modificado</span>' : "") +
                '<div class="dep-amount' + (isWithdraw ? " withdraw" : "") + '">' + (isWithdraw ? "" : "+") + Utils.formatMoney(d.amount) + '</div>' +
              '</div>';
            }).join("")
          : '<div class="empty-state" style="padding:10px 0">Aún sin depósitos</div>') +
      '</div>'
    );
  }

  function attachEvents(container) {
    container.querySelector("#btn-add-category").addEventListener("click", function () { openCategoryModal(); });
    container.querySelector("#btn-add-deposit").addEventListener("click", function () { openDepositModal(); });

    container.querySelectorAll(".goal-card").forEach(function (card) {
      card.addEventListener("click", function (e) {
        if (e.target.closest("[data-edit-category]") || e.target.closest(".deposit-row")) return;
        openAdjustModal(card.getAttribute("data-category-id"));
      });
    });

    container.querySelectorAll("[data-edit-category]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = btn.getAttribute("data-edit-category");
        var cat = Storage.savingsCategories.list(code()).find(function (c) { return c.id === id; });
        if (cat) openCategoryModal(cat);
      });
    });

    container.querySelectorAll(".deposit-row[data-deposit-id]").forEach(function (row) {
      row.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = row.getAttribute("data-deposit-id");
        var dep = Storage.savingsDeposits.list(code()).find(function (d) { return d.id === id; });
        var cat = Storage.savingsCategories.list(code()).find(function (c) { return c.id === (dep && dep.categoryId); });
        if (dep && cat) openDepositDetailModal(dep, cat);
      });
    });

  }

  function removeCategoryAndDeposits(id) {
    Storage.savingsCategories.remove(code(), id);
    Storage.savingsDeposits.list(code()).filter(function (d) { return d.categoryId === id; })
      .forEach(function (d) {
        Storage.savingsDeposits.remove(code(), d.id);
        if (d.linkedTxId) Storage.transactions.remove(code(), d.linkedTxId);
      });
  }

  function openCategoryModal(existing) {
    var isEdit = !!existing;
    var html =
      Modals.headerHTML({
        icon: "piggy", theme: "savings",
        title: isEdit ? "Editar meta" : "Nueva meta de ahorro",
        sub: isEdit ? "Cambia el ícono, nombre o meta" : "Solo crea la meta, sin dinero todavía"
      }) +
      '<div class="field-group"><label class="field-label">Ícono</label>' +
        '<div class="emoji-grid">' + EMOJI_OPTIONS.map(function (e) {
          return '<div class="emoji-opt' + (e === (isEdit ? existing.icon : EMOJI_OPTIONS[0]) ? " selected" : "") + '" data-emoji="' + e + '">' + e + '</div>';
        }).join("") + '</div>' +
      '</div>' +
      '<div class="field-textline"><input type="text" id="f-name" class="plain-input-underline" placeholder="Nombre (ej. Fondo de emergencia)" value="' + (isEdit ? Utils.escapeHtml(existing.name || "") : "") + '"></div>' +
      '<div class="field-group"><label class="field-label">Meta en pesos (opcional)</label>' +
        '<div class="amount-field collect"><span class="curr-sign">$</span><input type="number" inputmode="decimal" id="f-goal" placeholder="0" min="0" step="0.01" value="' + (isEdit && existing.goal > 0 ? existing.goal : "") + '"></div>' +
      '</div>' +
      (isEdit
        ? '<div class="detail-actions">' +
            '<button class="btn btn-danger-outline" id="btn-delete-category">Eliminar</button>' +
            '<button class="btn btn-amber" id="f-submit">Guardar cambios</button>' +
          '</div>'
        : '<button class="btn btn-amber modal-footer-btn" id="f-submit">Crear meta</button>');

    Modals.open({
      html: html,
      onMount: function (sheet) {
        var selected = isEdit ? existing.icon : EMOJI_OPTIONS[0];
        sheet.querySelectorAll("[data-emoji]").forEach(function (opt) {
          opt.addEventListener("click", function () {
            selected = opt.getAttribute("data-emoji");
            sheet.querySelectorAll("[data-emoji]").forEach(function (o) { o.classList.remove("selected"); });
            opt.classList.add("selected");
          });
        });
        sheet.querySelector("#f-submit").addEventListener("click", function () {
          var name = sheet.querySelector("#f-name").value.trim();
          if (!name) { sheet.querySelector("#f-name").focus(); return; }
          var goal = parseFloat(sheet.querySelector("#f-goal").value) || 0;
          if (isEdit) {
            Storage.savingsCategories.update(code(), existing.id, { icon: selected, name: name, goal: goal });
          } else {
            Storage.savingsCategories.add(code(), { id: Utils.uid(), icon: selected, name: name, goal: goal, createdAt: Date.now() });
          }
          Modals.close();
          App.refresh();
        });
        if (isEdit) {
          sheet.querySelector("#btn-delete-category").addEventListener("click", function () {
            removeCategoryAndDeposits(existing.id);
            Modals.close();
            App.refresh();
          });
        }
      }
    });
  }

  function openDepositModal(preselectId) {
    var categories = Storage.savingsCategories.list(code());
    var hasCategories = categories.length > 0;

    var html =
      Modals.headerHTML({ icon: "piggy", theme: "savings", title: "Agregar dinero", sub: "Crea una meta nueva o abona a una que ya tengas" }) +
      (hasCategories ?
        '<div class="segmented" id="mode-toggle" style="margin-bottom:16px">' +
          '<button type="button" class="active" data-mode="existing">Meta existente</button>' +
          '<button type="button" data-mode="new">Nueva meta</button>' +
        '</div>'
        : '') +
      '<div id="existing-slot"' + (hasCategories ? '' : ' hidden') + '>' +
        '<div class="field-group"><label class="field-label">Categoría</label>' +
          '<select id="f-category" class="input">' +
            categories.map(function (c) { return '<option value="' + Utils.escapeHtml(c.id) + '"' + (c.id === preselectId ? " selected" : "") + '>' + Utils.escapeHtml(c.icon) + " " + Utils.escapeHtml(c.name) + '</option>'; }).join("") +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div id="new-slot"' + (hasCategories ? ' hidden' : '') + '>' +
        '<div class="field-group"><label class="field-label">Ícono</label>' +
          '<div class="emoji-grid">' + EMOJI_OPTIONS.map(function (e, i) {
            return '<div class="emoji-opt' + (i === 0 ? " selected" : "") + '" data-emoji="' + e + '">' + e + '</div>';
          }).join("") + '</div>' +
        '</div>' +
        '<div class="field-textline"><input type="text" id="f-new-name" class="plain-input-underline" placeholder="Nombre de la meta (ej. Viaje)"></div>' +
        '<div class="field-group"><label class="field-label">Meta en pesos (opcional)</label>' +
          '<div class="amount-field collect"><span class="curr-sign">$</span><input type="number" inputmode="decimal" id="f-new-goal" placeholder="0" min="0" step="0.01"></div>' +
        '</div>' +
      '</div>' +
      '<div class="field-group">' +
        '<label class="field-label">Monto a depositar (MXN)</label>' +
        '<div class="amount-field collect"><span class="curr-sign">$</span><input type="number" inputmode="decimal" id="f-amount" placeholder="0" min="0" step="0.01"></div>' +
        '<div id="balance-hint" style="font-size:12px;color:var(--text-muted);margin-top:6px"></div>' +
      '</div>' +
      '<div class="field-textline"><input type="text" id="f-note" class="plain-input-underline" placeholder="Nota (opcional)"></div>' +
      '<div class="field-group"><label class="field-label">Fecha</label><input type="date" id="f-date" class="input" value="' + Utils.todayISO() + '"></div>' +
      '<div class="field-group">' +
        '<label class="field-label">Método</label>' +
        '<div class="method-row">' +
          '<button type="button" class="method-btn" data-method="tarjeta">' + Icons.get("card", 15) + ' Tarjeta</button>' +
          '<button type="button" class="method-btn selected neutral" data-method="efectivo">' + Icons.get("cash", 15) + ' Efectivo</button>' +
        '</div>' +
      '</div>' +
      '<p class="field-error" id="f-error" hidden></p>' +
      '<button class="btn btn-amber modal-footer-btn" id="f-submit">Guardar</button>';

    Modals.open({
      html: html,
      onMount: function (sheet) {
        var method = "efectivo";
        var mode = hasCategories ? "existing" : "new";
        var selectedEmoji = EMOJI_OPTIONS[0];
        var hintEl = sheet.querySelector("#balance-hint");
        var errorEl = sheet.querySelector("#f-error");

        function updateHint() {
          hintEl.textContent = "Disponible en " + (method === "tarjeta" ? "tarjeta" : "efectivo") + ": " + Utils.formatMoney(availableBalance(method));
        }
        updateHint();

        if (hasCategories) {
          sheet.querySelectorAll("[data-mode]").forEach(function (btn) {
            btn.addEventListener("click", function () {
              mode = btn.getAttribute("data-mode");
              sheet.querySelectorAll("[data-mode]").forEach(function (b) { b.classList.remove("active"); });
              btn.classList.add("active");
              sheet.querySelector("#existing-slot").hidden = mode !== "existing";
              sheet.querySelector("#new-slot").hidden = mode !== "new";
            });
          });
        }

        sheet.querySelectorAll("[data-emoji]").forEach(function (opt) {
          opt.addEventListener("click", function () {
            selectedEmoji = opt.getAttribute("data-emoji");
            sheet.querySelectorAll("[data-emoji]").forEach(function (o) { o.classList.remove("selected"); });
            opt.classList.add("selected");
          });
        });

        sheet.querySelectorAll("[data-method]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            method = btn.getAttribute("data-method");
            sheet.querySelectorAll("[data-method]").forEach(function (b) { b.classList.remove("selected", "neutral"); });
            btn.classList.add("selected", "neutral");
            updateHint();
            errorEl.hidden = true;
          });
        });

        sheet.querySelector("#f-submit").addEventListener("click", function () {
          var amount = parseFloat(sheet.querySelector("#f-amount").value);
          if (!amount || amount <= 0) { sheet.querySelector("#f-amount").focus(); return; }
          errorEl.hidden = true;

          if (mode === "new" && !sheet.querySelector("#f-new-name").value.trim()) {
            sheet.querySelector("#f-new-name").focus();
            return;
          }

          var available = availableBalance(method);
          if (amount > available) {
            errorEl.textContent = "No tienes suficiente saldo en " + (method === "tarjeta" ? "tarjeta" : "efectivo") + ". Disponible: " + Utils.formatMoney(available);
            errorEl.hidden = false;
            sheet.querySelector("#f-amount").focus();
            return;
          }

          var note = sheet.querySelector("#f-note").value.trim();
          var date = sheet.querySelector("#f-date").value || Utils.todayISO();
          var session = App.session();

          var categoryId, categoryName;
          if (mode === "new") {
            categoryName = sheet.querySelector("#f-new-name").value.trim();
            var newGoal = parseFloat(sheet.querySelector("#f-new-goal").value) || 0;
            categoryId = Utils.uid();
            Storage.savingsCategories.add(code(), { id: categoryId, icon: selectedEmoji, name: categoryName, goal: newGoal, createdAt: Date.now() });
          } else {
            categoryId = sheet.querySelector("#f-category").value;
            var cat = categories.find(function (c) { return c.id === categoryId; });
            categoryName = cat ? cat.name : "Ahorro";
          }

          var linkedTxId = pushLinkedTransaction("egreso", "Ahorro: " + categoryName, amount, method, date);

          Storage.savingsDeposits.add(code(), {
            id: Utils.uid(), categoryId: categoryId, amount: amount, note: note, date: date, method: method,
            author: session.name, authorColor: session.color, createdAt: Date.now(), linkedTxId: linkedTxId
          });
          Modals.close();
          App.refresh();
        });
      }
    });
  }

  function openAdjustModal(categoryId) {
    var cat = Storage.savingsCategories.list(code()).find(function (c) { return c.id === categoryId; });
    if (!cat) return;
    var currentTotal = Storage.savingsDeposits.list(code())
      .filter(function (d) { return d.categoryId === categoryId; })
      .reduce(function (s, d) { return s + d.amount; }, 0);

    var html =
      Modals.headerHTML({
        icon: "piggy", theme: "savings",
        title: Utils.escapeHtml(cat.icon) + " " + Utils.escapeHtml(cat.name),
        sub: "Saldo actual: " + Utils.formatMoney(currentTotal)
      }) +
      '<div class="segmented" id="direction-toggle" style="margin-bottom:16px">' +
        '<button type="button" class="active" data-direction="add">Agregar saldo</button>' +
        '<button type="button" data-direction="remove">Usar ahorro</button>' +
      '</div>' +
      '<div class="field-group">' +
        '<label class="field-label">Monto (MXN)</label>' +
        '<div class="amount-field income" id="adjust-amount-field"><span class="curr-sign">$</span><input type="number" inputmode="decimal" id="f-amount" placeholder="0" min="0" step="0.01"></div>' +
        '<div id="balance-hint" style="font-size:12px;color:var(--text-muted);margin-top:6px"></div>' +
      '</div>' +
      '<div class="field-textline"><input type="text" id="f-note" class="plain-input-underline" placeholder="Nota (opcional)"></div>' +
      '<div class="field-group"><label class="field-label">Fecha</label><input type="date" id="f-date" class="input" value="' + Utils.todayISO() + '"></div>' +
      '<div class="field-group">' +
        '<label class="field-label">Método</label>' +
        '<div class="method-row">' +
          '<button type="button" class="method-btn" data-method="tarjeta">' + Icons.get("card", 15) + ' Tarjeta</button>' +
          '<button type="button" class="method-btn selected neutral" data-method="efectivo">' + Icons.get("cash", 15) + ' Efectivo</button>' +
        '</div>' +
      '</div>' +
      '<p class="field-error" id="f-error" hidden></p>' +
      '<button class="btn btn-success modal-footer-btn" id="f-submit">Agregar saldo</button>';

    Modals.open({
      html: html,
      onMount: function (sheet) {
        var direction = "add";
        var method = "efectivo";
        var amountField = sheet.querySelector("#adjust-amount-field");
        var submitBtn = sheet.querySelector("#f-submit");
        var hintEl = sheet.querySelector("#balance-hint");
        var errorEl = sheet.querySelector("#f-error");

        function updateHint() {
          if (direction === "add") {
            hintEl.textContent = "Disponible en " + (method === "tarjeta" ? "tarjeta" : "efectivo") + ": " + Utils.formatMoney(availableBalance(method));
          } else {
            hintEl.textContent = "Ahorrado en esta meta: " + Utils.formatMoney(currentTotal);
          }
        }
        updateHint();

        sheet.querySelectorAll("[data-direction]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            direction = btn.getAttribute("data-direction");
            sheet.querySelectorAll("[data-direction]").forEach(function (b) { b.classList.remove("active"); });
            btn.classList.add("active");
            errorEl.hidden = true;
            if (direction === "add") {
              amountField.classList.remove("expense");
              amountField.classList.add("income");
              submitBtn.className = "btn btn-success modal-footer-btn";
              submitBtn.textContent = "Agregar saldo";
            } else {
              amountField.classList.remove("income");
              amountField.classList.add("expense");
              submitBtn.className = "btn btn-danger-solid modal-footer-btn";
              submitBtn.textContent = "Usar ahorro";
            }
            updateHint();
          });
        });

        sheet.querySelectorAll("[data-method]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            method = btn.getAttribute("data-method");
            sheet.querySelectorAll("[data-method]").forEach(function (b) { b.classList.remove("selected", "neutral"); });
            btn.classList.add("selected", "neutral");
            updateHint();
            errorEl.hidden = true;
          });
        });

        submitBtn.addEventListener("click", function () {
          var amount = parseFloat(sheet.querySelector("#f-amount").value);
          if (!amount || amount <= 0) { sheet.querySelector("#f-amount").focus(); return; }
          errorEl.hidden = true;

          if (direction === "add") {
            var available = availableBalance(method);
            if (amount > available) {
              errorEl.textContent = "No tienes suficiente saldo en " + (method === "tarjeta" ? "tarjeta" : "efectivo") + ". Disponible: " + Utils.formatMoney(available);
              errorEl.hidden = false;
              sheet.querySelector("#f-amount").focus();
              return;
            }
          } else if (amount > currentTotal) {
            errorEl.textContent = "No puedes usar más de lo que has ahorrado aquí (" + Utils.formatMoney(currentTotal) + ").";
            errorEl.hidden = false;
            sheet.querySelector("#f-amount").focus();
            return;
          }

          var note = sheet.querySelector("#f-note").value.trim();
          var date = sheet.querySelector("#f-date").value || Utils.todayISO();
          var session = App.session();
          var signedAmount = direction === "add" ? amount : -amount;

          // "Agregar saldo" sale de tu billetera y queda como egreso en movimientos.
          // "Usar ahorro" solo reduce la meta: el dinero ya salio de tu billetera
          // cuando lo ahorraste, asi que no vuelve a sumarse como ingreso.
          var linkedTxId = direction === "add"
            ? pushLinkedTransaction("egreso", "Ahorro: " + cat.name, amount, method, date)
            : null;

          Storage.savingsDeposits.add(code(), {
            id: Utils.uid(), categoryId: categoryId, amount: signedAmount, note: note, date: date, method: method,
            author: session.name, authorColor: session.color, createdAt: Date.now(), linkedTxId: linkedTxId
          });
          Modals.close();
          App.refresh();
        });
      }
    });
  }

  function openDepositDetailModal(dep, cat) {
    var isWithdraw = dep.amount < 0;

    var rows = [
      { label: "Meta", value: Utils.escapeHtml(cat.icon) + " " + Utils.escapeHtml(cat.name) },
      { label: "Fecha", value: dep.date },
      { label: "Método", value: dep.method === "tarjeta" ? "Tarjeta" : "Efectivo" }
    ];
    if (dep.note) rows.push({ label: "Nota", value: Utils.escapeHtml(dep.note) });
    if (dep.author) rows.push({ label: "Registró", value: '<span style="color:' + Utils.escapeHtml(dep.authorColor) + ';font-weight:700">' + Utils.escapeHtml(dep.author) + '</span>' });

    var tags = dep.edited ? '<span class="tag tag-edited">Modificado</span>' : "";

    var html =
      Modals.headerHTML({
        icon: "piggy", theme: "savings",
        title: isWithdraw ? "Uso de ahorro" : "Ahorro",
        sub: "Detalle del movimiento"
      }) +
      '<div class="detail-amount ' + (isWithdraw ? "negative" : "positive") + '">' + (isWithdraw ? "-" : "+") + Utils.formatMoney(Math.abs(dep.amount)) + '</div>' +
      (tags ? '<div class="detail-tags" style="justify-content:flex-start;margin-bottom:16px">' + tags + '</div>' : "") +
      '<div class="detail-list">' +
        rows.map(function (r) { return '<div class="detail-row"><span class="dr-label">' + r.label + '</span><span class="dr-value">' + r.value + '</span></div>'; }).join("") +
      '</div>' +
      '<p class="field-error" id="f-error" hidden></p>' +
      '<div class="detail-actions">' +
        '<button class="btn btn-danger-outline" id="btn-delete-dep">Eliminar</button>' +
        '<button class="btn ' + (isWithdraw ? "btn-danger-solid" : "btn-success") + '" id="btn-edit-dep">Editar</button>' +
      '</div>';

    Modals.open({
      html: html,
      onMount: function (sheet) {
        sheet.querySelector("#btn-edit-dep").addEventListener("click", function () {
          Modals.close();
          openEditDepositModal(dep, cat);
        });
        sheet.querySelector("#btn-delete-dep").addEventListener("click", function () {
          var catTotal = Storage.savingsDeposits.list(code())
            .filter(function (d) { return d.categoryId === cat.id; })
            .reduce(function (s, d) { return s + d.amount; }, 0);
          if (catTotal - dep.amount < -0.001) {
            var errorEl = sheet.querySelector("#f-error");
            errorEl.textContent = "No puedes eliminar este ahorro: ya usaste parte de él y la meta quedaría en negativo.";
            errorEl.hidden = false;
            return;
          }
          Storage.savingsDeposits.remove(code(), dep.id);
          if (dep.linkedTxId) Storage.transactions.remove(code(), dep.linkedTxId);
          Modals.close();
          App.refresh();
        });
      }
    });
  }

  function openEditDepositModal(dep, cat) {
    var isWithdraw = dep.amount < 0;
    var totalExcludingThis = Storage.savingsDeposits.list(code())
      .filter(function (d) { return d.categoryId === cat.id && d.id !== dep.id; })
      .reduce(function (s, d) { return s + d.amount; }, 0);

    var html =
      Modals.headerHTML({
        icon: "piggy", theme: "savings",
        title: (isWithdraw ? "Editar uso: " : "Editar ahorro: ") + Utils.escapeHtml(cat.icon) + " " + Utils.escapeHtml(cat.name),
        sub: isWithdraw ? "Esto no afecta tu saldo disponible" : "Ajusta lo que sale de tu saldo disponible"
      }) +
      '<div class="field-group">' +
        '<label class="field-label">Monto (MXN)</label>' +
        '<div class="amount-field ' + (isWithdraw ? "expense" : "income") + '"><span class="curr-sign">$</span><input type="number" inputmode="decimal" id="f-amount" placeholder="0" min="0" step="0.01" value="' + Math.abs(dep.amount) + '"></div>' +
        '<div id="balance-hint" style="font-size:12px;color:var(--text-muted);margin-top:6px"></div>' +
      '</div>' +
      '<div class="field-textline"><input type="text" id="f-note" class="plain-input-underline" placeholder="Nota (opcional)" value="' + Utils.escapeHtml(dep.note || "") + '"></div>' +
      '<div class="field-group"><label class="field-label">Fecha</label><input type="date" id="f-date" class="input" value="' + dep.date + '"></div>' +
      '<div class="field-group">' +
        '<label class="field-label">Método</label>' +
        '<div class="method-row">' +
          '<button type="button" class="method-btn' + (dep.method === "tarjeta" ? " selected neutral" : "") + '" data-method="tarjeta">' + Icons.get("card", 15) + ' Tarjeta</button>' +
          '<button type="button" class="method-btn' + (dep.method === "efectivo" ? " selected neutral" : "") + '" data-method="efectivo">' + Icons.get("cash", 15) + ' Efectivo</button>' +
        '</div>' +
      '</div>' +
      '<p class="field-error" id="f-error" hidden></p>' +
      '<button class="btn ' + (isWithdraw ? "btn-danger-solid" : "btn-success") + ' modal-footer-btn" id="f-submit">Guardar cambios</button>';

    Modals.open({
      html: html,
      onMount: function (sheet) {
        var method = dep.method;
        var errorEl = sheet.querySelector("#f-error");
        var hintEl = sheet.querySelector("#balance-hint");

        function updateHint() {
          if (isWithdraw) {
            hintEl.textContent = "Ahorrado en esta meta (sin este movimiento): " + Utils.formatMoney(totalExcludingThis);
          } else {
            var wasSameMethod = method === dep.method;
            var available = availableBalance(method) + (wasSameMethod ? Math.abs(dep.amount) : 0);
            hintEl.textContent = "Disponible en " + (method === "tarjeta" ? "tarjeta" : "efectivo") + ": " + Utils.formatMoney(available);
          }
        }
        updateHint();

        sheet.querySelectorAll("[data-method]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            method = btn.getAttribute("data-method");
            sheet.querySelectorAll("[data-method]").forEach(function (b) { b.classList.remove("selected", "neutral"); });
            btn.classList.add("selected", "neutral");
            updateHint();
            errorEl.hidden = true;
          });
        });

        sheet.querySelector("#f-submit").addEventListener("click", function () {
          var amount = parseFloat(sheet.querySelector("#f-amount").value);
          if (!amount || amount <= 0) { sheet.querySelector("#f-amount").focus(); return; }
          errorEl.hidden = true;

          if (isWithdraw) {
            if (amount > totalExcludingThis) {
              errorEl.textContent = "No puedes usar más de lo que has ahorrado aquí (" + Utils.formatMoney(totalExcludingThis) + ").";
              errorEl.hidden = false;
              sheet.querySelector("#f-amount").focus();
              return;
            }
          } else {
            var wasSameMethod = method === dep.method;
            var available = availableBalance(method) + (wasSameMethod ? Math.abs(dep.amount) : 0);
            if (amount > available) {
              errorEl.textContent = "No tienes suficiente saldo en " + (method === "tarjeta" ? "tarjeta" : "efectivo") + ". Disponible: " + Utils.formatMoney(available);
              errorEl.hidden = false;
              sheet.querySelector("#f-amount").focus();
              return;
            }
            if (totalExcludingThis + amount < -0.001) {
              errorEl.textContent = "No puedes bajar tanto este ahorro: ya usaste parte de él y la meta quedaría en negativo (mínimo " + Utils.formatMoney(-totalExcludingThis) + ").";
              errorEl.hidden = false;
              sheet.querySelector("#f-amount").focus();
              return;
            }
          }

          var note = sheet.querySelector("#f-note").value.trim();
          var date = sheet.querySelector("#f-date").value || dep.date;
          var signedAmount = isWithdraw ? -amount : amount;

          Storage.savingsDeposits.update(code(), dep.id, { amount: signedAmount, note: note, date: date, method: method, edited: true });

          if (dep.linkedTxId) {
            Storage.transactions.update(code(), dep.linkedTxId, {
              amount: amount, note: note, date: date, method: method, edited: true
            });
          }

          Modals.close();
          App.refresh();
        });
      }
    });
  }

  return { render: render };
})();
