/* =========================================================
   api/_lib/body.js — leer el cuerpo de la petición a mano.

   El proyecto tiene NODEJS_HELPERS=0 (variable de entorno en
   Vercel), así que req.body NO viene pre-parseado en ninguna
   función — lo necesitamos así para el webhook de Stripe, que debe
   verificar la firma contra los bytes EXACTOS que mandó Stripe (un
   req.body ya parseado y vuelto a convertir a texto no sería
   idéntico byte a byte, y la firma no cuadraría). Las demás
   funciones usan este mismo helper para no depender de un
   comportamiento distinto entre rutas.
   ========================================================= */

function readRawBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on("data", function (c) { chunks.push(c); });
    req.on("end", function () { resolve(Buffer.concat(chunks)); });
    req.on("error", reject);
  });
}

function readJsonBody(req) {
  return readRawBody(req).then(function (buf) {
    if (!buf || !buf.length) return {};
    try { return JSON.parse(buf.toString("utf8")); } catch (e) { return {}; }
  });
}

module.exports = { readRawBody: readRawBody, readJsonBody: readJsonBody };
