-- Проверка заказов поставщикам и приёмки (миграция 20261031160000_supplier_orders).
--
-- Только на ЛОКАЛЬНОЙ базе, где миграция уже применена:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -At \
--     -f supabase/tests/test_supplier_orders.sql
-- До применения — тем же файлом, подключив миграцию перед ним в одной
-- транзакции: `BEGIN; \i <миграция> \i <этот файл>` (откат в конце снимет и её).
--
-- Всё в одной транзакции с откатом. Проваленная проверка останавливает прогон
-- с текстом «ПРОВАЛ: …».
--
-- ⚠️ Триггер уведомлений на локальной базе стучится в БОЕВЫЕ функции (адрес
-- прода зашит в тело, docs/HANDOFF.md) — внутри транзакции он выключен.

\set ON_ERROR_STOP 1
BEGIN;

ALTER TABLE public.notifications DISABLE TRIGGER USER;

CREATE FUNCTION pg_temp.ok(cond boolean, what text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ПРОВАЛ: %', what;
  END IF;
  RETURN 'ок  ' || what;
END $$;

-- Текст ошибки запроса или «без ошибки» — для проверок отказов.
CREATE FUNCTION pg_temp.err(q text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE q;
  RETURN 'без ошибки';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

-- ── Данные ──────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'restock-admin@example.test') RETURNING id AS admin_id \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'restock-buyer1@example.test') RETURNING id AS buyer1 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'restock-buyer2@example.test') RETURNING id AS buyer2 \gset
INSERT INTO public.profiles (id) VALUES (:'admin_id'), (:'buyer1'), (:'buyer2') ON CONFLICT (id) DO NOTHING;
-- Роль меняет только администратор (protect_profile_role_update) — триггер на время выключен
ALTER TABLE public.profiles DISABLE TRIGGER USER;
UPDATE public.profiles SET role = 'admin' WHERE id = :'admin_id';
UPDATE public.profiles SET role = 'user' WHERE id IN (:'buyer1', :'buyer2');
ALTER TABLE public.profiles ENABLE TRIGGER USER;

INSERT INTO public.suppliers (name, phone) VALUES ('Поставщик проверки', '+77000000010') RETURNING id AS sup \gset
INSERT INTO public.suppliers (name) VALUES ('Другой поставщик') RETURNING id AS other_sup \gset

SELECT (array_agg(id ORDER BY name, id))[1] AS pa,
       (array_agg(id ORDER BY name, id))[2] AS pb,
       (array_agg(id ORDER BY name, id))[3] AS pc,
       (array_agg(id ORDER BY name, id))[4] AS pother
FROM public.products \gset
UPDATE public.products SET supplier_id = :'sup' WHERE id IN (:'pa', :'pb', :'pc');
UPDATE public.products SET supplier_id = :'other_sup' WHERE id = :'pother';
UPDATE public.products SET stock_quantity = 0, cost_price = 1500, sku = ' A-1 ' WHERE id = :'pa';
UPDATE public.products SET stock_quantity = 1, cost_price = 0 WHERE id = :'pb';
UPDATE public.products SET stock_quantity = 5 WHERE id = :'pc';
-- Двое ждут товар A («Сообщить о поступлении»)
INSERT INTO public.stock_alerts (user_id, product_id) VALUES (:'buyer1', :'pa'), (:'buyer2', :'pa');

