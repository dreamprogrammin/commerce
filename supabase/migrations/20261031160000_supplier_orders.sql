-- ============================================================================
-- Заказы поставщикам и приёмка — «К закупке», шаг 2.
--
-- Зачем (31 октября 2026). Шаг 1 собирал заказ поставщику в браузере: текст —
-- в WhatsApp, а сам заказ нигде не оставался. Заказанный товар оставался на
-- пороге, пока не придёт, — его можно было заказать второй раз; пришедший
-- товар пополнял остаток только правкой в карточке, по одному и без следа.
-- Шаг 2 из предложенного порядка 2 → 3 → 4 — по слову владельца («давай
-- продолжай», 31.10).
--
-- Как устроено:
--   * supplier_orders — заказ поставщику, supplier_order_items — его строки
--     (название, артикул и закупочная цена — снимок на момент заказа: так
--     заказ и ушёл поставщику), stock_receipts — журнал приёмки: что,
--     сколько, кто принял, остаток до и после;
--   * статусы: ordered («Заказал») → in_transit («В пути») → received
--     («Принят»); cancelled — отменён, пока ничего не принято. Принимать
--     можно частями: заказ закрывается, когда принято всё, или вручную —
--     «остального не будет»;
--   * приёмка прибавляет остаток к текущему (строка товара под блокировкой) —
--     касса и сайт, списывающие в ту же секунду, не теряются. Триггеры
--     products срабатывают как при любой правке остатка:
--     `trigger_back_in_stock` при 0 → N шлёт «Товар снова в наличии»
--     подписавшимся и снимает подписки — это и нужно; функция возвращает,
--     скольких это коснулось, а страница предупреждает до приёмки;
--   * всё — функциями admin_*, EXECUTE только у service_role: их зовут
--     серверные маршруты `/api/admin/restock/orders*` после `requireAdmin`;
--     кто сделал — параметром, сверяется с profiles.role. Таблицы закрыты
--     RLS без политик: читает их тот же сервер ключом сервиса.
-- ============================================================================

-- ── 0. Состояние базы ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.supplier_orders') IS NOT NULL THEN
    RAISE EXCEPTION 'supplier_orders уже существует — миграция применялась?';
  END IF;
  IF to_regclass('public.suppliers') IS NULL THEN
    RAISE EXCEPTION 'нет таблицы suppliers';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'products'
        AND column_name IN ('stock_quantity', 'supplier_id', 'cost_price', 'sku')) <> 4 THEN
    RAISE EXCEPTION 'у products нет stock_quantity / supplier_id / cost_price / sku';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.products'::regclass AND tgname = 'trigger_back_in_stock') THEN
    RAISE EXCEPTION 'нет trigger_back_in_stock — комментарии и страница рассчитаны на него';
  END IF;
END $$;

-- ── 1. Таблицы ──────────────────────────────────────────────────────────────
CREATE TABLE public.supplier_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Номер для людей: «заказ №12» в переписке с поставщиком
  number integer GENERATED ALWAYS AS IDENTITY UNIQUE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'ordered'
    CHECK (status IN ('ordered', 'in_transit', 'received', 'cancelled')),
  note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  shipped_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supplier_orders_supplier_status ON public.supplier_orders (supplier_id, status);

CREATE TABLE public.supplier_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.supplier_orders(id) ON DELETE CASCADE,
  -- Удалили товар — строка остаётся в истории со снимком названия
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  sku text,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 9999),
  received_quantity integer NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  -- NULL — закупочная цена не была заполнена (0 в products)
  cost_price numeric CHECK (cost_price IS NULL OR cost_price > 0),
  UNIQUE (order_id, product_id)
);
CREATE INDEX supplier_order_items_product ON public.supplier_order_items (product_id);

