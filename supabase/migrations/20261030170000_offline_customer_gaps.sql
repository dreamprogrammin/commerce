-- ============================================================================
-- Карточки магазина: три дыры, найденные при их выкатке (30 октября 2026).
--
--   1. Возврат по заказу карточки (до слияния) не отменял её ожидающие
--      бонусы: `process_order_return` смотрел только `user_id`, а у заказа
--      карточки он пуст. Теперь отменяет на карточке — так же, как у аккаунта.
--   2. Приветственные 1000 могли прийти человеку дважды: на карточку в
--      магазине и на аккаунт на сайте. При слиянии, если у аккаунта они уже
--      были, приветственные карточки не переносятся — снимаются из того, что
--      на карточке осталось доступным, со строкой в истории.
--   3. «Продажи», чек и возвраты брали имя и телефон покупателя только из
--      профиля: у заказа карточки они были пустыми, а поиск заказа для
--      возврата по телефону его не находил вовсе (обязательный JOIN профиля).
--
-- Тела функций сняты с прода 30.10.2026 (pg_get_functiondef), сигнатуры не
-- меняются — CREATE OR REPLACE.
-- ============================================================================

DO $$
DECLARE
  v_expected CONSTANT jsonb := '{
    "process_order_return": "1b52e6acca0a626777eecee299ebde5c",
    "admin_merge_offline_customer": "7801d74640358c950ceeda00fef294f5",
    "get_sales_list": "158c81b9ff5796cd6e967dd951877af6",
    "get_sale_receipt": "004e418ca6c01c8a32445835212152e6",
    "get_order_for_return": "add619bd353d39608e2311e9ab5170a5",
    "search_orders_for_return": "2ea97bde1e289f8abf1ad61f18b860d6"
  }';
  v_name text;
BEGIN
  FOR v_name IN SELECT jsonb_object_keys(v_expected) LOOP
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = v_name) <> 1 THEN
      RAISE EXCEPTION '% — не одна версия', v_name;
    END IF;
    IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = v_name) IS DISTINCT FROM v_expected ->> v_name THEN
      RAISE EXCEPTION '% отличается от снятой с прода 30.10.2026 — миграция не для этой базы', v_name;
    END IF;
  END LOOP;
END $$;


