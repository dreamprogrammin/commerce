-- ============================================================================
-- Поставки от поставщиков (26 ноября 2026)
--
-- Владелец 26.11: «товар, который добавляется на сайт, автоматически должен
-- добавляться в заказ к поставщику … нужно сделать ещё один раздел — поставки
-- от поставщиков, в которых будут сформированы заказы при добавлении, с
-- примерной датой ожидания, и там должна происходить сверка товаров: сколько
-- пришло и сколько нет, как в SAP-портале. Как только я поставку оприходую,
-- она уже появляется в основном складе; пока поставка не принята, товары не
-- добавляются, а если тот же товар — остатки увеличиваются».
-- Решения владельца 26.11: сколько штук — полем в форме товара; товары
-- копятся в заказе поставщика, пока не нажато «Заказано»; новый товар скрыт
-- с сайта до первой приёмки.
--
-- Склад — как и был, остаток товара (products.stock_quantity): приёмка
-- (admin_receive_supplier_order, 20261031160000) прибавляет пришедшее к
-- остатку, до приёмки остаток не меняется.
--
--   • supplier_orders.status + 'draft' — «Формируется»: копится, поставщику
--     ещё не отправлен. У поставщика такой один (supplier_orders_one_draft).
--     Принять по нему нельзя.
--   • supplier_orders.ordered_at — когда нажато «Заказано». У прежних заказов —
--     created_at, у заказов из «К закупке» — сразу (DEFAULT now()), у
--     формирующегося — NULL (supplier_orders_ordered_at_draft).
--   • supplier_orders.expected_at — примерная дата поставки, день по Алматы;
--     NULL — не указана.
--   • supplier_order_items.show_on_receipt — товар скрыт с сайта, пока не
--     придёт; первая приёмка его показывает (is_active = true) и флаг снимает.
--   • admin_add_to_supplier_draft — «На сайт»: товар — в формирующийся заказ
--     его поставщика (нет — заводится); тот же товар — количество
--     прибавляется; p_show_on_receipt — скрыть до приёмки.
--   • admin_edit_supplier_draft — количество строк формирующегося; 0 убирает
--     строку; строк не осталось — заказа нет. Убранный скрытый товар остаётся
--     скрытым: показать его можно в карточке товара.
--   • admin_place_supplier_order — «Заказано»: draft → ordered, ordered_at,
--     дата ожидания; названия, артикулы и закупочные цены строк — на момент
--     заказа.
--   • admin_set_supplier_order_expected — поправить дату, пока заказ открыт.
--   • admin_receive_supplier_order — как была, плюс показ скрытого товара и
--     shown в ответе (id и slug): страница сбросит кеш карточки и скажет
--     поисковикам. По формирующемуся — понятный отказ.
--
-- Функции — только ключу сервиса; кто действует — параметром, роль
-- проверяется внутри, как у прежних (20261031160000). Тело
-- admin_receive_supplier_order снято с боя pg_get_functiondef 26.11.2026 и
-- совпадает с 20261031160000; сигнатура та же — CREATE OR REPLACE не
-- плодит перегрузок, права на неё сохраняются.
-- ============================================================================

-- ── 0. Проверка состояния ────────────────────────────────────────────────────
DO $$
DECLARE
  v_def text;
BEGIN
  IF to_regclass('public.supplier_orders') IS NULL OR to_regclass('public.supplier_order_items') IS NULL
     OR to_regclass('public.stock_receipts') IS NULL THEN
    RAISE EXCEPTION 'нет заказов поставщикам — сначала 20261031160000_supplier_orders';
  END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid = 'public.supplier_orders'::regclass AND conname = 'supplier_orders_status_check')
     IS DISTINCT FROM 'CHECK ((status = ANY (ARRAY[''ordered''::text, ''in_transit''::text, ''received''::text, ''cancelled''::text])))' THEN
    RAISE EXCEPTION 'supplier_orders_status_check не тот, под который готовилась миграция';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND ((table_name = 'supplier_orders' AND column_name IN ('ordered_at', 'expected_at'))
                 OR (table_name = 'supplier_order_items' AND column_name = 'show_on_receipt'))) THEN
    RAISE EXCEPTION 'колонки поставок уже есть — миграция применялась?';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'admin_receive_supplier_order'
      AND pronamespace = 'public'::regnamespace) <> 1
     OR to_regprocedure('public.admin_receive_supplier_order(uuid, jsonb, uuid, boolean)') IS NULL THEN
    RAISE EXCEPTION 'admin_receive_supplier_order — не одна версия или не та сигнатура';
  END IF;
  v_def := pg_get_functiondef('public.admin_receive_supplier_order(uuid, jsonb, uuid, boolean)'::regprocedure);
  IF position('INSERT INTO stock_receipts' IN v_def) = 0 OR position('show_on_receipt' IN v_def) > 0 THEN
    RAISE EXCEPTION 'admin_receive_supplier_order не та, под которую готовилась миграция';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
             AND proname IN ('admin_add_to_supplier_draft', 'admin_edit_supplier_draft',
                             'admin_place_supplier_order', 'admin_set_supplier_order_expected')) THEN
    RAISE EXCEPTION 'функции поставок уже есть — миграция применялась?';
  END IF;
