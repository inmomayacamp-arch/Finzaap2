/* =========================================================
   views/account.js — pantalla "Cuenta"
   ========================================================= */

var AccountView = (function () {

  function code() { return App.session().code; }

  var emailBackfillAttempted = false;

  // Solicitudes de sincronización: se cargan una vez y se invalidan
  // (vuelven a pedirse) despues de aceptar/rechazar/enviar/salir.
  var incomingRequestsCache = [];
  var outgoingRequestCache = null;
  var joinRequestsLoaded = false;
  var joinRequestsLoading = false;

  function invalidateJoinRequests() {
    joinRequestsLoaded = false;
  }

  function ensureJoinRequestsLoaded(session) {
    if (!Storage.sync.isConfigured() || typeof Auth === "undefined") return;
    if (joinRequestsLoaded || joinRequestsLoading) return;
    joinRequestsLoading = true;
    Promise.all([
      Auth.getIncomingJoinRequests(session.userId),
      Auth.getOutgoingJoinRequest(session.userId)
    ]).then(function (results) {
      incomingRequestsCache = results[0] || [];
      outgoingRequestCache = results[1] || null;
      joinRequestsLoading = false;
      joinRequestsLoaded = true;

      // ya te aceptaron: mueve tu sesion a ese espacio compartido y
      // limpia la solicitud, en vez de seguir mostrando "esperando".
      if (outgoingRequestCache && outgoingRequestCache.status === "accepted") {
        applyAcceptedSwitch(session, outgoingRequestCache);
        return;
      }
      App.refresh();
    }).catch(function () { joinRequestsLoading = false; });
  }

  function applyAcceptedSwitch(session, req) {
    Auth.loadOrCreateProfile(session.userId, session.name).then(function (profile) {
      var newSession = Object.assign({}, session, { code: profile.householdCode, inviteCode: profile.inviteCode });
      Storage.setSession(newSession);
      Storage.sync.unsubscribe();
      Storage.ensureAccount(newSession.code);
      return Storage.sync.pullAll(newSession.code).then(function () {
        Storage.sync.subscribe(newSession.code, App.refresh);
        return Auth.dismissJoinRequest(req.id).catch(function () {});
      });
    }).then(function () {
      outgoingRequestCache = null;
      App.refresh();
    });
  }

  // Estado de la suscripcion (prueba/pagada/vencida): se carga una
  // vez y se refresca la UI cuando llega. Solo para MOSTRAR el
  // estado -- el bloqueo real de escritura lo aplica la base de
  // datos (has_active_access), no esta cache.
  var billingState = null;
  var billingLoading = false;

  function ensureBillingLoaded(session) {
    if (!Storage.sync.isConfigured() || typeof Billing === "undefined") return;
    if (billingState !== null || billingLoading) return;
    billingLoading = true;
    Billing.getSubscriptionState(session).then(function (state) {
      billingState = state;
      billingLoading = false;
      App.refresh();
    }).catch(function () { billingLoading = false; });
  }

  // Estado de las notificaciones push: se carga una vez y se
  // refresca la UI cuando llega.
  var pushSubscribed = null; // null = aun no se sabe
  var pushLoading = false;

  function ensurePushStateLoaded() {
    if (typeof Push === "undefined" || !Push.isSupported() || pushSubscribed !== null || pushLoading) return;
    pushLoading = true;
    Push.isSubscribed().then(function (yes) {
      pushSubscribed = yes;
      pushLoading = false;
      App.refresh();
    }).catch(function () { pushLoading = false; });
  }

  // "quién registró qué": cada movimiento ya guarda su autor (se ve en
  // cada fila de Inicio/Reporte) -- esto solo junta un resumen por
  // persona para tener una vista rápida, sin tener que revisar
  // movimiento por movimiento. Solo aplica si la cuenta es compartida.
  function activityCardHTML(session, others, txs) {
    if (!others.length) return "";
    var members = [{ name: session.name }].concat(others);
    var now = new Date();
    var monthKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");

    var rows = members.map(function (m) {
      var mine = txs.filter(function (t) { return t.author === m.name; });
      var thisMonth = mine.filter(function (t) { return t.date.slice(0, 7) === monthKey; }).length;
      var last = mine.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); })[0];
      return { name: m.name, thisMonth: thisMonth, last: last };
    });

    return (
      '<div class="card">' +
        '<div class="card-label-sm">' + Icons.get("users", 12) + ' Actividad del hogar</div>' +
        rows.map(function (r) {
          return (
            '<div class="activity-row">' +
              '<span class="avatar avatar-sm" style="background:' + Utils.colorForAuthor(r.name) + '">' + Utils.initials(r.name) + '</span>' +
              '<div class="activity-info">' +
                '<div class="activity-name">' + Utils.escapeHtml(r.name) + '</div>' +
                '<div class="activity-meta">' +
                  r.thisMonth + ' movimiento' + (r.thisMonth === 1 ? '' : 's') + ' este mes' +
                  (r.last ? ' · último: ' + Utils.escapeHtml(r.last.description || (r.last.type === 'ingreso' ? 'Ingreso' : 'Egreso')) + ' (' + Utils.shortDate(r.last.date) + ')' : '') +
                '</div>' +
              '</div>' +
            '</div>'
          );
        }).join("") +
      '</div>'
    );
  }

  function render(container) {
    var session = App.session();

    // Sesiones que iniciaron antes de guardar el correo no lo tienen: se
    // completa una sola vez consultando la sesión de Supabase actual.
    if (!session.email && !emailBackfillAttempted && Storage.sync.isConfigured()) {
      emailBackfillAttempted = true;
      Storage.sync.client().auth.getUser().then(function (res) {
        var email = res.data && res.data.user ? res.data.user.email : null;
        if (email) {
          Storage.setSession(Object.assign({}, App.session(), { email: email }));
          App.refresh();
        }
      }).catch(function () {});
    }

    App.ensureHouseholdMembersLoaded(session);
    var others = App.householdMembers(session);
    ensureJoinRequestsLoaded(session);
    ensurePushStateLoaded();
    ensureBillingLoaded(session);
    var isShared = session.inviteCode && session.code !== session.inviteCode;
    var pushSupported = typeof Push !== "undefined" && Push.isSupported();
    var txs = Storage.transactions.list(code());
    var now = new Date();
    var key = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    var income = 0, expense = 0;
    txs.forEach(function (t) {
      if (t.date.slice(0, 7) !== key) return;
      if (t.type === "ingreso") income += t.amount; else expense += t.amount;
    });
    var balance = income - expense;

    var receivablesPending = Storage.receivables.list(code()).filter(function (r) { return r.status !== "paid"; });
    var payablesPending = Storage.payables.list(code()).filter(function (p) { return p.status !== "paid"; });
    var recurrentCount = Storage.recurringTransactions.list(code()).length +
      Storage.recurringReceivables.list(code()).length + Storage.recurringPayables.list(code()).length;
    var deposits = Storage.savingsDeposits.list(code());
    var savingsTotal = deposits.reduce(function (s, d) { return s + d.amount; }, 0);

    var wallet = txs.reduce(function (acc, t) { return acc + (t.type === "ingreso" ? t.amount : -t.amount); }, 0);
    var expectedFlow = wallet +
      receivablesPending.reduce(function (s, r) { return s + r.amount; }, 0) -
      payablesPending.reduce(function (s, p) { return s + p.amount; }, 0);

    var status = Storage.syncStatus();

    container.innerHTML =
      '<div class="page-header">' +
        '<div>' +
          '<div class="page-eyebrow">Mi</div>' +
          '<h1 class="page-title">Cuenta</h1>' +
        '</div>' +
      '</div>' +

      '<div class="profile-hero">' +
        '<div class="profile-hero-top">' +
          '<span class="avatar">' + Utils.initials(session.name) + '</span>' +
          '<div>' +
            '<div class="profile-hero-name">' + Utils.escapeHtml(session.name) + '</div>' +
            '<div class="profile-hero-sub">' + Utils.MONTHS_CAP[now.getMonth()].toLowerCase() + ' ' + now.getFullYear() + '</div>' +
            (session.email ? '<div class="profile-hero-sub" style="opacity:0.7;margin-top:1px">' + Utils.escapeHtml(session.email) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="profile-stats">' +
          '<div class="profile-stat"><div class="p-label">Ingresos</div><div class="p-value">' + Utils.formatMoney(income) + '</div></div>' +
          '<div class="profile-stat"><div class="p-label">Egresos</div><div class="p-value">' + Utils.formatMoney(expense) + '</div></div>' +
          '<div class="profile-stat"><div class="p-label">Balance</div><div class="p-value">' + Utils.formatMoney(balance) + '</div></div>' +
        '</div>' +
      '</div>' +

      installCardHTML() +
      billingCardHTML() +

      '<div class="card">' +
        '<div class="card-label-sm">' + Icons.get("users", 12) + ' Tu código personal</div>' +
        '<p style="font-size:13px;color:var(--text-muted);margin:6px 0 12px">Compártelo con alguien que ya tenga su propia cuenta para conectarse contigo:</p>' +
        '<div class="share-row">' +
          '<span class="share-code">' + (session.inviteCode || session.code) + '</span>' +
          '<button class="btn btn-secondary btn-pill" id="btn-copy-code">' + Icons.get("copy", 14) + ' Copiar</button>' +
        '</div>' +
        '<button class="btn btn-primary" id="btn-share-invite" style="margin-top:10px">' + Icons.get("share", 15) + ' Compartir invitación</button>' +
        '<div class="sync-status-text ' + (status === "ok" ? "ok" : "err") + '">' +
          Icons.get(status === "ok" ? "wifi" : "wifiOff", 14) + " " +
          syncStatusLabel(status) +
        '</div>' +
        (others.length
          ? '<div class="sync-status-text ok" style="margin-top:8px;display:flex;align-items:center;gap:8px">' +
              '<div class="avatar-stack">' + others.map(function (m) { return '<span class="avatar avatar-sm" style="background:' + Utils.colorForAuthor(m.name) + '">' + Utils.initials(m.name) + '</span>'; }).join("") + '</div>' +
              '<span>Sincronizado con ' + others.map(function (m) { return Utils.escapeHtml(m.name); }).join(", ") + '</span>' +
            '</div>' +
            others.map(function (m) {
              return (
                '<div class="join-request-row">' +
                  '<span class="jr-name">' + Utils.escapeHtml(m.name) + '</span>' +
                  '<button class="btn btn-danger-outline btn-pill" data-remove-member="' + m.id + '" data-member-name="' + Utils.escapeHtml(m.name) + '">Quitar</button>' +
                '</div>'
              );
            }).join("")
          : (isShared
              ? '<div class="sync-status-text ok" style="margin-top:4px">' + Icons.get("check", 14) + ' Conectado con otra cuenta (código ' + session.code + ')</div>'
              : '')) +
        (isShared
          ? '<button class="btn btn-danger-outline btn-pill" id="btn-leave-household" style="margin-top:12px">' + Icons.get("close", 14) + ' Dejar de compartir</button>'
          : '') +
      '</div>' +

      activityCardHTML(session, others, txs) +

      (incomingRequestsCache.length
        ? '<div class="card">' +
            '<div class="card-label-sm">' + Icons.get("users", 12) + ' Solicitudes para unirse a tu cuenta</div>' +
            incomingRequestsCache.map(function (r) {
              return (
                '<div class="join-request-row">' +
                  '<span class="jr-name">' + Utils.escapeHtml(r.requester_name) + '</span>' +
                  '<div class="jr-actions">' +
                    '<button class="btn btn-success btn-pill" data-accept-request="' + r.id + '">Aceptar</button>' +
                    '<button class="btn btn-danger-outline btn-pill" data-reject-request="' + r.id + '">Rechazar</button>' +
                  '</div>' +
                '</div>'
              );
            }).join("") +
          '</div>'
        : '') +

      '<div class="card">' +
        '<div class="card-label-sm">' + Icons.get("repeat", 12) + ' Unirme a otra cuenta</div>' +
        (outgoingRequestCache && outgoingRequestCache.status === "pending"
          ? '<p style="font-size:13px;color:var(--text-secondary);margin:6px 0 10px">Esperando que <strong>' + Utils.escapeHtml(outgoingRequestCache.target_name) + '</strong> confirme tu solicitud…</p>' +
            '<button class="btn btn-secondary-outline btn-pill" id="btn-check-outgoing">Verificar</button>'
          : outgoingRequestCache && outgoingRequestCache.status === "rejected"
            ? '<p style="font-size:13px;color:var(--red-500);margin:6px 0 10px">' + Utils.escapeHtml(outgoingRequestCache.target_name) + ' rechazó tu solicitud.</p>' +
              '<button class="btn btn-secondary-outline btn-pill" id="btn-dismiss-outgoing">Entendido</button>'
            : '<p style="font-size:13px;color:var(--text-muted);margin:6px 0 12px">Escribe el código personal de alguien más para pedir compartir su espacio financiero:</p>' +
              '<div style="display:flex;gap:10px">' +
                '<input type="text" id="input-join-code" class="input input-code" placeholder="XXXX-XXXX" maxlength="9" style="flex:1">' +
                '<button class="btn btn-primary btn-pill" id="btn-join-submit">Solicitar</button>' +
              '</div>' +
              '<p class="field-error" id="join-code-error" hidden></p>') +
      '</div>' +

      '<div class="card">' +
        statRow("repeat", "Transacciones", txs.length) +
        statRow("up", "Por pagar", payablesPending.length) +
        statRow("down", "Por cobrar", receivablesPending.length) +
        statRow("sync", "Recurrentes", recurrentCount) +
        statRow("piggy", "Ahorro total", Utils.formatMoney(savingsTotal)) +
        statRow("arrowUpRight", "Flujo esperado", Utils.formatMoney(expectedFlow)) +
      '</div>' +

      (pushSupported
        ? '<div class="card">' +
            '<div class="card-label-sm">' + Icons.get("bell", 12) + ' Recordatorios</div>' +
            '<p style="font-size:13px;color:var(--text-muted);margin:6px 0 12px">Avisos de pagos próximos, si no has registrado gastos hoy, y tu reporte semanal.</p>' +
            (pushSubscribed
              ? '<button class="btn btn-secondary-outline" id="btn-toggle-push">' + Icons.get("close", 15) + ' Desactivar recordatorios</button>'
              : '<button class="btn btn-primary" id="btn-toggle-push">' + Icons.get("bell", 15) + ' Activar recordatorios</button>') +
            '<p class="field-error" id="push-error" hidden></p>' +
          '</div>'
        : '') +

      '<div class="card">' +
        '<div class="card-label-sm">' + Icons.get("mail", 12) + ' Soporte</div>' +
        '<p style="font-size:13px;color:var(--text-muted);margin:6px 0 12px">¿Algo falló o tienes una duda? Escríbenos y te respondemos por correo.</p>' +
        '<a class="btn btn-secondary" href="' + supportMailtoHref(session) + '" id="btn-contact-support" style="display:block;text-align:center;text-decoration:none">' + Icons.get("mail", 15) + ' Contactar soporte</a>' +
      '</div>' +

      '<button class="btn btn-danger-solid" id="btn-logout" style="margin-top:6px">' + Icons.get("logout", 15) + ' Cerrar sesión</button>' +
      '<button class="btn btn-danger-outline" id="btn-delete-data" style="margin-top:10px">' + Icons.get("trash", 15) + ' Eliminar todos mis datos</button>';

    attachEvents(container, session);
  }

  function installCardHTML() {
    if (typeof InstallPrompt === "undefined" || InstallPrompt.isStandalone()) return "";

    if (InstallPrompt.canPromptNatively()) {
      return (
        '<div class="card">' +
          '<div class="card-label-sm">' + Icons.get("plusCircle", 12) + ' Instalar app</div>' +
          '<p style="font-size:13px;color:var(--text-muted);margin:6px 0 12px">Agrégala a tu pantalla de inicio para abrirla como una app, sin el navegador.</p>' +
          '<button class="btn btn-primary" id="btn-install-app">' + Icons.get("plusCircle", 15) + ' Instalar app</button>' +
        '</div>'
      );
    }

    if (InstallPrompt.isIOS()) {
      return (
        '<div class="card">' +
          '<div class="card-label-sm">' + Icons.get("plusCircle", 12) + ' Instalar app</div>' +
          '<p style="font-size:13px;color:var(--text-muted);margin:6px 0 0">' +
            'Toca el botón <strong>compartir</strong> de Safari (el cuadrito con la flecha hacia arriba) y elige <strong>"Agregar a pantalla de inicio"</strong>.' +
          '</p>' +
        '</div>'
      );
    }

    return "";
  }

  function billingCardHTML() {
    if (!billingState) return "";
    var s = billingState;
    var planLabel = s.sub && s.sub.plan === "annual" ? "Plan anual" : "Plan mensual";

    if (s.hasActiveSub) {
      var renewDate = s.sub.current_period_end
        ? new Date(Number(s.sub.current_period_end)).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })
        : "";
      return (
        '<div class="card">' +
          '<div class="card-label-sm">' + Icons.get("shield", 12) + ' Tu plan</div>' +
          '<div class="sync-status-text ok" style="margin:6px 0 12px">' + Icons.get("check", 14) + ' ' + planLabel + ' activo' + (renewDate ? ' · renueva el ' + renewDate : '') + '</div>' +
          '<button class="btn btn-secondary" id="btn-manage-billing">Administrar suscripción</button>' +
          '<p class="field-error" id="billing-error" hidden></p>' +
        '</div>'
      );
    }

    if (s.inTrial) {
      return (
        '<div class="card">' +
          '<div class="card-label-sm">' + Icons.get("shield", 12) + ' Tu plan</div>' +
          '<p style="font-size:13px;color:var(--text-secondary);margin:6px 0 14px">Estás en tu <strong>prueba gratis</strong> — quedan <strong>' + s.trialDaysLeft + ' día' + (s.trialDaysLeft === 1 ? "" : "s") + '</strong> con acceso completo.</p>' +
          '<div style="display:flex;gap:10px">' +
            '<button class="btn btn-secondary-outline" id="btn-sub-monthly" style="flex:1">Mensual $59</button>' +
            '<button class="btn btn-secondary-outline" id="btn-sub-annual" style="flex:1">Anual $599</button>' +
          '</div>' +
          '<p class="field-error" id="billing-error" hidden></p>' +
        '</div>'
      );
    }

    return (
      '<div class="card" style="border:1.5px solid rgba(239,68,68,0.35)">' +
        '<div class="card-label-sm" style="color:var(--red-500)">' + Icons.get("shield", 12) + ' Tu prueba terminó</div>' +
        '<p style="font-size:13px;color:var(--text-secondary);margin:6px 0 14px">Tu cuenta está en <strong>modo de solo lectura</strong>: puedes ver tu información, pero no agregar, editar ni eliminar movimientos hasta que actives un plan.</p>' +
        '<div style="display:flex;gap:10px">' +
          '<button class="btn btn-primary" id="btn-sub-monthly" style="flex:1">Mensual $59</button>' +
          '<button class="btn btn-primary" id="btn-sub-annual" style="flex:1">Anual $599</button>' +
        '</div>' +
        '<p class="field-error" id="billing-error" hidden></p>' +
      '</div>'
    );
  }

  function supportMailtoHref(session) {
    var subject = "Soporte FinzApp";
    var body = "Cuenta: " + (session.email || session.name) + "\nCódigo: " + session.code + "\n\nDescribe aquí tu duda o el problema que tuviste:\n";
    return "mailto:hola@finzapp.com.mx?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  function syncStatusLabel(status) {
    if (!Storage.sync.isConfigured()) return "Guardado en este dispositivo";
    if (status === "ok") return "Sincronizado con la nube";
    if (status === "busy") return "Sincronizando…";
    return "Error de conexión con la nube";
  }

  function statRow(icon, label, value) {
    return (
      '<div class="stat-list-row">' +
        '<div class="stat-list-icon">' + Icons.get(icon, 17) + '</div>' +
        '<div class="stat-list-label">' + label + '</div>' +
        '<div class="stat-list-value">' + value + '</div>' +
      '</div>'
    );
  }

  function attachEvents(container, session) {
    var installBtn = container.querySelector("#btn-install-app");
    if (installBtn) {
      installBtn.addEventListener("click", function () {
        InstallPrompt.prompt().then(function () { App.refresh(); });
      });
    }

    var manageBillingBtn = container.querySelector("#btn-manage-billing");
    if (manageBillingBtn) {
      manageBillingBtn.addEventListener("click", function () {
        var errorEl = container.querySelector("#billing-error");
        errorEl.hidden = true;
        manageBillingBtn.disabled = true;
        Billing.openPortal().catch(function (err) {
          manageBillingBtn.disabled = false;
          errorEl.textContent = err.message || String(err);
          errorEl.hidden = false;
        });
      });
    }

    ["monthly", "annual"].forEach(function (plan) {
      var btn = container.querySelector("#btn-sub-" + (plan === "monthly" ? "monthly" : "annual"));
      if (!btn) return;
      btn.addEventListener("click", function () {
        var errorEl = container.querySelector("#billing-error");
        errorEl.hidden = true;
        container.querySelectorAll("#btn-sub-monthly, #btn-sub-annual").forEach(function (b) { b.disabled = true; });
        Billing.startCheckout(plan).catch(function (err) {
          container.querySelectorAll("#btn-sub-monthly, #btn-sub-annual").forEach(function (b) { b.disabled = false; });
          errorEl.textContent = err.message || String(err);
          errorEl.hidden = false;
        });
      });
    });

    var pushBtn = container.querySelector("#btn-toggle-push");
    if (pushBtn) {
      pushBtn.addEventListener("click", function () {
        var errorEl = container.querySelector("#push-error");
        errorEl.hidden = true;
        pushBtn.disabled = true;

        var action = pushSubscribed ? Push.unsubscribe() : Push.subscribe(session.userId);
        action.then(function () {
          pushSubscribed = !pushSubscribed;
          App.refresh();
        }).catch(function (err) {
          pushBtn.disabled = false;
          errorEl.textContent = err.message || String(err);
          errorEl.hidden = false;
        });
      });
    }

    container.querySelector("#btn-copy-code").addEventListener("click", function (e) {
      var btn = e.currentTarget;
      var restore = btn.innerHTML;
      var codeToCopy = session.inviteCode || session.code;
      var done = function () {
        btn.innerHTML = Icons.get("check", 14) + ' Copiado';
        setTimeout(function () { btn.innerHTML = restore; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(codeToCopy).then(done).catch(function () { fallbackCopy(codeToCopy, done); });
      } else {
        fallbackCopy(codeToCopy, done);
      }
    });

    container.querySelector("#btn-share-invite").addEventListener("click", function (e) {
      var btn = e.currentTarget;
      var codeToShare = session.inviteCode || session.code;
      var link = window.location.origin + "/";
      var message = "¡Únete a mí en FinzApp! 💜 Usa mi código " + codeToShare + " para conectarte y llevar juntos nuestras finanzas: " + link;

      if (navigator.share) {
        navigator.share({ title: "FinzApp", text: message }).catch(function () {});
        return;
      }

      var restore = btn.innerHTML;
      var done = function () {
        btn.innerHTML = Icons.get("check", 15) + ' Mensaje copiado';
        setTimeout(function () { btn.innerHTML = restore; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(message).then(done).catch(function () { fallbackCopy(message, done); });
      } else {
        fallbackCopy(message, done);
      }
    });

    var joinInput = container.querySelector("#input-join-code");
    if (joinInput) {
      joinInput.addEventListener("input", function () {
        var pos = joinInput.selectionStart;
        var before = joinInput.value.length;
        joinInput.value = Utils.formatCode(joinInput.value);
        var after = joinInput.value.length;
        joinInput.setSelectionRange(pos + (after - before), pos + (after - before));
        container.querySelector("#join-code-error").hidden = true;
      });
      container.querySelector("#btn-join-submit").addEventListener("click", function () {
        sendJoinRequest(container, session, joinInput.value);
      });
    }

    var checkOutgoingBtn = container.querySelector("#btn-check-outgoing");
    if (checkOutgoingBtn) {
      checkOutgoingBtn.addEventListener("click", function () {
        checkOutgoingBtn.textContent = "Verificando…";
        checkOutgoingBtn.disabled = true;
        invalidateJoinRequests();
        ensureJoinRequestsLoaded(session);
      });
    }

    var dismissOutgoingBtn = container.querySelector("#btn-dismiss-outgoing");
    if (dismissOutgoingBtn) {
      dismissOutgoingBtn.addEventListener("click", function () {
        Auth.dismissJoinRequest(outgoingRequestCache.id).then(function () {
          outgoingRequestCache = null;
          App.refresh();
        });
      });
    }

    container.querySelectorAll("[data-accept-request]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        btn.disabled = true;
        Auth.acceptJoinRequest(btn.getAttribute("data-accept-request")).then(function () {
          invalidateJoinRequests();
          App.invalidateHouseholdMembers(session.code);
          App.refresh();
        }).catch(function (err) {
          alert(err.message || String(err));
          btn.disabled = false;
        });
      });
    });

    container.querySelectorAll("[data-reject-request]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        btn.disabled = true;
        Auth.rejectJoinRequest(btn.getAttribute("data-reject-request")).then(function () {
          invalidateJoinRequests();
          App.refresh();
        }).catch(function (err) {
          alert(err.message || String(err));
          btn.disabled = false;
        });
      });
    });

    var leaveBtn = container.querySelector("#btn-leave-household");
    if (leaveBtn) {
      leaveBtn.addEventListener("click", function () {
        leaveHousehold(session);
      });
    }

    container.querySelectorAll("[data-remove-member]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var name = btn.getAttribute("data-member-name");
        if (!confirm("¿Quitar a " + name + " de tu cuenta compartida? Ella o él regresará a su propio espacio; no se borra ningún dato.")) return;
        btn.disabled = true;
        Auth.removeHouseholdMember(btn.getAttribute("data-remove-member")).then(function () {
          App.invalidateHouseholdMembers(session.code);
          App.refresh();
        }).catch(function (err) {
          alert(err.message || String(err));
          btn.disabled = false;
        });
      });
    });

    container.querySelector("#btn-logout").addEventListener("click", function () {
      if (confirm("¿Cerrar sesión? Tus datos siguen guardados en la nube; vuelve a entrar con tu correo cuando quieras.")) {
        Storage.sync.unsubscribe();
        Auth.signOut().then(function () { App.showSetup(); }).catch(function () { App.showSetup(); });
      }
    });

    container.querySelector("#btn-delete-data").addEventListener("click", function () {
      openDeleteDataModal(session);
    });
  }

  function openDeleteDataModal(session) {
    var shared = session.inviteCode && session.code !== session.inviteCode;
    var html =
      Modals.headerHTML({
        icon: "trash", theme: "expense",
        title: "Eliminar todos los datos",
        sub: "Esta acción no se puede deshacer"
      }) +
      '<p style="font-size:14px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px">' +
        'Se eliminarán <strong>todos</strong> tus ingresos, egresos, cobros, pagos, plantillas recurrentes y metas de ahorro, tanto de este dispositivo como de la nube.' +
      '</p>' +
      '<p style="font-size:14px;color:var(--text-secondary);line-height:1.5;margin-bottom:20px">' +
        (shared
          ? 'Tu cuenta está sincronizada con alguien más: <strong>esos datos también se eliminarán para esa persona</strong>, porque comparten el mismo espacio.'
          : 'Si en algún momento compartes tu código con alguien más, esta acción también borraría los datos que vean en ese espacio compartido.') +
      '</p>' +
      '<div class="detail-actions">' +
        '<button class="btn btn-secondary-outline" data-modal-close>Cancelar</button>' +
        '<button class="btn btn-danger-solid" id="btn-confirm-delete-data">Eliminar todo</button>' +
      '</div>';

    Modals.open({
      html: html,
      onMount: function (sheet) {
        sheet.querySelector("#btn-confirm-delete-data").addEventListener("click", function () {
          deleteAllData();
          Modals.close();
          App.refresh();
        });
      }
    });
  }

  function deleteAllData() {
    var acc = code();
    [
      Storage.transactions, Storage.recurringTransactions,
      Storage.receivables, Storage.payables,
      Storage.recurringReceivables, Storage.recurringPayables,
      Storage.savingsCategories, Storage.savingsDeposits
    ].forEach(function (api) {
      api.list(acc).forEach(function (item) { api.remove(acc, item.id); });
    });
  }

  function sendJoinRequest(container, session, rawCode) {
    var code = Utils.normalizeCode(rawCode);
    var errorEl = container.querySelector("#join-code-error");
    if (code.length !== 8) {
      errorEl.textContent = "Ingresa el código completo de 8 caracteres.";
      errorEl.hidden = false;
      return;
    }
    var formatted = code.slice(0, 4) + "-" + code.slice(4, 8);
    if (formatted === session.inviteCode) {
      errorEl.textContent = "Ese es tu propio código.";
      errorEl.hidden = false;
      return;
    }
    var btn = container.querySelector("#btn-join-submit");
    var original = btn.textContent;
    btn.textContent = "Enviando…";
    btn.disabled = true;

    Auth.requestJoin(formatted).then(function () {
      invalidateJoinRequests();
      App.refresh();
    }).catch(function (err) {
      btn.textContent = original;
      btn.disabled = false;
      errorEl.textContent = err.message || String(err);
      errorEl.hidden = false;
    });
  }

  function leaveHousehold(session) {
    if (!confirm("¿Dejar de compartir esta cuenta? Nada se borra: tú regresas a tu propio espacio y la otra persona sigue viendo los datos compartidos igual que hasta ahora.")) return;

    Auth.leaveHousehold().then(function (res) {
      var newSession = Object.assign({}, session, { code: res.householdCode });
      Storage.setSession(newSession);
      Storage.sync.unsubscribe();
      Storage.ensureAccount(newSession.code);
      return Storage.sync.pullAll(newSession.code).then(function () {
        Storage.sync.subscribe(newSession.code, App.refresh);
        invalidateJoinRequests();
        App.refresh();
      });
    }).catch(function (err) {
      alert(err.message || String(err));
    });
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    done();
  }

  return { render: render };
})();
