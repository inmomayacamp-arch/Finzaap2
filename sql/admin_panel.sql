-- =========================================================
-- FinzApp — panel de administrador
--
-- Pega TODO este archivo en el SQL Editor de Supabase y dale
-- "Run". Se agrega a los scripts anteriores, no los reemplaza.
--
-- QUÉ AGREGA:
--
-- - Una tabla `admins` que dice qué usuarios (por su id de
--   Supabase Auth) pueden entrar al panel de administrador.
--   Nadie puede leerla ni escribirla por la API normal — no
--   tiene ninguna política de RLS que lo permita, ni siquiera
--   para ti mismo autenticado. Solo se usa desde ADENTRO de las
--   funciones de abajo.
--
-- - is_admin(): dice si quien hace la consulta ahora mismo es
--   admin o no.
--
-- - admin_stats() y admin_list_accounts(): las únicas dos
--   funciones que el panel usa para traer datos de TODAS las
--   cuentas (rompiendo la regla normal de "solo tu propio
--   household"). Ambas empiezan revisando is_admin() y truenan
--   con un error si no lo eres — así que aunque alguien más
--   llame estas funciones directamente (como hiciste tú probando
--   la vulnerabilidad anterior), no consigue nada.
--
-- ÚLTIMO PASO — hazlo tú: hasta abajo de este archivo hay un
-- INSERT para agregarte como admin. Cambia el correo por el
-- tuyo (con el que inicias sesión en FinzApp) antes de correrlo.
-- =========================================================

create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table admins enable row level security;
-- sin políticas: esta tabla queda completamente cerrada a la API,
-- solo la leen las funciones SECURITY DEFINER de abajo.

create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from admins where user_id = auth.uid());
$$;
grant execute on function is_admin() to authenticated;

-- ---------------------------------------------------------
-- Números generales para la cabecera del panel.
-- ---------------------------------------------------------

create or replace function admin_stats()
returns table(
  total_accounts bigint,
  total_users bigint,
  total_transactions bigint,
  new_accounts_7d bigint,
  new_accounts_30d bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select
    (select count(*) from accounts),
    (select count(*) from profiles),
    (select count(*) from transactions),
    (select count(*) from accounts where created_at >= (extract(epoch from now() - interval '7 days') * 1000)),
    (select count(*) from accounts where created_at >= (extract(epoch from now() - interval '30 days') * 1000));
end;
$$;
grant execute on function admin_stats() to authenticated;

-- ---------------------------------------------------------
-- Una fila por cuenta (household), con quién la usa y qué tan
-- activa está.
-- ---------------------------------------------------------

create or replace function admin_list_accounts()
returns table(
  code text,
  created_at bigint,
  member_count bigint,
  members text,
  transaction_count bigint,
  last_activity bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;

  return query
  select
    a.code,
    a.created_at,
    count(distinct p.id) as member_count,
    coalesce(
      string_agg(distinct trim(coalesce(p.name, 'Sin nombre')) || ' <' || coalesce(u.email, 'sin correo') || '>', ', '),
      '(sin miembros)'
    ) as members,
    count(distinct t.id) as transaction_count,
    max(t.created_at) as last_activity
  from accounts a
  left join profiles p on p.household_code = a.code
  left join auth.users u on u.id = p.id
  left join transactions t on t.account_code = a.code
  group by a.code, a.created_at
  order by a.created_at desc;
end;
$$;
grant execute on function admin_list_accounts() to authenticated;

-- ---------------------------------------------------------
-- Agrégate como admin (cambia el correo antes de correr esto).
-- ---------------------------------------------------------

insert into admins (user_id)
select id from auth.users where email = 'PON-AQUI-TU-CORREO@ejemplo.com'
on conflict (user_id) do nothing;
