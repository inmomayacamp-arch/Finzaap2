-- =========================================================
-- FinzApp — cierre de una vulnerabilidad real de seguridad
--
-- Pega TODO este archivo en el SQL Editor de Supabase y dale
-- "Run". Esto se agrega a los scripts anteriores, no los
-- reemplaza.
--
-- QUÉ CORRIGE (encontrado en una auditoría de seguridad):
--
-- 1) La tabla `profiles` dejaba que CUALQUIER usuario autenticado
--    leyera el perfil de TODOS los demás usuarios (nombre,
--    invite_code y household_code de cada quien) — se hizo así
--    para que "unirme a otra cuenta" pudiera buscar por código,
--    pero quedó abierta a leer todo, no solo lo necesario.
--
-- 2) La regla para actualizar tu propio perfil no revisaba QUÉ
--    valor le pones a household_code, solo que fuera TU fila la
--    que editas. Combinado con el punto 1, cualquier usuario
--    registrado podía: leer el household_code de cualquier otra
--    persona, y luego "pegárselo" a su propio perfil directo
--    contra la base de datos (sin pasar por la pantalla de la
--    app ni conocer el código de invitación real) — quedando así
--    con acceso completo de lectura/escritura/borrado a los
--    movimientos, cobros, pagos y ahorros de esa cuenta ajena.
--
-- CÓMO SE CORRIGE:
--
-- - `profiles` ahora solo se puede leer: tu propio perfil, o el de
--   alguien que YA comparte tu household_code actual.
-- - household_code deja de poder cambiarse por una actualización
--   directa: la única forma de cambiarlo es la función
--   join_household(codigo), que corre en el servidor y valida el
--   código de invitación de verdad antes de mover a nadie de
--   cuenta.
-- - `accounts` deja de poder listarse completo: solo se ve la
--   fila de tu propia cuenta actual.
-- =========================================================

-- ---------------------------------------------------------
-- 1) profiles: solo tu perfil, o el de quien ya comparte tu
--    household_code actual.
-- ---------------------------------------------------------

create or replace function my_household_code()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select household_code from profiles where id = auth.uid();
$$;

drop policy if exists "select profiles" on profiles;
create policy "select profiles" on profiles for select to authenticated
using (id = auth.uid() or household_code = my_household_code());

-- ---------------------------------------------------------
-- 2) profiles: por la vía normal (UPDATE de fila propia) solo se
--    puede cambiar el nombre. household_code e invite_code ya no
--    se pueden tocar así, pase lo que diga la política de RLS.
-- ---------------------------------------------------------

revoke update on profiles from authenticated;
grant update (name) on profiles to authenticated;

-- ---------------------------------------------------------
-- 3) Único camino permitido para cambiar household_code: esta
--    función, que valida el invite_code de verdad en el servidor
--    antes de mover a la persona de cuenta.
-- ---------------------------------------------------------

create or replace function join_household(p_invite_code text)
returns table(household_code text, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_code text;
  target_name text;
begin
  select p.household_code, p.name into target_code, target_name
  from profiles p
  where p.invite_code = p_invite_code;

  if target_code is null then
    raise exception 'No encontramos ese código.';
  end if;

  update profiles set household_code = target_code where id = auth.uid();

  return query select target_code, target_name;
end;
$$;

grant execute on function join_household(text) to authenticated;
grant execute on function my_household_code() to authenticated;

-- ---------------------------------------------------------
-- 4) accounts: ya no se puede listar completa (antes cualquiera
--    podía leer TODOS los códigos de cuenta existentes). El flujo
--    real de la app busca por profiles.invite_code, no por
--    accounts.code directamente, así que esto no le quita nada.
-- ---------------------------------------------------------

drop policy if exists "select accounts" on accounts;
create policy "select accounts" on accounts for select to authenticated
using (code = my_household_code());

-- refresca el cache de esquema de PostgREST para que la API
-- reconozca las funciones nuevas de inmediato.
notify pgrst, 'reload schema';
