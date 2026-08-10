/* =========================================================
   monitoring.js — Sentry: avisa en automático si algo falla en
   producción.

   Incluye los fallos "silenciosos" de sincronización con
   Supabase (pushInsert/pushUpdate/pushDelete/pullAll en
   storage.js) que antes solo se veían en la consola del
   navegador de quien los tuviera en ese momento, sin que nadie
   se enterara — así fue como pasaron desapercibidos varios bugs
   reales durante el desarrollo (columnas faltantes, valores mal
   formados, etc.).

   El DSN de Sentry es seguro de tener aquí, a la vista: solo
   permite mandar reportes de error hacia el proyecto, no leer ni
   administrar nada (a diferencia de una llave secreta).
   ========================================================= */

(function () {
  if (typeof Sentry === "undefined") return;

  Sentry.init({
    dsn: "https://92b938ed81ce587ea0d10151e7eb4719@o4511884742819840.ingest.us.sentry.io/4511884778864640",
    environment: /localhost|127\.0\.0\.1/.test(window.location.hostname) ? "development" : "production",
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0
  });
})();

// Pequeño reportero compartido para los fallos "silenciosos" de
// sincronización — Storage.sync lo usa en vez de solo console.warn.
var Monitoring = (function () {
  function reportSyncError(context, error) {
    var message = (error && error.message) || String(error);
    console.warn(context + ":", message);
    if (typeof Sentry !== "undefined") {
      Sentry.captureMessage(context + ": " + message, "warning");
    }
  }
  return { reportSyncError: reportSyncError };
})();
