-- =====================================================================================
-- Fix: Полный фикс бонусной системы
--
-- Проблема 1: cancel_order НЕ обрабатывает earned бонусы при отмене заказа.
--   → earned транзакции остаются 'pending' для отменённых заказов
--   → pending_bonus_balance не уменьшается (фантомный баланс)
--
-- Проблема 2: cancel_order использует transaction_type = 'refund' вместо 'refund_spent'
--   → нарушение CHECK constraint, INSERT может тихо фейлиться
--
-- Проблема 3: process_confirmed_order не проставляет activation_date в bonus_transactions
--   → пользователь не видит дату активации в истории
--
-- Проблема 4: Старые заказы (до 20260303000002) не имеют earned записей
-- =====================================================================================


-- =====================================================================================
-- 1. FIX: cancel_order — обрабатывать earned бонусы + фикс transaction_type
-- =====================================================================================
DROP FUNCTION IF EXISTS public.cancel_order(UUID, TEXT, TEXT);

CREATE FUNCTION public.cancel_order(
  p_order_id UUID,
  p_table_name TEXT DEFAULT 'orders',
  p_cancelled_by TEXT DEFAULT 'admin'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_user_id UUID := NULL;
  v_bonuses_spent NUMERIC := 0;
  v_bonuses_awarded INTEGER := 0;
  v_item_record RECORD;
  v_result TEXT;
  v_new_active_balance INTEGER;
  v_new_pending_balance INTEGER;
  v_bonuses_activation_date TIMESTAMPTZ;
BEGIN
  -- Валидация cancelled_by
  IF p_cancelled_by NOT IN ('client', 'admin', 'system') THEN
    RAISE EXCEPTION 'Неверное значение cancelled_by: %. Допустимые: client, admin, system', p_cancelled_by;
  END IF;

  -- Валидация table_name
  IF p_table_name NOT IN ('orders', 'guest_checkouts') THEN
    RAISE EXCEPTION 'Неверная таблица: %. Допустимые: orders, guest_checkouts', p_table_name;
  END IF;

  -- Получаем данные заказа в зависимости от таблицы
  IF p_table_name = 'orders' THEN
    SELECT status, user_id, COALESCE(bonuses_spent, 0), COALESCE(bonuses_awarded, 0), bonuses_activation_date
    INTO v_status, v_user_id, v_bonuses_spent, v_bonuses_awarded, v_bonuses_activation_date
    FROM public.orders
    WHERE id = p_order_id;
  ELSE
    -- Для guest_checkouts нет user_id и bonuses_spent
    SELECT status
    INTO v_status
    FROM public.guest_checkouts
    WHERE id = p_order_id;
  END IF;

  IF v_status IS NULL THEN
    RETURN 'Ошибка: Заказ не найден в таблице ' || p_table_name;
  END IF;

  -- Проверяем статус заказа
  IF v_status = 'cancelled' THEN
    RETURN 'Ошибка: Заказ уже отменён';
  END IF;

  IF v_status NOT IN ('new', 'pending', 'confirmed', 'processing') THEN
    RETURN 'Ошибка: Заказ в статусе "' || v_status || '" нельзя отменить';
  END IF;

  -- Возвращаем товары на склад
  IF p_table_name = 'orders' THEN
    FOR v_item_record IN
      SELECT product_id, quantity
      FROM public.order_items
      WHERE order_id = p_order_id
    LOOP
      UPDATE public.products
      SET
        stock_quantity = stock_quantity + v_item_record.quantity,
        sales_count = GREATEST(sales_count - v_item_record.quantity, 0)
      WHERE id = v_item_record.product_id;

      RAISE NOTICE 'Возвращён товар %: количество %', v_item_record.product_id, v_item_record.quantity;
    END LOOP;
  ELSE
    FOR v_item_record IN
      SELECT product_id, quantity
      FROM public.guest_checkout_items
      WHERE checkout_id = p_order_id
    LOOP
      UPDATE public.products
      SET
        stock_quantity = stock_quantity + v_item_record.quantity,
        sales_count = GREATEST(sales_count - v_item_record.quantity, 0)
      WHERE id = v_item_record.product_id;

      RAISE NOTICE 'Возвращён товар % (гостевой): количество %', v_item_record.product_id, v_item_record.quantity;
    END LOOP;
  END IF;

  -- ==========================================
  -- Обработка бонусов (только для orders с user_id)
  -- ==========================================
  IF p_table_name = 'orders' AND v_user_id IS NOT NULL THEN

    -- A) Возвращаем ПОТРАЧЕННЫЕ бонусы
    IF v_bonuses_spent > 0 THEN
      UPDATE public.profiles
      SET active_bonus_balance = active_bonus_balance + v_bonuses_spent
      WHERE id = v_user_id
      RETURNING active_bonus_balance, pending_bonus_balance
      INTO v_new_active_balance, v_new_pending_balance;

      INSERT INTO public.bonus_transactions (
        user_id, order_id, amount, transaction_type, status,
        balance_after, pending_balance_after, description
      ) VALUES (
        v_user_id,
        p_order_id,
        v_bonuses_spent,
        'refund_spent',
        'completed',
        v_new_active_balance,
        v_new_pending_balance,
        'Возврат потраченных бонусов при отмене заказа'
      );

      RAISE NOTICE 'Возвращены потраченные бонусы: %', v_bonuses_spent;
    END IF;

    -- B) Откатываем НАЧИСЛЕННЫЕ бонусы
    IF v_bonuses_awarded > 0 THEN
      -- Если заказ был подтверждён (process_confirmed_order добавил к pending_bonus_balance),
      -- нужно вычесть обратно
      IF v_bonuses_activation_date IS NOT NULL THEN
        UPDATE public.profiles
        SET pending_bonus_balance = GREATEST(pending_bonus_balance - v_bonuses_awarded, 0)
        WHERE id = v_user_id
        RETURNING active_bonus_balance, pending_bonus_balance
        INTO v_new_active_balance, v_new_pending_balance;
      ELSE
        -- Заказ не был подтверждён, pending_bonus_balance не менялся
        SELECT active_bonus_balance, pending_bonus_balance
        INTO v_new_active_balance, v_new_pending_balance
        FROM public.profiles WHERE id = v_user_id;
      END IF;

      -- Логируем откат начисленных бонусов
      INSERT INTO public.bonus_transactions (
        user_id, order_id, amount, transaction_type, status,
        balance_after, pending_balance_after, description
      ) VALUES (
        v_user_id,
        p_order_id,
        -v_bonuses_awarded,
        'refund_earned',
        'completed',
        v_new_active_balance,
        v_new_pending_balance,
        'Отмена начисленных бонусов при отмене заказа'
      );

      -- Помечаем earned транзакцию как cancelled
      UPDATE public.bonus_transactions
      SET status = 'cancelled'
      WHERE order_id = p_order_id
        AND transaction_type = 'earned'
        AND status = 'pending';

      RAISE NOTICE 'Отменены начисленные бонусы: %', v_bonuses_awarded;
    END IF;

  END IF;

  -- Обновляем статус И cancelled_by
  IF p_table_name = 'orders' THEN
    UPDATE public.orders
    SET status = 'cancelled', cancelled_by = p_cancelled_by
    WHERE id = p_order_id;
  ELSE
    UPDATE public.guest_checkouts
    SET status = 'cancelled', cancelled_by = p_cancelled_by
    WHERE id = p_order_id;
  END IF;

  v_result := 'Успех: Заказ ' || p_order_id || ' отменён';
  IF p_cancelled_by = 'client' THEN
    v_result := v_result || ' (отменён клиентом)';
  ELSIF p_cancelled_by = 'admin' THEN
    v_result := v_result || ' (отменён администратором)';
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.cancel_order(UUID, TEXT, TEXT) IS
'Отменяет заказ: возвращает товары, потраченные бонусы, откатывает начисленные бонусы, '
'помечает earned транзакции как cancelled.';


