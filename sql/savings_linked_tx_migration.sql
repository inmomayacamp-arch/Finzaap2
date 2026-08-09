-- =========================================================
-- Finanza — agrega columnas que faltaban (causaban que ciertos
-- guardados fallaran en silencio contra Supabase)
--
-- Pega TODO este archivo en el SQL Editor de Supabase y dale
-- "Run". Esto se agrega a los scripts anteriores, no los
-- reemplaza.
--
-- Qué corrige (dos bugs del mismo tipo):
--
-- 1) linked_tx_id en savings_deposits: cuando se agregó la
--    función de que un depósito de ahorro descuente del saldo
--    real (y quede vinculado a su movimiento en Inicio/Reporte),
--    la app empezó a enviar un campo "linkedTxId" en cada
--    depósito — pero la tabla nunca tuvo esa columna.
--
-- 2) edited en transactions/receivables/payables/savings_deposits:
--    cuando se agregó la función de editar movimientos ("queda
--    un texto de Modificado"), la app empezó a enviar un campo
--    "edited" en cada edición — pero ninguna de esas 4 tablas
--    tenía esa columna.
--
-- En ambos casos Supabase RECHAZABA el guardado por completo
-- (columna inexistente) y el cambio solo vivía en el
-- celular/navegador de quien lo hizo: se veía bien al instante,
-- pero desaparecía (o revertía a como estaba antes) al
-- actualizar la página, cerrar sesión o entrar desde otro
-- dispositivo, porque nunca llegó a guardarse de verdad en la
-- nube.
-- =========================================================

alter table savings_deposits add column if not exists linked_tx_id text;

alter table transactions add column if not exists edited boolean default false;
alter table receivables add column if not exists edited boolean default false;
alter table payables add column if not exists edited boolean default false;
alter table savings_deposits add column if not exists edited boolean default false;

-- refresca el cache de esquema de PostgREST para que la API
-- reconozca las columnas nuevas de inmediato.
notify pgrst, 'reload schema';