-- ── 1. Возврат по заказу карточки ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_order_return(p_order_id uuid, p_items jsonb, p_reason text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_source_table TEXT;
  v_order RECORD;
  v_item RECORD;
  v_order_item RECORD;
  v_already_returned INTEGER;
  v_return_id UUID;
  v_total_refund NUMERIC := 0;
  v_total_bonuses_cancel INTEGER := 0;
  v_new_active_balance INTEGER;
  v_new_pending_balance INTEGER;
  v_items_count INTEGER := 0;
BEGIN
  -- 1. Проверяем что вызывает admin
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Доступ запрещён: только администраторы могут оформлять возвраты';
  END IF;

  -- 2. Auto-detect: ищем сначала в orders, потом в guest_checkouts
  SELECT id, status, created_at, user_id, bonuses_awarded, offline_customer_id
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  -- FOUND, а не «IS NOT NULL»: составная запись считается NOT NULL только
  -- когда непусты все поля. В гостевой ветке ниже user_id выбирается как
  -- NULL::UUID, поэтому условие там не срабатывало никогда и v_source_table
  -- оставался пустым — возврат гостевого заказа не работал.
  IF FOUND THEN
    v_source_table := 'orders';
  ELSE
    SELECT id, status, created_at, NULL::UUID AS user_id, 0 AS bonuses_awarded, NULL::UUID AS offline_customer_id
    INTO v_order
    FROM public.guest_checkouts
    WHERE id = p_order_id;

    IF FOUND THEN
      v_source_table := 'guest_checkouts';
    END IF;
  END IF;

  IF v_source_table IS NULL THEN
    RAISE EXCEPTION 'Заказ не найден';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Нельзя оформить возврат: заказ отменён';
  END IF;

  -- 3. Проверяем что возврат в пределах 14 дней
  IF v_order.created_at + INTERVAL '14 days' < NOW() THEN
    RAISE EXCEPTION 'Срок возврата истёк (14 дней с момента заказа)';
  END IF;

  -- 4. Создаём запись возврата
  IF v_source_table = 'orders' THEN
    INSERT INTO public.order_returns (order_id, created_by, reason)
    VALUES (p_order_id, v_caller_id, p_reason)
    RETURNING id INTO v_return_id;
  ELSE
    INSERT INTO public.order_returns (guest_checkout_id, created_by, reason)
    VALUES (p_order_id, v_caller_id, p_reason)
    RETURNING id INTO v_return_id;
  END IF;

  -- 5. Обрабатываем каждую позицию
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INTEGER)
  LOOP
    IF v_source_table = 'orders' THEN
      -- Из order_items
      SELECT oi.product_id, oi.quantity,
             oi.price_at_purchase AS price_per_item,
             COALESCE(pr.bonus_points_award, 0) AS bonus_points_per_item
      INTO v_order_item
      FROM public.order_items oi
      LEFT JOIN public.products pr ON pr.id = oi.product_id
      WHERE oi.order_id = p_order_id AND oi.product_id = v_item.product_id;
    ELSE
      -- Из guest_checkout_items (bonus_points_per_item = 0)
      SELECT product_id, quantity, price_per_item, 0 AS bonus_points_per_item
      INTO v_order_item
      FROM public.guest_checkout_items
      WHERE checkout_id = p_order_id AND product_id = v_item.product_id;
    END IF;

    IF v_order_item IS NULL THEN
      RAISE EXCEPTION 'Товар % не найден в заказе', v_item.product_id;
    END IF;

    -- Проверяем количество с учётом предыдущих возвратов
    SELECT COALESCE(SUM(ori.quantity), 0)::INTEGER
    INTO v_already_returned
    FROM public.order_return_items ori
    JOIN public.order_returns orr ON orr.id = ori.return_id
    WHERE
      CASE
        WHEN v_source_table = 'orders' THEN orr.order_id = p_order_id
        ELSE orr.guest_checkout_id = p_order_id
      END
      AND ori.product_id = v_item.product_id;

    IF v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'Количество возврата должно быть больше 0';
    END IF;

    IF v_item.quantity > (v_order_item.quantity - v_already_returned) THEN
      RAISE EXCEPTION 'Превышено допустимое количество для возврата товара %. Доступно: %',
        v_item.product_id, (v_order_item.quantity - v_already_returned);
    END IF;

    -- Создаём позицию возврата
    INSERT INTO public.order_return_items (
      return_id, product_id, quantity, price_per_item, bonus_points_per_item
    ) VALUES (
      v_return_id,
      v_item.product_id,
      v_item.quantity,
      v_order_item.price_per_item,
      v_order_item.bonus_points_per_item
    );

    -- 6. Восстанавливаем stock
    UPDATE public.products
    SET stock_quantity = stock_quantity + v_item.quantity,
        sales_count = GREATEST(sales_count - v_item.quantity, 0)
    WHERE id = v_item.product_id;

    -- Считаем итоги
    v_total_refund := v_total_refund + (v_order_item.price_per_item * v_item.quantity);
    v_total_bonuses_cancel := v_total_bonuses_cancel + (v_order_item.bonus_points_per_item * v_item.quantity);
    v_items_count := v_items_count + 1;
  END LOOP;

  IF v_items_count = 0 THEN
    RAISE EXCEPTION 'Не указаны позиции для возврата';
  END IF;

  -- 7. Отменяем pending бонусы (только для orders с user_id)
  IF v_source_table = 'orders' AND v_order.user_id IS NOT NULL AND v_total_bonuses_cancel > 0 THEN
    UPDATE public.profiles
    SET pending_bonus_balance = GREATEST(COALESCE(pending_bonus_balance, 0) - v_total_bonuses_cancel, 0)
    WHERE id = v_order.user_id
    RETURNING active_bonus_balance, pending_bonus_balance
    INTO v_new_active_balance, v_new_pending_balance;

    -- Создаём bonus_transaction
    INSERT INTO public.bonus_transactions (
      user_id, order_id, transaction_type, amount,
      balance_after, pending_balance_after,
      description, status
    ) VALUES (
      v_order.user_id,
      p_order_id,
      -- 'return_cancel' не проходит bonus_transactions_transaction_type_check:
      -- такого значения в списке разрешённых нет. Пишем 'refund_earned' —
      -- действующая конвенция для отмены начисленных бонусов (26 записей
      -- против 2 у синонима 'rollback_earned').
      'refund_earned',
      -v_total_bonuses_cancel,
      v_new_active_balance,
      v_new_pending_balance,
      'Бонусы отменены: возврат товара',
      'completed'
    );

    -- Уменьшаем bonuses_awarded в orders
    UPDATE public.orders
    SET bonuses_awarded = GREATEST(COALESCE(bonuses_awarded, 0) - v_total_bonuses_cancel, 0)
    WHERE id = p_order_id;
  END IF;

  -- 7б. Заказ карточки магазина до слияния (30.10.2026): те же ожидающие
  -- бонусы, только на карточке
  IF v_source_table = 'orders' AND v_order.user_id IS NULL
     AND v_order.offline_customer_id IS NOT NULL AND v_total_bonuses_cancel > 0 THEN
    UPDATE public.offline_customers
    SET pending_bonus_balance = GREATEST(pending_bonus_balance - v_total_bonuses_cancel, 0)
    WHERE id = v_order.offline_customer_id
    RETURNING active_bonus_balance, pending_bonus_balance
    INTO v_new_active_balance, v_new_pending_balance;

    INSERT INTO public.bonus_transactions (
      offline_customer_id, order_id, transaction_type, amount,
      balance_after, pending_balance_after, description, status
    ) VALUES (
      v_order.offline_customer_id, p_order_id, 'refund_earned', -v_total_bonuses_cancel,
      v_new_active_balance, v_new_pending_balance, 'Бонусы отменены: возврат товара', 'completed'
    );

    UPDATE public.orders
    SET bonuses_awarded = GREATEST(COALESCE(bonuses_awarded, 0) - v_total_bonuses_cancel, 0)
    WHERE id = p_order_id;
  END IF;

  -- 8. Обновляем запись возврата с итогами
  UPDATE public.order_returns
  SET refund_amount = v_total_refund,
      bonuses_cancelled = v_total_bonuses_cancel
  WHERE id = v_return_id;

  -- 9. Возвращаем результат
  RETURN jsonb_build_object(
    'return_id', v_return_id,
    'order_id', p_order_id,
    'items_count', v_items_count,
    'refund_amount', v_total_refund,
    'bonuses_cancelled', v_total_bonuses_cancel
  );
