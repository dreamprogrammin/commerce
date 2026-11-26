-- Поставки: не пришла в свой день — на завтра (миграция 20261127120000_supplier_delivery_rollover).
--
-- Только на ЛОКАЛЬНОЙ базе, суперпользователем (cron.job):
--   psql "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres" -X -At \
--     -f supabase/tests/test_supplier_delivery_rollover.sql
-- До применения — `BEGIN; \i <миграция> \i <этот файл>`. Всё откатывается.

\set ON_ERROR_STOP 1
BEGIN;

CREATE FUNCTION pg_temp.ok(cond boolean, what text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ПРОВАЛ: %', what;
  END IF;
  RETURN 'ок  ' || what;
END $$;

SELECT (now() AT TIME ZONE 'Asia/Almaty')::date AS today \gset

INSERT INTO public.suppliers (name) VALUES ('Проверка переноса') RETURNING id AS sup \gset
-- Заказы с датой, поставленной руками: прошла 3 дня назад, вчера, сегодня, завтра;
-- без даты; принятый с прошедшей датой; формирующийся
INSERT INTO public.supplier_orders (supplier_id, status, ordered_at, expected_at) VALUES
  (:'sup', 'ordered',    now(), :'today'::date - 3) RETURNING id AS late3 \gset
INSERT INTO public.supplier_orders (supplier_id, status, ordered_at, expected_at) VALUES
  (:'sup', 'in_transit', now(), :'today'::date - 1) RETURNING id AS late1 \gset
INSERT INTO public.supplier_orders (supplier_id, status, ordered_at, expected_at) VALUES
  (:'sup', 'ordered',    now(), :'today'::date) RETURNING id AS today_o \gset
INSERT INTO public.supplier_orders (supplier_id, status, ordered_at, expected_at) VALUES
  (:'sup', 'ordered',    now(), NULL) RETURNING id AS nodate \gset
INSERT INTO public.supplier_orders (supplier_id, status, ordered_at, expected_at, closed_at) VALUES
  (:'sup', 'received',   now(), :'today'::date - 5, now()) RETURNING id AS closed \gset

SELECT pg_temp.ok((SELECT planned_at = :'today'::date - 3 AND postponed = 0 FROM public.supplier_orders WHERE id = :'late3'),
                  'новый заказ: «сначала ждали» = его дата, переносов 0');

SELECT pg_temp.ok(public.supplier_orders_rollover() = 2, 'перенесены два опоздавших открытых');
SELECT pg_temp.ok((SELECT expected_at = :'today'::date AND postponed = 3 AND planned_at = :'today'::date - 3 FROM public.supplier_orders WHERE id = :'late3'),
                  'опоздал на 3 дня — на сегодня, переносов 3, сначала ждали — как было');
SELECT pg_temp.ok((SELECT expected_at = :'today'::date AND postponed = 1 FROM public.supplier_orders WHERE id = :'late1'),
                  '«В пути» переносится тоже');
SELECT pg_temp.ok((SELECT expected_at = :'today'::date AND postponed = 0 FROM public.supplier_orders WHERE id = :'today_o'), 'сегодняшний — не трогается');
SELECT pg_temp.ok((SELECT expected_at IS NULL AND postponed = 0 FROM public.supplier_orders WHERE id = :'nodate'), 'без даты — не трогается');
SELECT pg_temp.ok((SELECT expected_at = :'today'::date - 5 AND postponed = 0 FROM public.supplier_orders WHERE id = :'closed'), 'принятый — не трогается');
SELECT pg_temp.ok(public.supplier_orders_rollover() = 0, 'второй запуск в тот же день — ничего');

-- Ночь пропущена: следующий запуск добавит оба дня
UPDATE public.supplier_orders SET expected_at = :'today'::date - 2 WHERE id = :'late1';
SELECT pg_temp.ok((SELECT postponed = 0 AND planned_at = :'today'::date - 2 FROM public.supplier_orders WHERE id = :'late1'),
                  'дата руками — новый план, переносов снова 0');
SELECT set_config('app.delivery_rollover', 'on', true);
UPDATE public.supplier_orders SET expected_at = :'today'::date - 2, postponed = 1 WHERE id = :'late3';
SELECT set_config('app.delivery_rollover', 'off', true);
SELECT public.supplier_orders_rollover();
SELECT pg_temp.ok((SELECT expected_at = :'today'::date AND postponed = 3 AND planned_at = :'today'::date - 3 FROM public.supplier_orders WHERE id = :'late3'),
                  'пропущенная ночь: переносов прибавилось на все пропущенные дни');

-- Ручная дата через функцию «Дата» — тоже новый план
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (gen_random_uuid(), 'rollover-probe@example.test', '{}') RETURNING id AS admin \gset
-- Страж роли (только админ меняет роль) — мимо: триггеры на время вставки выключены
SET LOCAL session_replication_role = replica;
INSERT INTO public.profiles (id, role) VALUES (:'admin', 'admin') ON CONFLICT (id) DO UPDATE SET role = 'admin';
SET LOCAL session_replication_role = origin;
SELECT public.admin_set_supplier_order_expected(:'late3', :'today'::date + 2, :'admin');
SELECT pg_temp.ok((SELECT expected_at = :'today'::date + 2 AND planned_at = :'today'::date + 2 AND postponed = 0 FROM public.supplier_orders WHERE id = :'late3'),
                  '«Дата» в «Поставках» — новый план');
-- Другие правки строки (статус) не сбрасывают счёт
UPDATE public.supplier_orders SET postponed = 4 WHERE id = :'late1';
UPDATE public.supplier_orders SET status = 'in_transit', updated_at = now() WHERE id = :'late1';
SELECT pg_temp.ok((SELECT postponed = 4 FROM public.supplier_orders WHERE id = :'late1'), 'смена статуса счёт переносов не сбрасывает');

SELECT pg_temp.ok((SELECT schedule = '1 19 * * *' AND command LIKE '%supplier_orders_rollover()%' FROM cron.job WHERE jobname = 'Supplier Delivery Rollover'),
                  'расписание — 00:01 по Алматы');
SELECT pg_temp.ok(NOT has_function_privilege('authenticated', 'public.supplier_orders_rollover()', 'EXECUTE')
                  AND NOT has_function_privilege('anon', 'public.supplier_orders_rollover()', 'EXECUTE')
                  AND has_function_privilege('service_role', 'public.supplier_orders_rollover()', 'EXECUTE'),
                  'перенос — только service_role');

ROLLBACK;
