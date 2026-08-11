/* =========================================================
   api/create-portal-session.js — link al portal de Stripe donde el
   usuario puede ver sus facturas, cambiar método de pago o
   cancelar su suscripción, sin que tengamos que construir nada de
   eso nosotros mismos.
   ========================================================= */

var Stripe = require("stripe");
var { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Método no permitido" }); return; }

  var token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) { res.status(401).json({ error: "No autorizado" }); return; }

  var supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  var { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData || !userData.user) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  var { data: profile } = await supabase
    .from("profiles")
    .select("household_code")
    .eq("id", userData.user.id)
    .single();
  if (!profile) { res.status(400).json({ error: "No encontramos tu perfil" }); return; }

  var { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("household_code", profile.household_code)
    .maybeSingle();
  if (!sub || !sub.stripe_customer_id) {
    res.status(400).json({ error: "Todavía no tienes una suscripción para administrar." });
    return;
  }

  var stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  try {
    var portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: "https://finzapp.com.mx/index.html"
    });
    res.status(200).json({ url: portal.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
