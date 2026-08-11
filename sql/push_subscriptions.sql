-- =========================================================
-- FinzApp — recordatorios push (suscripciones de dispositivo)
--
-- Pega TODO este archivo en el SQL Editor de Supabase y dale
-- "Run". Se agrega a los scripts anteriores, no los reemplaza.
--
-- QUÉ AGREGA:
--
-- Una tabla `push_subscriptions`: cada fila es "este dispositivo de
-- este usuario aceptó recibir notificaciones". El trabajo programado
-- (Vercel Cron) que manda los recordatorios lee esta tabla con la
-- llave de servicio (que ignora RLS a propósito, porque necesita ver
-- las suscripciones de TODOS los usuarios para avisarles). Por la
-- API normal (anon/authenticated), cada quien solo ve y borra sus
-- propias suscripciones.
-- =========================================================

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at bigint not null
);
create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

drop policy if exists "select own push subscriptions" on push_subscriptions;
create policy "select own push subscriptions" on push_subscriptions for select to authenticated
using (user_id = auth.uid());

drop policy if exists "insert own push subscriptions" on push_subscriptions;
create policy "insert own push subscriptions" on push_subscriptions for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "delete own push subscriptions" on push_subscriptions;
create policy "delete own push subscriptions" on push_subscriptions for delete to authenticated
using (user_id = auth.uid());

notify pgrst, 'reload schema';
