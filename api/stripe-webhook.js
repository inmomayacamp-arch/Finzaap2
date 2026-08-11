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

    await supabase.from("subscriptions").upsert({
      household_code: householdCode,
      stripe_customer_id: sub.customer,
      stripe_subscription_id: sub.id,
      status: sub.status,
      plan: planFromPriceId(priceId),
      current_period_end: sub.current_period_end ? sub.current_period_end * 1000 : null,
      updated_at: Date.now()
    }, { onConflict: "household_code" });
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
    }

    sendJson(res, 200, { received: true });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
};
