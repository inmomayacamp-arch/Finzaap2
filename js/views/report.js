/* =========================================================
   views/report.js — pantalla "Reporte" (análisis + PDF)
   ========================================================= */

var ReportView = (function () {

  var periodType = "mes"; // 'dia' | 'semana' | 'mes'
  var periodOffset = 0;
  var typeFilter = "todo"; // 'todo' | 'ingresos' | 'egresos'

  function code() { return App.session().code; }

  function startOfWeek(date) {
    var d = new Date(date);
    var day = (d.getDay() + 6) % 7; // lunes = 0
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function periodRange() {
    var today = new Date();
    if (periodType === "dia") {
      var d = new Date(today);
      d.setDate(d.getDate() + periodOffset);
      return { start: d, end: d };
    }
    if (periodType === "semana") {
      var base = new Date(today);
      base.setDate(base.getDate() + periodOffset * 7);
      var start = startOfWeek(base);
      var end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { start: start, end: end };
    }
    // mes
    var m = new Date(today.getFullYear(), today.getMonth() + periodOffset, 1);
    var mEnd = new Date(today.getFullYear(), today.getMonth() + periodOffset + 1, 0);
    return { start: m, end: mEnd };
  }

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
        '<div class="summary-tile"><div class="stl-label">Ingresos</div><div class="stl-value" style="color:var(--green-500)">' + Utils.formatMoney(income) + '</div></div>' +
        '<div class="summary-tile"><div class="stl-label">Egresos</div><div class="stl-value" style="color:var(--red-500)">' + Utils.formatMoney(expense) + '</div></div>' +
        '<div class="summary-tile"><div class="stl-label">Balance</div><div class="stl-value" style="color:' + (balance < 0 ? "var(--red-500)" : "var(--text)") + '">' + Utils.formatMoney(balance) + '</div></div>' +
      '</div>' +

      categoryChartCard(inPeriod) +

      '<div class="card">' +
        '<div class="section-title" style="margin-bottom:8px">' + sorted.length + ' transacci' + (sorted.length === 1 ? "ón" : "ones") + '</div>' +
        (sorted.length ? '<div class="tx-list">' + sorted.map(HomeView.txRowHTML).join("") + '</div>' : HomeView.emptyStateHTML("📭", "Sin transacciones en este período")) +
      '</div>';

    attachEvents(container, inPeriod, range);
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

  function attachEvents(container, inPeriod, range) {
    container.querySelectorAll("[data-period-type]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        periodType = btn.getAttribute("data-period-type");
        periodOffset = 0;
        App.refresh();
      });
    });
    container.querySelectorAll("[data-type-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        typeFilter = btn.getAttribute("data-type-filter");
        App.refresh();
      });
    });
    container.querySelector("#period-prev").addEventListener("click", function () { periodOffset--; App.refresh(); });
    container.querySelector("#period-next").addEventListener("click", function () { periodOffset++; App.refresh(); });

    container.querySelectorAll(".tx-row[data-tx-id]").forEach(function (row) {
      row.addEventListener("click", function () {
        var tx = Storage.transactions.list(code()).find(function (t) { return t.id === row.getAttribute("data-tx-id"); });
        if (tx) HomeView.openTransactionDetailModal(tx);
      });
    });

    container.querySelector("#btn-export-pdf").addEventListener("click", function (e) {
      exportPDF(inPeriod, range, e.currentTarget);
    });
  }

  function exportPDF(inPeriod, range, btn) {
    var income = inPeriod.filter(function (t) { return t.type === "ingreso"; }).reduce(function (s, t) { return s + t.amount; }, 0);
    var expense = inPeriod.filter(function (t) { return t.type === "egreso"; }).reduce(function (s, t) { return s + t.amount; }, 0);
    var balance = income - expense;
    var rows = inPeriod.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    var html =
      '<div class="pr-head">' +
        '<h1>Reporte financiero — ' + periodLabel(range) + '</h1>' +
        '<p>Generado el ' + Utils.todayISO() + '</p>' +
      '</div>' +
      '<div class="pr-summary">' +
        '<div><div class="pr-label">Ingresos</div><div class="pr-value">' + Utils.formatMoney(income) + '</div></div>' +
        '<div><div class="pr-label">Egresos</div><div class="pr-value">' + Utils.formatMoney(expense) + '</div></div>' +
        '<div><div class="pr-label">Balance</div><div class="pr-value">' + Utils.formatMoney(balance) + '</div></div>' +
      '</div>' +
      '<table><thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Método</th><th>Tipo</th><th>Monto</th></tr></thead><tbody>' +
        rows.map(function (t) {
          return '<tr><td>' + t.date + '</td><td>' + Utils.escapeHtml(t.description) + '</td><td>' + Utils.escapeHtml(t.category || "General") +
            '</td><td>' + (t.method === "tarjeta" ? "Tarjeta" : "Efectivo") + '</td><td>' + (t.type === "ingreso" ? "Ingreso" : "Egreso") +
            '</td><td>' + (t.type === "ingreso" ? "+" : "-") + Utils.formatMoney(t.amount) + '</td></tr>';
        }).join("") +
      '</tbody></table>';

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
        margin: 10,
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
