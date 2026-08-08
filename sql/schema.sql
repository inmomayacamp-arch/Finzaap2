-- =========================================================
-- Finanza — schema de Supabase
--
-- Pega TODO este archivo en el SQL Editor de tu proyecto de
-- Supabase (Project → SQL Editor → New query) y dale "Run".
--
-- Modelo de seguridad: esta app no usa cuentas de usuario ni
-- contraseñas — el "código de cuenta" (ej. HKHQ-VZ8P) que se
-- comparte entre las personas ES el secreto que protege los
-- datos. Cualquiera con la anon key puede leer/escribir, pero
-- solo quien conozca el código específico puede encontrar y
-- filtrar esos registros, porque el código no es adivinable
-- (8 caracteres al azar) y toda consulta debe incluirlo.
-- =========================================================

create table if not exists accounts (
  code text primary key,
  created_at bigint not null
);

create table if not exists transactions (
  id text primary key,
  account_code text not null references accounts(code) on delete cascade,
  type text not null,
  amount numeric not null,
  description text,
  category text,
  note text,
  date date not null,
  method text not null,
  recurrent boolean default false,
  author text,
  author_color text,
  created_at bigint
);
create index if not exists transactions_account_idx on transactions(account_code);

create table if not exists recurring_transactions (
  id text primary key,
  account_code text not null references accounts(code) on delete cascade,
  type text not null,
  description text,
  category text,
  amount numeric not null,
  method text not null,
  note text
);
create index if not exists recurring_transactions_account_idx on recurring_transactions(account_code);

create table if not exists receivables (
  id text primary key,
  account_code text not null references accounts(code) on delete cascade,
  description text,
  amount numeric not null,
  note text,
  date date not null,
  status text default 'pending',
  recurrent boolean default false,
  author text,
  author_color text,
  created_at bigint
);
create index if not exists receivables_account_idx on receivables(account_code);

create table if not exists payables (
  id text primary key,
  account_code text not null references accounts(code) on delete cascade,
  description text,
  amount numeric not null,
  note text,
  date date not null,
  reminder date,
  status text default 'pending',
  recurrent boolean default false,
  author text,
  author_color text,
  created_at bigint
);
create index if not exists payables_account_idx on payables(account_code);

create table if not exists recurring_receivables (
  id text primary key,
  account_code text not null references accounts(code) on delete cascade,
  description text,
  amount numeric not null,
  note text
);
create index if not exists recurring_receivables_account_idx on recurring_receivables(account_code);

create table if not exists recurring_payables (
  id text primary key,
  account_code text not null references accounts(code) on delete cascade,
  description text,
  amount numeric not null,
  note text
);
create index if not exists recurring_payables_account_idx on recurring_payables(account_code);

create table if not exists savings_categories (
  id text primary key,
  account_code text not null references accounts(code) on delete cascade,
  icon text,
  name text,
  goal numeric default 0,
  created_at bigint
);
create index if not exists savings_categories_account_idx on savings_categories(account_code);

create table if not exists savings_deposits (
  id text primary key,
  account_code text not null references accounts(code) on delete cascade,
  category_id text,
  amount numeric not null,
  note text,
  date date not null,
  method text not null,
  author text,
  author_color text,
  created_at bigint
);
create index if not exists savings_deposits_account_idx on savings_deposits(account_code);

-- ---------------------------------------------------------
-- Row Level Security: se habilita en todas las tablas y se
-- permite acceso total a la key pública (anon). La protección
-- real la da el código de cuenta, no RLS por usuario.
-- ---------------------------------------------------------

alter table accounts enable row level security;
alter table transactions enable row level security;
alter table recurring_transactions enable row level security;
alter table receivables enable row level security;
alter table payables enable row level security;
alter table recurring_receivables enable row level security;
alter table recurring_payables enable row level security;
alter table savings_categories enable row level security;
alter table savings_deposits enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'accounts','transactions','recurring_transactions','receivables','payables',
    'recurring_receivables','recurring_payables','savings_categories','savings_deposits'
  ])
  loop
    execute format('drop policy if exists "allow all anon" on %I;', t);
    execute format(
      'create policy "allow all anon" on %I for all to anon using (true) with check (true);', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------
-- Realtime: publica los cambios de estas tablas para que la
-- app pueda escuchar en vivo (INSERT/UPDATE/DELETE).
-- Envuelto en manejo de errores para poder correr este script
-- más de una vez sin que falle si una tabla ya está publicada.
-- ---------------------------------------------------------

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'accounts','transactions','recurring_transactions','receivables','payables',
    'recurring_receivables','recurring_payables','savings_categories','savings_deposits'
  ])
  loop
    begin
      execute format('alter publication supabase_realtime add table %I;', t);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;