-- ── Права ───────────────────────────────────────────────────────────────────
SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.admin_create_supplier_order(uuid,jsonb,uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.admin_create_supplier_order(uuid,jsonb,uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.admin_set_supplier_order_status(uuid,text,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.admin_set_supplier_order_status(uuid,text,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.admin_receive_supplier_order(uuid,jsonb,uuid,boolean)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.admin_receive_supplier_order(uuid,jsonb,uuid,boolean)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.admin_create_supplier_order(uuid,jsonb,uuid,text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.admin_receive_supplier_order(uuid,jsonb,uuid,boolean)', 'EXECUTE'),
  'функции заказов — только service_role');
SELECT pg_temp.ok(
  NOT has_table_privilege('anon', 'public.supplier_orders', 'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated', 'public.supplier_orders', 'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated', 'public.supplier_order_items', 'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated', 'public.stock_receipts', 'SELECT,INSERT,UPDATE,DELETE')
  AND (SELECT bool_and(relrowsecurity) FROM pg_class
       WHERE oid IN ('public.supplier_orders'::regclass, 'public.supplier_order_items'::regclass, 'public.stock_receipts'::regclass)),
  'таблицы закрыты: RLS включён, прав у anon и authenticated нет');

-- ── «Заказал» ───────────────────────────────────────────────────────────────
SELECT pg_temp.ok(
  pg_temp.err(format('select public.admin_create_supplier_order(%L, %L::jsonb, %L)', :'sup',
    jsonb_build_array(jsonb_build_object('product_id', :'pa', 'quantity', 1)), :'buyer1')) LIKE '%только администратор%',
  'заказывать может только администратор');
SELECT pg_temp.ok(
  pg_temp.err(format('select public.admin_create_supplier_order(%L, %L::jsonb, %L)', :'sup', '[]', :'admin_id')) LIKE '%Заказ пуст%',
  'пустой заказ — отказ');
SELECT pg_temp.ok(
  pg_temp.err(format('select public.admin_create_supplier_order(%L, %L::jsonb, %L)', :'sup',
    jsonb_build_array(jsonb_build_object('product_id', :'pa', 'quantity', 0)), :'admin_id')) LIKE '%от 1 до 9999%',
  'количество 0 — отказ');
SELECT pg_temp.ok(
  pg_temp.err(format('select public.admin_create_supplier_order(%L, %L::jsonb, %L)', :'sup',
    jsonb_build_array(jsonb_build_object('product_id', :'pa', 'quantity', 1), jsonb_build_object('product_id', :'pa', 'quantity', 2)), :'admin_id'))
    LIKE '%повторяется%',
  'товар дважды — отказ');
SELECT pg_temp.ok(
  pg_temp.err(format('select public.admin_create_supplier_order(%L, %L::jsonb, %L)', :'sup',
    jsonb_build_array(jsonb_build_object('product_id', :'pa', 'quantity', 1), jsonb_build_object('product_id', :'pother', 'quantity', 1)), :'admin_id'))
    LIKE '%Не товары этого поставщика%',
  'товар другого поставщика — отказ, заказ не создан');
SELECT pg_temp.ok((SELECT count(*) FROM public.supplier_orders) = 0, 'после отказов заказов нет');

SELECT public.admin_create_supplier_order(:'sup',
  jsonb_build_array(jsonb_build_object('product_id', :'pa', 'quantity', 5), jsonb_build_object('product_id', :'pb', 'quantity', 3)),
  :'admin_id', '  срочно  ') AS o1 \gset
SELECT (:'o1'::jsonb)->>'id' AS o1_id, (:'o1'::jsonb)->>'number' AS o1_no \gset
SELECT pg_temp.ok(EXISTS (
  SELECT 1 FROM public.supplier_orders
  WHERE id = :'o1_id' AND status = 'ordered' AND supplier_id = :'sup' AND created_by = :'admin_id'
    AND note = 'срочно' AND shipped_at IS NULL AND closed_at IS NULL),
  'заказ создан: «Заказан», кто заказал, примечание без пробелов по краям');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.supplier_order_items WHERE order_id = :'o1_id') = 2
  AND EXISTS (SELECT 1 FROM public.supplier_order_items i JOIN public.products p ON p.id = i.product_id
              WHERE i.order_id = :'o1_id' AND i.product_id = :'pa' AND i.quantity = 5 AND i.received_quantity = 0
                AND i.cost_price = 1500 AND i.sku = 'A-1' AND i.product_name = btrim(p.name))
  AND EXISTS (SELECT 1 FROM public.supplier_order_items WHERE order_id = :'o1_id' AND product_id = :'pb' AND cost_price IS NULL),
  'строки: количество, снимок названия и артикула, закупка 0 — как не заполненная');

-- ── Статусы ─────────────────────────────────────────────────────────────────
SELECT pg_temp.ok(
  pg_temp.err(format('select public.admin_set_supplier_order_status(%L, %L, %L)', :'o1_id', 'received', :'admin_id')) LIKE '%ещё ничего не принято%',
  'закрыть заказ, по которому ничего не пришло, нельзя — только отменить');
SELECT public.admin_set_supplier_order_status(:'o1_id', 'in_transit', :'admin_id');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.supplier_orders WHERE id = :'o1_id' AND status = 'in_transit' AND shipped_at IS NOT NULL),
  '«В пути»: статус и время');
SELECT public.admin_set_supplier_order_status(:'o1_id', 'ordered', :'admin_id');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.supplier_orders WHERE id = :'o1_id' AND status = 'ordered' AND shipped_at IS NULL),
  '«В пути» нажали по ошибке — назад в «Заказан»');

-- ── Приёмка частями ─────────────────────────────────────────────────────────
SELECT pg_temp.ok(
  pg_temp.err(format('select public.admin_receive_supplier_order(%L, %L::jsonb, %L)', :'o1_id',
    jsonb_build_array(jsonb_build_object('product_id', :'pc', 'quantity', 1)), :'admin_id')) LIKE '%не из заказа%',
  'товар не из заказа — отказ');
SELECT pg_temp.ok(
  pg_temp.err(format('select public.admin_receive_supplier_order(%L, %L::jsonb, %L)', :'o1_id',
    jsonb_build_array(jsonb_build_object('product_id', :'pa', 'quantity', 0)), :'admin_id')) LIKE '%Не указано, сколько пришло%',
  'всё по нулям без «закрыть» — отказ');