END $$;

-- ── 1. Формирующийся заказ, дата заказа и дата поставки ──────────────────────
ALTER TABLE public.supplier_orders DROP CONSTRAINT supplier_orders_status_check;
ALTER TABLE public.supplier_orders ADD CONSTRAINT supplier_orders_status_check
  CHECK (status IN ('draft', 'ordered', 'in_transit', 'received', 'cancelled'));

ALTER TABLE public.supplier_orders
  ADD COLUMN ordered_at timestamptz,
  ADD COLUMN expected_at date;
-- Прежние заказы ушли поставщику, когда их сохранили
UPDATE public.supplier_orders SET ordered_at = created_at;
-- Заказ из «К закупке» (admin_create_supplier_order) уходит сразу
ALTER TABLE public.supplier_orders ALTER COLUMN ordered_at SET DEFAULT now();
ALTER TABLE public.supplier_orders ADD CONSTRAINT supplier_orders_ordered_at_draft
  CHECK ((status = 'draft') = (ordered_at IS NULL));
CREATE UNIQUE INDEX supplier_orders_one_draft ON public.supplier_orders (supplier_id) WHERE status = 'draft';

ALTER TABLE public.supplier_order_items
  ADD COLUMN show_on_receipt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.supplier_orders.ordered_at IS
  'Когда заказ ушёл поставщику («Заказано» или «Заказал» в «К закупке»); NULL — формируется (status = draft).';
COMMENT ON COLUMN public.supplier_orders.expected_at IS
  'Примерная дата поставки, день по Алматы; NULL — не указана (26.11.2026).';
COMMENT ON COLUMN public.supplier_order_items.show_on_receipt IS
  'Товар скрыт с сайта до первой приёмки: приёмка ставит products.is_active = true и снимает флаг (26.11.2026).';

