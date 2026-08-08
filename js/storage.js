/* =========================================================
   storage.js — capa de datos (localStorage + Supabase)

   Todo vive primero bajo la clave `finanza:account:<CODIGO>:*`
   en localStorage: cada lectura de las vistas es instantánea y
   funciona sin internet. Cuando hay credenciales de Supabase
   válidas en config.js, cada escritura además se empuja a la
   nube en segundo plano, y los cambios remotos (de otro
   dispositivo con el mismo código) llegan por Realtime y
   refrescan el caché local automáticamente.
   ========================================================= */

var Storage = (function () {

  var SESSION_KEY = "finanza:session";

  var ENTITIES = [
    "transactions", "recurringTransactions", "receivables", "payables",
    "recurringReceivables", "recurringPayables", "savingsCategories", "savingsDeposits"
  ];

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn("Storage: no se pudo leer", key, e);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn("Storage: no se pudo guardar", key, e);
      return false;
    }
  }

  // ---------------- sesión del dispositivo ----------------

  function getSession() {
    return readJSON(SESSION_KEY, null);
  }
  function setSession(session) {
    writeJSON(SESSION_KEY, session);
  }
  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  // ---------------- cuentas (caché local) ----------------

  function accountKey(code, entity) {
    return "finanza:account:" + code + ":" + entity;
  }

  function accountExists(code) {
    return localStorage.getItem(accountKey(code, "meta")) !== null;
  }

  function ensureAccount(code) {
    if (!accountExists(code)) {
      writeJSON(accountKey(code, "meta"), { createdAt: Utils.todayISO() });
      ENTITIES.forEach(function (entity) { writeJSON(accountKey(code, entity), []); });
    }
  }

  function readList(code, entity) {
    return readJSON(accountKey(code, entity), []);
  }
  function writeList(code, entity, list) {
    writeJSON(accountKey(code, entity), list);
  }

  function addItem(code, entity, item) {
    var list = readList(code, entity);
    list.unshift(item);
    writeList(code, entity, list);
    Sync.pushInsert(entity, code, item);
    return item;
  }
  function removeItem(code, entity, id) {
    var list = readList(code, entity).filter(function (it) { return it.id !== id; });
    writeList(code, entity, list);
    Sync.pushDelete(entity, code, id);
  }
  function updateItem(code, entity, id, patch) {
    var list = readList(code, entity);
    var idx = list.findIndex(function (it) { return it.id === id; });
    if (idx > -1) {
      list[idx] = Object.assign({}, list[idx], patch);
      writeList(code, entity, list);
      Sync.pushUpdate(entity, code, id, patch);
      return list[idx];
    }
    return null;
  }

  // ---------------- API pública por entidad ----------------

  function entityApi(entity) {
    return {
      list: function (code) { return readList(code, entity); },
      add: function (code, item) { return addItem(code, entity, item); },
      remove: function (code, id) { return removeItem(code, entity, id); },
      update: function (code, id, patch) { return updateItem(code, entity, id, patch); }
    };
  }

  // =========================================================
  // Sync — puente con Supabase (opcional)
  // =========================================================

  var Sync = (function () {
    var dbClient = null;
    var status = "err"; // 'ok' | 'err' | 'busy' — 'err' hasta la primera operación exitosa
    var channel = null;
    var onChangeCb = null;

    function camelToSnake(str) {
      return str.replace(/[A-Z]/g, function (c) { return "_" + c.toLowerCase(); });
    }
    function snakeToCamel(str) {
      return str.replace(/_([a-z0-9])/g, function (_, c) { return c.toUpperCase(); });
    }
    function tableFor(entity) { return camelToSnake(entity); }

    function toRow(item, code) {
      var row = { account_code: code };
      Object.keys(item).forEach(function (k) { row[camelToSnake(k)] = item[k]; });
      return row;
    }
    function fromRow(row) {
      var item = {};
      Object.keys(row).forEach(function (k) {
        if (k === "account_code") return;
        item[snakeToCamel(k)] = row[k];
      });
      return item;
    }

    function isConfigured() {
      return typeof CONFIG !== "undefined" &&
        typeof supabase !== "undefined" &&
        CONFIG.SUPABASE_URL && CONFIG.SUPABASE_URL.indexOf("TU-PROYECTO") === -1 &&
        CONFIG.SUPABASE_ANON_KEY && CONFIG.SUPABASE_ANON_KEY.indexOf("TU-ANON-KEY") === -1;
    }

    function client() {
      if (!isConfigured()) return null;
      if (!dbClient) dbClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      return dbClient;
    }

    function setStatus(next) {
      if (status === next) return;
      status = next;
      if (typeof App !== "undefined" && App.refresh) App.refresh();
    }

    function getStatus() { return isConfigured() ? status : "ok"; }

    // ---- escritura remota (fire-and-forget, no bloquea la UI) ----

    function pushInsert(entity, code, item) {
      var c = client();
      if (!c) return;
      c.from(tableFor(entity)).insert(toRow(item, code))
        .then(function (res) { setStatus(res.error ? "err" : "ok"); if (res.error) console.warn("Sync insert:", res.error.message); });
    }
    function pushDelete(entity, code, id) {
      var c = client();
      if (!c) return;
      c.from(tableFor(entity)).delete().eq("id", id).eq("account_code", code)
        .then(function (res) { setStatus(res.error ? "err" : "ok"); if (res.error) console.warn("Sync delete:", res.error.message); });
    }
    function pushUpdate(entity, code, id, patch) {
      var c = client();
      if (!c) return;
      var row = {};
      Object.keys(patch).forEach(function (k) { row[camelToSnake(k)] = patch[k]; });
      c.from(tableFor(entity)).update(row).eq("id", id).eq("account_code", code)
        .then(function (res) { setStatus(res.error ? "err" : "ok"); if (res.error) console.warn("Sync update:", res.error.message); });
    }

    // ---- cuentas remotas ----

    function ensureAccountRemote(code) {
      var c = client();
      if (!c) return Promise.resolve();
      return c.from("accounts").upsert({ code: code, created_at: Date.now() }, { onConflict: "code" })
        .then(function (res) { setStatus(res.error ? "err" : "ok"); return res; });
    }

    function accountExistsRemote(code) {
      var c = client();
      if (!c) return Promise.resolve(null); // null = "no se pudo verificar" (sin Supabase)
      return c.from("accounts").select("code").eq("code", code).maybeSingle()
        .then(function (res) {
          setStatus(res.error ? "err" : "ok");
          return res.error ? null : !!res.data;
        })
        .catch(function () { setStatus("err"); return null; });
    }

    // ---- descarga completa (al crear/unirse y al reconectar) ----

    function pullAll(code) {
      var c = client();
      if (!c) return Promise.resolve(false);
      setStatus("busy");
      var jobs = ENTITIES.map(function (entity) {
        return c.from(tableFor(entity)).select("*").eq("account_code", code)
          .then(function (res) {
            if (res.error) throw res.error;
            var items = res.data.map(fromRow);
            items.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
            writeList(code, entity, items);
          });
      });
      return Promise.all(jobs)
        .then(function () { writeJSON(accountKey(code, "meta"), { createdAt: Utils.todayISO() }); setStatus("ok"); return true; })
        .catch(function (e) { console.warn("Sync pullAll:", e.message); setStatus("err"); return false; });
    }

    // ---- tiempo real: escucha cambios remotos y refresca ----

    function subscribe(code, onChange) {
      var c = client();
      if (!c) return;
      unsubscribe();
      onChangeCb = Utils.debounce(function () {
        pullAll(code).then(function () { if (onChange) onChange(); });
      }, 350);

      var builder = c.channel("account-" + code);
      ENTITIES.concat(["accounts"]).forEach(function (entity) {
        builder = builder.on("postgres_changes",
          { event: "*", schema: "public", table: tableFor(entity), filter: "account_code=eq." + code },
          onChangeCb
        );
      });
      channel = builder.subscribe();
    }

    function unsubscribe() {
      if (channel && dbClient) { dbClient.removeChannel(channel); channel = null; }
    }

    return {
      isConfigured: isConfigured,
      getStatus: getStatus,
      pushInsert: pushInsert,
      pushDelete: pushDelete,
      pushUpdate: pushUpdate,
      ensureAccountRemote: ensureAccountRemote,
      accountExistsRemote: accountExistsRemote,
      pullAll: pullAll,
      subscribe: subscribe,
      unsubscribe: unsubscribe
    };
  })();

  return {
    getSession: getSession,
    setSession: setSession,
    clearSession: clearSession,

    accountExists: accountExists,
    ensureAccount: ensureAccount,

    transactions: entityApi("transactions"),
    recurringTransactions: entityApi("recurringTransactions"),
    receivables: entityApi("receivables"),
    payables: entityApi("payables"),
    recurringReceivables: entityApi("recurringReceivables"),
    recurringPayables: entityApi("recurringPayables"),
    savingsCategories: entityApi("savingsCategories"),
    savingsDeposits: entityApi("savingsDeposits"),

    syncStatus: function () { return Sync.getStatus(); },
    sync: Sync
  };
})();