-- =====================================================================================
-- 2. FIX: process_confirmed_order — проставлять activation_date в bonus_transactions
-- =====================================================================================
DROP FUNCTION IF EXISTS public.process_confirmed_order(UUID);

CREATE FUNCTION public.process_confirmed_order(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_order RECORD;
  v_welcome_bonus INTEGER := 500;
  v_user_profile RECORD;
  v_activation_date TIMESTAMPTZ;
BEGIN
  SELECT
    o.id,
    o.user_id,
    o.bonuses_awarded,
    o.bonuses_activation_date,
    o.status
  INTO v_target_order
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RETURN 'Ошибка: Заказ ' || p_order_id || ' не найден.';
  END IF;

  -- Идемпотентность: если бонусы уже обработаны, пропускаем
  IF v_target_order.bonuses_activation_date IS NOT NULL THEN
    RETURN 'Заказ ' || p_order_id || ' уже обработан (bonuses_activation_date установлена).';
  END IF;

  -- Списываем товары со склада
  UPDATE public.products p
  SET stock_quantity = p.stock_quantity - oi.quantity
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND p.id = oi.product_id;

  IF v_target_order.user_id IS NOT NULL THEN
    SELECT * INTO v_user_profile
    FROM public.profiles
    WHERE id = v_target_order.user_id;

    IF v_user_profile IS NOT NULL AND v_target_order.bonuses_awarded > 0 THEN
      v_activation_date := NOW() + INTERVAL '14 days';

      IF NOT v_user_profile.has_received_welcome_bonus THEN
        -- Первый заказ: pending бонусы + приветственный бонус сразу
        UPDATE public.profiles
        SET
          pending_bonus_balance = pending_bonus_balance + v_target_order.bonuses_awarded,
          active_bonus_balance = active_bonus_balance + v_welcome_bonus,
          has_received_welcome_bonus = TRUE
        WHERE id = v_target_order.user_id;

        -- Логируем приветственный бонус в историю
        INSERT INTO public.bonus_transactions (
          user_id, order_id, transaction_type, amount,
          balance_after, pending_balance_after, description, status
        ) VALUES (
          v_target_order.user_id,
          p_order_id,
          'welcome',
          v_welcome_bonus,
          COALESCE(v_user_profile.active_bonus_balance, 0) + v_welcome_bonus,
          COALESCE(v_user_profile.pending_bonus_balance, 0) + v_target_order.bonuses_awarded,
          'Приветственный бонус за первый заказ',
          'completed'
        );

        RAISE NOTICE 'Начислен приветственный бонус % пользователю %', v_welcome_bonus, v_target_order.user_id;
      ELSE
        -- Повторный заказ: только pending бонусы
        UPDATE public.profiles
        SET
          pending_bonus_balance = pending_bonus_balance + v_target_order.bonuses_awarded
        WHERE id = v_target_order.user_id;
      END IF;

      -- Устанавливаем дату активации бонусов за покупку (14 дней)
      UPDATE public.orders
      SET bonuses_activation_date = v_activation_date
      WHERE id = p_order_id;

      -- ✅ FIX: Проставляем activation_date в bonus_transactions
      UPDATE public.bonus_transactions
      SET activation_date = v_activation_date
      WHERE order_id = p_order_id
        AND transaction_type = 'earned'
        AND status = 'pending';

      RAISE NOTICE 'Установлена дата активации бонусов для заказа %', p_order_id;
    END IF;
  ELSE
    -- Для гостевых заказов ставим маркер обработки
    UPDATE public.orders
    SET bonuses_activation_date = NOW()
    WHERE id = p_order_id;
  END IF;

  RETURN 'Успех: Заказ ' || p_order_id || ' обработан (товары списаны, бонусы начислены).';
END;
$$;

COMMENT ON FUNCTION public.process_confirmed_order IS
  'Обрабатывает подтверждённый заказ: списывает товары, зачисляет pending бонусы, '
  'начисляет приветственный бонус первому заказу, проставляет activation_date в bonus_transactions.';


-- =====================================================================================
-- 3. BACKFILL: Вставить earned записи для старых заказов (до 20260303000002)
-- =====================================================================================
INSERT INTO public.bonus_transactions (
  user_id, order_id, transaction_type, amount,
  balance_after, pending_balance_after,
  description, status, activation_date, created_at
)
SELECT
  o.user_id,
  o.id,
  'earned',
  o.bonuses_awarded,
  0,
  0,
  'Бонусы за покупку (ретроспективная запись)',
  CASE
    WHEN o.status IN ('completed', 'delivered') THEN 'completed'
    WHEN o.status = 'cancelled' THEN 'cancelled'
    ELSE 'pending'
  END,
  o.bonuses_activation_date,
  o.created_at
FROM public.orders o
WHERE o.user_id IS NOT NULL
  AND o.bonuses_awarded > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.bonus_transactions bt
    WHERE bt.order_id = o.id AND bt.transaction_type = 'earned'
  );


