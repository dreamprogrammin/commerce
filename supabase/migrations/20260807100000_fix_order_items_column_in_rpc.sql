-- ============================================================================
--  Возвраты и чеки: две независимые поломки
-- ============================================================================
--  ПОЛОМКА 1 — исчезнувшие колонки. Функции читают order_items.price_per_item
--  и bonus_points_per_item. Их нет: 22 мая колонки удалили через дашборд,
--  добавив price_at_purchase (см. 20260522043812_remote_schema), а функции не
--  поправили. Вызов падает с «column oi.price_per_item does not exist».
--  Гостевые обращения (gci.price_per_item) не тронуты — там колонка на месте.
--
--  ПОЛОМКА 2 — проверка найденности через «IS NOT NULL». Для составной записи
--  это условие означает «все поля непустые», а не «строка найдена».
--    • get_order_for_return выбирает в запись имя и фамилию покупателя. У кого
--      не заполнена фамилия — а это большинство — заказ признавался ненайденным,
--      управление уходило в гостевую ветку и вылетало «Заказ не найден».
--    • process_order_return в гостевой ветке выбирает NULL::UUID AS user_id,
--      поэтому условие не срабатывало там никогда: v_source_table оставался
--      пустым и возврат гостевого заказа не проходил.
--  Заменено на FOUND — он говорит именно о том, вернул ли SELECT строку.
--
--  ПОЛОМКА 3 — недопустимый тип бонусной операции. process_order_return
--  писал transaction_type = 'return_cancel', которого нет в списке
--  bonus_transactions_transaction_type_check. Раньше до этой строки
--  просто не доходило: функция падала раньше. Пишем 'refund_earned' —
--  то же значение, что система уже пишет при отмене заказа.
--
--  ПРО БОНУСЫ. bonus_points_per_item хранила бонусы позиции на момент покупки;
--  вместе с колонкой это знание потеряно. Берём products.bonus_points_award —
--  то же поле, по которому create_user_order считал начисление. Разойтись оно
--  может, только если бонус товара меняли между покупкой и возвратом;
--  альтернатива — не отменять бонусы вовсе — хуже.
--
--  Имена в выдаче (price_per_item) сохранены: на них завязаны adminSalesStore
--  и adminReturnsStore.
--
--  Тела сняты с прода через pg_get_functiondef, изменены только эти места.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_order_for_return(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $$
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
    p.first_name,
    p.last_name,
    p.phone
  INTO v_order
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.user_id
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
$$;


CREATE OR REPLACE FUNCTION public.get_sale_receipt(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $$
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
    'customer_name', COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, ''),
    'customer_phone', p.phone,
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
$$;


CREATE OR REPLACE FUNCTION public.process_order_return(p_order_id uuid, p_items jsonb, p_reason text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
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
  SELECT id, status, created_at, user_id, bonuses_awarded
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
    SELECT id, status, created_at, NULL::UUID AS user_id, 0 AS bonuses_awarded
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
$$;

NOTIFY pgrst, 'reload schema';
