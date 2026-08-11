/* =========================================================
   api/stripe-webhook.js — Stripe avisa aquí cuando algo cambia
   (pago confirmado, renovación, cancelación) y actualizamos la
   tabla `subscriptions` en consecuencia.

   Verificamos la firma de cada evento (STRIPE_WEBHOOK_SECRET) para
   asegurarnos de que el aviso venga realmente de Stripe y no de
   alguien más tratando de regalarse una suscripción activa.
   ========================================================= */

var Stripe = require("stripe");
var { createClient } = require("@supabase/supabase-js");
var webpush = require("web-push");
var { readRawBody } = require("./_lib/body");
var { sendJson } = require("./_lib/http");

module.exports = async function handler(req, res) {
  var stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  var sig = req.headers["stripe-signature"];
  var rawBody = await readRawBody(req);

  var event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    sendJson(res, 400, { error: "Firma inválida: " + err.message });
    return;
  }

  // Evita que un evento de modo test (o viceversa) contamine los datos
  // reales si algun dia esta funcion corre con llaves de otro modo que
  // las configuradas en Stripe para este mismo endpoint.
  var isLiveKey = /^sk_live_/.test(process.env.STRIPE_SECRET_KEY || "");
  if (event.livemode !== isLiveKey) {
    sendJson(res, 200, { received: true, ignored: "modo de Stripe distinto al configurado" });
    return;
  }

  var supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  function planFromPriceId(priceId) {
    if (priceId === process.env.STRIPE_PRICE_ANNUAL) return "annual";
    if (priceId === process.env.STRIPE_PRICE_MONTHLY) return "monthly";
    return null;
  }

  async function upsertFromSubscription(sub) {
    var householdCode = sub.metadata && sub.metadata.household_code;

    if (!householdCode) {
      var { data: existing } = await supabase
        .from("subscriptions")
        .select("household_code")
        .eq("stripe_customer_id", sub.customer)
        .maybeSingle();
      householdCode = existing && existing.household_code;
    }
    if (!householdCode) return;

    var item = sub.items && sub.items.data && sub.items.data[0];
    var priceId = item && item.price && item.price.id;
    // Stripe movio current_period_end del objeto Subscription al item
    // en versiones nuevas de la API (facturacion flexible); probamos
    // ambos lugares para que funcione sin importar la version en uso.
    var periodEnd = sub.current_period_end || (item && item.current_period_end);

    await supabase.from("subscriptions").upsert({
      household_code: householdCode,
      stripe_customer_id: sub.customer,
      stripe_subscription_id: sub.id,
      status: sub.status,
      plan: planFromPriceId(priceId),
      current_period_end: periodEnd ? periodEnd * 1000 : null,
      updated_at: Date.now()
    }, { onConflict: "household_code" });
  }

  // Avisa por push que la tarjeta fue rechazada. El bloqueo de acceso
  // ya lo aplica has_active_access() cuando llegue (por separado) el
  // customer.subscription.updated con status "past_due" -- esto solo
  // le explica al usuario por qué, para que no piense que la app se
  // rompió.
  async function notifyPaymentFailed(invoice) {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

    var { data: sub } = await supabase
      .from("subscriptions")
      .select("household_code")
      .eq("stripe_customer_id", invoice.customer)
      .maybeSingle();
    var householdCode = sub && sub.household_code;
    if (!householdCode) return;

    var { data: profiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("household_code", householdCode);
    if (!profiles || !profiles.length) return;

    var userIds = profiles.map(function (p) { return p.id; });
    var { data: pushSubs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .in("user_id", userIds);
    if (!pushSubs || !pushSubs.length) return;

    webpush.setVapidDetails("mailto:hola@finzapp.com.mx", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    var payload = JSON.stringify({
      title: "Tu pago no se pudo procesar",
      body: "Actualiza tu método de pago en FinzApp para no perder el acceso.",
      url: "/"
    });

    for (var i = 0; i < pushSubs.length; i++) {
      var s = pushSubs[i];
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }
    }
  }

  try {
    if (event.type === "checkout.session.completed") {
      var session = event.data.object;
      if (session.mode === "subscription" && session.subscription) {
        var sub = await stripe.subscriptions.retrieve(session.subscription);
        sub.metadata = Object.assign({}, sub.metadata, session.metadata);
        await upsertFromSubscription(sub);
      }
    } else if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.deleted"
    ) {
      await upsertFromSubscription(event.data.object);
    } else if (event.type === "invoice.payment_failed") {
      await notifyPaymentFailed(event.data.object);
    }

    sendJson(res, 200, { received: true });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
};
