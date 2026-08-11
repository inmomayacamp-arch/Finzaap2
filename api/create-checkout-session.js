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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }

  var body = await readJsonBody(req);
  var plan = body && body.plan;
  if (plan !== "monthly" && plan !== "annual") {
    res.status(400).json({ error: "Plan inválido" });
    return;
  }

  var token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) { res.status(401).json({ error: "No autorizado" }); return; }

  var supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  var { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData || !userData.user) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  var { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("household_code, name")
    .eq("id", userData.user.id)
    .single();
  if (profileErr || !profile) {
    res.status(400).json({ error: "No encontramos tu perfil" });
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

    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
