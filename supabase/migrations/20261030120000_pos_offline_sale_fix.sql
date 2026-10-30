-- ============================================================================
-- Офлайн-касса: продажа покупателю работает, цена — как на сайте, бонусы —
-- с историей и активацией.
--
-- Зачем (30 октября 2026). Найдено при подготовке страницы «Пользователи»:
--   1. Продажа с привязанным покупателем падала всегда: позиции писались в
--      колонки `order_items.price_per_item` и `bonus_points_per_item`, которых
--      в боевой таблице нет (есть `price_at_purchase`). На 30 октября в базе
--      ни одной офлайн-продажи покупателю. Проверено запуском на локальной
--      базе, где функция совпадает с боевой по md5.
--   2. Касса считала по `price`, без скидки: LEGO 60410 на сайте 7 990 ₸, в
--      кассе 8 990 ₸. Владелец 30 октября: «нужно сделать как на сайте» —
--      теперь `final_price`, та же цена, что видит покупатель на сайте.
--   3. Бонусы покупателя менялись в профиле без записи в историю, а заказ
--      оставался в статусе `new` без `bonuses_activation_date` — ежедневная
--      активация (`activate_pending_bonuses`) берёт только заказы со статусом
--      от `confirmed` и с датой активации, так что бонусы за покупку в кассе
--      висели бы «в ожидании» навсегда. Теперь как у заказа с сайта: история
--      (`spent`, `welcome`, `pending`), дата активации через 14 дней; продажа
--      в кассе оплачена на месте — статус `completed`.
--
--   4. Поиск покупателя по телефону (`get_profile_by_phone`) падал всегда:
--      функция объявляет бонусы `numeric`, а в `profiles` они `integer` —
--      «structure of query does not match function result type». Искал он
--      ещё и только точное совпадение записи («+7 (702)…» ≠ «8702…»). И был
--      открыт всем, включая anon, без проверки, что спрашивает администратор:
--      починенный, он отдавал бы любому имя и бонусы человека по номеру.
--      Теперь — только администратору, сравнение по цифрам, «8…» = «+7…».
--
-- Что не меняется: продажа без покупателя (в `guest_checkouts`) — только цена;
-- правило «1000 приветственных за первый заказ» — как было, плюс запись в
-- историю. Уведомление в Telegram офлайн-заказы и раньше пропускали
-- (`notify_user_order_to_telegram`, проверка `source = 'offline'`).
--
-- `search_products_for_pos`: в `price` теперь цена продажи (со скидкой), полная —
-- в новой колонке `full_price`. Так ещё не выкаченная касса на `master` сразу
-- показывает ту цену, которую возьмёт функция продажи. Тип возврата меняется —
-- поэтому DROP и CREATE с прежними правами, а не CREATE OR REPLACE.
--
-- Тела сняты с прода 30 октября 2026 (`pg_get_functiondef`); перед заменой —
-- сверка md5, при расхождении миграция падает, ничего не тронув.
-- ============================================================================

-- ── 0. Состояние базы — то, под которое всё готовилось ──────────────────────
DO $$
BEGIN
  IF (SELECT md5(pg_get_functiondef('public.create_offline_sale(jsonb, text, uuid, integer)'::regprocedure)))
       IS DISTINCT FROM 'a48b8ca21614687e02c27b7455ed4590' THEN
    RAISE EXCEPTION 'create_offline_sale отличается от снятой с прода 30.10.2026 — миграция не для этой базы';
  END IF;
  IF (SELECT md5(pg_get_functiondef('public.search_products_for_pos(text)'::regprocedure)))
       IS DISTINCT FROM '5fd8504a2c7ba9172720f31793968148' THEN
    RAISE EXCEPTION 'search_products_for_pos отличается от снятой с прода 30.10.2026 — миграция не для этой базы';
  END IF;
  IF (SELECT md5(pg_get_functiondef('public.get_profile_by_phone(text)'::regprocedure)))
       IS DISTINCT FROM '88e3a8c1b142c45748a736de8505eaa3' THEN
    RAISE EXCEPTION 'get_profile_by_phone отличается от снятой с прода 30.10.2026 — миграция не для этой базы';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'price_at_purchase'
  ) THEN
    RAISE EXCEPTION 'нет order_items.price_at_purchase';
  END IF;
