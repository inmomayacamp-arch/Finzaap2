/* =========================================================
   push.js — recordatorios push (pago próximo, gastos de hoy,
   reporte semanal)

   El envío real ocurre en el servidor (api/send-reminders.js,
   corre una vez al día vía Vercel Cron); este archivo solo pide el
   permiso, crea la suscripción del dispositivo y la guarda en
   Supabase para que ese trabajo programado sepa a quién avisarle.
   ========================================================= */

var Push = (function () {

  function isSupported() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  function urlBase64ToUint8Array(base64) {
    var padding = "=".repeat((4 - (base64.length % 4)) % 4);
    var base64safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(base64safe);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  function permission() {
    return isSupported() ? Notification.permission : "unsupported";
  }

  function getExistingSubscription() {
    if (!isSupported()) return Promise.resolve(null);
    return navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription();
    });
  }

  function isSubscribed() {
    return getExistingSubscription().then(function (sub) { return !!sub; });
  }

  function saveSubscription(userId, sub) {
    var c = Storage.sync.client();
    if (!c) return Promise.resolve();
    var json = sub.toJSON();
    return c.from("push_subscriptions").upsert({
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      created_at: Date.now()
    }, { onConflict: "endpoint" }).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  function subscribe(userId) {
    if (!isSupported()) return Promise.reject(new Error("Este navegador no soporta notificaciones."));
    return Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") throw new Error("No diste permiso para las notificaciones.");
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      return reg.pushManager.getSubscription().then(function (existing) {
        if (existing) return existing;
        return reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(CONFIG.VAPID_PUBLIC_KEY)
        });
      });
    }).then(function (sub) {
      return saveSubscription(userId, sub).then(function () { return sub; });
    });
  }

  function unsubscribe() {
    return getExistingSubscription().then(function (sub) {
      if (!sub) return;
      var endpoint = sub.endpoint;
      var c = Storage.sync.client();
      return sub.unsubscribe().then(function () {
        if (!c) return;
        return c.from("push_subscriptions").delete().eq("endpoint", endpoint);
      });
    });
  }

  return {
    isSupported: isSupported,
    permission: permission,
    isSubscribed: isSubscribed,
    subscribe: subscribe,
    unsubscribe: unsubscribe
  };
})();