-- =====================================================================================
-- 4. BACKFILL: Проставить activation_date для существующих earned записей
-- =====================================================================================
UPDATE public.bonus_transactions bt
SET activation_date = o.bonuses_activation_date
FROM public.orders o
WHERE bt.order_id = o.id
  AND bt.transaction_type = 'earned'
  AND bt.activation_date IS NULL
  AND o.bonuses_activation_date IS NOT NULL;


-- =====================================================================================
-- 5. BACKFILL: Пометить earned транзакции отменённых заказов как cancelled
-- =====================================================================================
UPDATE public.bonus_transactions bt
SET status = 'cancelled'
FROM public.orders o
WHERE bt.order_id = o.id
  AND bt.transaction_type = 'earned'
  AND bt.status = 'pending'
  AND o.status = 'cancelled';


-- =====================================================================================
-- 6. BACKFILL: Обнулить фантомный pending_bonus_balance от отменённых заказов
-- Пересчитываем pending_bonus_balance на основе реальных данных:
-- pending = сумма bonuses_awarded от подтверждённых заказов, чья activation_date ещё не наступила
-- =====================================================================================
UPDATE public.profiles p
SET pending_bonus_balance = COALESCE(
  (
    SELECT SUM(o.bonuses_awarded)
    FROM public.orders o
    WHERE o.user_id = p.id
      AND o.status IN ('confirmed', 'delivered')
      AND o.bonuses_activation_date IS NOT NULL
      AND o.bonuses_activation_date > NOW()
      AND o.bonuses_awarded > 0
  ),
  0
)
WHERE p.pending_bonus_balance > 0
  AND p.pending_bonus_balance != COALESCE(
    (
      SELECT SUM(o.bonuses_awarded)
      FROM public.orders o
      WHERE o.user_id = p.id
        AND o.status IN ('confirmed', 'delivered')
        AND o.bonuses_activation_date IS NOT NULL
        AND o.bonuses_activation_date > NOW()
        AND o.bonuses_awarded > 0
    ),
    0
  );


NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
