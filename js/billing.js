/* =========================================================
   billing.js — estado de la suscripción y checkout de Stripe

   La app NUNCA decide por sí sola si puedes escribir datos o no —
   eso lo aplica de verdad la base de datos (has_active_access(), ver
   sql/subscriptions.sql). Este archivo solo LEE ese estado para
   mostrarlo bien en pantalla, y arranca el pago/portal de Stripe.
   ========================================================= */

var Billing = (function () {

  var TRIAL_DAYS = 7;

  function getSubscriptionState(session) {
    var c = Storage.sync.client();
    if (!c) return Promise.resolve(null);

    return Promise.all([
      c.from("accounts").select("created_at").eq("code", session.code).maybeSingle(),
      c.from("subscriptions").select("status,plan,current_period_end").eq("household_code", session.code).maybeSingle()
    ]).then(function (results) {
      var accRes = results[0], subRes = results[1];
      var createdAt = accRes.data ? Number(accRes.data.created_at) : null;
      var sub = subRes.data || null;
      var now = Date.now();
      var trialEndsAt = createdAt ? createdAt + TRIAL_DAYS * 86400000 : null;
      var inTrial = !!trialEndsAt && now < trialEndsAt;
      var hasActiveSub = !!sub && (sub.status === "active" || sub.status === "trialing") &&
        (!sub.current_period_end || Number(sub.current_period_end) > now);

      return {
        inTrial: inTrial,
        trialDaysLeft: inTrial ? Math.max(1, Math.ceil((trialEndsAt - now) / 86400000)) : 0,
        hasActiveSub: hasActiveSub,
        sub: sub,
        hasAccess: inTrial || hasActiveSub
      };
    });
  }

  function authToken() {
    var c = Storage.sync.client();
    if (!c) return Promise.resolve(null);
    return c.auth.getSession().then(function (res) {
      return res.data && res.data.session ? res.data.session.access_token : null;
    });
  }

  function startCheckout(plan) {
    return authToken().then(function (token) {
      if (!token) throw new Error("Vuelve a iniciar sesión para continuar.");
      return fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify({ plan: plan })
      });
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.error) throw new Error(data.error);
      window.location.href = data.url;
    });
  }

  function openPortal() {
    return authToken().then(function (token) {
      if (!token) throw new Error("Vuelve a iniciar sesión para continuar.");
      return fetch("/api/create-portal-session", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token }
      });
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.error) throw new Error(data.error);
      window.location.href = data.url;
    });
  }

  return {
    getSubscriptionState: getSubscriptionState,
    startCheckout: startCheckout,
    openPortal: openPortal
  };
})();
