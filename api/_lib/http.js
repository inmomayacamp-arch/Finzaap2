/* =========================================================
   api/_lib/http.js — responder sin los helpers de Vercel

   Con NODEJS_HELPERS=0 (necesario para leer el body crudo del
   webhook de Stripe), tambien desaparecen res.status()/res.json()
   en TODAS las funciones, no solo en la que los necesitaba. Este
   helper los reemplaza con la API nativa de Node.
   ========================================================= */

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

module.exports = { sendJson: sendJson };
