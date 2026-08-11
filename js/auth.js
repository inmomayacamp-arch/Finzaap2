/* =========================================================
   auth.js — registro, login y perfiles (Supabase Auth)

   Cada usuario autenticado tiene una fila en `profiles` con:
   - invite_code: su código personal, permanente, para invitar
     a otras personas que YA tengan su propia cuenta.
   - household_code: el código del espacio compartido en el que
     está trabajando ahora mismo (por defecto, el suyo propio).
     Todas las lecturas/escrituras de datos usan household_code,
     no invite_code.
   ========================================================= */

var Auth = (function () {

  var PENDING_NAME_KEY = "finanza:pendingSignupName";

  function client() {
    var c = Storage.sync.client();
    if (!c) throw new Error("Supabase no está configurado (revisa js/config.js).");
    return c;
  }

  function friendlyError(err) {
    var msg = (err && err.message) || String(err);
    if (/already registered|already exists/i.test(msg)) return "Ese correo ya tiene una cuenta. Intenta iniciar sesión.";
    if (/invalid login credentials/i.test(msg)) return "Correo o contraseña incorrectos.";
    if (/email not confirmed/i.test(msg)) return "Confirma tu correo antes de entrar (revisa tu bandeja de entrada).";
    if (/password should be at least/i.test(msg)) return "La contraseña debe tener al menos 6 caracteres.";
    if (/unable to validate email/i.test(msg)) return "Ese correo no parece válido.";
    return msg;
  }

  function createProfile(userId, name, email) {
    var c = client();
    var code = Utils.generateAccountCode();
    return c.from("accounts").insert({ code: code, created_at: Date.now() })
      .then(function (res) { if (res.error) throw res.error; })
      .then(function () {
        return c.from("profiles").insert({
          id: userId, name: name, invite_code: code, household_code: code, created_at: Date.now()
        });
      })
      .then(function (res) { if (res.error) throw res.error; return { id: userId, name: name, inviteCode: code, householdCode: code, email: email || null }; });
  }

  function loadOrCreateProfile(userId, fallbackName) {
    var c = client();
    return c.auth.getUser().then(function (userRes) {
      var email = userRes.data && userRes.data.user ? userRes.data.user.email : null;
      return c.from("profiles").select("*").eq("id", userId).maybeSingle()
        .then(function (res) {
          if (res.error) throw res.error;
          if (res.data) {
            return { id: res.data.id, name: res.data.name, inviteCode: res.data.invite_code, householdCode: res.data.household_code, email: email };
          }
          // primer login tras confirmar el correo: el perfil aun no existia
          var name = fallbackName || localStorage.getItem(PENDING_NAME_KEY) || "Usuario";
          return createProfile(userId, name, email);
        })
        .then(function (profile) {
          localStorage.removeItem(PENDING_NAME_KEY);
          return profile;
        });
    });
  }

  function signUp(name, email, password) {
    localStorage.setItem(PENDING_NAME_KEY, name);
    return client().auth.signUp({ email: email, password: password })
      .then(function (res) {
        if (res.error) throw new Error(friendlyError(res.error));
        if (!res.data.session) {
          return { needsConfirmation: true };
        }
        return createProfile(res.data.user.id, name, res.data.user.email).then(function (profile) {
          return { needsConfirmation: false, profile: profile };
        });
      });
  }

  function signIn(email, password) {
    return client().auth.signInWithPassword({ email: email, password: password })
      .then(function (res) {
        if (res.error) throw new Error(friendlyError(res.error));
        return loadOrCreateProfile(res.data.user.id);
      });
  }

  function signOut() {
    return client().auth.signOut();
  }

  function getSessionUser() {
    return client().auth.getSession().then(function (res) { return res.data.session ? res.data.session.user : null; });
  }

  function sendPasswordReset(email) {
    return client().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname })
      .then(function (res) { if (res.error) throw new Error(friendlyError(res.error)); });
  }

  function updatePassword(newPassword) {
    return client().auth.updateUser({ password: newPassword })
      .then(function (res) { if (res.error) throw new Error(friendlyError(res.error)); });
  }

  function onAuthEvent(cb) {
    client().auth.onAuthStateChange(cb);
  }

  // Devuelve el resto de perfiles que comparten el mismo household_code
  // (para mostrar con quién estás sincronizado: nombre + iniciales).
  function listHouseholdMembers(householdCode) {
    var c = client();
    return c.from("profiles").select("id,name").eq("household_code", householdCode)
      .then(function (res) { if (res.error) throw res.error; return res.data || []; });
  }

  // Pide unirte al espacio de otra persona a partir de SU código
  // personal (invite_code) — esto YA NO une de inmediato, solo crea
  // una solicitud pendiente que esa persona debe aceptar desde su
  // Cuenta (ver accept_join_request). Corre en el servidor porque
  // necesita buscar el perfil de alguien más por su invite_code, algo
  // que las políticas normales de profiles no dejan hacer al cliente.
  function requestJoin(inviteCode) {
    var c = client();
    return c.rpc("request_join", { p_invite_code: inviteCode })
      .then(function (res) {
        if (res.error) throw new Error(friendlyError(res.error));
        var row = res.data && res.data[0];
        if (!row) throw new Error("No encontramos ese código.");
        return { targetName: row.target_name, status: row.status };
      });
  }

  // Solicitudes pendientes que otras personas te enviaron con TU código.
  function getIncomingJoinRequests(userId) {
    var c = client();
    return c.from("join_requests").select("id,requester_name,created_at")
      .eq("target_id", userId).eq("status", "pending").order("created_at", { ascending: false })
      .then(function (res) { if (res.error) throw res.error; return res.data || []; });
  }

  // La solicitud más reciente que TÚ enviaste (para saber si sigue
  // pendiente, si te aceptaron o si te rechazaron).
  function getOutgoingJoinRequest(userId) {
    var c = client();
    return c.from("join_requests").select("id,target_name,status,created_at")
      .eq("requester_id", userId).order("created_at", { ascending: false }).limit(1)
      .then(function (res) { if (res.error) throw res.error; return (res.data && res.data[0]) || null; });
  }

  function acceptJoinRequest(requestId) {
    var c = client();
    return c.rpc("accept_join_request", { p_request_id: requestId })
      .then(function (res) {
        if (res.error) throw new Error(friendlyError(res.error));
        var row = res.data && res.data[0];
        if (!row) throw new Error("No se pudo aceptar la solicitud.");
        return { householdCode: row.household_code, requesterName: row.requester_name };
      });
  }

  function rejectJoinRequest(requestId) {
    var c = client();
    return c.rpc("reject_join_request", { p_request_id: requestId })
      .then(function (res) { if (res.error) throw new Error(friendlyError(res.error)); });
  }

  // Borra una solicitud tuya ya resuelta (aceptada/rechazada) de la
  // vista — las pendientes no se pueden borrar así, solo resolverse.
  function dismissJoinRequest(requestId) {
    var c = client();
    return c.from("join_requests").delete().eq("id", requestId)
      .then(function (res) { if (res.error) throw res.error; });
  }

  // Quita a alguien de TU espacio compartido (lo puede hacer cualquiera
  // de los dos lados, no solo quien se unió). Esa persona regresa a su
  // propio espacio; no se borra ningún dato de nadie.
  function removeHouseholdMember(memberId) {
    var c = client();
    return c.rpc("remove_household_member", { p_member_id: memberId })
      .then(function (res) { if (res.error) throw new Error(friendlyError(res.error)); });
  }

  // Sale del espacio compartido y regresa tu perfil a tu propio
  // espacio (tu invite_code de siempre). No borra ningún dato: lo que
  // había en el espacio compartido sigue ahí para quien se quede.
  function leaveHousehold() {
    var c = client();
    return c.rpc("leave_household")
      .then(function (res) {
        if (res.error) throw new Error(friendlyError(res.error));
        var row = res.data && res.data[0];
        if (!row) throw new Error("No se pudo salir de la cuenta compartida.");
        return { householdCode: row.household_code };
      });
  }

  return {
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    loadOrCreateProfile: loadOrCreateProfile,
    getSessionUser: getSessionUser,
    sendPasswordReset: sendPasswordReset,
    updatePassword: updatePassword,
    onAuthEvent: onAuthEvent,
    listHouseholdMembers: listHouseholdMembers,
    requestJoin: requestJoin,
    getIncomingJoinRequests: getIncomingJoinRequests,
    getOutgoingJoinRequest: getOutgoingJoinRequest,
    acceptJoinRequest: acceptJoinRequest,
    rejectJoinRequest: rejectJoinRequest,
    dismissJoinRequest: dismissJoinRequest,
    leaveHousehold: leaveHousehold,
    removeHouseholdMember: removeHouseholdMember
  };
})();
