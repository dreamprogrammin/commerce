-- ============================================================================
-- МИГРАЦИЯ: Возврат товаров из заказов
-- ============================================================================
-- Функционал:
-- - Таблицы order_returns и order_return_items
-- - RPC process_order_return: оформление возврата (admin only)
-- - RPC get_order_for_return: получение заказа с остатками для возврата
-- - Обновление get_sales_report: добавлены returns_count и returns_amount
-- ============================================================================

-- ============================================================================
-- 1. Обновляем CHECK constraint для bonus_transactions (добавляем return_cancel)
-- ============================================================================
ALTER TABLE public.bonus_transactions
  DROP CONSTRAINT IF EXISTS bonus_transactions_transaction_type_check;

ALTER TABLE public.bonus_transactions
  ADD CONSTRAINT bonus_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'earned',
    'spent',
    'welcome',
    'refund_spent',
    'refund_earned',
    'activation',
    'return_cancel'
  ));

-- ============================================================================
-- 2. Таблица order_returns
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.order_returns (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  reason TEXT,
  refund_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  bonuses_cancelled INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_returns_order_id ON public.order_returns(order_id);
CREATE INDEX IF NOT EXISTS idx_order_returns_created_at ON public.order_returns(created_at DESC);

COMMENT ON TABLE public.order_returns IS 'Возвраты товаров из заказов';

-- ============================================================================
-- 3. Таблица order_return_items
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.order_return_items (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  return_id UUID NOT NULL REFERENCES public.order_returns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_per_item NUMERIC(10, 2) NOT NULL,
  bonus_points_per_item INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_order_return_items_return_id ON public.order_return_items(return_id);

COMMENT ON TABLE public.order_return_items IS 'Позиции в возврате';

-- ============================================================================
-- 4. RLS политики
-- ============================================================================
ALTER TABLE public.order_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_return_items ENABLE ROW LEVEL SECURITY;

-- Чтение для всех авторизованных (пользователь увидит через join с orders)
CREATE POLICY "Authenticated can read order_returns"
  ON public.order_returns FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can read order_return_items"
  ON public.order_return_items FOR SELECT
  USING (auth.role() = 'authenticated');

-- Запись только через SECURITY DEFINER функции (запрещаем прямую вставку)
CREATE POLICY "No direct insert on order_returns"
  ON public.order_returns FOR INSERT
  WITH CHECK (false);

CREATE POLICY "No direct insert on order_return_items"
  ON public.order_return_items FOR INSERT
  WITH CHECK (false);

-- ============================================================================
-- 5. RPC: get_order_for_return
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_order_for_return(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role TEXT;
  v_order RECORD;
  v_items JSONB;
BEGIN
  -- Проверяем права администратора
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Доступ запрещён: только администраторы';
  END IF;

  -- Получаем заказ
  SELECT
    o.id,
    o.created_at,
    o.status,
    o.total_amount,
    o.final_amount,
    o.bonuses_spent,
    o.bonuses_awarded,
    o.user_id,
    p.first_name,
    p.last_name,
    p.phone
  INTO v_order
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.user_id
  WHERE o.id = p_order_id;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Заказ не найден';
  END IF;

  -- Получаем позиции с учётом уже возвращённых количеств
  SELECT jsonb_agg(item_row ORDER BY item_row.product_name)
  INTO v_items
  FROM (
    SELECT
      oi.product_id,
      pr.name AS product_name,
      oi.quantity AS ordered_quantity,
      oi.price_per_item,
      oi.bonus_points_per_item,
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
    'items', COALESCE(v_items, '[]'::JSONB)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_for_return(UUID) TO authenticated;

-- ============================================================================
-- 6. RPC: process_order_return
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_order_return(
  p_order_id UUID,
  p_items JSONB,         -- [{product_id, quantity}]
  p_reason TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
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

  -- 2. Проверяем что заказ существует и не отменён
  SELECT id, status, created_at, user_id, bonuses_awarded
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
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
  INSERT INTO public.order_returns (order_id, created_by, reason)
  VALUES (p_order_id, v_caller_id, p_reason)
  RETURNING id INTO v_return_id;

  -- 5. Обрабатываем каждую позицию
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INTEGER)
  LOOP
    -- Получаем данные позиции заказа
    SELECT product_id, quantity, price_per_item, bonus_points_per_item
    INTO v_order_item
    FROM public.order_items
    WHERE order_id = p_order_id AND product_id = v_item.product_id;

    IF v_order_item IS NULL THEN
      RAISE EXCEPTION 'Товар % не найден в заказе', v_item.product_id;
    END IF;

    -- Проверяем количество с учётом предыдущих возвратов
    SELECT COALESCE(SUM(ori.quantity), 0)::INTEGER
    INTO v_already_returned
    FROM public.order_return_items ori
    JOIN public.order_returns orr ON orr.id = ori.return_id
    WHERE orr.order_id = p_order_id AND ori.product_id = v_item.product_id;

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

  -- 7. Отменяем pending бонусы (уменьшаем pending_bonus_balance)
  IF v_order.user_id IS NOT NULL AND v_total_bonuses_cancel > 0 THEN
    UPDATE public.profiles
    SET pending_bonus_balance = GREATEST(COALESCE(pending_bonus_balance, 0) - v_total_bonuses_cancel, 0)
    WHERE id = v_order.user_id
    RETURNING active_bonus_balance, pending_bonus_balance
    INTO v_new_active_balance, v_new_pending_balance;

    -- 9. Создаём bonus_transaction
    INSERT INTO public.bonus_transactions (
      user_id, order_id, transaction_type, amount,
      balance_after, pending_balance_after,
      description, status
    ) VALUES (
      v_order.user_id,
      p_order_id,
      'return_cancel',
      -v_total_bonuses_cancel,
      v_new_active_balance,
      v_new_pending_balance,
      'Бонусы отменены: возврат товара',
      'completed'
    );

    -- 8. Уменьшаем bonuses_awarded в orders
    UPDATE public.orders
    SET bonuses_awarded = GREATEST(COALESCE(bonuses_awarded, 0) - v_total_bonuses_cancel, 0)
    WHERE id = p_order_id;
  END IF;

  -- 10. Обновляем запись возврата с итогами
  UPDATE public.order_returns
  SET refund_amount = v_total_refund,
      bonuses_cancelled = v_total_bonuses_cancel
  WHERE id = v_return_id;

  -- 11. Возвращаем результат
  RETURN jsonb_build_object(
    'return_id', v_return_id,
    'order_id', p_order_id,
    'items_count', v_items_count,
    'refund_amount', v_total_refund,
    'bonuses_cancelled', v_total_bonuses_cancel
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_order_return(UUID, JSONB, TEXT) TO authenticated;

-- ============================================================================
-- 7. Обновление get_sales_report: добавляем returns_count и returns_amount
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_sales_report(
  p_from    TIMESTAMPTZ,
  p_to      TIMESTAMPTZ,
  p_acquiring_rate NUMERIC DEFAULT 1.5
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role TEXT;

  -- Заказы авторизованных пользователей
  v_user_count          INTEGER := 0;
  v_user_turnover       NUMERIC := 0;
  v_user_cost           NUMERIC := 0;
  v_user_bonuses_spent  NUMERIC := 0;
  v_user_card_sum       NUMERIC := 0;
  v_user_online_count   INTEGER := 0;
  v_user_offline_count  INTEGER := 0;

  -- Гостевые заказы
  v_guest_count         INTEGER := 0;
  v_guest_turnover      NUMERIC := 0;
  v_guest_cost          NUMERIC := 0;
  v_guest_card_sum      NUMERIC := 0;
  v_guest_online_count  INTEGER := 0;
  v_guest_offline_count INTEGER := 0;

  -- Возвраты
  v_returns_count       INTEGER := 0;
  v_returns_amount      NUMERIC := 0;

  -- Итоги
  v_total_count     INTEGER;
  v_turnover        NUMERIC;
  v_cost            NUMERIC;
  v_gross_profit    NUMERIC;
  v_tax             NUMERIC;
  v_commission      NUMERIC;
  v_net_profit      NUMERIC;
  v_card_sum        NUMERIC;
BEGIN
  -- Проверяем права
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Доступ запрещён';
  END IF;

  -- Пользовательские заказы (не отменённые)
  SELECT
    COUNT(*)::INTEGER,
    COALESCE(SUM(o.final_amount), 0),
    COALESCE(SUM(o.bonuses_spent), 0),
    COALESCE(SUM(CASE WHEN o.payment_method = 'card' THEN o.final_amount ELSE 0 END), 0),
    COUNT(CASE WHEN o.source = 'online' THEN 1 END)::INTEGER,
    COUNT(CASE WHEN o.source = 'offline' THEN 1 END)::INTEGER
  INTO
    v_user_count, v_user_turnover, v_user_bonuses_spent,
    v_user_card_sum, v_user_online_count, v_user_offline_count
  FROM public.orders o
  WHERE
    o.created_at >= p_from
    AND o.created_at < p_to
    AND o.status NOT IN ('cancelled');

  -- Себестоимость товаров из пользовательских заказов
  SELECT COALESCE(SUM(oi.quantity * p.cost_price), 0)
  INTO v_user_cost
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  JOIN public.products p ON p.id = oi.product_id
  WHERE
    o.created_at >= p_from
    AND o.created_at < p_to
    AND o.status NOT IN ('cancelled');

  -- Гостевые заказы (не отменённые)
  SELECT
    COUNT(*)::INTEGER,
    COALESCE(SUM(gc.final_amount), 0),
    COALESCE(SUM(CASE WHEN gc.payment_method = 'card' THEN gc.final_amount ELSE 0 END), 0),
    COUNT(CASE WHEN gc.source = 'online' THEN 1 END)::INTEGER,
    COUNT(CASE WHEN gc.source = 'offline' THEN 1 END)::INTEGER
  INTO
    v_guest_count, v_guest_turnover, v_guest_card_sum,
    v_guest_online_count, v_guest_offline_count
  FROM public.guest_checkouts gc
  WHERE
    gc.created_at >= p_from
    AND gc.created_at < p_to
    AND gc.status NOT IN ('cancelled');

  -- Себестоимость из гостевых заказов
  SELECT COALESCE(SUM(gci.quantity * p.cost_price), 0)
  INTO v_guest_cost
  FROM public.guest_checkout_items gci
  JOIN public.guest_checkouts gc ON gc.id = gci.checkout_id
  JOIN public.products p ON p.id = gci.product_id
  WHERE
    gc.created_at >= p_from
    AND gc.created_at < p_to
    AND gc.status NOT IN ('cancelled');

  -- Возвраты за период
  SELECT
    COUNT(*)::INTEGER,
    COALESCE(SUM(orr.refund_amount), 0)
  INTO v_returns_count, v_returns_amount
  FROM public.order_returns orr
  WHERE
    orr.created_at >= p_from
    AND orr.created_at < p_to;

  -- Сводные расчёты
  v_total_count  := v_user_count + v_guest_count;
  v_turnover     := v_user_turnover + v_guest_turnover;
  v_cost         := v_user_cost + v_guest_cost;
  v_card_sum     := v_user_card_sum + v_guest_card_sum;
  v_gross_profit := v_turnover - v_cost;
  v_tax          := ROUND(v_turnover * 0.04, 2);
  v_commission   := ROUND(v_card_sum * p_acquiring_rate / 100, 2);
  v_net_profit   := v_gross_profit - v_tax - v_commission;

  RETURN jsonb_build_object(
    -- Общие метрики
    'total_orders',       v_total_count,
    'turnover',           v_turnover,
    'cost_of_goods',      v_cost,
    'gross_profit',       v_gross_profit,
    'tax_amount',         v_tax,
    'tax_rate',           0.04,
    'card_sum',           v_card_sum,
    'commission_amount',  v_commission,
    'acquiring_rate',     p_acquiring_rate,
    'net_profit',         v_net_profit,
    'bonuses_spent',      v_user_bonuses_spent,

    -- Разбивка: онлайн / офлайн
    'online_count',       v_user_online_count + v_guest_online_count,
    'offline_count',      v_user_offline_count + v_guest_offline_count,
    'user_orders_count',  v_user_count,
    'guest_orders_count', v_guest_count,

    -- Возвраты
    'returns_count',      v_returns_count,
    'returns_amount',     v_returns_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_report(TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC) TO authenticated;

-- Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
