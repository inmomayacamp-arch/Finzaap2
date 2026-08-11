/* =========================================================
   api/health.js — endpoint público, sin autenticación, para que
   un monitor externo (UptimeRobot, etc.) confirme dos cosas:
   que el sitio responde Y que sí puede hablar con Supabase --
   no solo que Vercel está de pie. No expone datos, solo el
   estado (ok/error).
   ========================================================= */

var { createClient } = require("@supabase/supabase-js");
var { sendJson } = require("./_lib/http");

module.exports = async function handler(req, res) {
  var supabaseUrl = process.env.SUPABASE_URL;
  var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    sendJson(res, 500, { status: "error", reason: "missing_env" });
    return;
  }

  try {
    var supabase = createClient(supabaseUrl, serviceKey);
    var result = await supabase.from("accounts").select("code").limit(1);
    if (result.error) throw result.error;
    sendJson(res, 200, { status: "ok" });
  } catch (err) {
    console.error("Health check:", err && err.message);
    sendJson(res, 500, { status: "error" });
  }
};