END $$;

-- ── 1. Поиск товаров для кассы: цена продажи и полная ───────────────────────
DROP FUNCTION public.search_products_for_pos(text);

CREATE FUNCTION public.search_products_for_pos(p_query text)
 RETURNS TABLE(id uuid, name text, price numeric, full_price numeric, stock_quantity integer, bonus_points_award integer, barcode text, image_url text, blur_placeholder text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    -- Цена продажи — как на сайте, со скидкой
    COALESCE(p.final_price, p.price) AS price,
    p.price AS full_price,
    p.stock_quantity,
    COALESCE(p.bonus_points_award, 0) AS bonus_points_award,
    p.barcode,
    pi.image_url,
    pi.blur_placeholder
  FROM public.products p
  LEFT JOIN LATERAL (
    SELECT pi2.image_url, pi2.blur_placeholder
    FROM public.product_images pi2
    WHERE pi2.product_id = p.id
    ORDER BY pi2.display_order ASC
    LIMIT 1
  ) pi ON TRUE
  WHERE
    p.is_active = TRUE
    AND p.stock_quantity > 0
    AND (
      p.name ILIKE '%' || p_query || '%'
      OR p.barcode = p_query
    )
  ORDER BY
    CASE WHEN p.barcode = p_query THEN 0 ELSE 1 END,
    p.name ASC
  LIMIT 30;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.search_products_for_pos(text) TO anon, authenticated, service_role;

-- ── 1б. Покупатель по телефону — только администратору, по цифрам номера ───
DROP FUNCTION public.get_profile_by_phone(text);

CREATE FUNCTION public.get_profile_by_phone(p_phone text)
 RETURNS TABLE(id uuid, first_name text, last_name text, phone text, active_bonus_balance integer, pending_bonus_balance integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_digits text := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
BEGIN
  IF (SELECT role FROM public.profiles WHERE profiles.id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Доступ запрещён: только администраторы ищут покупателей по телефону';
  END IF;

  -- «8 702…», «+7 (702)…» и «702…» — один номер: к виду 7XXXXXXXXXX
  IF length(v_digits) = 11 AND left(v_digits, 1) = '8' THEN
    v_digits := '7' || substr(v_digits, 2);
  ELSIF length(v_digits) = 10 THEN
    v_digits := '7' || v_digits;
  END IF;
  IF length(v_digits) <> 11 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT pr.id, pr.first_name, pr.last_name, pr.phone, pr.active_bonus_balance, pr.pending_bonus_balance
  FROM public.profiles pr
  WHERE CASE
          WHEN length(regexp_replace(COALESCE(pr.phone, ''), '\D', '', 'g')) = 10
            THEN '7' || regexp_replace(pr.phone, '\D', '', 'g')
          WHEN regexp_replace(COALESCE(pr.phone, ''), '\D', '', 'g') ~ '^8\d{10}$'
            THEN '7' || substr(regexp_replace(pr.phone, '\D', '', 'g'), 2)
          ELSE regexp_replace(COALESCE(pr.phone, ''), '\D', '', 'g')
        END = v_digits
  ORDER BY pr.created_at
  LIMIT 1;
END;
$function$;

-- Права — как были: зовёт касса в браузере администратора (authenticated)
GRANT EXECUTE ON FUNCTION public.get_profile_by_phone(text) TO anon, authenticated, service_role;

-- ── 2. Продажа ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_offline_sale(p_cart_items jsonb, p_payment_method text DEFAULT 'cash'::text, p_profile_id uuid DEFAULT NULL::uuid, p_bonuses_to_spend integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_profile RECORD;
  v_cart_item RECORD;
  v_product RECORD;
  v_total_price NUMERIC := 0;
  v_total_bonus_award INTEGER := 0;
  v_calculated_discount NUMERIC := 0;
  v_final_price NUMERIC;
  v_bonus_rate NUMERIC;
  v_order_id UUID;
  v_checkout_id UUID;
  v_is_first_order BOOLEAN;
  v_active INTEGER;
  v_pending INTEGER;
BEGIN
  -- Проверяем что вызывает администратор
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Доступ запрещён: только администраторы могут создавать оффлайн-продажи';
  END IF;

  -- Проверяем наличие товаров и считаем сумму
  FOR v_cart_item IN
    SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER)
  LOOP
    SELECT id, COALESCE(final_price, price) AS price, stock_quantity, bonus_points_award, is_active
    INTO v_product
    FROM public.products
    WHERE id = v_cart_item.product_id;

    IF v_product IS NULL OR NOT v_product.is_active THEN
      RAISE EXCEPTION 'Товар не найден или неактивен: %', v_cart_item.product_id;
    END IF;

    IF v_product.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара на складе. Доступно: % шт.', v_product.stock_quantity;
    END IF;

    v_total_price := v_total_price + (v_product.price * v_cart_item.quantity);
    v_total_bonus_award := v_total_bonus_award
      + (COALESCE(v_product.bonus_points_award, 0) * v_cart_item.quantity);
  END LOOP;

  -- === ПРОДАЖА С ЗАРЕГИСТРИРОВАННЫМ КЛИЕНТОМ ===
  IF p_profile_id IS NOT NULL THEN

    SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
    IF v_profile IS NULL THEN
      RAISE EXCEPTION 'Профиль клиента не найден';
    END IF;

    -- Проверяем и применяем бонусы
    IF p_bonuses_to_spend > 0 THEN
      IF v_profile.active_bonus_balance < p_bonuses_to_spend THEN
        RAISE EXCEPTION 'Недостаточно бонусов. Доступно: %', v_profile.active_bonus_balance;
      END IF;

      SELECT COALESCE((value->>'bonus_conversion_rate')::NUMERIC, 1.0)
      INTO v_bonus_rate FROM public.settings WHERE key = 'bonus_system';

      v_calculated_discount := p_bonuses_to_spend * COALESCE(v_bonus_rate, 1.0);
    END IF;

    v_final_price := GREATEST(v_total_price - v_calculated_discount, 0);

    -- Проверяем первый ли заказ у клиента
    SELECT NOT EXISTS(SELECT 1 FROM public.orders WHERE user_id = p_profile_id)
    INTO v_is_first_order;

    -- Создаём заказ. Оплачен на месте — сразу `completed`; дата активации
    -- бонусов — как у заказа с сайта, через 14 дней
    INSERT INTO public.orders (
      user_id, total_amount, discount_amount, final_amount,
      bonuses_spent, bonuses_awarded, bonuses_activation_date,
      delivery_method, payment_method, status, source
    )
    VALUES (
      p_profile_id,
      v_total_price,
      v_calculated_discount,
      v_final_price,
      p_bonuses_to_spend,
      v_total_bonus_award,
      NOW() + INTERVAL '14 days',
      'pickup',
      p_payment_method,
      'completed',
      'offline'
    )
    RETURNING id INTO v_order_id;

    -- Добавляем позиции
    FOR v_cart_item IN
      SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER)
    LOOP
      SELECT COALESCE(final_price, price) AS price INTO v_product FROM public.products WHERE id = v_cart_item.product_id;

      INSERT INTO public.order_items (order_id, product_id, quantity, price_at_purchase)
      VALUES (
        v_order_id,
        v_cart_item.product_id,
        v_cart_item.quantity,
        v_product.price
      );

      -- Списываем остаток
      UPDATE public.products
      SET stock_quantity = stock_quantity - v_cart_item.quantity
      WHERE id = v_cart_item.product_id;
    END LOOP;

    -- Списываем потраченные бонусы
    IF p_bonuses_to_spend > 0 THEN
      UPDATE public.profiles
      SET active_bonus_balance = active_bonus_balance - p_bonuses_to_spend
      WHERE id = p_profile_id
      RETURNING active_bonus_balance, pending_bonus_balance INTO v_active, v_pending;

      INSERT INTO public.bonus_transactions (
        profile_id, order_id, transaction_type, amount,
        balance_after, pending_balance_after, description, status
      ) VALUES (
        p_profile_id, v_order_id, 'spent', -p_bonuses_to_spend,
        v_active, v_pending, 'Списание бонусов за покупку в магазине', 'completed'
      );
    END IF;

    -- Начисляем 1000 приветственных бонусов за первый заказ
    IF v_is_first_order AND NOT COALESCE(v_profile.has_received_welcome_bonus, FALSE) THEN
      UPDATE public.profiles
      SET active_bonus_balance = active_bonus_balance + 1000,
          has_received_welcome_bonus = TRUE
      WHERE id = p_profile_id
      RETURNING active_bonus_balance, pending_bonus_balance INTO v_active, v_pending;

      INSERT INTO public.bonus_transactions (
        profile_id, order_id, transaction_type, amount,
        balance_after, pending_balance_after, description, status
      ) VALUES (
        p_profile_id, v_order_id, 'welcome', 1000,
        v_active, v_pending, 'Приветственные бонусы за первую покупку', 'completed'
      );
    END IF;

    -- Бонусы с товаров → в pending (активируются через 14 дней)
    IF v_total_bonus_award > 0 THEN
      UPDATE public.profiles
      SET pending_bonus_balance = pending_bonus_balance + v_total_bonus_award
      WHERE id = p_profile_id
      RETURNING active_bonus_balance, pending_bonus_balance INTO v_active, v_pending;

      INSERT INTO public.bonus_transactions (
        profile_id, order_id, transaction_type, amount,
        balance_after, pending_balance_after, description, activation_date
      ) VALUES (
        p_profile_id, v_order_id, 'pending', v_total_bonus_award,
        v_active, v_pending, 'Начисление бонусов за покупку в магазине (ожидание активации)',
        NOW() + INTERVAL '14 days'
      );
    END IF;

    RETURN jsonb_build_object(
      'order_id', v_order_id,
      'type', 'user_order',
      'total', v_total_price,
      'discount', v_calculated_discount,
      'final', v_final_price,
      'bonuses_spent', p_bonuses_to_spend,
      'bonuses_awarded', v_total_bonus_award
    );

  -- === АНОНИМНАЯ ПРОДАЖА (без клиента) ===
  ELSE

    v_final_price := v_total_price;

    INSERT INTO public.guest_checkouts (
      guest_name, guest_email, guest_phone,
      total_amount, final_amount,
      delivery_method, payment_method, status, source
    )
    VALUES (
      'Оффлайн покупатель', 'offline@uhti.kz', '',
      v_total_price, v_final_price,
      'pickup', p_payment_method, 'new', 'offline'
    )
    RETURNING id INTO v_checkout_id;

    -- Добавляем позиции
    FOR v_cart_item IN
      SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER)
    LOOP
      SELECT COALESCE(final_price, price) AS price INTO v_product FROM public.products WHERE id = v_cart_item.product_id;

      INSERT INTO public.guest_checkout_items (checkout_id, product_id, quantity, price_per_item)
      VALUES (v_checkout_id, v_cart_item.product_id, v_cart_item.quantity, v_product.price);

      -- Списываем остаток
      UPDATE public.products
      SET stock_quantity = stock_quantity - v_cart_item.quantity
      WHERE id = v_cart_item.product_id;
    END LOOP;

    RETURN jsonb_build_object(
      'order_id', v_checkout_id,
      'type', 'guest_checkout',
      'total', v_total_price,
      'discount', 0,
      'final', v_final_price,
      'bonuses_spent', 0,
      'bonuses_awarded', 0
    );

  END IF;
END;
$function$;

-- ── 3. Ровно по одной версии каждой функции ─────────────────────────────────
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('create_offline_sale', 'search_products_for_pos', 'get_profile_by_phone')) <> 3 THEN
    RAISE EXCEPTION 'после миграции не по одной версии create_offline_sale / search_products_for_pos / get_profile_by_phone';
  END IF;
END $$;
