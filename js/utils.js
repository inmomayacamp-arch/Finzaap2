/* =========================================================
   utils.js — funciones puras compartidas por toda la app
   ========================================================= */

var Utils = (function () {

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function generateAccountCode() {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin caracteres ambiguos
    var part = function () {
      var s = "";
      for (var i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
      return s;
    };
    return part() + "-" + part();
  }

  function normalizeCode(raw) {
    return (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function formatCode(raw) {
    var c = normalizeCode(raw);
    if (c.length <= 4) return c;
    return c.slice(0, 4) + "-" + c.slice(4, 8);
  }

  function formatMoney(amount) {
    var n = Math.round(Number(amount) || 0);
    var sign = n < 0 ? "-" : "";
    var abs = Math.abs(n);
    return sign + "$" + abs.toLocaleString("en-US");
  }

  function formatMoneyAbs(amount) {
    var abs = Math.abs(Math.round(Number(amount) || 0));
    return "$" + abs.toLocaleString("en-US");
  }

  function todayISO() {
    var d = new Date();
    return isoFromDate(d);
  }

  function isoFromDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function parseISO(iso) {
    var parts = (iso || "").split("-").map(Number);
    return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  }

  var MONTHS_LONG = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
  var MONTHS_SHORT = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  var MONTHS_CAP = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  var DAYS_SHORT = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

  function monthLabelLong(year, monthIndex) {
    return MONTHS_LONG[monthIndex] + " " + year;
  }

  function monthLabelCap(year, monthIndex) {
    return MONTHS_CAP[monthIndex] + " de " + year;
  }

  function daysUntil(iso) {
    var target = parseISO(iso);
    var today = parseISO(todayISO());
    var ms = target.getTime() - today.getTime();
    return Math.round(ms / 86400000);
  }

  function humanDueLabel(iso) {
    var d = daysUntil(iso);
    if (d === 0) return "Hoy";
    if (d === 1) return "Mañana";
    if (d === -1) return "Ayer";
    if (d < 0) return "Venció hace " + Math.abs(d) + " días";
    return "En " + d + " días";
  }

  function shortDate(iso) {
    if (!iso) return "";
    var d = parseISO(iso);
    return String(d.getDate()).padStart(2, "0") + " " + MONTHS_SHORT[d.getMonth()];
  }

  // paleta de colores para etiquetar a cada persona de la cuenta
  var AUTHOR_PALETTE = [
    "#6C5CE7", "#F59E0B", "#10B981", "#EF4444", "#0EA5E9", "#EC4899", "#8B5CF6", "#14B8A6"
  ];

  function colorForAuthor(name) {
    var str = (name || "").trim().toLowerCase();
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    var idx = Math.abs(hash) % AUTHOR_PALETTE.length;
    return AUTHOR_PALETTE[idx];
  }

  function initials(name) {
    var parts = (name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  return {
    uid: uid,
    generateAccountCode: generateAccountCode,
    normalizeCode: normalizeCode,
    formatCode: formatCode,
    formatMoney: formatMoney,
    formatMoneyAbs: formatMoneyAbs,
    todayISO: todayISO,
    isoFromDate: isoFromDate,
    parseISO: parseISO,
    monthLabelLong: monthLabelLong,
    monthLabelCap: monthLabelCap,
    MONTHS_LONG: MONTHS_LONG,
    MONTHS_SHORT: MONTHS_SHORT,
    MONTHS_CAP: MONTHS_CAP,
    DAYS_SHORT: DAYS_SHORT,
    daysUntil: daysUntil,
    humanDueLabel: humanDueLabel,
    shortDate: shortDate,
    colorForAuthor: colorForAuthor,
    initials: initials,
    escapeHtml: escapeHtml,
    clamp: clamp,
    debounce: debounce
  };
})();
