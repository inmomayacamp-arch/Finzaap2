-- =========================================================
-- FinzApp — segunda ronda de hardening (hallazgos de Advisors)
--
-- Pega TODO este archivo en el SQL Editor de Supabase y dale
-- "Run". Se agrega a los scripts anteriores, no los reemplaza.
--
-- QUÉ CORRIGE:
--
-- 1) accounts (INSERT): la política dejaba mandar CUALQUIER
--    created_at al crear una cuenta -- como la prueba gratis de
--    7 días se calcula justo a partir de ese valor, alguien con
--    conocimientos técnicos podía intentar mandar una fecha
--    "recién creada" a propósito para no perder nunca el acceso.
--    Ahora solo se acepta un created_at dentro de +/-5 minutos
--    del reloj real del servidor -- suficiente margen para
--    diferencias normales de reloj, no para manipularlo.
--
-- 2) notify_signup(): es una función que solo debe correr como
--    trigger (la dispara Postgres solo, al crear un profile), no
--    algo que nadie deba poder llamar directo por la API. Por
--    default Postgres le da permiso de ejecución a cualquiera;
--    se lo quitamos explícitamente.
-- =========================================================

-- ---------------------------------------------------------
-- 1) accounts: created_at tiene que ser real, no inventado.
-- ---------------------------------------------------------

drop policy if exists "insert accounts" on accounts;
create policy "insert accounts" on accounts for insert to authenticated
with check (
  created_at between
    (extract(epoch from now()) * 1000)::bigint - 300000
    and (extract(epoch from now()) * 1000)::bigint + 300000
);

-- ---------------------------------------------------------
-- 2) notify_signup: solo la puede disparar el trigger, nadie
--    más directo por la API.
-- ---------------------------------------------------------

revoke execute on function notify_signup() from public, anon, authenticated;

notify pgrst, 'reload schema';
