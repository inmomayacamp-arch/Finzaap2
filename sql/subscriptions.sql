-- =========================================================
-- FinzApp — suscripciones de pago (Stripe) y bloqueo de solo
-- lectura al terminar la prueba
--
-- Pega TODO este archivo en el SQL Editor de Supabase y dale
-- "Run". Se agrega a los scripts anteriores, no los reemplaza.
--
-- QUÉ AGREGA:
--
-- 1) Tabla `subscriptions`: el estado de pago de cada cuenta
--    (household). La llena el webhook de Stripe (con la llave de
--    servicio, que ignora RLS); por la API normal cada quien solo
--    puede LEER el estado de su propia cuenta, nadie puede
--    escribirla directo — eso evita que alguien se "regale" una
--    suscripción activa modificando la tabla él mismo.
--
-- 2) has_active_access(codigo): true si la cuenta sigue dentro de
--    sus 7 días de prueba (contados desde que se creó) O tiene una
--    suscripción activa/en prueba en Stripe vigente.
--
-- 3) Las políticas de TODAS las tablas de datos (transacciones,
--    cobros, pagos, ahorro, etc.) se separan en "leer" (siempre
--    permitido si es tu cuenta) y "escribir" (agregar/editar/
--    borrar — permitido solo si has_active_access() es true). Así
--    es como se aplica de verdad el "solo lectura" cuando se acaba
--    la prueba sin pagar: no es solo esconder botones en la app, es
--    una regla en la base de datos que no se puede saltar.
-- =========================================================

create table if not exists subscriptions (
  household_code text primary key references accounts(code) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'none',
  plan text,
  current_period_end bigint,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

alter table subscriptions enable row level security;

drop policy if exists "select own subscription" on subscriptions;
create policy "select own subscription" on subscriptions for select to authenticated
using (household_code in (select household_code from profiles where id = auth.uid()));
-- sin políticas de insert/update/delete: solo el webhook (llave de
-- servicio) puede escribir aquí.

-- ---------------------------------------------------------
-- Cuentas que ya existían ANTES de que existiera el cobro (la tuya,
-- las cuentas demo, cualquiera que se haya registrado antes de hoy):
-- se marcan como "grandfathered" para que nunca queden en solo
-- lectura por este cambio — su prueba de 7 días, calculada desde
-- que se crearon, ya habría "vencido" aunque nunca debieron pagar.
-- Solo afecta a cuentas que YA EXISTEN en este momento; cualquier
-- cuenta nueva de aquí en adelante sí sigue la regla normal de 7
-- días de prueba y luego pago.
-- ---------------------------------------------------------

insert into subscriptions (household_code, status, created_at, updated_at)
select code, 'grandfathered', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint
from accounts
on conflict (household_code) do nothing;

-- ---------------------------------------------------------
-- ¿Esta cuenta puede seguir agregando/editando/borrando datos?
-- ---------------------------------------------------------

create or replace function has_active_access(p_code text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    coalesce((select a.created_at from accounts a where a.code = p_code), 0)
      >= (extract(epoch from now()) * 1000)::bigint - 7 * 86400000
    or exists (
      select 1 from subscriptions s
      where s.household_code = p_code
        and s.status in ('active', 'trialing', 'grandfathered')
        and (s.current_period_end is null or s.current_period_end > (extract(epoch from now()) * 1000)::bigint)
    );
$$;
grant execute on function has_active_access(text) to authenticated;

-- ---------------------------------------------------------
-- Separar "leer" de "escribir" en cada tabla de datos.
-- ---------------------------------------------------------

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'transactions','recurring_transactions','receivables','payables',
    'recurring_receivables','recurring_payables','savings_categories','savings_deposits'
  ])
  loop
    execute format('drop policy if exists "household members" on %I;', t);
    execute format('drop policy if exists "household members select" on %I;', t);
    execute format('drop policy if exists "household members insert" on %I;', t);
    execute format('drop policy if exists "household members update" on %I;', t);
    execute format('drop policy if exists "household members delete" on %I;', t);

    execute format(
      'create policy "household members select" on %I for select to authenticated ' ||
      'using (account_code in (select household_code from profiles where id = auth.uid()));',
      t
    );
    execute format(
      'create policy "household members insert" on %I for insert to authenticated ' ||
      'with check (account_code in (select household_code from profiles where id = auth.uid()) and has_active_access(account_code));',
      t
    );
    execute format(
      'create policy "household members update" on %I for update to authenticated ' ||
      'using (account_code in (select household_code from profiles where id = auth.uid()) and has_active_access(account_code)) ' ||
      'with check (account_code in (select household_code from profiles where id = auth.uid()) and has_active_access(account_code));',
      t
    );
    execute format(
      'create policy "household members delete" on %I for delete to authenticated ' ||
      'using (account_code in (select household_code from profiles where id = auth.uid()) and has_active_access(account_code));',
      t
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
