/* =========================================================
   views/setup.js — flujo de onboarding (3 pasos)
   ========================================================= */

var SetupView = (function () {

  var pendingName = "";

  function init() {
    var nameInput = document.getElementById("input-name");
    var continueBtn = document.getElementById("btn-name-continue");
    var codeInput = document.getElementById("input-code");

    nameInput.addEventListener("input", function () {
      continueBtn.disabled = nameInput.value.trim().length === 0;
    });
    nameInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !continueBtn.disabled) goToAccountStep();
    });
    continueBtn.addEventListener("click", goToAccountStep);

    document.getElementById("btn-back-name").addEventListener("click", function () {
      document.getElementById("step-account").hidden = true;
      document.getElementById("step-name").hidden = false;
      nameInput.focus();
    });

    document.getElementById("btn-create-account").addEventListener("click", createAccount);

    document.getElementById("btn-join-account").addEventListener("click", function () {
      var panel = document.getElementById("join-panel");
      panel.hidden = !panel.hidden;
      if (!panel.hidden) codeInput.focus();
    });

    codeInput.addEventListener("input", function () {
      var pos = codeInput.selectionStart;
      var before = codeInput.value.length;
      codeInput.value = Utils.formatCode(codeInput.value);
      var after = codeInput.value.length;
      codeInput.setSelectionRange(pos + (after - before), pos + (after - before));
      document.getElementById("join-error").hidden = true;
    });
    codeInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") joinAccount();
    });
    document.getElementById("btn-join-confirm").addEventListener("click", joinAccount);
  }

  function goToAccountStep() {
    var nameInput = document.getElementById("input-name");
    pendingName = nameInput.value.trim();
    if (!pendingName) return;
    document.getElementById("greet-name").textContent = pendingName;
    document.getElementById("step-name").hidden = true;
    document.getElementById("step-account").hidden = false;
  }

  function startSession(code) {
    var session = {
      name: pendingName,
      code: code,
      color: Utils.colorForAuthor(pendingName)
    };
    Storage.setSession(session);
    App.boot();
  }

  function setLoading(btn, loadingText) {
    btn.dataset.originalText = btn.textContent;
    btn.textContent = loadingText;
    btn.disabled = true;
  }
  function clearLoading(btn) {
    btn.textContent = btn.dataset.originalText || btn.textContent;
    btn.disabled = false;
  }

  function createAccount() {
    var code = Utils.generateAccountCode();
    Storage.ensureAccount(code);
    var btn = document.getElementById("btn-create-account");

    if (Storage.sync.isConfigured()) {
      setLoading(btn, "Creando…");
      Storage.sync.ensureAccountRemote(code)
        .then(function () { startSession(code); })
        .catch(function () { startSession(code); });
    } else {
      startSession(code);
    }
  }

  function joinAccount() {
    var codeInput = document.getElementById("input-code");
    var code = Utils.normalizeCode(codeInput.value);
    var errorEl = document.getElementById("join-error");

    if (code.length !== 8) {
      errorEl.textContent = "Ingresa el código completo de 8 caracteres.";
      errorEl.hidden = false;
      return;
    }
    var formatted = code.slice(0, 4) + "-" + code.slice(4, 8);
    var btn = document.getElementById("btn-join-confirm");

    if (Storage.sync.isConfigured()) {
      setLoading(btn, "Buscando…");
      Storage.sync.accountExistsRemote(formatted).then(function (existsRemote) {
        clearLoading(btn);
        if (existsRemote === false) {
          errorEl.textContent = "No encontramos esa cuenta. Verifica el código.";
          errorEl.hidden = false;
          return;
        }
        Storage.ensureAccount(formatted);
        startSession(formatted);
      });
      return;
    }

    if (!Storage.accountExists(formatted)) {
      errorEl.textContent = "No encontramos esa cuenta en este dispositivo.";
      errorEl.hidden = false;
      return;
    }
    startSession(formatted);
  }

  return { init: init };
})();
