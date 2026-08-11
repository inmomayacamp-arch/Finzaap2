/* =========================================================
   api/send-reminders.js — recordatorios push, una vez al día

   Lo dispara Vercel Cron (ver vercel.json). Revisa, por cada
   persona con notificaciones activadas: si tiene un pago venciendo
   pronto, si no ha registrado nada hoy, y si es domingo (reporte
   semanal) — y le manda SOLO los avisos que le tocan a ELLA, no un
   mensaje igual para todos.

   Usa la llave de servicio de Supabase (SUPABASE_SERVICE_ROLE_KEY),
   que ignora RLS a propósito: este es el único lugar del proyecto
   que necesita ver datos de todas las cuentas a la vez. Esa llave
   vive solo como variable de entorno en Vercel, nunca en el cliente.
   ========================================================= */

var { createClient } = require("@supabase/supabase-js");
var webpush = require("web-push");
var { sendJson } = require("./_lib/http");

module.exports = async function handler(req, res) {
  // Protege el endpoint: solo Vercel Cron (con CRON_SECRET) puede
  // llamarlo, para que nadie más pueda disparar envíos masivos.
  var authHeader = req.headers["authorization"] || "";
  if (!process.env.CRON_SECRET || authHeader !== "Bearer " + process.env.CRON_SECRET) {
    sendJson(res, 401, { error: "No autorizado" });
    return;
  }

  var supabaseUrl = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    sendJson(res, 500, { error: "Faltan variables de entorno" });
    return;
  }

  var supabase = createClient(supabaseUrl, serviceKey);
  webpush.setVapidDetails("mailto:hola@finzapp.com.mx", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  var today = new Date();
  var todayISO = today.toISOString().slice(0, 10);
  var in3days = new Date(today.getTime() + 3 * 86400000).toISOString().slice(0, 10);
  var isSunday = today.getDay() === 0;

  var { data: subs, error: subsErr } = await supabase
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth");
  if (subsErr) { sendJson(res, 500, { error: subsErr.message }); return; }
  if (!subs || !subs.length) { sendJson(res, 200, { checked: 0, sent: 0 }); return; }

  var userIds = Array.from(new Set(subs.map(function (s) { return s.user_id; })));
  var { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, household_code")
    .in("id", userIds);
  if (profErr) { sendJson(res, 500, { error: profErr.message }); return; }

  var notifications = []; // { user_id, title, body }

  for (var i = 0; i < profiles.length; i++) {
    var profile = profiles[i];
    var acc = profile.household_code;

    var { data: duePayables } = await supabase
      .from("payables")
      .select("description, amount, date")
      .eq("account_code", acc)
      .eq("status", "pending")
      .gte("date", todayISO)
      .lte("date", in3days);

    (duePayables || []).forEach(function (p) {
      notifications.push({
        user_id: profile.id,
        title: "Pago próximo",
        body: (p.description || "Un pago") + " vence el " + p.date + " — $" + p.amount
      });
    });

    var { count: txToday } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("account_code", acc)
      .eq("date", todayISO);

    if (!txToday) {
      notifications.push({
        user_id: profile.id,
        title: "FinzApp",
        body: "No has registrado movimientos hoy. Llévalo al día tomándote 30 segundos."
      });
    }

    if (isSunday) {
      notifications.push({
        user_id: profile.id,
        title: "Tu reporte semanal",
        body: "Dale un vistazo a tu Reporte de esta semana en FinzApp."
      });
    }
  }

  var sent = 0, failed = 0, removed = 0;
  for (var j = 0; j < notifications.length; j++) {
    var n = notifications[j];
    var userSubs = subs.filter(function (s) { return s.user_id === n.user_id; });
    for (var k = 0; k < userSubs.length; k++) {
      var s = userSubs[k];
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: n.title, body: n.body, url: "/" })
        );
        sent++;
      } catch (err) {
        failed++;
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          removed++;
        }
      }
    }
  }

  sendJson(res, 200, { checked: profiles.length, notifications: notifications.length, sent: sent, failed: failed, removedStale: removed });
};