END;
$function$;

-- ── 2. Слияние: приветственные — одни на человека ───────────────────────────
CREATE OR REPLACE FUNCTION public.admin_merge_offline_customer(p_customer_id uuid, p_profile_id uuid, p_admin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_card RECORD;
  v_orders integer;
  v_active integer;
  v_profile_welcome boolean;
  v_welcome_back integer := 0;
  v_pending integer;
BEGIN
  IF (SELECT role FROM public.profiles WHERE id = p_admin_id) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Объединять может только администратор';
  END IF;

  SELECT * INTO v_card FROM public.offline_customers WHERE id = p_customer_id FOR UPDATE;
  IF v_card IS NULL THEN
    RAISE EXCEPTION 'Карточка не найдена';
  END IF;
  IF v_card.merged_at IS NOT NULL THEN
    RAISE EXCEPTION 'Карточка уже объединена с аккаунтом';
  END IF;

  -- Приветственные — одни на человека (30.10.2026). Если они уже были у
  -- аккаунта, приветственные карточки не переносятся: снимаем их из того,
  -- что на карточке осталось доступным (потраченное не возвращаем).
  SELECT has_received_welcome_bonus INTO v_profile_welcome
  FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF v_profile_welcome AND v_card.has_received_welcome_bonus THEN
    v_welcome_back := LEAST(1000, v_card.active_bonus_balance);
  END IF;

  -- Профиль под блокировкой: баланс меняется вместе с переносом строк
  UPDATE public.profiles
  SET active_bonus_balance = active_bonus_balance + v_card.active_bonus_balance - v_welcome_back,
      pending_bonus_balance = pending_bonus_balance + v_card.pending_bonus_balance,
      has_received_welcome_bonus = has_received_welcome_bonus OR v_card.has_received_welcome_bonus,
      phone = COALESCE(NULLIF(btrim(phone), ''), v_card.phone),
      first_name = COALESCE(NULLIF(btrim(first_name), ''), v_card.first_name),
      last_name = COALESCE(NULLIF(btrim(last_name), ''), v_card.last_name),
      updated_at = now()
  WHERE id = p_profile_id
  RETURNING active_bonus_balance, pending_bonus_balance INTO v_active, v_pending;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Аккаунт не найден';
  END IF;

  -- Заказы и история переходят в аккаунт; ссылка на карточку остаётся —
  -- видно, что покупка была до слияния. Ожидающие бонусы дальше активирует
  -- activate_pending_bonuses, как у заказов с сайта.
  UPDATE public.orders SET user_id = p_profile_id
  WHERE offline_customer_id = p_customer_id AND user_id IS NULL;
  GET DIAGNOSTICS v_orders = ROW_COUNT;

  UPDATE public.bonus_transactions SET user_id = p_profile_id, profile_id = p_profile_id
  WHERE offline_customer_id = p_customer_id AND user_id IS NULL;

  IF v_welcome_back > 0 THEN
    INSERT INTO public.bonus_transactions (
      user_id, profile_id, offline_customer_id, transaction_type, amount,
      balance_after, pending_balance_after, description, status
    ) VALUES (
      p_profile_id, p_profile_id, p_customer_id, 'rollback_earned', -v_welcome_back,
      v_active, v_pending,
      'Приветственные бонусы уже были у аккаунта — повторные с карточки магазина не переносятся',
      'completed'
    );
  END IF;

  UPDATE public.offline_customers
  SET merged_into = p_profile_id, merged_at = now(), merged_by = p_admin_id,
      active_bonus_balance = 0, pending_bonus_balance = 0
  WHERE id = p_customer_id;

  IF v_card.active_bonus_balance + v_card.pending_bonus_balance > 0 OR v_orders > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      p_profile_id, 'bonus_earned', 'Покупки из магазина в вашем аккаунте',
      format('Перенесено покупок: %s, бонусов: %s', v_orders,
             v_card.active_bonus_balance - v_welcome_back + v_card.pending_bonus_balance),
      '/profile/bonuses'
    );
  END IF;

  RETURN jsonb_build_object(
    'orders', v_orders,
    'active_moved', v_card.active_bonus_balance - v_welcome_back,
    'welcome_not_moved', v_welcome_back,
    'pending_moved', v_card.pending_bonus_balance,
    'active_balance', v_active,
    'pending_balance', v_pending
  );