CREATE TABLE public.stock_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.supplier_orders(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  stock_before integer NOT NULL,
  stock_after integer NOT NULL,
  received_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_receipts_order ON public.stock_receipts (order_id);
CREATE INDEX stock_receipts_product ON public.stock_receipts (product_id, received_at DESC);

ALTER TABLE public.supplier_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_orders, public.supplier_order_items, public.stock_receipts FROM anon, authenticated;

COMMENT ON TABLE public.supplier_orders IS
  'Заказы поставщикам («К закупке», шаг 2). Политик нет: пишут функции admin_*_supplier_order*, читает сервер ключом сервиса.';
COMMENT ON TABLE public.stock_receipts IS
  'Журнал приёмки товара: кто, когда, сколько; остаток до и после.';

-- ── 2. Заказ из черновика — «Заказал» ───────────────────────────────────────
-- p_items: [{"product_id": "<uuid>", "quantity": N}, …]
CREATE FUNCTION public.admin_create_supplier_order(
  p_supplier_id uuid,
  p_items jsonb,
  p_admin_id uuid,
  p_note text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order_id uuid;
  v_number integer;
  v_count integer;
  v_bad text;
BEGIN
  IF (SELECT role FROM profiles WHERE id = p_admin_id) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Заказывать у поставщика может только администратор';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM suppliers WHERE id = p_supplier_id) THEN
    RAISE EXCEPTION 'Поставщик не найден';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Заказ пуст';
  END IF;
  IF jsonb_array_length(p_items) > 300 THEN
    RAISE EXCEPTION 'В заказе больше 300 позиций';
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity integer)
             WHERE i.product_id IS NULL OR i.quantity IS NULL OR i.quantity NOT BETWEEN 1 AND 9999) THEN
    RAISE EXCEPTION 'Количество в заказе — от 1 до 9999';
  END IF;
  IF (SELECT count(*) - count(DISTINCT i.product_id)
      FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity integer)) > 0 THEN
    RAISE EXCEPTION 'Товар повторяется в заказе';
  END IF;
  SELECT string_agg(coalesce(p.name, i.product_id::text), ', ') INTO v_bad
  FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity integer)
  LEFT JOIN products p ON p.id = i.product_id
  WHERE p.id IS NULL OR p.supplier_id IS DISTINCT FROM p_supplier_id;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Не товары этого поставщика: %', v_bad;
  END IF;

  INSERT INTO supplier_orders (supplier_id, note, created_by)
  VALUES (p_supplier_id, NULLIF(btrim(p_note), ''), p_admin_id)
  RETURNING id, number INTO v_order_id, v_number;

  INSERT INTO supplier_order_items (order_id, product_id, product_name, sku, quantity, cost_price)
  SELECT v_order_id, p.id, btrim(p.name), NULLIF(btrim(p.sku), ''), i.quantity, NULLIF(p.cost_price, 0)
  FROM jsonb_to_recordset(p_items) AS i(product_id uuid, quantity integer)
  JOIN products p ON p.id = i.product_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('id', v_order_id, 'number', v_number, 'positions', v_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_create_supplier_order(uuid, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_supplier_order(uuid, jsonb, uuid, text) TO service_role;

-- ── 3. Статус — «В пути», «Отменить», «Закрыть» ─────────────────────────────
--   in_transit — из ordered; ordered — назад из in_transit (нажали по ошибке);
--   cancelled  — пока ничего не принято; received — закрыть частично
--   принятый («остального не будет»). Полностью принятый закрывается сам.
CREATE FUNCTION public.admin_set_supplier_order_status(
  p_order_id uuid,
  p_status text,
  p_admin_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order supplier_orders%ROWTYPE;
  v_received integer;
BEGIN
  IF (SELECT role FROM profiles WHERE id = p_admin_id) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Менять заказ поставщику может только администратор';
  END IF;
  SELECT * INTO v_order FROM supplier_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Заказ не найден';
  END IF;
  IF v_order.status NOT IN ('ordered', 'in_transit') THEN
    RAISE EXCEPTION 'Заказ №% уже закрыт', v_order.number;
  END IF;
  SELECT coalesce(sum(received_quantity), 0) INTO v_received FROM supplier_order_items WHERE order_id = p_order_id;

  IF p_status = 'in_transit' AND v_order.status = 'ordered' THEN
    UPDATE supplier_orders SET status = 'in_transit', shipped_at = now(), updated_at = now() WHERE id = p_order_id;
  ELSIF p_status = 'ordered' AND v_order.status = 'in_transit' AND v_received = 0 THEN
    UPDATE supplier_orders SET status = 'ordered', shipped_at = NULL, updated_at = now() WHERE id = p_order_id;
  ELSIF p_status = 'cancelled' AND v_received = 0 THEN
    UPDATE supplier_orders SET status = 'cancelled', closed_at = now(), updated_at = now() WHERE id = p_order_id;
  ELSIF p_status = 'received' AND v_received > 0 THEN
    UPDATE supplier_orders SET status = 'received', closed_at = now(), updated_at = now() WHERE id = p_order_id;
  ELSIF p_status = 'cancelled' THEN
    RAISE EXCEPTION 'Часть заказа №% уже принята — его можно только закрыть', v_order.number;
  ELSIF p_status = 'received' THEN
    RAISE EXCEPTION 'По заказу №% ещё ничего не принято', v_order.number;
  ELSE
    RAISE EXCEPTION 'Заказ №%: нельзя перейти из % в %', v_order.number, v_order.status, p_status;
  END IF;

  RETURN jsonb_build_object('id', p_order_id, 'status', p_status);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_supplier_order_status(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_supplier_order_status(uuid, text, uuid) TO service_role;

-- ── 4. Приёмка — «Принять» ──────────────────────────────────────────────────
-- p_items: [{"product_id": "<uuid>", "quantity": N}, …], N — сколько пришло
-- сейчас (0 — не пришло). Больше заказанного — можно: поставщик доложил.
-- p_close — «остального не будет»: закрыть, даже если принято не всё.
CREATE FUNCTION public.admin_receive_supplier_order(
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
  v_waiting integer;
  v_notified integer := 0;
  v_units integer := 0;
  v_done boolean;
  v_status text;
  v_received jsonb := '[]'::jsonb;
BEGIN
  IF (SELECT role FROM profiles WHERE id = p_admin_id) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Принимать товар может только администратор';
  END IF;
  SELECT * INTO v_order FROM supplier_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Заказ не найден';
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
    SELECT stock_quantity INTO v_before FROM products WHERE id = v_item.product_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Товар из заказа №% удалён — принять его нельзя', v_order.number;
    END IF;
    -- Подписки снимет trigger_back_in_stock — считаем, пока они есть
    v_waiting := CASE WHEN v_before = 0
      THEN (SELECT count(*) FROM stock_alerts WHERE product_id = v_item.product_id) ELSE 0 END;

    UPDATE products SET stock_quantity = v_before + v_item.quantity WHERE id = v_item.product_id;
    INSERT INTO stock_receipts (order_id, product_id, quantity, stock_before, stock_after, received_by)
    VALUES (p_order_id, v_item.product_id, v_item.quantity, v_before, v_before + v_item.quantity, p_admin_id);
    UPDATE supplier_order_items SET received_quantity = received_quantity + v_item.quantity
    WHERE order_id = p_order_id AND product_id = v_item.product_id;

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
    'received', v_received);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_receive_supplier_order(uuid, jsonb, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_receive_supplier_order(uuid, jsonb, uuid, boolean) TO service_role;

-- ── 5. Ровно одна версия каждой ─────────────────────────────────────────────
DO $$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['admin_create_supplier_order', 'admin_set_supplier_order_status', 'admin_receive_supplier_order'] LOOP
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = v_name) <> 1 THEN
      RAISE EXCEPTION '% — не одна версия', v_name;
    END IF;
  END LOOP;
END $$;
