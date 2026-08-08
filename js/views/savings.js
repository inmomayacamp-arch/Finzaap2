/* =========================================================
   views/savings.js — pantalla "Ahorro"
   ========================================================= */

var SavingsView = (function () {

  var EMOJI_OPTIONS = ["🛡️","✈️","🚗","🏠","🎓","💍","🎉","📱","💻","🏥","🐾","👶","🎸","🏝️","💰","🧧","🎁","🚲","⛺","🩺","🛠️"];

  function code() { return App.session().code; }

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
          '<div class="goal-emoji">' + cat.icon + '</div>' +
          '<div>' +
            '<div class="goal-name">' + Utils.escapeHtml(cat.name) + '</div>' +
            (cat.goal > 0 ? '<div class="goal-meta">Meta: ' + Utils.formatMoney(cat.goal) + '</div>' : '<div class="goal-meta">Sin meta definida</div>') +
          '</div>' +
          '<div class="goal-amounts">' +
            '<div class="cur">' + Utils.formatMoney(total) + '</div>' +
            (pct !== null ? '<div class="pct">' + pct + '%</div>' : '') +
          '</div>' +
          '<button class="icon-btn" data-remove-category="' + cat.id + '" title="Eliminar categoría" style="margin-left:6px">' + Icons.get("close", 13) + '</button>' +
        '</div>' +
        (cat.goal > 0 ? '<div class="progress-track"><div class="progress-fill' + (pct >= 100 ? " complete" : "") + '" style="width:' + pct + '%"></div></div>' : '') +
        (sorted.length
          ? sorted.map(function (d) {
              var isWithdraw = d.amount < 0;
              return '<div class="deposit-row">' +
                '<div class="dep-date">' + d.date + ' · ' + (d.method === "tarjeta" ? "Tarjeta" : "Efectivo") + (d.note ? " · " + Utils.escapeHtml(d.note) : "") + '</div>' +
                '<div class="dep-amount' + (isWithdraw ? " withdraw" : "") + '">' + (isWithdraw ? "" : "+") + Utils.formatMoney(d.amount) + '</div>' +
                '<button class="icon-btn" data-remove-deposit="' + d.id + '" title="Eliminar depósito">' + Icons.get("close", 12) + '</button>' +
              '</div>';
            }).join("")
          : '<div class="empty-state" style="padding:10px 0">Aún sin depósitos</div>') +
      '</div>'
    );
  }

  function attachEvents(container) {
    container.querySelector("#btn-add-category").addEventListener("click", openCategoryModal);
    container.querySelector("#btn-add-deposit").addEventListener("click", function () { openDepositModal(); });

    container.querySelectorAll(".goal-card").forEach(function (card) {
      card.addEventListener("click", function (e) {
        if (e.target.closest("[data-remove-category]") || e.target.closest("[data-remove-deposit]")) return;
        openAdjustModal(card.getAttribute("data-category-id"));
      });
    });

    container.querySelectorAll("[data-remove-category]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = btn.getAttribute("data-remove-category");
        Storage.savingsCategories.remove(code(), id);
        Storage.savingsDeposits.list(code()).filter(function (d) { return d.categoryId === id; })
          .forEach(function (d) { Storage.savingsDeposits.remove(code(), d.id); });
        App.refresh();
      });
    });
    container.querySelectorAll("[data-remove-deposit]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        Storage.savingsDeposits.remove(code(), btn.getAttribute("data-remove-deposit"));
        App.refresh();
      });
    });
  }

  function openCategoryModal() {
    var html =
      Modals.headerHTML({ icon: "piggy", theme: "savings", title: "Nueva meta de ahorro", sub: "Solo crea la meta, sin dinero todavía" }) +
      '<div class="field-group"><label class="field-label">Ícono</label>' +
        '<div class="emoji-grid">' + EMOJI_OPTIONS.map(function (e, i) {
          return '<div class="emoji-opt' + (i === 0 ? " selected" : "") + '" data-emoji="' + e + '">' + e + '</div>';
        }).join("") + '</div>' +
      '</div>' +
      '<div class="field-textline"><input type="text" id="f-name" class="plain-input-underline" placeholder="Nombre (ej. Fondo de emergencia)"></div>' +
      '<div class="field-group"><label class="field-label">Meta en pesos (opcional)</label>' +
        '<div class="amount-field collect"><span class="curr-sign">$</span><input type="number" inputmode="decimal" id="f-goal" placeholder="0" min="0" step="0.01"></div>' +
      '</div>' +
      '<button class="btn btn-amber modal-footer-btn" id="f-submit">Crear meta</button>';

    Modals.open({
      html: html,
      onMount: function (sheet) {
        var selected = EMOJI_OPTIONS[0];
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
          Storage.savingsCategories.add(code(), { id: Utils.uid(), icon: selected, name: name, goal: goal, createdAt: Date.now() });
          Modals.close();
          App.refresh();
        });
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
            categories.map(function (c) { return '<option value="' + c.id + '"' + (c.id === preselectId ? " selected" : "") + '>' + c.icon + " " + Utils.escapeHtml(c.name) + '</option>'; }).join("") +
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
      '<button class="btn btn-amber modal-footer-btn" id="f-submit">Guardar</button>';

    Modals.open({
      html: html,
      onMount: function (sheet) {
        var method = "efectivo";
        var mode = hasCategories ? "existing" : "new";
        var selectedEmoji = EMOJI_OPTIONS[0];

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
          });
        });

        sheet.querySelector("#f-submit").addEventListener("click", function () {
          var amount = parseFloat(sheet.querySelector("#f-amount").value);
          if (!amount || amount <= 0) { sheet.querySelector("#f-amount").focus(); return; }
          var note = sheet.querySelector("#f-note").value.trim();
          var date = sheet.querySelector("#f-date").value || Utils.todayISO();
          var session = App.session();

          var categoryId;
          if (mode === "new") {
            var newName = sheet.querySelector("#f-new-name").value.trim();
            if (!newName) { sheet.querySelector("#f-new-name").focus(); return; }
            var newGoal = parseFloat(sheet.querySelector("#f-new-goal").value) || 0;
            categoryId = Utils.uid();
            Storage.savingsCategories.add(code(), { id: categoryId, icon: selectedEmoji, name: newName, goal: newGoal, createdAt: Date.now() });
          } else {
            categoryId = sheet.querySelector("#f-category").value;
          }

          Storage.savingsDeposits.add(code(), {
            id: Utils.uid(), categoryId: categoryId, amount: amount, note: note, date: date, method: method,
            author: session.name, authorColor: session.color, createdAt: Date.now()
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
        title: cat.icon + " " + Utils.escapeHtml(cat.name),
        sub: "Saldo actual: " + Utils.formatMoney(currentTotal)
      }) +
      '<div class="segmented" id="direction-toggle" style="margin-bottom:16px">' +
        '<button type="button" class="active" data-direction="add">Agregar saldo</button>' +
        '<button type="button" data-direction="remove">Quitar saldo</button>' +
      '</div>' +
      '<div class="field-group">' +
        '<label class="field-label">Monto (MXN)</label>' +
        '<div class="amount-field income" id="adjust-amount-field"><span class="curr-sign">$</span><input type="number" inputmode="decimal" id="f-amount" placeholder="0" min="0" step="0.01"></div>' +
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
      '<button class="btn btn-success modal-footer-btn" id="f-submit">Agregar saldo</button>';

    Modals.open({
      html: html,
      onMount: function (sheet) {
        var direction = "add";
        var method = "efectivo";
        var amountField = sheet.querySelector("#adjust-amount-field");
        var submitBtn = sheet.querySelector("#f-submit");

        sheet.querySelectorAll("[data-direction]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            direction = btn.getAttribute("data-direction");
            sheet.querySelectorAll("[data-direction]").forEach(function (b) { b.classList.remove("active"); });
            btn.classList.add("active");
            if (direction === "add") {
              amountField.classList.remove("expense");
              amountField.classList.add("income");
              submitBtn.className = "btn btn-success modal-footer-btn";
              submitBtn.textContent = "Agregar saldo";
            } else {
              amountField.classList.remove("income");
              amountField.classList.add("expense");
              submitBtn.className = "btn btn-danger-solid modal-footer-btn";
              submitBtn.textContent = "Quitar saldo";
            }
          });
        });

        sheet.querySelectorAll("[data-method]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            method = btn.getAttribute("data-method");
            sheet.querySelectorAll("[data-method]").forEach(function (b) { b.classList.remove("selected", "neutral"); });
            btn.classList.add("selected", "neutral");
          });
        });

        submitBtn.addEventListener("click", function () {
          var amount = parseFloat(sheet.querySelector("#f-amount").value);
          if (!amount || amount <= 0) { sheet.querySelector("#f-amount").focus(); return; }
          var note = sheet.querySelector("#f-note").value.trim();
          var date = sheet.querySelector("#f-date").value || Utils.todayISO();
          var session = App.session();
          var signedAmount = direction === "add" ? amount : -amount;
          Storage.savingsDeposits.add(code(), {
            id: Utils.uid(), categoryId: categoryId, amount: signedAmount, note: note, date: date, method: method,
            author: session.name, authorColor: session.color, createdAt: Date.now()
          });
          Modals.close();
          App.refresh();
        });
      }
    });
  }

  return { render: render };
})();
