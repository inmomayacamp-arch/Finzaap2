-- =========================================================
-- FinzApp — presupuestos mensuales por categoría
--
-- Pega TODO este archivo en el SQL Editor de Supabase y dale
-- "Run". Se agrega a los scripts anteriores, no los reemplaza.
--
-- QUÉ AGREGA:
--
-- Tabla `budgets`: un límite mensual opcional por categoría y
-- cuenta (household). `notified_pct`/`notified_month` los usa
-- api/send-reminders.js para saber si ya avisó por push que una
-- categoría se acercó o se pasó del límite ESTE mes, y no repetir
-- el aviso todos los días -- se reinicia solo (compara el mes
-- actual contra notified_month) al llegar un mes nuevo.
--
-- Mismas reglas que el resto de las tablas de datos: cualquiera
-- del hogar puede LEER los presupuestos; escribir (crear, editar,
-- borrar) requiere has_active_access() (ver sql/subscriptions.sql),
-- igual que transacciones, cobros, pagos, etc.
-- =========================================================

create table if not exists budgets (
  id text primary key,
  account_code text not null references accounts(code) on delete cascade,
  category text not null,
  monthly_limit numeric not null,
  notified_pct int not null default 0,
  notified_month text,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint,
  unique (account_code, category)
);
create index if not exists budgets_account_idx on budgets(account_code);

alter table budgets enable row level security;

drop policy if exists "household members select" on budgets;
drop policy if exists "household members insert" on budgets;
drop policy if exists "household members update" on budgets;
drop policy if exists "household members delete" on budgets;

create policy "household members select" on budgets for select to authenticated
using (account_code in (select household_code from profiles where id = auth.uid()));

create policy "household members insert" on budgets for insert to authenticated
with check (account_code in (select household_code from profiles where id = auth.uid()) and has_active_access(account_code));

create policy "household members update" on budgets for update to authenticated
using (account_code in (select household_code from profiles where id = auth.uid()) and has_active_access(account_code))
with check (account_code in (select household_code from profiles where id = auth.uid()) and has_active_access(account_code));

create policy "household members delete" on budgets for delete to authenticated
using (account_code in (select household_code from profiles where id = auth.uid()) and has_active_access(account_code));

notify pgrst, 'reload schema';
