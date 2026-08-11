/* =========================================================
   api/create-checkout-session.js — crea el link de pago de Stripe

   El cliente manda su token de sesión (no el household_code
   directo — ese lo buscamos nosotros en el servidor a partir del
   token, para que nadie pueda mandar el código de otra cuenta y
   pagarle la suscripción a alguien más por error o a propósito).
   ========================================================= */

var Stripe = require("stripe");
var { createClient } = require("@supabase/supabase-js");
var { readJsonBody } = require("./_lib/body");
var { sendJson } = require("./_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { sendJson(res, 405, { error: "Método no permitido" }); return; }

  var body = await readJsonBody(req);
  var plan = body && body.plan;
  if (plan !== "monthly" && plan !== "annual") {
    sendJson(res, 400, { error: "Plan inválido" });
    return;
  }

  var token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) { sendJson(res, 401, { error: "No autorizado" }); return; }

  var supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  var { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData || !userData.user) {
    sendJson(res, 401, { error: "No autorizado" });
    return;
  }

  var { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("household_code, name")
    .eq("id", userData.user.id)
    .single();
  if (profileErr || !profile) {
    sendJson(res, 400, { error: "No encontramos tu perfil" });
    return;
  }

  var stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  var priceId = plan === "annual" ? process.env.STRIPE_PRICE_ANNUAL : process.env.STRIPE_PRICE_MONTHLY;
  var origin = "https://finzapp.com.mx";

  try {
    // si ya tiene stripe_customer_id de una suscripcion previa, lo
    // reusamos para que el historial de pagos quede en un solo lugar.
    var { data: existingSub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("household_code", profile.household_code)
      .maybeSingle();

    var session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer: (existingSub && existingSub.stripe_customer_id) || undefined,
      customer_email: (existingSub && existingSub.stripe_customer_id) ? undefined : userData.user.email,
      client_reference_id: profile.household_code,
      metadata: { household_code: profile.household_code },
      subscription_data: { metadata: { household_code: profile.household_code } },
      success_url: origin + "/index.html?checkout=success",
      cancel_url: origin + "/index.html?checkout=cancel"
    });

    sendJson(res, 200, { url: session.url });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
};