-- ── 2. «На сайт» — товар в формирующийся заказ поставщика ────────────────────
CREATE FUNCTION public.admin_add_to_supplier_draft(
  p_product_id uuid,
  p_quantity integer,
  p_admin_id uuid,
  p_show_on_receipt boolean
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_product products%ROWTYPE;
  v_order_id uuid;
  v_number integer;
  v_created boolean := false;
  v_positions integer;
  v_show boolean := coalesce(p_show_on_receipt, false);
BEGIN
  IF (SELECT role FROM profiles WHERE id = p_admin_id) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Заказывать у поставщика может только администратор';
  END IF;
  IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 9999 THEN
    RAISE EXCEPTION 'Количество в заказе — от 1 до 9999';
  END IF;
  SELECT * INTO v_product FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Товар не найден';
  END IF;
  IF v_product.supplier_id IS NULL THEN
    RAISE EXCEPTION 'У товара «%» не указан поставщик — в заказ его не положить', btrim(v_product.name);
  END IF;

  -- Два «На сайт» одного поставщика в одну секунду не заведут два заказа:
  -- второй ждёт здесь и находит заказ первого
  PERFORM 1 FROM suppliers WHERE id = v_product.supplier_id FOR UPDATE;
  SELECT id, number INTO v_order_id, v_number FROM supplier_orders
  WHERE supplier_id = v_product.supplier_id AND status = 'draft';
  IF v_order_id IS NULL THEN
    INSERT INTO supplier_orders (supplier_id, status, ordered_at, created_by)
    VALUES (v_product.supplier_id, 'draft', NULL, p_admin_id)
    RETURNING id, number INTO v_order_id, v_number;
    v_created := true;
  END IF;

  INSERT INTO supplier_order_items (order_id, product_id, product_name, sku, quantity, cost_price, show_on_receipt)
  VALUES (v_order_id, v_product.id, btrim(v_product.name), NULLIF(btrim(v_product.sku), ''), p_quantity,
          NULLIF(v_product.cost_price, 0), v_show)
  ON CONFLICT (order_id, product_id) DO UPDATE
    SET quantity = LEAST(supplier_order_items.quantity + EXCLUDED.quantity, 9999),
        show_on_receipt = supplier_order_items.show_on_receipt OR EXCLUDED.show_on_receipt;

  -- Скрыт до приёмки: страница создаёт товар уже скрытым, здесь — чтобы
  -- строка с флагом и видимый товар не разошлись
  IF v_show AND v_product.is_active THEN
    UPDATE products SET is_active = false WHERE id = v_product.id;
  END IF;

  UPDATE supplier_orders SET updated_at = now() WHERE id = v_order_id;
  SELECT count(*) INTO v_positions FROM supplier_order_items WHERE order_id = v_order_id;
  RETURN jsonb_build_object('id', v_order_id, 'number', v_number, 'positions', v_positions, 'created', v_created);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_add_to_supplier_draft(uuid, integer, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_to_supplier_draft(uuid, integer, uuid, boolean) TO service_role;

-- ── 3. Состав формирующегося заказа ─────────────────────────────────────────
-- p_items: [{"line_id": "<uuid строки>", "quantity": N}, …]; N = 0 — убрать.
-- По строке, а не по товару: строку удалённого товара (product_id = NULL)
-- тоже можно убрать.
CREATE FUNCTION public.admin_edit_supplier_draft(
  p_order_id uuid,
  p_items jsonb,
  p_admin_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order supplier_orders%ROWTYPE;
  v_left integer;
BEGIN
  IF (SELECT role FROM profiles WHERE id = p_admin_id) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Менять заказ поставщику может только администратор';
  END IF;
  SELECT * INTO v_order FROM supplier_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Заказ не найден';
  END IF;
  IF v_order.status <> 'draft' THEN
    RAISE EXCEPTION 'Заказ №% уже отправлен поставщику — его состав не меняется', v_order.number;
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Не переданы строки заказа';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_items) AS r(line_id uuid, quantity integer)
             WHERE r.line_id IS NULL OR r.quantity IS NULL OR r.quantity NOT BETWEEN 0 AND 9999) THEN
    RAISE EXCEPTION 'Количество в заказе — от 0 до 9999';
  END IF;
  IF (SELECT count(*) - count(DISTINCT r.line_id)
      FROM jsonb_to_recordset(p_items) AS r(line_id uuid, quantity integer)) > 0 THEN
    RAISE EXCEPTION 'Строка повторяется';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_items) AS r(line_id uuid, quantity integer)
             WHERE NOT EXISTS (SELECT 1 FROM supplier_order_items i WHERE i.id = r.line_id AND i.order_id = p_order_id)) THEN
    RAISE EXCEPTION 'Строки нет в заказе №%', v_order.number;
  END IF;

  UPDATE supplier_order_items i SET quantity = r.quantity
  FROM jsonb_to_recordset(p_items) AS r(line_id uuid, quantity integer)
  WHERE i.id = r.line_id AND i.order_id = p_order_id AND r.quantity > 0;
  DELETE FROM supplier_order_items i
  USING jsonb_to_recordset(p_items) AS r(line_id uuid, quantity integer)
  WHERE i.id = r.line_id AND i.order_id = p_order_id AND r.quantity = 0;

  SELECT count(*) INTO v_left FROM supplier_order_items WHERE order_id = p_order_id;
  IF v_left = 0 THEN
    DELETE FROM supplier_orders WHERE id = p_order_id;
  ELSE
    UPDATE supplier_orders SET updated_at = now() WHERE id = p_order_id;
  END IF;
  RETURN jsonb_build_object('id', p_order_id, 'number', v_order.number, 'positions', v_left, 'deleted', v_left = 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_edit_supplier_draft(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_edit_supplier_draft(uuid, jsonb, uuid) TO service_role;

-- ── 4. «Заказано» ────────────────────────────────────────────────────────────
-- Дата — не раньше сегодняшнего дня по Алматы и не дальше года; NULL — без даты
CREATE FUNCTION public.admin_place_supplier_order(
  p_order_id uuid,
  p_expected_at date,
  p_admin_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order supplier_orders%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Almaty')::date;
BEGIN
  IF (SELECT role FROM profiles WHERE id = p_admin_id) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Заказывать у поставщика может только администратор';
  END IF;
  SELECT * INTO v_order FROM supplier_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Заказ не найден';
  END IF;
  IF v_order.status <> 'draft' THEN
    RAISE EXCEPTION 'Заказ №% уже отправлен поставщику', v_order.number;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supplier_order_items WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'Заказ пуст';
  END IF;
  IF p_expected_at < v_today THEN
    RAISE EXCEPTION 'Дата поставки уже прошла — укажите сегодняшнюю или позже';
  END IF;
  IF p_expected_at > v_today + 366 THEN
    RAISE EXCEPTION 'Дата поставки — не дальше года';
  END IF;

  -- Товар могли поправить, пока заказ копился: поставщик получает сегодняшнее
  UPDATE supplier_order_items i
  SET product_name = btrim(p.name), sku = NULLIF(btrim(p.sku), ''), cost_price = NULLIF(p.cost_price, 0)
  FROM products p
  WHERE i.order_id = p_order_id AND p.id = i.product_id;

  UPDATE supplier_orders
  SET status = 'ordered', ordered_at = now(), expected_at = p_expected_at, updated_at = now()
  WHERE id = p_order_id;
  RETURN jsonb_build_object('id', p_order_id, 'number', v_order.number, 'status', 'ordered', 'expected_at', p_expected_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_place_supplier_order(uuid, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_place_supplier_order(uuid, date, uuid) TO service_role;

-- ── 5. Дата поставки — поправить ─────────────────────────────────────────────
CREATE FUNCTION public.admin_set_supplier_order_expected(
  p_order_id uuid,
  p_expected_at date,
  p_admin_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order supplier_orders%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Almaty')::date;
BEGIN
  IF (SELECT role FROM profiles WHERE id = p_admin_id) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Менять заказ поставщику может только администратор';
  END IF;
  SELECT * INTO v_order FROM supplier_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Заказ не найден';
  END IF;
  IF v_order.status NOT IN ('draft', 'ordered', 'in_transit') THEN
    RAISE EXCEPTION 'Заказ №% закрыт — дату не поменять', v_order.number;
  END IF;
  IF p_expected_at < v_today THEN
    RAISE EXCEPTION 'Дата поставки уже прошла — укажите сегодняшнюю или позже';
  END IF;
  IF p_expected_at > v_today + 366 THEN
    RAISE EXCEPTION 'Дата поставки — не дальше года';
  END IF;
  UPDATE supplier_orders SET expected_at = p_expected_at, updated_at = now() WHERE id = p_order_id;
  RETURN jsonb_build_object('id', p_order_id, 'number', v_order.number, 'expected_at', p_expected_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_supplier_order_expected(uuid, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_supplier_order_expected(uuid, date, uuid) TO service_role;

-- ── 6. Приёмка — показ скрытого товара ──────────────────────────────────────
-- Тело — с боя (pg_get_functiondef 26.11.2026); добавлено: отказ по
-- формирующемуся, is_active и show_on_receipt, shown в ответе
CREATE OR REPLACE FUNCTION public.admin_receive_supplier_order(
  p_order_id uuid,
  p_items jsonb,
  p_admin_id uuid,
  p_close boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order supplier_orders%ROWTYPE;
  v_item record;
  v_before integer;
  v_active boolean;
  v_slug text;
  v_show boolean;
  v_waiting integer;
  v_notified integer := 0;
  v_units integer := 0;
  v_done boolean;
  v_status text;
  v_received jsonb := '[]'::jsonb;
  v_shown jsonb := '[]'::jsonb;
BEGIN
  IF (SELECT role FROM profiles WHERE id = p_admin_id) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Принимать товар может только администратор';
  END IF;
  SELECT * INTO v_order FROM supplier_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Заказ не найден';
  END IF;
  IF v_order.status = 'draft' THEN
    RAISE EXCEPTION 'Заказ №% ещё не отправлен поставщику — сначала «Заказано»', v_order.number;
  END IF;
  IF v_order.status NOT IN ('ordered', 'in_transit') THEN
    RAISE EXCEPTION 'Заказ №% уже закрыт', v_order.number;
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Не переданы строки приёмки';
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_items) AS r(product_id uuid, quantity integer)
             WHERE r.product_id IS NULL OR r.quantity IS NULL OR r.quantity NOT BETWEEN 0 AND 9999) THEN
    RAISE EXCEPTION 'Принять можно от 0 до 9999 штук';
  END IF;
  IF (SELECT count(*) - count(DISTINCT r.product_id)
      FROM jsonb_to_recordset(p_items) AS r(product_id uuid, quantity integer)) > 0 THEN
    RAISE EXCEPTION 'Товар повторяется в приёмке';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_items) AS r(product_id uuid, quantity integer)
             WHERE NOT EXISTS (SELECT 1 FROM supplier_order_items i
                               WHERE i.order_id = p_order_id AND i.product_id = r.product_id)) THEN
    RAISE EXCEPTION 'В приёмке товар не из заказа №%', v_order.number;
  END IF;
  IF NOT p_close AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_items) AS r(product_id uuid, quantity integer)
                                 WHERE r.quantity > 0) THEN
    RAISE EXCEPTION 'Не указано, сколько пришло';
  END IF;

  -- Порядок по id товара — две приёмки сразу не встанут друг другу поперёк
  FOR v_item IN SELECT r.product_id, r.quantity
                FROM jsonb_to_recordset(p_items) AS r(product_id uuid, quantity integer)
                WHERE r.quantity > 0 ORDER BY r.product_id LOOP
    SELECT stock_quantity, is_active, slug INTO v_before, v_active, v_slug
    FROM products WHERE id = v_item.product_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Товар из заказа №% удалён — принять его нельзя', v_order.number;
    END IF;
    -- Подписки снимет trigger_back_in_stock — считаем, пока они есть
    v_waiting := CASE WHEN v_before = 0
      THEN (SELECT count(*) FROM stock_alerts WHERE product_id = v_item.product_id) ELSE 0 END;
    -- Новый товар из «На сайт» скрыт до первой приёмки (26.11.2026): пришёл — на сайт
    SELECT show_on_receipt INTO v_show FROM supplier_order_items
    WHERE order_id = p_order_id AND product_id = v_item.product_id;

    UPDATE products SET stock_quantity = v_before + v_item.quantity, is_active = is_active OR v_show
    WHERE id = v_item.product_id;
    INSERT INTO stock_receipts (order_id, product_id, quantity, stock_before, stock_after, received_by)
    VALUES (p_order_id, v_item.product_id, v_item.quantity, v_before, v_before + v_item.quantity, p_admin_id);
    UPDATE supplier_order_items SET received_quantity = received_quantity + v_item.quantity, show_on_receipt = false
    WHERE order_id = p_order_id AND product_id = v_item.product_id;

    IF v_show AND NOT v_active THEN
      v_shown := v_shown || jsonb_build_object('product_id', v_item.product_id, 'slug', v_slug);
    END IF;
    v_notified := v_notified + v_waiting;
    v_units := v_units + v_item.quantity;
    v_received := v_received || jsonb_build_object(
      'product_id', v_item.product_id,
      'quantity', v_item.quantity,
      'stock_before', v_before,
      'stock_after', v_before + v_item.quantity,
      'notified', v_waiting);
  END LOOP;

  SELECT bool_and(received_quantity >= quantity) INTO v_done
  FROM supplier_order_items WHERE order_id = p_order_id AND product_id IS NOT NULL;

  IF coalesce(v_done, true) OR p_close THEN
    IF NOT EXISTS (SELECT 1 FROM supplier_order_items WHERE order_id = p_order_id AND received_quantity > 0) THEN
      RAISE EXCEPTION 'По заказу №% ничего не принято — его можно отменить', v_order.number;
    END IF;
    v_status := 'received';
    UPDATE supplier_orders
    SET status = 'received', shipped_at = coalesce(shipped_at, now()), closed_at = now(), updated_at = now()
    WHERE id = p_order_id;
  ELSE
    -- Пришла часть — заказ в пути, ждём остальное
    v_status := 'in_transit';
    UPDATE supplier_orders
    SET status = 'in_transit', shipped_at = coalesce(shipped_at, now()), updated_at = now()
    WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object(
    'id', p_order_id,
    'number', v_order.number,
    'status', v_status,
    'units', v_units,
    'notified', v_notified,
    'received', v_received,
    'shown', v_shown);
END;
$function$;

-- ── 7. Проверка результата ───────────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('admin_add_to_supplier_draft', 'admin_edit_supplier_draft', 'admin_place_supplier_order',
                      'admin_set_supplier_order_expected', 'admin_receive_supplier_order',
                      'admin_create_supplier_order', 'admin_set_supplier_order_status')) <> 7 THEN
    RAISE EXCEPTION 'функции заказов поставщикам — не по одной версии';
  END IF;
  IF position('show_on_receipt' IN pg_get_functiondef('public.admin_receive_supplier_order(uuid, jsonb, uuid, boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'admin_receive_supplier_order не обновилась';
  END IF;
  IF EXISTS (SELECT 1 FROM public.supplier_orders WHERE (status = 'draft') <> (ordered_at IS NULL)) THEN
    RAISE EXCEPTION 'ordered_at расходится со статусом';
  END IF;
  IF has_function_privilege('anon', 'public.admin_add_to_supplier_draft(uuid, integer, uuid, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_place_supplier_order(uuid, date, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_edit_supplier_draft(uuid, jsonb, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_set_supplier_order_expected(uuid, date, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_receive_supplier_order(uuid, jsonb, uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'функции заказов открыты не только ключу сервиса';
  END IF;
END $$;
