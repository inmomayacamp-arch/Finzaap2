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

  function createProfile(userId, name) {
    var c = client();
    var code = Utils.generateAccountCode();
    return c.from("accounts").insert({ code: code, created_at: Date.now() })
      .then(function (res) { if (res.error) throw res.error; })
      .then(function () {
        return c.from("profiles").insert({
          id: userId, name: name, invite_code: code, household_code: code, created_at: Date.now()
        });
      })
      .then(function (res) { if (res.error) throw res.error; return { id: userId, name: name, inviteCode: code, householdCode: code }; });
  }

  function loadOrCreateProfile(userId, fallbackName) {
    var c = client();
    return c.from("profiles").select("*").eq("id", userId).maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        if (res.data) {
          return { id: res.data.id, name: res.data.name, inviteCode: res.data.invite_code, householdCode: res.data.household_code };
        }
        // primer login tras confirmar el correo: el perfil aun no existia
        var name = fallbackName || localStorage.getItem(PENDING_NAME_KEY) || "Usuario";
        return createProfile(userId, name);
      })
      .then(function (profile) {
        localStorage.removeItem(PENDING_NAME_KEY);
        return profile;
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
        return createProfile(res.data.user.id, name).then(function (profile) {
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

  // Une el perfil del usuario actual al espacio compartido de otra
  // persona a partir de SU código personal (invite_code).
  function joinByCode(userId, inviteCode) {
    var c = client();
    return c.from("profiles").select("household_code, name").eq("invite_code", inviteCode).maybeSingle()
      .then(function (res) {
        if (res.error) throw new Error(friendlyError(res.error));
        if (!res.data) throw new Error("No encontramos ese código.");
        return c.from("profiles").update({ household_code: res.data.household_code }).eq("id", userId)
          .then(function (res2) { if (res2.error) throw new Error(friendlyError(res2.error)); return res.data; });
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
    joinByCode: joinByCode
  };
})();
