/* =========================================================
   views/setup.js — login / registro / recuperación (Supabase Auth)
   ========================================================= */

var SetupView = (function () {

  function $(id) { return document.getElementById(id); }

  function showStep(id) {
    ["step-login", "step-signup", "step-check-email", "step-forgot", "step-reset"].forEach(function (s) {
      $(s).hidden = s !== id;
    });
  }

  function showError(id, err) {
    var el = $(id);
    el.textContent = (err && err.message) || String(err);
    el.hidden = false;
  }
  function hideError(id) { $(id).hidden = true; }

  function setLoading(btn, loadingText) {
    if (btn.dataset.originalText === undefined) btn.dataset.originalText = btn.textContent;
    btn.textContent = loadingText;
    btn.disabled = true;
  }
  function clearLoading(btn) {
    btn.textContent = btn.dataset.originalText || btn.textContent;
    btn.disabled = false;
  }

  function sessionFromProfile(profile) {
    return {
      userId: profile.id,
      name: profile.name,
      code: profile.householdCode,
      inviteCode: profile.inviteCode,
      color: Utils.colorForAuthor(profile.name)
    };
  }

  function init() {
    // ---- login ----
    $("btn-login-submit").addEventListener("click", function () {
      hideError("login-error");
      var email = $("login-email").value.trim();
      var password = $("login-password").value;
      if (!email || !password) { showError("login-error", "Escribe tu correo y tu contraseña."); return; }
      var btn = $("btn-login-submit");
      setLoading(btn, "Entrando…");
      Auth.signIn(email, password)
        .then(function (profile) {
          Storage.setSession(sessionFromProfile(profile));
          App.boot();
        })
        .catch(function (err) { clearLoading(btn); showError("login-error", err); });
    });
    $("login-password").addEventListener("keydown", function (e) { if (e.key === "Enter") $("btn-login-submit").click(); });

    $("btn-go-signup").addEventListener("click", function () { showStep("step-signup"); });
    $("btn-go-login").addEventListener("click", function () { showStep("step-login"); });
    $("btn-go-forgot").addEventListener("click", function () { showStep("step-forgot"); });

    // ---- crear cuenta ----
    $("btn-signup-submit").addEventListener("click", function () {
      hideError("signup-error");
      var name = $("signup-name").value.trim();
      var email = $("signup-email").value.trim();
      var password = $("signup-password").value;
      if (!name) { showError("signup-error", "Escribe tu nombre."); return; }
      if (!email) { showError("signup-error", "Escribe tu correo."); return; }
      if (password.length < 6) { showError("signup-error", "La contraseña debe tener al menos 6 caracteres."); return; }
      var btn = $("btn-signup-submit");
      setLoading(btn, "Creando…");
      Auth.signUp(name, email, password)
        .then(function (result) {
          clearLoading(btn);
          if (result.needsConfirmation) {
            $("check-email-address").textContent = email;
            showStep("step-check-email");
          } else {
            Storage.setSession(sessionFromProfile(result.profile));
            App.boot();
          }
        })
        .catch(function (err) { clearLoading(btn); showError("signup-error", err); });
    });

    $("btn-check-email-back").addEventListener("click", function () { showStep("step-login"); });

    // ---- olvidé mi contraseña ----
    $("btn-forgot-back").addEventListener("click", function () { showStep("step-login"); });
    $("btn-forgot-submit").addEventListener("click", function () {
      hideError("forgot-error");
      $("forgot-success").hidden = true;
      var email = $("forgot-email").value.trim();
      if (!email) { showError("forgot-error", "Escribe tu correo."); return; }
      var btn = $("btn-forgot-submit");
      setLoading(btn, "Enviando…");
      Auth.sendPasswordReset(email)
        .then(function () { clearLoading(btn); $("forgot-success").hidden = false; })
        .catch(function (err) { clearLoading(btn); showError("forgot-error", err); });
    });

    // ---- nueva contraseña (desde el enlace del correo) ----
    $("btn-reset-submit").addEventListener("click", function () {
      hideError("reset-error");
      var pw = $("reset-password").value;
      if (pw.length < 6) { showError("reset-error", "La contraseña debe tener al menos 6 caracteres."); return; }
      var btn = $("btn-reset-submit");
      setLoading(btn, "Guardando…");
      Auth.updatePassword(pw)
        .then(function () { return Auth.getSessionUser(); })
        .then(function (user) { return Auth.loadOrCreateProfile(user.id); })
        .then(function (profile) {
          Storage.setSession(sessionFromProfile(profile));
          App.boot();
        })
        .catch(function (err) { clearLoading(btn); showError("reset-error", err); });
    });
  }

  function showRecoveryStep() {
    showStep("step-reset");
  }

  return { init: init, showRecoveryStep: showRecoveryStep };
})();
