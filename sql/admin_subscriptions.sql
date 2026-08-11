-- =========================================================
-- FinzApp — visibilidad de pagos en el panel de administrador
--
-- Pega TODO este archivo en el SQL Editor de Supabase y dale
-- "Run". Reemplaza admin_stats() y admin_list_accounts() (ver
-- sql/admin_panel.sql) para que incluyan el estado de la
-- suscripción de cada cuenta -- antes el panel no mostraba nada
-- de esto.
-- =========================================================

create or replace function admin_stats()
returns table(
  total_accounts bigint,
  total_users bigint,
  total_transactions bigint,
  new_accounts_7d bigint,
  new_accounts_30d bigint,
  paying_accounts bigint,
  trial_accounts bigint,
  past_due_accounts bigint
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
    (select count(*) from accounts where created_at >= (extract(epoch from now() - interval '30 days') * 1000)),
    (select count(*) from subscriptions where status in ('active', 'trialing')),
    (select count(*) from accounts a
       where not exists (select 1 from subscriptions s where s.household_code = a.code)
         and a.created_at >= (extract(epoch from now()) * 1000)::bigint - 7 * 86400000),
    (select count(*) from subscriptions where status = 'past_due');
end;
$$;
grant execute on function admin_stats() to authenticated;

-- ---------------------------------------------------------
-- Igual que antes, agregando el estado de pago de cada cuenta.
-- sub_status queda NULL si la cuenta nunca ha llegado a Stripe
-- (sigue en su prueba gratis de 7 dias, o ya se le acabo y nunca
-- pago). has_access reusa la misma funcion que aplica el bloqueo
-- real, para que el panel nunca diga algo distinto de lo que la
-- base de datos en realidad permite.
-- ---------------------------------------------------------

create or replace function admin_list_accounts()
returns table(
  code text,
  created_at bigint,
  member_count bigint,
  members text,
  transaction_count bigint,
  last_activity bigint,
  sub_status text,
  plan text,
  current_period_end bigint,
  has_access boolean
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
    max(t.created_at) as last_activity,
    s.status,
    s.plan,
    s.current_period_end,
    has_active_access(a.code)
  from accounts a
  left join profiles p on p.household_code = a.code
  left join auth.users u on u.id = p.id
  left join transactions t on t.account_code = a.code
  left join subscriptions s on s.household_code = a.code
  group by a.code, a.created_at, s.status, s.plan, s.current_period_end
  order by a.created_at desc;
end;
$$;
grant execute on function admin_list_accounts() to authenticated;
