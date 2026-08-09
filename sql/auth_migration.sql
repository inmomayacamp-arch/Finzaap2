-- =========================================================
-- FinzApp — migración a login real (correo + contraseña)
--
-- Pega TODO este archivo en el SQL Editor de Supabase y dale
-- "Run". Esto se agrega AL script anterior (sql/schema.sql),
-- no lo reemplaza — corre este después de aquel.
--
-- Qué cambia:
-- - Se crea `profiles`: cada usuario autenticado tiene un
--   nombre, un código personal permanente (invite_code) y un
--   "household_code" que indica en qué espacio compartido está
--   trabajando ahora mismo (por defecto, el suyo propio).
-- - Las políticas de acceso (RLS) de TODAS las tablas dejan de
--   estar abiertas a cualquiera con la anon key, y pasan a
--   exigir sesión iniciada + pertenecer a ese household_code.
--   Esto es un endurecimiento real de seguridad: antes, con
--   solo la anon key (pública) se podía leer/escribir cualquier
--   código; ahora hace falta haber iniciado sesión Y que tu
--   perfil apunte a ese household.
-- =========================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  invite_code text unique not null,
  household_code text not null references accounts(code) on delete restrict,
  created_at bigint
);
create index if not exists profiles_invite_code_idx on profiles(invite_code);
create index if not exists profiles_household_idx on profiles(household_code);

alter table profiles enable row level security;

drop policy if exists "select profiles" on profiles;
create policy "select profiles" on profiles for select to authenticated using (true);

drop policy if exists "insert own profile" on profiles;
create policy "insert own profile" on profiles for insert to authenticated with check (id = auth.uid());

drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------
-- accounts: cualquier usuario autenticado puede consultar
-- (para verificar que un código exista) y crear el suyo propio.
-- ---------------------------------------------------------

drop policy if exists "allow all anon" on accounts;
drop policy if exists "select accounts" on accounts;
create policy "select accounts" on accounts for select to authenticated using (true);
drop policy if exists "insert accounts" on accounts;
create policy "insert accounts" on accounts for insert to authenticated with check (true);

-- ---------------------------------------------------------
-- Tablas de datos: solo miembros del household (perfil cuyo
-- household_code coincide) pueden leer/escribir esas filas.
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
    execute format('drop policy if exists "allow all anon" on %I;', t);
    execute format('drop policy if exists "household members" on %I;', t);
    execute format(
      'create policy "household members" on %I for all to authenticated ' ||
      'using (account_code in (select household_code from profiles where id = auth.uid())) ' ||
      'with check (account_code in (select household_code from profiles where id = auth.uid()));',
      t
    );
  end loop;
end $$;
