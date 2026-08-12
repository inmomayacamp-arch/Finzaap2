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

  // Presupuestos: a diferencia de los pagos por vencer (que se avisan
  // todos los dias mientras sigan pendientes, sin problema porque se
  // resuelven solos), un presupuesto pasado se queda pasado el resto
  // del mes -- avisar cada dia seria machacar. notified_pct/
  // notified_month en cada fila de `budgets` recuerdan el umbral (80%
  // o 100%) ya avisado ESTE mes, para avisar una sola vez por umbral.
  // Se revisa una vez por hogar (no por persona) para no duplicar el
  // aviso ni la escritura cuando la cuenta es compartida.
  var monthKey = todayISO.slice(0, 7);
  var monthStartISO = monthKey + "-01";
  var profilesByAccount = {};
  profiles.forEach(function (p) {
    var acc = p.household_code;
    if (!profilesByAccount[acc]) profilesByAccount[acc] = [];
    profilesByAccount[acc].push(p);
  });

  var accountCodes = Object.keys(profilesByAccount);

  // Prueba por terminar: aviso único (no todos los dias, para no
  // machacar) cuando quedan exactamente 2 dias de los 7 de prueba, y
  // solo si la cuenta no tiene ya una suscripcion real -- si ya paga,
  // no le va a "acabar" nada, el aviso no le aplica.
  var TRIAL_DAYS = 7;
  var TRIAL_WARNING_DAYS_LEFT = 2;

  var { data: accountsData } = await supabase.from("accounts").select("code, created_at").in("code", accountCodes);
  var createdAtByAccount = {};
  (accountsData || []).forEach(function (acc) { createdAtByAccount[acc.code] = Number(acc.created_at); });

  var { data: subsData } = await supabase.from("subscriptions").select("household_code, status").in("household_code", accountCodes);
  var hasAccessViaSubByAccount = {};
  (subsData || []).forEach(function (s) {
    if (s.status === "active" || s.status === "trialing" || s.status === "grandfathered") hasAccessViaSubByAccount[s.household_code] = true;
  });

  for (var a = 0; a < accountCodes.length; a++) {
    var accCode = accountCodes[a];
    var members = profilesByAccount[accCode];

    var createdAt = createdAtByAccount[accCode];
    if (createdAt && !hasAccessViaSubByAccount[accCode]) {
      var daysSinceCreated = Math.floor((today.getTime() - createdAt) / 86400000);
      var trialDaysLeft = TRIAL_DAYS - daysSinceCreated;
      if (trialDaysLeft === TRIAL_WARNING_DAYS_LEFT) {
        members.forEach(function (m) {
          notifications.push({
            user_id: m.id,
            title: "Tu prueba está por terminar",
            body: "Te quedan " + TRIAL_WARNING_DAYS_LEFT + " días de prueba gratis en FinzApp. Activa un plan para no perder acceso."
          });
        });
      }
    }

    var { data: accBudgets } = await supabase
      .from("budgets")
      .select("id, category, monthly_limit, notified_pct, notified_month")
      .eq("account_code", accCode);
    if (!accBudgets || !accBudgets.length) continue;

    var { data: monthExpenses } = await supabase
      .from("transactions")
      .select("category, amount")
      .eq("account_code", accCode)
      .eq("type", "egreso")
      .gte("date", monthStartISO);

    var spentByCategory = {};
    (monthExpenses || []).forEach(function (t) {
      var cat = t.category || "General";
      spentByCategory[cat] = (spentByCategory[cat] || 0) + Number(t.amount);
    });

    for (var b = 0; b < accBudgets.length; b++) {
      var budget = accBudgets[b];
      var spent = spentByCategory[budget.category] || 0;
      var pct = budget.monthly_limit > 0 ? Math.round((spent / budget.monthly_limit) * 100) : 0;
      var threshold = pct >= 100 ? 100 : pct >= 80 ? 80 : 0;
      var notifiedThisMonth = budget.notified_month === monthKey ? (budget.notified_pct || 0) : 0;

      if (threshold > 0 && threshold > notifiedThisMonth) {
        var title = threshold >= 100 ? "Presupuesto superado" : "Ya casi llegas a tu límite";
        var body = threshold >= 100
          ? "Ya pasaste tu presupuesto de " + budget.category + " este mes ($" + Math.round(spent) + " de $" + Math.round(budget.monthly_limit) + ")."
          : "Vas en " + pct + "% de tu presupuesto de " + budget.category + " este mes.";

        members.forEach(function (m) {
          notifications.push({ user_id: m.id, title: title, body: body });
        });

        await supabase.from("budgets").update({ notified_pct: threshold, notified_month: monthKey }).eq("id", budget.id);
      }
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