SELECT pg_temp.ok(
  pg_temp.err(format('select public.admin_receive_supplier_order(%L, %L::jsonb, %L)', :'o1_id',
    jsonb_build_array(jsonb_build_object('product_id', :'pa', 'quantity', 10000)), :'admin_id')) LIKE '%от 0 до 9999%',
  '10 000 штук — отказ');
SELECT pg_temp.ok(
  pg_temp.err(format('select public.admin_receive_supplier_order(%L, %L::jsonb, %L)', :'o1_id',
    jsonb_build_array(jsonb_build_object('product_id', :'pa', 'quantity', 1)), :'buyer1')) LIKE '%только администратор%',
  'принимать может только администратор');
SELECT pg_temp.ok((SELECT stock_quantity FROM public.products WHERE id = :'pa') = 0 AND (SELECT count(*) FROM public.stock_receipts) = 0,
  'после отказов остаток и журнал не тронуты');

SELECT count(*) AS notif_before FROM public.notifications WHERE type = 'back_in_stock' AND user_id IN (:'buyer1', :'buyer2') \gset
SELECT public.admin_receive_supplier_order(:'o1_id',
  jsonb_build_array(jsonb_build_object('product_id', :'pa', 'quantity', 2), jsonb_build_object('product_id', :'pb', 'quantity', 0)),
  :'admin_id') AS r1 \gset
SELECT pg_temp.ok((:'r1'::jsonb)->>'status' = 'in_transit' AND ((:'r1'::jsonb)->>'units')::int = 2 AND ((:'r1'::jsonb)->>'notified')::int = 2,
  'пришла часть: заказ «В пути», 2 шт., уведомлено двое ждущих');
SELECT pg_temp.ok((SELECT stock_quantity FROM public.products WHERE id = :'pa') = 2, 'остаток A: 0 → 2');
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.notifications WHERE type = 'back_in_stock' AND user_id IN (:'buyer1', :'buyer2')) = :notif_before + 2
  AND NOT EXISTS (SELECT 1 FROM public.stock_alerts WHERE product_id = :'pa'),
  '«Товар снова в наличии» — обоим ждавшим, подписки сняты (trigger_back_in_stock)');
SELECT pg_temp.ok(EXISTS (
  SELECT 1 FROM public.stock_receipts
  WHERE order_id = :'o1_id' AND product_id = :'pa' AND quantity = 2 AND stock_before = 0 AND stock_after = 2 AND received_by = :'admin_id'),
  'журнал приёмки: сколько, остаток до и после, кто принял');
SELECT pg_temp.ok((SELECT received_quantity FROM public.supplier_order_items WHERE order_id = :'o1_id' AND product_id = :'pa') = 2
  AND EXISTS (SELECT 1 FROM public.supplier_orders WHERE id = :'o1_id' AND shipped_at IS NOT NULL AND closed_at IS NULL),
  'принято 2 из 5, заказ открыт');
SELECT pg_temp.ok(
  pg_temp.err(format('select public.admin_set_supplier_order_status(%L, %L, %L)', :'o1_id', 'cancelled', :'admin_id')) LIKE '%можно только закрыть%',
  'часть принята — отменить нельзя');
SELECT pg_temp.ok(
  pg_temp.err(format('select public.admin_set_supplier_order_status(%L, %L, %L)', :'o1_id', 'ordered', :'admin_id')) LIKE '%нельзя перейти%',
  'часть принята — назад в «Заказан» нельзя');

-- Остальное: A — ещё 3, B — 3 → закрыт сам; остаток прибавляется к текущему
UPDATE public.products SET stock_quantity = stock_quantity - 1 WHERE id = :'pa';  -- продали одну, пока ждали
SELECT public.admin_receive_supplier_order(:'o1_id',
  jsonb_build_array(jsonb_build_object('product_id', :'pa', 'quantity', 3), jsonb_build_object('product_id', :'pb', 'quantity', 3)),
  :'admin_id') AS r2 \gset
SELECT pg_temp.ok((:'r2'::jsonb)->>'status' = 'received' AND ((:'r2'::jsonb)->>'notified')::int = 0,
  'принято всё — заказ закрыт сам, уведомлять некого');
SELECT pg_temp.ok((SELECT stock_quantity FROM public.products WHERE id = :'pa') = 4 AND (SELECT stock_quantity FROM public.products WHERE id = :'pb') = 4,
  'остаток прибавлен к текущему: A 1 + 3 = 4 (продажа между приёмками не потерялась), B 1 + 3 = 4');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.supplier_orders WHERE id = :'o1_id' AND status = 'received' AND closed_at IS NOT NULL),
  'закрыт: «Принят», время закрытия');
