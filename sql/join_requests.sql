-- =========================================================
-- FinzApp — solicitudes de sincronización (aceptar/rechazar) y
-- salir de una cuenta compartida
--
-- Pega TODO este archivo en el SQL Editor de Supabase y dale
-- "Run". Se agrega a los scripts anteriores, no los reemplaza.
--
-- QUÉ CAMBIA:
--
-- Antes, "Unirme a otra cuenta" te unía de inmediato con solo
-- escribir el código de alguien más, sin que esa persona lo supiera
-- ni lo aprobara. Ahora:
--
-- 1) Escribir un código crea una SOLICITUD (tabla join_requests),
--    no te une todavía.
-- 2) El dueño de ese código ve la solicitud en su Cuenta y la
--    Acepta o Rechaza. Solo al aceptar se hace la unión de verdad.
-- 3) Cualquiera de los dos lados puede "Dejar de compartir" en
--    cualquier momento — eso solo regresa tu perfil a tu propio
--    espacio (tu invite_code de siempre), no borra ningún dato: lo
--    que había en el espacio compartido sigue ahí para quien se
--    quede, y lo que tenías tú antes de unirte sigue en tu propio
--    espacio, esperándote.
--
-- La tabla join_requests no tiene ninguna política que permita
-- insertar o modificar filas directo por la API — todo pasa por las
-- funciones de abajo, que validan cada paso en el servidor.
-- =========================================================

create table if not exists join_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  requester_name text not null,
  target_id uuid not null references auth.users(id) on delete cascade,
  target_name text not null,
  status text not null default 'pending',
  created_at bigint not null,
  resolved_at bigint
);
create index if not exists join_requests_target_idx on join_requests(target_id, status);
create index if not exists join_requests_requester_idx on join_requests(requester_id, status);

alter table join_requests enable row level security;

drop policy if exists "select own join requests" on join_requests;
create policy "select own join requests" on join_requests for select to authenticated
using (requester_id = auth.uid() or target_id = auth.uid());

-- solo puedes borrar (descartar) tus propias solicitudes YA
-- resueltas (aceptada/rechazada) — las pendientes no se pueden
-- borrar por aquí, solo aceptarlas o rechazarlas con las funciones.
drop policy if exists "delete own resolved request" on join_requests;
create policy "delete own resolved request" on join_requests for delete to authenticated
using (requester_id = auth.uid() and status <> 'pending');

-- ---------------------------------------------------------
-- Crear una solicitud a partir del código personal de alguien más.
-- ---------------------------------------------------------

create or replace function request_join(p_invite_code text)
returns table(target_name text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_name text;
  t_id uuid;
  t_name text;
  existing_status text;
begin
  select name into my_name from profiles where id = me;

  select p.id, p.name into t_id, t_name from profiles p where p.invite_code = p_invite_code;
  if t_id is null then
    raise exception 'No encontramos ese código.';
  end if;
  if t_id = me then
    raise exception 'Ese es tu propio código.';
  end if;

  select jr.status into existing_status from join_requests jr
    where jr.requester_id = me and jr.target_id = t_id and jr.status = 'pending';
  if existing_status is not null then
    return query select t_name, 'pending'::text;
    return;
  end if;

  insert into join_requests (requester_id, requester_name, target_id, target_name, status, created_at)
  values (me, coalesce(my_name, 'Alguien'), t_id, t_name, 'pending', (extract(epoch from now()) * 1000)::bigint);

  return query select t_name, 'pending'::text;
end;
$$;
grant execute on function request_join(text) to authenticated;

-- ---------------------------------------------------------
-- El dueño del código acepta: mueve al que pidió unirse a SU
-- espacio actual. Rechazar solo cierra la solicitud.
-- ---------------------------------------------------------

create or replace function accept_join_request(p_request_id uuid)
returns table(household_code text, requester_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  req record;
  my_code text;
begin
  select * into req from join_requests where id = p_request_id and target_id = auth.uid() and status = 'pending';
  if req is null then
    raise exception 'Esa solicitud ya no está disponible.';
  end if;

  select p.household_code into my_code from profiles p where p.id = auth.uid();

  update profiles set household_code = my_code where id = req.requester_id;
  update join_requests set status = 'accepted', resolved_at = (extract(epoch from now()) * 1000)::bigint where id = p_request_id;

  return query select my_code, req.requester_name;
end;
$$;
grant execute on function accept_join_request(uuid) to authenticated;

create or replace function reject_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update join_requests
    set status = 'rejected', resolved_at = (extract(epoch from now()) * 1000)::bigint
    where id = p_request_id and target_id = auth.uid() and status = 'pending';
end;
$$;
grant execute on function reject_join_request(uuid) to authenticated;

-- ---------------------------------------------------------
-- Dejar de compartir: regresa tu perfil a tu propio espacio
-- (tu invite_code de siempre). No borra ningún dato de nadie.
-- ---------------------------------------------------------

create or replace function leave_household()
returns table(household_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  my_invite text;
begin
  select invite_code into my_invite from profiles where id = auth.uid();
  update profiles set household_code = my_invite where id = auth.uid();
  return query select my_invite;
end;
$$;
grant execute on function leave_household() to authenticated;

-- ---------------------------------------------------------
-- Quitar a alguien de TU espacio compartido (lo puede hacer
-- cualquiera de los dos lados, no solo quien se une). Igual que
-- "Dejar de compartir": esa persona regresa a su propio espacio,
-- no se borra ningún dato de nadie.
-- ---------------------------------------------------------

create or replace function remove_household_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  my_code text;
  member_code text;
  member_invite text;
begin
  if p_member_id = auth.uid() then
    raise exception 'No puedes quitarte a ti mismo así — usa "Dejar de compartir".';
  end if;

  select p.household_code into my_code from profiles p where p.id = auth.uid();
  select p.household_code, p.invite_code into member_code, member_invite from profiles p where p.id = p_member_id;

  if member_code is null or member_code <> my_code then
    raise exception 'Esa persona no está en tu espacio compartido.';
  end if;

  update profiles set household_code = member_invite where id = p_member_id;
end;
$$;
grant execute on function remove_household_member(uuid) to authenticated;

-- refresca el cache de esquema de PostgREST para que la API
-- reconozca la tabla y las funciones nuevas de inmediato.
notify pgrst, 'reload schema';
