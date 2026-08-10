/* =========================================================
   icons.js — iconos SVG inline (sin dependencias externas)
   ========================================================= */

var Icons = (function () {

  function svg(inner, size) {
    size = size || 22;
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
  }

  var STROKE = 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

  var raw = {
    home: '<path d="M4 11.2 12 4l8 7.2" ' + STROKE + '/><path d="M6 9.8V20h12V9.8" ' + STROKE + '/><path d="M10 20v-5.5h4V20" ' + STROKE + '/>',
    down: '<circle cx="12" cy="12" r="9" ' + STROKE + '/><path d="M12 7.5v9M8.5 12.5 12 16l3.5-3.5" ' + STROKE + '/>',
    up: '<circle cx="12" cy="12" r="9" ' + STROKE + '/><path d="M12 16.5v-9M8.5 11.5 12 8l3.5 3.5" ' + STROKE + '/>',
    report: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" ' + STROKE + '/>',
    piggy: '<path d="M4.5 12c0-3.6 3.1-6.2 7.2-6.2 3 0 5.6 1.4 6.8 3.5H20l1 2.3-1.7 1V15c0 1-.8 1.8-1.8 1.8h-.8v2.4h-2.4v-2.1c-1 .2-2.1.3-3.3.3-4.1 0-7.2-2.6-7.2-6.2Z" ' + STROKE + '/><circle cx="8.3" cy="11.3" r=".9" fill="currentColor"/><path d="M6.5 17.4 5.3 20M4 12.5 2 12" ' + STROKE + '/>',
    user: '<circle cx="12" cy="8.2" r="3.6" ' + STROKE + '/><path d="M4.5 20c1-3.6 4-5.6 7.5-5.6s6.5 2 7.5 5.6" ' + STROKE + '/>',
    wifi: '<path d="M2.5 9.5a13.7 13.7 0 0 1 19 0M5.7 12.8a9.4 9.4 0 0 1 12.6 0M9 16a5 5 0 0 1 6 0" ' + STROKE + '/><circle cx="12" cy="19.2" r="1.1" fill="currentColor"/>',
    wifiOff: '<path d="M2.5 9.5a13.7 13.7 0 0 1 6.6-3.6M14.9 5.9a13.7 13.7 0 0 1 6.6 3.6M5.7 12.8a9.4 9.4 0 0 1 4.1-2.2M14.2 10.6a9.4 9.4 0 0 1 4.1 2.2M9 16a5 5 0 0 1 6 0M2 2l20 20" ' + STROKE + '/><circle cx="12" cy="19.2" r="1.1" fill="currentColor"/>',
    sync: '<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5" ' + STROKE + '/><path d="M20 4v4.5h-4.5M4 20v-4.5h4.5" ' + STROKE + '/>',
    plus: '<path d="M12 5v14M5 12h14" ' + STROKE + '/>',
    close: '<path d="M6 6l12 12M18 6 6 18" ' + STROKE + '/>',
    check: '<path d="M5 12.5 9.5 17 19 7" ' + STROKE + '/>',
    chevronLeft: '<path d="M15 5 8 12l7 7" ' + STROKE + '/>',
    chevronRight: '<path d="M9 5l7 7-7 7" ' + STROKE + '/>',
    arrowUpRight: '<path d="M7 17 17 7M9 7h8v8" ' + STROKE + '/>',
    arrowDownRight: '<path d="M7 7 17 17M17 9v8H9" ' + STROKE + '/>',
    card: '<rect x="2.5" y="5.5" width="19" height="13" rx="2.5" ' + STROKE + '/><path d="M2.5 9.8h19" ' + STROKE + '/>',
    cash: '<rect x="2.5" y="6.5" width="19" height="11" rx="2.2" ' + STROKE + '/><circle cx="12" cy="12" r="2.6" ' + STROKE + '/>',
    bell: '<path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.2 1.5 5.2H4.5S6 14 6 10Z" ' + STROKE + '/><path d="M10 18a2 2 0 0 0 4 0" ' + STROKE + '/>',
    repeat: '<path d="M17 2.5 20 5.5l-3 3M4 11.5v-2a4 4 0 0 1 4-4h12M7 21.5 4 18.5l3-3M20 12.5v2a4 4 0 0 1-4 4H4" ' + STROKE + '/>',
    copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.3" ' + STROKE + '/><path d="M15.5 8.5V5.8a2.3 2.3 0 0 0-2.3-2.3H5.8a2.3 2.3 0 0 0-2.3 2.3v7.4a2.3 2.3 0 0 0 2.3 2.3h2.7" ' + STROKE + '/>',
    logout: '<path d="M9 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3H9" ' + STROKE + '/><path d="M16 16l5-4-5-4M21 12H9" ' + STROKE + '/>',
    pdf: '<path d="M6 2.5h9L19.5 7v14.5h-13.5Z" ' + STROKE + '/><path d="M15 2.5V7h4.5" ' + STROKE + '/><path d="M8.2 17.5v-4h1.1a1.4 1.4 0 0 1 0 2.8H8.2M12 17.5v-4h1a1.4 1.4 0 0 1 1.4 1.4v1.2A1.4 1.4 0 0 1 13 17.5h-1Zm4.3 0v-4h2.3M16.3 15.5h1.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
    x: '<path d="M6 6l12 12M18 6 6 18" ' + STROKE + '/>',
    trash: '<path d="M4 6.5h16M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7M6.5 6.5 7.3 20a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-13.5" ' + STROKE + '/>',
    users: '<path d="M16 14c2.67 0 8 1.34 8 4v2H0v-2c0-2.66 5.33-4 8-4 .32 0 .69.02 1.08.05M8 12A5 5 0 1 0 8 2a5 5 0 0 0 0 10Zm8-2a4 4 0 1 0-1.2-7.82" ' + STROKE + '/>',
    plusCircle: '<circle cx="12" cy="12" r="9" ' + STROKE + '/><path d="M12 8v8M8 12h8" ' + STROKE + '/>',
    edit: '<path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 15.5V20Z" ' + STROKE + '/><path d="M13.5 6.5 17.5 10.5" ' + STROKE + '/>',
    share: '<circle cx="18" cy="5" r="2.6" ' + STROKE + '/><circle cx="6" cy="12" r="2.6" ' + STROKE + '/><circle cx="18" cy="19" r="2.6" ' + STROKE + '/><path d="M8.3 10.6 15.7 6.4M8.3 13.4l7.4 4.2" ' + STROKE + '/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" ' + STROKE + '/><circle cx="12" cy="12" r="3.2" ' + STROKE + '/>',
    eyeOff: '<path d="M3.5 3.5l17 17M10.6 5.3A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.5 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.4 0 2.6-.3 3.7-.8M9.5 9.7a3.2 3.2 0 0 0 4.5 4.5" ' + STROKE + '/>',
    shield: '<path d="M12 3 5 6v5.5c0 4.5 3 7.2 7 8.5 4-1.3 7-4 7-8.5V6l-7-3Z" ' + STROKE + '/>',
    mail: '<rect x="2.5" y="5" width="19" height="14" rx="2.3" ' + STROKE + '/><path d="M3.5 6.5 12 13l8.5-6.5" ' + STROKE + '/>'
  };

  var cache = {};
  function get(name, size) {
    var key = name + "_" + (size || 22);
    if (!cache[key]) cache[key] = svg(raw[name] || raw.home, size);
    return cache[key];
  }

  // categorías comunes -> emoji
  var CATEGORY_EMOJI = {
    "trabajo": "💼", "sueldo": "💼", "salario": "💼",
    "freelance": "💻", "proyecto": "💻",
    "inversiones": "📈", "dividendos": "📈", "ahorro": "🐷",
    "vivienda": "🏠", "renta": "🏠", "hipoteca": "🏠",
    "alimentación": "🛒", "alimentacion": "🛒", "supermercado": "🛒", "comida": "🍔",
    "transporte": "🚗", "gasolina": "⛽", "auto": "🚗",
    "seguros": "🛡️", "seguro": "🛡️",
    "deudas": "💳", "tarjeta": "💳",
    "servicios": "🧾", "internet": "🌐", "luz": "💡", "agua": "🚿",
    "salud": "🏥", "gobierno": "🏛️", "impuestos": "🏛️",
    "educación": "🎓", "educacion": "🎓",
    "entretenimiento": "🎬", "viaje": "✈️", "ropa": "👕",
    "mascotas": "🐾", "regalos": "🎁", "general": "🗂️"
  };

  function categoryEmoji(category) {
    if (!category) return "🗂️";
    var key = category.trim().toLowerCase();
    return CATEGORY_EMOJI[key] || "🗂️";
  }

  return { get: get, categoryEmoji: categoryEmoji, CATEGORY_EMOJI: CATEGORY_EMOJI };
})();