SELECT pg_temp.ok(
  pg_temp.err(format('select public.admin_receive_supplier_order(%L, %L::jsonb, %L)', :'o1_id',
    jsonb_build_array(jsonb_build_object('product_id', :'pa', 'quantity', 1)), :'admin_id')) LIKE '%уже закрыт%'
  AND pg_temp.err(format('select public.admin_set_supplier_order_status(%L, %L, %L)', :'o1_id', 'in_transit', :'admin_id')) LIKE '%уже закрыт%',
  'закрытый заказ не принимается и не меняется');

-- ── Доложил больше / «остального не будет» / отмена ─────────────────────────
SELECT (public.admin_create_supplier_order(:'sup', jsonb_build_array(jsonb_build_object('product_id', :'pc', 'quantity', 2)), :'admin_id'))->>'id' AS o2 \gset
SELECT public.admin_receive_supplier_order(:'o2', jsonb_build_array(jsonb_build_object('product_id', :'pc', 'quantity', 4)), :'admin_id') AS r3 \gset
SELECT pg_temp.ok((:'r3'::jsonb)->>'status' = 'received' AND (SELECT stock_quantity FROM public.products WHERE id = :'pc') = 9,
  'поставщик доложил: заказано 2, пришло 4 — принято, остаток 5 + 4');

SELECT (public.admin_create_supplier_order(:'sup', jsonb_build_array(jsonb_build_object('product_id', :'pb', 'quantity', 10)), :'admin_id'))->>'id' AS o3 \gset
SELECT public.admin_receive_supplier_order(:'o3', jsonb_build_array(jsonb_build_object('product_id', :'pb', 'quantity', 1)), :'admin_id', true) AS r4 \gset
SELECT pg_temp.ok((:'r4'::jsonb)->>'status' = 'received'
  AND (SELECT received_quantity FROM public.supplier_order_items WHERE order_id = :'o3') = 1,
  '«остального не будет»: принято 1 из 10, заказ закрыт');

SELECT (public.admin_create_supplier_order(:'sup', jsonb_build_array(jsonb_build_object('product_id', :'pb', 'quantity', 2)), :'admin_id'))->>'id' AS o4 \gset
SELECT public.admin_receive_supplier_order(:'o4', jsonb_build_array(jsonb_build_object('product_id', :'pb', 'quantity', 1)), :'admin_id') AS r5 \gset
SELECT public.admin_set_supplier_order_status(:'o4', 'received', :'admin_id');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.supplier_orders WHERE id = :'o4' AND status = 'received' AND closed_at IS NOT NULL),
  'частично принятый закрыт кнопкой «Закрыть»');

SELECT (public.admin_create_supplier_order(:'sup', jsonb_build_array(jsonb_build_object('product_id', :'pa', 'quantity', 1)), :'admin_id'))->>'id' AS o5 \gset
SELECT pg_temp.ok(
  pg_temp.err(format('select public.admin_receive_supplier_order(%L, %L::jsonb, %L, true)', :'o5',
    jsonb_build_array(jsonb_build_object('product_id', :'pa', 'quantity', 0)), :'admin_id')) LIKE '%можно отменить%',
  '«закрыть» без единой принятой штуки — отказ, предлагается отменить');
SELECT public.admin_set_supplier_order_status(:'o5', 'cancelled', :'admin_id');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.supplier_orders WHERE id = :'o5' AND status = 'cancelled' AND closed_at IS NOT NULL),
  'отмена, пока ничего не принято');

-- ── Удалённый товар ─────────────────────────────────────────────────────────
INSERT INTO public.products (name, slug, price, supplier_id, stock_quantity)
VALUES ('Временный товар проверки', 'restock-temp-check', 100, :'sup', 0) RETURNING id AS ptmp \gset
SELECT (public.admin_create_supplier_order(:'sup', jsonb_build_array(jsonb_build_object('product_id', :'ptmp', 'quantity', 3)), :'admin_id'))->>'id' AS o6 \gset
DELETE FROM public.products WHERE id = :'ptmp';
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.supplier_order_items
                          WHERE order_id = :'o6' AND product_id IS NULL AND product_name = 'Временный товар проверки' AND quantity = 3),
  'товар удалили — строка заказа осталась со снимком названия');

-- ── Номера ──────────────────────────────────────────────────────────────────
SELECT pg_temp.ok((SELECT count(DISTINCT number) FROM public.supplier_orders) = (SELECT count(*) FROM public.supplier_orders)
  AND (SELECT min(number) FROM public.supplier_orders WHERE id = :'o1_id') < (SELECT number FROM public.supplier_orders WHERE id = :'o2'),
  'номера заказов уникальны и растут');

ROLLBACK;
\echo 'Все проверки пройдены, транзакция откатана.'
