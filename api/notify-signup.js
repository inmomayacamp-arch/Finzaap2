/* =========================================================
   api/notify-signup.js — avisa por correo cuando alguien crea su
   cuenta, aunque sea solo la prueba gratis sin pagar nada.

   Lo dispara un Database Webhook de Supabase en cada INSERT a
   `profiles` (se crea una sola vez, justo cuando alguien termina
   de registrarse -- unirse a una cuenta compartida NO crea un
   profile nuevo, solo mueve el household_code del que ya tenía).
   Se verifica con un secreto compartido en un header, para que
   nadie más pueda disparar correos falsos.
   ========================================================= */

var { createClient } = require("@supabase/supabase-js");
var { readJsonBody } = require("./_lib/body");
var { sendJson } = require("./_lib/http");

module.exports = async function handler(req, res) {
  if (!process.env.SIGNUP_WEBHOOK_SECRET || req.headers["x-webhook-secret"] !== process.env.SIGNUP_WEBHOOK_SECRET) {
    sendJson(res, 401, { error: "No autorizado" });
    return;
  }

  var body = await readJsonBody(req);
  var profile = body && body.record;
  if (!profile || !profile.id) { sendJson(res, 200, { skipped: true }); return; }

  var supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  var email = null;
  try {
    var userRes = await supabase.auth.admin.getUserById(profile.id);
    email = userRes.data && userRes.data.user ? userRes.data.user.email : null;
  } catch (e) {}

  var when = new Date(Number(profile.created_at) || Date.now())
    .toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" });

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM_EMAIL || "FinzApp <onboarding@resend.dev>",
        to: process.env.NOTIFY_TO_EMAIL || "hola@finzapp.com.mx",
        subject: "Cuenta nueva en FinzApp — " + (profile.name || "sin nombre"),
        text:
          "Se registró una cuenta nueva.\n\n" +
          "Nombre: " + (profile.name || "—") + "\n" +
          "Correo: " + (email || "—") + "\n" +
          "Código de hogar: " + (profile.household_code || "—") + "\n" +
          "Fecha: " + when
      })
    });
  } catch (err) {
    console.error("notify-signup: no se pudo mandar el correo", err && err.message);
  }

  sendJson(res, 200, { received: true });
};
