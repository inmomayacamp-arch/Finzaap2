/* =========================================================
   views/report.js — pantalla "Reporte" (análisis + PDF)
   ========================================================= */

var ReportView = (function () {

  var periodType = "mes"; // 'dia' | 'semana' | 'mes'
  var periodOffset = 0;
  var typeFilter = "todo"; // 'todo' | 'ingresos' | 'egresos'
  var showAllTx = false;
  var TX_PREVIEW_COUNT = 7;
  var searchQuery = "";

  // mismas categorías sugeridas de egresos que en el formulario de
  // movimientos (js/views/home.js) -- duplicadas aquí a propósito, es
  // una lista corta y evita acoplar los dos módulos solo por esto.
  var BUDGET_CATEGORY_SUGGESTIONS = [
    "Alimentación", "Transporte", "Vivienda", "Servicios", "Salud",
    "Entretenimiento", "Ropa", "Educación", "Deudas", "General"
  ];

  function code() { return App.session().code; }

  function startOfWeek(date) {
    var d = new Date(date);
    var day = (d.getDay() + 6) % 7; // lunes = 0
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function rangeForOffset(offset) {
    var today = new Date();
    if (periodType === "dia") {
      var d = new Date(today);
      d.setDate(d.getDate() + offset);
      return { start: d, end: d };
    }
    if (periodType === "semana") {
      var base = new Date(today);
      base.setDate(base.getDate() + offset * 7);
      var start = startOfWeek(base);
      var end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { start: start, end: end };
    }
    // mes
    var m = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    var mEnd = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
    return { start: m, end: mEnd };
  }

  function periodRange() { return rangeForOffset(periodOffset); }

  function periodLabel(range) {
    if (periodType === "dia") {
      return range.start.getDate() + " de " + Utils.MONTHS_CAP[range.start.getMonth()].toLowerCase() + " de " + range.start.getFullYear();
    }
    if (periodType === "semana") {
      var sameMonth = range.start.getMonth() === range.end.getMonth();
      var s = range.start.getDate() + (sameMonth ? "" : " " + Utils.MONTHS_SHORT[range.start.getMonth()]);
      var e = range.end.getDate() + " " + Utils.MONTHS_SHORT[range.end.getMonth()] + " " + range.end.getFullYear();
      return s + " – " + e;
    }
    return Utils.monthLabelCap(range.start.getFullYear(), range.start.getMonth());
  }

  function inRange(iso, range) {
    var d = Utils.parseISO(iso);
    return d >= stripTime(range.start) && d <= stripTime(range.end);
  }
  function stripTime(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  function render(container) {
    var all = Storage.transactions.list(code());
    var range = periodRange();
    var inPeriod = all.filter(function (t) { return inRange(t.date, range); });
    var filtered = inPeriod.filter(function (t) {
      if (typeFilter === "ingresos") return t.type === "ingreso";
      if (typeFilter === "egresos") return t.type === "egreso";
      return true;
    });

    var income = inPeriod.filter(function (t) { return t.type === "ingreso"; }).reduce(function (s, t) { return s + t.amount; }, 0);
    var expense = inPeriod.filter(function (t) { return t.type === "egreso"; }).reduce(function (s, t) { return s + t.amount; }, 0);
    var balance = income - expense;

    var prevRange = rangeForOffset(periodOffset - 1);
    var prevPeriod = all.filter(function (t) { return inRange(t.date, prevRange); });
    var prevIncome = prevPeriod.filter(function (t) { return t.type === "ingreso"; }).reduce(function (s, t) { return s + t.amount; }, 0);
    var prevExpense = prevPeriod.filter(function (t) { return t.type === "egreso"; }).reduce(function (s, t) { return s + t.amount; }, 0);
    var prevBalance = prevIncome - prevExpense;

    var savingsCategories = Storage.savingsCategories.list(code());
    var savingsDeposits = Storage.savingsDeposits.list(code());
    var budgets = Storage.budgets.list(code());

    var sorted = filtered.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    container.innerHTML =
      '<div class="page-header">' +
        '<div>' +
          '<div class="page-eyebrow">Análisis</div>' +
          '<h1 class="page-title">Reporte</h1>' +
        '</div>' +
        '<button class="btn btn-primary btn-pill" id="btn-export-pdf">' + Icons.get("pdf", 15) + ' PDF</button>' +
      '</div>' +

      '<div class="segmented" id="period-type-toggle">' +
        segBtn("dia", "Día") + segBtn("semana", "Semana") + segBtn("mes", "Mes") +
      '</div>' +

      '<div class="period-nav">' +
        '<button id="period-prev">' + Icons.get("chevronLeft", 16) + '</button>' +
        '<div class="period-label">' + periodLabel(range) + '</div>' +
        '<button id="period-next">' + Icons.get("chevronRight", 16) + '</button>' +
      '</div>' +

      '<div class="segmented" id="type-toggle">' +
        typeBtn("todo", "Todo") + typeBtn("ingresos", "Ingresos") + typeBtn("egresos", "Egresos") +
      '</div>' +

      '<div class="summary-tiles">' +
        '<div class="summary-tile"><div class="stl-label">Ingresos</div><div class="stl-value" style="color:var(--green-500)">' + Utils.formatMoney(income) + '</div>' + deltaBadgeHTML(income, prevIncome, false) + '</div>' +
        '<div class="summary-tile"><div class="stl-label">Egresos</div><div class="stl-value" style="color:var(--red-500)">' + Utils.formatMoney(expense) + '</div>' + deltaBadgeHTML(expense, prevExpense, true) + '</div>' +
        '<div class="summary-tile"><div class="stl-label">Balance</div><div class="stl-value" style="color:' + (balance < 0 ? "var(--red-500)" : "var(--text)") + '">' + Utils.formatMoney(balance) + '</div>' + deltaBadgeHTML(balance, prevBalance, false) + '</div>' +
      '</div>' +

      transactionsCardHTML(sorted) +

      savingsPeriodCardHTML(savingsDeposits, range) +
      insightCardHTML(inPeriod) +
      trendChartCard(all) +
      categoryChartCard(inPeriod) +
      methodDistributionCardHTML(inPeriod) +
      topExpensesCardHTML(inPeriod) +
      savingsOverviewCardHTML(savingsCategories, savingsDeposits) +
      budgetsCardHTML(budgets, all);

    attachEvents(container, inPeriod, range, savingsCategories, savingsDeposits, budgets);
  }

  function transactionsCardHTML(sorted) {
    var q = searchQuery.trim().toLowerCase();
    var matches = !q ? sorted : sorted.filter(function (t) {
      return (t.description || "").toLowerCase().indexOf(q) > -1 ||
        (t.category || "").toLowerCase().indexOf(q) > -1;
    });
    // buscando, se muestran todos los resultados de una vez -- no tiene
    // caso limitarlos a 7 si la persona ya filtró lo que busca.
    var visible = (showAllTx || q) ? matches : matches.slice(0, TX_PREVIEW_COUNT);
    var hasMore = !q && matches.length > TX_PREVIEW_COUNT;

    return (
      '<div class="card">' +
        '<div class="tx-list-head">' +
          '<div class="section-title">' + matches.length + ' transacci' + (matches.length === 1 ? "ón" : "ones") + '</div>' +
          (hasMore ? '<button type="button" id="btn-toggle-all-tx" class="btn-link">' + (showAllTx ? "Ver menos" : "Ver todas (" + matches.length + ")") + '</button>' : "") +
        '</div>' +
        '<div class="field-textline" style="margin-bottom:10px">' +
          '<input type="text" id="tx-search" class="plain-input-underline" placeholder="Buscar por descripción o categoría…" value="' + Utils.escapeHtml(searchQuery) + '">' +
        '</div>' +
        (visible.length
          ? '<div class="tx-list">' + visible.map(HomeView.txRowHTML).join("") + '</div>'
          : HomeView.emptyStateHTML("📭", q ? "Sin resultados para \"" + Utils.escapeHtml(searchQuery) + "\"" : "Sin transacciones en este período")) +
      '</div>'
    );
  }

  function segBtn(val, label) {
    return '<button data-period-type="' + val + '" class="' + (periodType === val ? "active" : "") + '">' + label + '</button>';
  }
  function typeBtn(val, label) {
    return '<button data-type-filter="' + val + '" class="' + (typeFilter === val ? "active" : "") + '">' + label + '</button>';
  }

  function niceCeil(value) {
    if (value <= 0) return 10;
    var pow = Math.pow(10, Math.floor(Math.log10(value)));
    var n = value / pow;
    var nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return nice * pow;
  }

  function formatAxis(v) {
    if (v >= 1000) return "$" + Math.round(v / 1000) + "k";
    return "$" + Math.round(v);
  }

  function categoryChartCard(inPeriod) {
    var byCategory = {};
    inPeriod.forEach(function (t) {
      var cat = t.category || "General";
      if (!byCategory[cat]) byCategory[cat] = { in: 0, out: 0 };
      if (t.type === "ingreso") byCategory[cat].in += t.amount; else byCategory[cat].out += t.amount;
    });
    var cats = Object.keys(byCategory)
      .map(function (k) { return { name: k, in: byCategory[k].in, out: byCategory[k].out, total: byCategory[k].in + byCategory[k].out }; })
      .sort(function (a, b) { return b.total - a.total; })
      .slice(0, 6);

    if (!cats.length) return "";

    var max = niceCeil(Math.max.apply(null, cats.map(function (c) { return Math.max(c.in, c.out); })));
    var ticks = [max, max * 0.75, max * 0.5, max * 0.25, 0];

    return (
      '<div class="card">' +
        '<div class="section-title" style="margin-bottom:6px">Por categoría</div>' +
        '<div class="chart-wrap">' +
          '<div class="chart-axis">' + ticks.map(function (t) { return "<div>" + formatAxis(t) + "</div>"; }).join("") + '</div>' +
          '<div class="chart-bars">' +
            cats.map(function (c) {
              var hIn = Utils.clamp((c.in / max) * 100, 0, 100);
              var hOut = Utils.clamp((c.out / max) * 100, 0, 100);
              return (
                '<div class="chart-cat">' +
                  '<div class="chart-cat-bars">' +
                    '<div class="chart-bar in" style="height:' + hIn + '%" title="' + Utils.escapeHtml(c.name) + ' · Ingresos: ' + Utils.formatMoney(c.in) + '"></div>' +
                    '<div class="chart-bar out" style="height:' + hOut + '%" title="' + Utils.escapeHtml(c.name) + ' · Egresos: ' + Utils.formatMoney(c.out) + '"></div>' +
                  '</div>' +
                  '<div class="chart-cat-label">' + Utils.escapeHtml(c.name) + '</div>' +
                '</div>'
              );
            }).join("") +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // invert=true cuando subir el valor es "malo" (egresos) -- así el
  // color de la flecha refleja lo que realmente le conviene al usuario,
  // no solo si el número subió o bajó.
  function deltaBadgeHTML(curr, prev, invert) {
    var diff = curr - prev;
    if (!prev) {
      if (!curr) return "";
      var upNew = diff > 0;
      var goodNew = invert ? !upNew : upNew;
      return '<div class="stl-delta ' + (goodNew ? "good" : "bad") + '">' + (upNew ? "▲" : "▼") + ' vs. período anterior</div>';
    }
    if (Math.abs(diff) < 0.5) return '<div class="stl-delta neutral">Igual que el período anterior</div>';
    var pct = Math.round(Math.abs(diff / prev) * 100);
    var up = diff > 0;
    var good = invert ? !up : up;
    return '<div class="stl-delta ' + (good ? "good" : "bad") + '">' + (up ? "▲" : "▼") + " " + pct + '% vs. anterior</div>';
  }

  function savingsPeriodCardHTML(deposits, range) {
    var periodDeposits = deposits.filter(function (d) { return inRange(d.date, range); });
    if (!periodDeposits.length) return "";
    var net = periodDeposits.reduce(function (s, d) { return s + d.amount; }, 0);
    var deposited = periodDeposits.filter(function (d) { return d.amount > 0; }).reduce(function (s, d) { return s + d.amount; }, 0);
    var withdrawn = periodDeposits.filter(function (d) { return d.amount < 0; }).reduce(function (s, d) { return s + Math.abs(d.amount); }, 0);

    return (
      '<div class="card savings-period-card">' +
        '<div class="sp-icon">' + Icons.get("piggy", 20) + '</div>' +
        '<div>' +
          '<div class="stl-label">Ahorro del período</div>' +
          '<div class="sp-value" style="color:' + (net < 0 ? "var(--red-500)" : "var(--amber-500)") + '">' + Utils.formatMoney(net) + '</div>' +
          '<div class="sp-meta">' + Utils.formatMoney(deposited) + ' depositado' + (withdrawn > 0 ? " · " + Utils.formatMoney(withdrawn) + " retirado" : "") + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function insightCardHTML(inPeriod) {
    var expenses = inPeriod.filter(function (t) { return t.type === "egreso"; });
    var totalExpense = expenses.reduce(function (s, t) { return s + t.amount; }, 0);
    if (!totalExpense) return "";

    var byCat = {};
    expenses.forEach(function (t) {
      var cat = t.category || "General";
      byCat[cat] = (byCat[cat] || 0) + t.amount;
    });
    var top = Object.keys(byCat)
      .map(function (k) { return { name: k, total: byCat[k] }; })
      .sort(function (a, b) { return b.total - a.total; })[0];
    if (!top) return "";

    var pct = Math.round((top.total / totalExpense) * 100);
    return (
      '<div class="insight-card">' +
        '<div class="insight-emoji">' + Icons.categoryEmoji(top.name) + '</div>' +
        '<div class="insight-text">Tu categoría con más gasto fue <strong>' + Utils.escapeHtml(top.name) + '</strong>: ' +
          Utils.formatMoney(top.total) + ' (' + pct + '% de tus egresos)</div>' +
      '</div>'
    );
  }

  function trendChartCard(all) {
    var today = new Date();
    var months = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() });
    }

    var data = months.map(function (m) {
      var inc = 0, exp = 0;
      all.forEach(function (t) {
        var d = Utils.parseISO(t.date);
        if (d.getFullYear() === m.year && d.getMonth() === m.month) {
          if (t.type === "ingreso") inc += t.amount; else exp += t.amount;
        }
      });
      return { label: Utils.MONTHS_SHORT[m.month], in: inc, out: exp };
    });

    var max = niceCeil(Math.max.apply(null, data.map(function (d) { return Math.max(d.in, d.out); })));
    var ticks = [max, max * 0.75, max * 0.5, max * 0.25, 0];

    return (
      '<div class="card">' +
        '<div class="section-title" style="margin-bottom:6px">Tendencia (6 meses)</div>' +
        '<div class="chart-wrap">' +
          '<div class="chart-axis">' + ticks.map(function (t) { return "<div>" + formatAxis(t) + "</div>"; }).join("") + '</div>' +
          '<div class="chart-bars">' +
            data.map(function (d) {
              var hIn = Utils.clamp((d.in / max) * 100, 0, 100);
              var hOut = Utils.clamp((d.out / max) * 100, 0, 100);
              return (
                '<div class="chart-cat">' +
                  '<div class="chart-cat-bars">' +
                    '<div class="chart-bar in" style="height:' + hIn + '%" title="' + d.label + ' · Ingresos: ' + Utils.formatMoney(d.in) + '"></div>' +
                    '<div class="chart-bar out" style="height:' + hOut + '%" title="' + d.label + ' · Egresos: ' + Utils.formatMoney(d.out) + '"></div>' +
                  '</div>' +
                  '<div class="chart-cat-label">' + d.label + '</div>' +
                '</div>'
              );
            }).join("") +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function methodDistributionCardHTML(inPeriod) {
    if (!inPeriod.length) return "";
    var card = 0, cash = 0;
    inPeriod.forEach(function (t) {
      if (t.method === "tarjeta") card += t.amount; else cash += t.amount;
    });
    var total = card + cash;
    if (!total) return "";
    var cardPct = Math.round((card / total) * 100);
    var cashPct = 100 - cardPct;

    return (
      '<div class="card">' +
        '<div class="section-title" style="margin-bottom:10px">Por método de pago</div>' +
        '<div class="method-dist-row">' +
          '<div class="method-dist-label">' + Icons.get("card", 14) + ' Tarjeta</div>' +
          '<div class="method-dist-value">' + Utils.formatMoney(card) + ' · ' + cardPct + '%</div>' +
        '</div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + cardPct + '%;background:linear-gradient(90deg,var(--indigo-400),var(--indigo-500))"></div></div>' +
        '<div class="method-dist-row" style="margin-top:10px">' +
          '<div class="method-dist-label">' + Icons.get("cash", 14) + ' Efectivo</div>' +
          '<div class="method-dist-value">' + Utils.formatMoney(cash) + ' · ' + cashPct + '%</div>' +
        '</div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + cashPct + '%;background:linear-gradient(90deg,var(--green-400),var(--green-500))"></div></div>' +
      '</div>'
    );
  }

  function topExpensesCardHTML(inPeriod) {
    var top = inPeriod.filter(function (t) { return t.type === "egreso"; })
      .sort(function (a, b) { return b.amount - a.amount; })
      .slice(0, 3);
    if (!top.length) return "";

    return (
      '<div class="card">' +
        '<div class="section-title" style="margin-bottom:4px">Mayores gastos</div>' +
        top.map(function (t) {
          return (
            '<div class="mini-list-row">' +
              '<span class="mlr-main">' + Icons.categoryEmoji(t.category) + " " + Utils.escapeHtml(t.description) +
                '<span class="mlr-sub"> · ' + Utils.shortDate(t.date) + '</span></span>' +
              '<span class="mlr-value" style="color:var(--red-500)">' + Utils.formatMoney(t.amount) + '</span>' +
            '</div>'
          );
        }).join("") +
      '</div>'
    );
  }

  // promedio de aportacion mensual neta de los ultimos 90 dias de una
  // meta, para estimar en cuantos meses mas se alcanza si el ritmo se
  // mantiene -- no es una promesa, solo una proyeccion simple.
  function savingsGoalProjection(cat, deposits) {
    var catDeposits = deposits.filter(function (d) { return d.categoryId === cat.id; });
    var total = catDeposits.reduce(function (s, d) { return s + d.amount; }, 0);
    if (cat.goal <= 0) return { total: total, pct: null, note: "" };
    if (total >= cat.goal) return { total: total, pct: 100, note: "¡Meta completada! 🎉" };

    var cutoff = Date.now() - 90 * 86400000;
    var recentNet = catDeposits
      .filter(function (d) { return Utils.parseISO(d.date).getTime() >= cutoff; })
      .reduce(function (s, d) { return s + d.amount; }, 0);
    var avgMonthly = recentNet / 3;
    var pct = Utils.clamp(Math.round((total / cat.goal) * 100), 0, 100);

    var note = "";
    if (avgMonthly > 0) {
      var months = Math.ceil((cat.goal - total) / avgMonthly);
      note = months <= 1 ? "A este ritmo, la alcanzas el próximo mes" : "A este ritmo, la alcanzas en ~" + months + " meses";
    }
    return { total: total, pct: pct, note: note };
  }

  function savingsOverviewCardHTML(categories, deposits) {
    if (!categories.length) return "";

    var rows = categories.map(function (c) { return { cat: c, projection: savingsGoalProjection(c, deposits) }; });
    var withGoal = rows.filter(function (r) { return r.cat.goal > 0; });
    var totalGoal = withGoal.reduce(function (s, r) { return s + r.cat.goal; }, 0);
    var totalSavedTowardGoals = withGoal.reduce(function (s, r) { return s + r.projection.total; }, 0);
    var combinedPct = totalGoal > 0 ? Utils.clamp(Math.round((totalSavedTowardGoals / totalGoal) * 100), 0, 100) : null;

    var featured = withGoal
      .filter(function (r) { return r.projection.pct !== null && r.projection.pct < 100; })
      .sort(function (a, b) { return b.projection.pct - a.projection.pct; })[0];

    return (
      '<div class="card">' +
        '<div class="section-title" style="margin-bottom:10px">Resumen de metas</div>' +
        (combinedPct !== null
          ? '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:6px">' +
              '<span>Progreso combinado</span><span>' + combinedPct + '%</span></div>' +
            '<div class="progress-track" style="margin-bottom:16px"><div class="progress-fill' + (combinedPct >= 100 ? " complete" : "") + '" style="width:' + combinedPct + '%"></div></div>'
          : "") +
        (featured
          ? '<div class="insight-card">' +
              '<div class="insight-emoji">' + Utils.escapeHtml(featured.cat.icon) + '</div>' +
              '<div class="insight-text">Vas más cerca en <strong>' + Utils.escapeHtml(featured.cat.name) + '</strong>: ' + featured.projection.pct + '% completado' +
                (featured.projection.note ? " — " + featured.projection.note : "") + '</div>' +
            '</div>'
          : "") +
        rows.map(function (r) {
          return (
            '<div class="mini-list-row">' +
              '<span class="mlr-main">' + Utils.escapeHtml(r.cat.icon) + " " + Utils.escapeHtml(r.cat.name) + '</span>' +
              '<span class="mlr-value">' + Utils.formatMoney(r.projection.total) +
                (r.projection.pct !== null ? '<span class="mlr-sub"> · ' + r.projection.pct + '%</span>' : '') + '</span>' +
            '</div>'
          );
        }).join("") +
      '</div>'
    );
  }

  // Los presupuestos son mensuales por definición -- siempre se miden
  // contra el mes calendario actual, sin importar qué período (día/
  // semana/mes) tenga elegido el Reporte en ese momento.
  function currentMonthKey() {
    var now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  }

  function budgetProgress(budget, all) {
    var monthKey = currentMonthKey();
    var spent = all
      .filter(function (t) { return t.type === "egreso" && (t.category || "General") === budget.category && t.date.slice(0, 7) === monthKey; })
      .reduce(function (s, t) { return s + t.amount; }, 0);
    var pct = budget.monthlyLimit > 0 ? Math.round((spent / budget.monthlyLimit) * 100) : 0;
    var status = pct >= 100 ? "over" : pct >= 80 ? "warning" : "ok";
    return { spent: spent, pct: pct, status: status };
  }

  function budgetsCardHTML(budgets, all) {
    return (
      '<div class="card">' +
        '<div class="tx-list-head">' +
          '<div class="section-title">Presupuestos por categoría</div>' +
          '<button type="button" id="btn-add-budget" class="btn-link">+ Agregar</button>' +
        '</div>' +
        (budgets.length
          ? budgets.map(function (b) {
              var p = budgetProgress(b, all);
              return (
                '<div class="budget-row" data-budget-id="' + b.id + '">' +
                  '<div class="budget-row-head">' +
                    '<span class="budget-cat">' + Icons.categoryEmoji(b.category) + " " + Utils.escapeHtml(b.category) + '</span>' +
                    '<span class="budget-amounts">' + Utils.formatMoney(p.spent) + ' <span class="mlr-sub">de ' + Utils.formatMoney(b.monthlyLimit) + '</span></span>' +
                  '</div>' +
                  '<div class="progress-track"><div class="progress-fill budget-fill-' + p.status + '" style="width:' + Utils.clamp(p.pct, 0, 100) + '%"></div></div>' +
                '</div>'
              );
            }).join("")
          : '<p style="font-size:13px;color:var(--text-muted);margin:4px 0 0">Ponle un límite mensual a una categoría para que te avisemos si te acercas o te pasas.</p>') +
      '</div>'
    );
  }

  function openBudgetModal(existing, categoriesInUse) {
    var isEdit = !!existing;
    var takenCategories = categoriesInUse.filter(function (c) { return !isEdit || c !== existing.category; });
    var options = Array.from(new Set(BUDGET_CATEGORY_SUGGESTIONS.concat(categoriesInUse)))
      .filter(function (c) { return takenCategories.indexOf(c) === -1; })
      .sort();

    var html =
      Modals.headerHTML({
        icon: "report", theme: "expense",
        title: isEdit ? "Editar presupuesto" : "Nuevo presupuesto",
        sub: isEdit ? "Cambia el límite mensual" : "Ponle un límite mensual a una categoría"
      }) +
      (isEdit
        ? '<div class="field-group"><label class="field-label">Categoría</label><p style="font-size:14px;font-weight:600;margin:0">' + Icons.categoryEmoji(existing.category) + " " + Utils.escapeHtml(existing.category) + '</p></div>'
        : '<div class="field-group"><label class="field-label">Categoría</label>' +
            '<select id="f-budget-category" class="input">' +
              options.map(function (c) { return '<option value="' + Utils.escapeHtml(c) + '">' + Utils.escapeHtml(c) + '</option>'; }).join("") +
              '<option value="__custom__">+ Otra categoría…</option>' +
            '</select>' +
            '<input type="text" id="f-budget-category-custom" class="input" placeholder="Nombre de la categoría" style="margin-top:8px" hidden>' +
          '</div>') +
      '<div class="field-group"><label class="field-label">Límite mensual (MXN)</label>' +
        '<div class="amount-field expense"><span class="curr-sign">$</span><input type="number" inputmode="decimal" id="f-budget-limit" placeholder="0" min="0" step="0.01" value="' + (isEdit ? existing.monthlyLimit : "") + '"></div>' +
      '</div>' +
      '<p class="field-error" id="f-budget-error" hidden></p>' +
      (isEdit
        ? '<div class="detail-actions">' +
            '<button class="btn btn-danger-outline" id="btn-delete-budget">Eliminar</button>' +
            '<button class="btn btn-danger-solid" id="f-submit">Guardar cambios</button>' +
          '</div>'
        : '<button class="btn btn-danger-solid modal-footer-btn" id="f-submit">Crear presupuesto</button>');

    Modals.open({
      html: html,
      onMount: function (sheet) {
        var categorySelect = sheet.querySelector("#f-budget-category");
        var customInput = sheet.querySelector("#f-budget-category-custom");
        var errorEl = sheet.querySelector("#f-budget-error");

        if (categorySelect) {
          categorySelect.addEventListener("change", function () {
            var isCustom = categorySelect.value === "__custom__";
            customInput.hidden = !isCustom;
            if (isCustom) customInput.focus();
          });
        }

        sheet.querySelector("#f-submit").addEventListener("click", function () {
          errorEl.hidden = true;
          var limit = parseFloat(sheet.querySelector("#f-budget-limit").value);
          if (!limit || limit <= 0) { sheet.querySelector("#f-budget-limit").focus(); return; }
          if (isEdit) {
            Storage.budgets.update(code(), existing.id, { monthlyLimit: limit, updatedAt: Date.now() });
          } else {
            var category = categorySelect.value === "__custom__" ? customInput.value.trim() : categorySelect.value;
            if (!category) { (categorySelect.value === "__custom__" ? customInput : categorySelect).focus(); return; }
            if (categoriesInUse.indexOf(category) > -1) {
              errorEl.textContent = "Ya tienes un presupuesto en \"" + category + "\".";
              errorEl.hidden = false;
              return;
            }
            Storage.budgets.add(code(), { id: Utils.uid(), category: category, monthlyLimit: limit, notifiedPct: 0, notifiedMonth: null, createdAt: Date.now() });
          }
          Modals.close();
          App.refresh();
        });
        if (isEdit) {
          sheet.querySelector("#btn-delete-budget").addEventListener("click", function () {
            Storage.budgets.remove(code(), existing.id);
            Modals.close();
            App.refresh();
          });
        }
      }
    });
  }

  function attachEvents(container, inPeriod, range, savingsCategories, savingsDeposits, budgets) {
    container.querySelectorAll("[data-period-type]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        periodType = btn.getAttribute("data-period-type");
        periodOffset = 0;
        showAllTx = false;
        App.refresh();
      });
    });
    container.querySelectorAll("[data-type-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        typeFilter = btn.getAttribute("data-type-filter");
        showAllTx = false;
        App.refresh();
      });
    });
    container.querySelector("#period-prev").addEventListener("click", function () { periodOffset--; showAllTx = false; App.refresh(); });
    container.querySelector("#period-next").addEventListener("click", function () { periodOffset++; showAllTx = false; App.refresh(); });

    var toggleAllBtn = container.querySelector("#btn-toggle-all-tx");
    if (toggleAllBtn) {
      toggleAllBtn.addEventListener("click", function () {
        showAllTx = !showAllTx;
        App.refresh();
      });
    }

    var searchInput = container.querySelector("#tx-search");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        searchQuery = searchInput.value;
        var caret = searchInput.selectionStart;
        App.refresh();
        // App.refresh() reconstruye todo el HTML del contenedor -- sin
        // esto, cada tecla que escribes le quita el foco al campo.
        var freshInput = document.getElementById("tx-search");
        if (freshInput) {
          freshInput.focus();
          freshInput.setSelectionRange(caret, caret);
        }
      });
    }

    container.querySelectorAll(".tx-row[data-tx-id]").forEach(function (row) {
      row.addEventListener("click", function () {
        var tx = Storage.transactions.list(code()).find(function (t) { return t.id === row.getAttribute("data-tx-id"); });
        if (tx) HomeView.openTransactionDetailModal(tx);
      });
    });

    var addBudgetBtn = container.querySelector("#btn-add-budget");
    if (addBudgetBtn) {
      addBudgetBtn.addEventListener("click", function () {
        openBudgetModal(null, budgets.map(function (b) { return b.category; }));
      });
    }
    container.querySelectorAll(".budget-row[data-budget-id]").forEach(function (row) {
      row.addEventListener("click", function () {
        var budget = budgets.find(function (b) { return b.id === row.getAttribute("data-budget-id"); });
        if (budget) openBudgetModal(budget, budgets.map(function (b) { return b.category; }));
      });
    });

    container.querySelector("#btn-export-pdf").addEventListener("click", function (e) {
      exportPDF(inPeriod, range, e.currentTarget, savingsCategories, savingsDeposits);
    });
  }

  function savingsPdfSectionHTML(categories, deposits, range) {
    if (!categories.length) return "";
    var periodNet = deposits.filter(function (d) { return inRange(d.date, range); })
      .reduce(function (s, d) { return s + d.amount; }, 0);

    var rows = categories.map(function (c) {
      var total = deposits.filter(function (d) { return d.categoryId === c.id; }).reduce(function (s, d) { return s + d.amount; }, 0);
      var pct = c.goal > 0 ? Utils.clamp(Math.round((total / c.goal) * 100), 0, 100) : null;
      return { name: c.name, icon: c.icon, total: total, goal: c.goal, pct: pct };
    });

    return (
      '<div class="pr-section accent-amber">' +
        '<h2>Ahorro</h2>' +
        '<p class="pr-savings-note">Aportado a metas en este período: ' + Utils.formatMoney(periodNet) + '</p>' +
        '<table class="pr-savings-table"><thead><tr><th>Meta</th><th>Ahorrado</th><th>Objetivo</th><th>Avance</th></tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr><td>' + Utils.escapeHtml(r.icon) + ' ' + Utils.escapeHtml(r.name) + '</td><td>' + Utils.formatMoney(r.total) + '</td>' +
              '<td>' + (r.goal > 0 ? Utils.formatMoney(r.goal) : "—") + '</td><td>' + (r.pct !== null ? r.pct + "%" : "—") + '</td></tr>';
          }).join("") +
        '</tbody></table>' +
      '</div>'
    );
  }

  function pdfTxSectionHTML(title, accent, txRows) {
    if (!txRows.length) return "";
    return (
      '<div class="pr-section accent-' + accent + '">' +
        '<h2>' + title + ' <span class="pr-section-count">(' + txRows.length + ')</span></h2>' +
        '<table class="pr-tx-table"><thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Método</th><th>Monto</th></tr></thead><tbody>' +
          txRows.map(function (t) {
            return '<tr><td>' + t.date + '</td><td>' + Utils.escapeHtml(t.description) + '</td><td>' + Utils.escapeHtml(t.category || "General") +
              '</td><td>' + (t.method === "tarjeta" ? "Tarjeta" : "Efectivo") +
              '</td><td>' + Utils.formatMoney(t.amount) + '</td></tr>';
          }).join("") +
        '</tbody></table>' +
      '</div>'
    );
  }

  function exportPDF(inPeriod, range, btn, savingsCategories, savingsDeposits) {
    var income = inPeriod.filter(function (t) { return t.type === "ingreso"; }).reduce(function (s, t) { return s + t.amount; }, 0);
    var expense = inPeriod.filter(function (t) { return t.type === "egreso"; }).reduce(function (s, t) { return s + t.amount; }, 0);
    var balance = income - expense;
    var byDateAsc = function (a, b) { return a.date < b.date ? -1 : 1; };
    var incomeRows = inPeriod.filter(function (t) { return t.type === "ingreso"; }).sort(byDateAsc);
    var expenseRows = inPeriod.filter(function (t) { return t.type === "egreso"; }).sort(byDateAsc);

    var html =
      '<div class="pr-brand">' +
        '<div class="pr-logo"><span class="dot filled"></span><span class="dot ring"></span></div>' +
        '<span class="pr-brand-text">FinzApp</span>' +
      '</div>' +
      '<div class="pr-head">' +
        '<h1>Reporte financiero — ' + periodLabel(range) + '</h1>' +
        '<p>Generado el ' + Utils.todayISO() + '</p>' +
      '</div>' +
      '<div class="pr-summary">' +
        '<div><div class="pr-label">Ingresos</div><div class="pr-value">' + Utils.formatMoney(income) + '</div></div>' +
        '<div><div class="pr-label">Egresos</div><div class="pr-value">' + Utils.formatMoney(expense) + '</div></div>' +
        '<div><div class="pr-label">Balance</div><div class="pr-value">' + Utils.formatMoney(balance) + '</div></div>' +
      '</div>' +
      pdfTxSectionHTML("Ingresos", "green", incomeRows) +
      pdfTxSectionHTML("Egresos", "red", expenseRows) +
      savingsPdfSectionHTML(savingsCategories, savingsDeposits, range);

    var printEl = document.getElementById("print-report");
    printEl.innerHTML = html;

    if (typeof html2pdf === "undefined") {
      window.print(); // respaldo si la librería no cargó (ej. sin internet)
      return;
    }

    var restore = btn.innerHTML;
    btn.innerHTML = "Generando…";
    btn.disabled = true;

    var filename = "FinzApp-Reporte-" + Utils.todayISO() + ".pdf";

    // Espera a que las fuentes (Outfit/DM Mono) terminen de cargar antes
    // de capturar: si el navegador todavia esta usando una fuente de
    // reemplazo en ese instante, el texto puede medir mas ancho y
    // desbordar las columnas de la tabla en el PDF resultante.
    var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();

    fontsReady.then(function () {
      return html2pdf().set({
        margin: 8,
        filename: filename,
        html2canvas: { scale: 2, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
      }).from(printEl).save();
    }).then(function () {
      btn.innerHTML = restore;
      btn.disabled = false;
    }).catch(function () {
      btn.innerHTML = restore;
      btn.disabled = false;
      window.print();
    });
  }

  return { render: render };
})();