END;
$function$;

-- ── 3. Покупатель карточки в «Продажах», чеке и возвратах ───────────────────
CREATE OR REPLACE FUNCTION public.get_sales_list(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_source text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_search text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_caller_role TEXT;
  v_offset      INTEGER;
  v_total       INTEGER;
  v_items       JSONB;
  v_search      TEXT;
BEGIN
  -- Проверяем права
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Доступ запрещён: только администраторы';
  END IF;

  v_offset := (GREATEST(p_page, 1) - 1) * p_page_size;
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');

  -- Считаем общее количество
  SELECT COUNT(*)::INTEGER INTO v_total
  FROM (
    -- orders
    SELECT o.id, o.created_at, o.status, COALESCE(o.source, 'online') AS source,
           COALESCE(COALESCE(p.first_name, oc.first_name), '') || ' ' || COALESCE(COALESCE(p.last_name, oc.last_name), '') AS customer_name,
           COALESCE(p.phone, oc.phone) AS customer_phone
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.user_id
      LEFT JOIN public.offline_customers oc ON oc.id = o.offline_customer_id
    WHERE
      (p_source IS NULL OR COALESCE(o.source, 'online') = p_source)
      AND (p_status IS NULL OR o.status = p_status)
      AND (p_date_from IS NULL OR o.created_at >= p_date_from)
      AND (p_date_to IS NULL OR o.created_at < p_date_to)
      AND (
        v_search IS NULL
        OR o.id::TEXT ILIKE '%' || v_search || '%'
        OR (COALESCE(COALESCE(p.first_name, oc.first_name), '') || ' ' || COALESCE(COALESCE(p.last_name, oc.last_name), '')) ILIKE '%' || v_search || '%'
        OR COALESCE(COALESCE(p.phone, oc.phone), '') ILIKE '%' || v_search || '%'
      )

    UNION ALL

    -- guest_checkouts
    SELECT gc.id, gc.created_at, gc.status, COALESCE(gc.source, 'online') AS source,
           COALESCE(gc.guest_name, '') AS customer_name,
           gc.guest_phone AS customer_phone
    FROM public.guest_checkouts gc
    WHERE
      (p_source IS NULL OR COALESCE(gc.source, 'online') = p_source)
      AND (p_status IS NULL OR gc.status = p_status)
      AND (p_date_from IS NULL OR gc.created_at >= p_date_from)
      AND (p_date_to IS NULL OR gc.created_at < p_date_to)
      AND (
        v_search IS NULL
        OR gc.id::TEXT ILIKE '%' || v_search || '%'
        OR COALESCE(gc.guest_name, '') ILIKE '%' || v_search || '%'
        OR COALESCE(gc.guest_phone, '') ILIKE '%' || v_search || '%'
      )
  ) AS combined;

  -- Получаем страницу данных
  SELECT jsonb_agg(row_data)
  INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'id', sub.id,
      'source_table', sub.source_table,
      'source', sub.source,
      'status', sub.status,
      'customer_name', sub.customer_name,
      'customer_phone', sub.customer_phone,
      'total_amount', sub.total_amount,
      'final_amount', sub.final_amount,
      'bonuses_spent', sub.bonuses_spent,
      'bonuses_awarded', sub.bonuses_awarded,
      'payment_method', sub.payment_method,
      'created_at', sub.created_at
    ) AS row_data
    FROM (
      -- orders
      SELECT
        o.id,
        'orders'::TEXT AS source_table,
        COALESCE(o.source, 'online') AS source,
        o.status,
        COALESCE(COALESCE(p.first_name, oc.first_name), '') || ' ' || COALESCE(COALESCE(p.last_name, oc.last_name), '') AS customer_name,
        COALESCE(p.phone, oc.phone) AS customer_phone,
        o.total_amount,
        o.final_amount,
        COALESCE(o.bonuses_spent, 0) AS bonuses_spent,
        COALESCE(o.bonuses_awarded, 0) AS bonuses_awarded,
        o.payment_method,
        o.created_at
      FROM public.orders o
      LEFT JOIN public.profiles p ON p.id = o.user_id
      LEFT JOIN public.offline_customers oc ON oc.id = o.offline_customer_id
      WHERE
        (p_source IS NULL OR COALESCE(o.source, 'online') = p_source)
        AND (p_status IS NULL OR o.status = p_status)
        AND (p_date_from IS NULL OR o.created_at >= p_date_from)
        AND (p_date_to IS NULL OR o.created_at < p_date_to)
        AND (
          v_search IS NULL
          OR o.id::TEXT ILIKE '%' || v_search || '%'
          OR (COALESCE(COALESCE(p.first_name, oc.first_name), '') || ' ' || COALESCE(COALESCE(p.last_name, oc.last_name), '')) ILIKE '%' || v_search || '%'
          OR COALESCE(COALESCE(p.phone, oc.phone), '') ILIKE '%' || v_search || '%'
        )

      UNION ALL

      -- guest_checkouts
      SELECT
        gc.id,
        'guest_checkouts'::TEXT AS source_table,
        COALESCE(gc.source, 'online') AS source,
        gc.status,
        COALESCE(gc.guest_name, '') AS customer_name,
        gc.guest_phone AS customer_phone,
        gc.total_amount,
        gc.final_amount,
        0 AS bonuses_spent,
        0 AS bonuses_awarded,
        gc.payment_method,
        gc.created_at
      FROM public.guest_checkouts gc
      WHERE
        (p_source IS NULL OR COALESCE(gc.source, 'online') = p_source)
        AND (p_status IS NULL OR gc.status = p_status)
        AND (p_date_from IS NULL OR gc.created_at >= p_date_from)
        AND (p_date_to IS NULL OR gc.created_at < p_date_to)
        AND (
          v_search IS NULL
          OR gc.id::TEXT ILIKE '%' || v_search || '%'
          OR COALESCE(gc.guest_name, '') ILIKE '%' || v_search || '%'
          OR COALESCE(gc.guest_phone, '') ILIKE '%' || v_search || '%'
        )

      ORDER BY created_at DESC
      LIMIT p_page_size
      OFFSET v_offset
    ) sub
  ) agg;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::JSONB),
    'total_count', v_total,
    'page', p_page,
    'page_size', p_page_size
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_sale_receipt(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_caller_role TEXT;
  v_result      JSONB;
  v_items       JSONB;
BEGIN
  -- Проверяем права
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Доступ запрещён: только администраторы';
  END IF;

  -- Пробуем найти в orders
  SELECT jsonb_build_object(
    'id', o.id,
    'source_table', 'orders',
    'source', COALESCE(o.source, 'online'),
    'status', o.status,
    'customer_name', COALESCE(COALESCE(p.first_name, oc.first_name), '') || ' ' || COALESCE(COALESCE(p.last_name, oc.last_name), ''),
    'customer_phone', COALESCE(p.phone, oc.phone),
    'payment_method', o.payment_method,
    'total_amount', o.total_amount,
    'final_amount', o.final_amount,
    'bonuses_spent', COALESCE(o.bonuses_spent, 0),
    'bonuses_awarded', COALESCE(o.bonuses_awarded, 0),
    'created_at', o.created_at
  )
  INTO v_result
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.user_id
      LEFT JOIN public.offline_customers oc ON oc.id = o.offline_customer_id
  WHERE o.id = p_order_id;

  IF v_result IS NOT NULL THEN
    -- Получаем позиции из order_items
    SELECT jsonb_agg(
      jsonb_build_object(
        'product_name', pr.name,
        'quantity', oi.quantity,
        'price_per_item', oi.price_at_purchase,
        'line_total', oi.quantity * oi.price_at_purchase
      )
      ORDER BY pr.name
    )
    INTO v_items
    FROM public.order_items oi
    JOIN public.products pr ON pr.id = oi.product_id
    WHERE oi.order_id = p_order_id;

    RETURN v_result || jsonb_build_object('items', COALESCE(v_items, '[]'::JSONB));
  END IF;

  -- Пробуем найти в guest_checkouts
  SELECT jsonb_build_object(
    'id', gc.id,
    'source_table', 'guest_checkouts',
    'source', COALESCE(gc.source, 'online'),
    'status', gc.status,
    'customer_name', COALESCE(gc.guest_name, ''),
    'customer_phone', gc.guest_phone,
    'payment_method', gc.payment_method,
    'total_amount', gc.total_amount,
    'final_amount', gc.final_amount,
    'bonuses_spent', 0,
    'bonuses_awarded', 0,
    'created_at', gc.created_at
  )
  INTO v_result
  FROM public.guest_checkouts gc
  WHERE gc.id = p_order_id;

  IF v_result IS NOT NULL THEN
    -- Получаем позиции из guest_checkout_items
    SELECT jsonb_agg(
      jsonb_build_object(
        'product_name', pr.name,
        'quantity', gci.quantity,
        'price_per_item', gci.price_per_item,
        'line_total', gci.quantity * gci.price_per_item
      )
      ORDER BY pr.name
    )
    INTO v_items
    FROM public.guest_checkout_items gci
    JOIN public.products pr ON pr.id = gci.product_id
    WHERE gci.checkout_id = p_order_id;

    RETURN v_result || jsonb_build_object('items', COALESCE(v_items, '[]'::JSONB));
  END IF;

  RAISE EXCEPTION 'Заказ не найден: %', p_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_orders_for_return(p_query text, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_caller_role TEXT;
  v_results JSONB;
  v_search TEXT;
BEGIN
  -- 1. Проверка роли — только админ
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Доступ запрещён: только администраторы';
  END IF;

  -- 2. Нормализуем поисковый запрос
  v_search := TRIM(p_query);

  IF v_search = '' THEN
    RETURN '[]'::JSONB;
  END IF;

  -- 3. Если запрос похож на UUID — ищем точное совпадение по id
  IF v_search ~* '^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$' THEN
    SELECT jsonb_agg(row_data)
    INTO v_results
    FROM (
      -- orders
      SELECT jsonb_build_object(
        'id', o.id,
        'customer_name', COALESCE(COALESCE(p.first_name, oc.first_name), '') || ' ' || COALESCE(COALESCE(p.last_name, oc.last_name), ''),
        'customer_phone', COALESCE(p.phone, oc.phone),
        'source_table', 'orders',
        'source', COALESCE(o.source, 'online'),
        'status', o.status,
        'final_amount', o.final_amount,
        'created_at', o.created_at
      ) AS row_data
      FROM public.orders o
      LEFT JOIN public.profiles p ON p.id = o.user_id
      LEFT JOIN public.offline_customers oc ON oc.id = o.offline_customer_id
      WHERE o.id = v_search::UUID

      UNION ALL

      -- guest_checkouts
      SELECT jsonb_build_object(
        'id', gc.id,
        'customer_name', COALESCE(gc.guest_name, ''),
        'customer_phone', gc.guest_phone,
        'source_table', 'guest_checkouts',
        'source', COALESCE(gc.source, 'online'),
        'status', gc.status,
        'final_amount', gc.final_amount,
        'created_at', gc.created_at
      ) AS row_data
      FROM public.guest_checkouts gc
      WHERE gc.id = v_search::UUID
    ) sub;

    RETURN COALESCE(v_results, '[]'::JSONB);
  END IF;

  -- 4. Поиск по телефону или имени (ILIKE)
  SELECT jsonb_agg(row_data ORDER BY created_at DESC)
  INTO v_results
  FROM (
    (
      -- orders: join profiles для поиска по телефону/имени
      SELECT
        jsonb_build_object(
          'id', o.id,
          'customer_name', COALESCE(COALESCE(p.first_name, oc.first_name), '') || ' ' || COALESCE(COALESCE(p.last_name, oc.last_name), ''),
          'customer_phone', COALESCE(p.phone, oc.phone),
          'source_table', 'orders',
          'source', COALESCE(o.source, 'online'),
          'status', o.status,
          'final_amount', o.final_amount,
          'created_at', o.created_at
        ) AS row_data,
        o.created_at
      FROM public.orders o
      LEFT JOIN public.profiles p ON p.id = o.user_id
      LEFT JOIN public.offline_customers oc ON oc.id = o.offline_customer_id
      WHERE
        COALESCE(p.phone, oc.phone) ILIKE '%' || v_search || '%'
        OR (COALESCE(COALESCE(p.first_name, oc.first_name), '') || ' ' || COALESCE(COALESCE(p.last_name, oc.last_name), '')) ILIKE '%' || v_search || '%'
    )

    UNION ALL

    (
      -- guest_checkouts: прямой поиск по guest_phone/guest_name
      SELECT
        jsonb_build_object(
          'id', gc.id,
          'customer_name', COALESCE(gc.guest_name, ''),
          'customer_phone', gc.guest_phone,
          'source_table', 'guest_checkouts',
          'source', COALESCE(gc.source, 'online'),
          'status', gc.status,
          'final_amount', gc.final_amount,
          'created_at', gc.created_at
        ) AS row_data,
        gc.created_at
      FROM public.guest_checkouts gc
      WHERE
        gc.guest_phone ILIKE '%' || v_search || '%'
        OR gc.guest_name ILIKE '%' || v_search || '%'
    )

    ORDER BY created_at DESC
    LIMIT p_limit
  ) sub;

  RETURN COALESCE(v_results, '[]'::JSONB);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_order_for_return(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_caller_role TEXT;
  v_order RECORD;
  v_items JSONB;
  v_source_table TEXT;
BEGIN
  -- Проверяем права администратора
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Доступ запрещён: только администраторы';
  END IF;

  -- Сначала ищем в orders
  SELECT
    o.id,
    o.created_at,
    o.status,
    o.total_amount,
    o.final_amount,
    o.bonuses_spent,
    o.bonuses_awarded,
    o.user_id,
    o.source,
    COALESCE(p.first_name, oc.first_name) AS first_name,
    COALESCE(p.last_name, oc.last_name) AS last_name,
    COALESCE(p.phone, oc.phone) AS phone
  INTO v_order
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.user_id
      LEFT JOIN public.offline_customers oc ON oc.id = o.offline_customer_id
  WHERE o.id = p_order_id;

  -- FOUND, а не «v_order IS NOT NULL»: для составной записи последнее
  -- означает «все поля непустые», и заказ покупателя с незаполненной
  -- фамилией считался ненайденным.
  IF FOUND THEN
    v_source_table := 'orders';

    -- Позиции из order_items
    SELECT jsonb_agg(item_row ORDER BY item_row.product_name)
    INTO v_items
    FROM (
      SELECT
        oi.product_id,
        pr.name AS product_name,
        oi.quantity AS ordered_quantity,
        oi.price_at_purchase AS price_per_item,
        COALESCE(pr.bonus_points_award, 0) AS bonus_points_per_item,
        COALESCE(ret.returned_quantity, 0) AS returned_quantity,
        oi.quantity - COALESCE(ret.returned_quantity, 0) AS available_quantity
      FROM public.order_items oi
      JOIN public.products pr ON pr.id = oi.product_id
      LEFT JOIN LATERAL (
        SELECT SUM(ori.quantity)::INTEGER AS returned_quantity
        FROM public.order_return_items ori
        JOIN public.order_returns orr ON orr.id = ori.return_id
        WHERE orr.order_id = p_order_id
          AND ori.product_id = oi.product_id
      ) ret ON TRUE
      WHERE oi.order_id = p_order_id
    ) item_row;

    RETURN jsonb_build_object(
      'id', v_order.id,
      'created_at', v_order.created_at,
      'status', v_order.status,
      'total_amount', v_order.total_amount,
      'final_amount', v_order.final_amount,
      'bonuses_spent', v_order.bonuses_spent,
      'bonuses_awarded', v_order.bonuses_awarded,
      'user_id', v_order.user_id,
      'customer_name', COALESCE(v_order.first_name, '') || ' ' || COALESCE(v_order.last_name, ''),
      'customer_phone', v_order.phone,
      'days_since_order', EXTRACT(DAY FROM NOW() - v_order.created_at)::INTEGER,
      'can_return', (
        v_order.status NOT IN ('cancelled')
        AND v_order.created_at + INTERVAL '14 days' >= NOW()
      ),
      'source_table', v_source_table,
      'source', COALESCE(v_order.source, 'online'),
      'items', COALESCE(v_items, '[]'::JSONB)
    );
  END IF;

  -- Не найден в orders — ищем в guest_checkouts
  SELECT
    gc.id,
    gc.created_at,
    gc.status,
    gc.total_amount,
    gc.final_amount,
    gc.source,
    gc.guest_name,
    gc.guest_phone
  INTO v_order
  FROM public.guest_checkouts gc
  WHERE gc.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Заказ не найден';
  END IF;

  v_source_table := 'guest_checkouts';

  -- Позиции из guest_checkout_items
  SELECT jsonb_agg(item_row ORDER BY item_row.product_name)
  INTO v_items
  FROM (
    SELECT
      gci.product_id,
      pr.name AS product_name,
      gci.quantity AS ordered_quantity,
      gci.price_per_item,
      0 AS bonus_points_per_item,
      COALESCE(ret.returned_quantity, 0) AS returned_quantity,
      gci.quantity - COALESCE(ret.returned_quantity, 0) AS available_quantity
    FROM public.guest_checkout_items gci
    JOIN public.products pr ON pr.id = gci.product_id
    LEFT JOIN LATERAL (
      SELECT SUM(ori.quantity)::INTEGER AS returned_quantity
      FROM public.order_return_items ori
      JOIN public.order_returns orr ON orr.id = ori.return_id
      WHERE orr.guest_checkout_id = p_order_id
        AND ori.product_id = gci.product_id
    ) ret ON TRUE
    WHERE gci.checkout_id = p_order_id
  ) item_row;

  RETURN jsonb_build_object(
    'id', v_order.id,
    'created_at', v_order.created_at,
    'status', v_order.status,
    'total_amount', v_order.total_amount,
    'final_amount', v_order.final_amount,
    'bonuses_spent', 0,
    'bonuses_awarded', 0,
    'user_id', NULL,
    'customer_name', COALESCE(v_order.guest_name, ''),
    'customer_phone', v_order.guest_phone,
    'days_since_order', EXTRACT(DAY FROM NOW() - v_order.created_at)::INTEGER,
    'can_return', (
      v_order.status NOT IN ('cancelled')
      AND v_order.created_at + INTERVAL '14 days' >= NOW()
    ),
    'source_table', v_source_table,
    'source', COALESCE(v_order.source, 'online'),
    'items', COALESCE(v_items, '[]'::JSONB)
  );
END;
$function$;


-- ── 4. По одной версии ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('process_order_return', 'admin_merge_offline_customer',
        'get_sales_list', 'get_sale_receipt', 'get_order_for_return', 'search_orders_for_return')) <> 6 THEN
    RAISE EXCEPTION 'после миграции не по одной версии функций';
  END IF;
END $$;
