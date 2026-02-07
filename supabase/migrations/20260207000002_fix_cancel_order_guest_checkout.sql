-- =====================================================================================
-- ИСПРАВЛЕНИЕ: cancel_order для гостевых заказов
-- =====================================================================================
-- ПРОБЛЕМА:
-- Ошибка "record v_order_data has no field user_id" при отмене гостевого заказа
-- PostgreSQL проверяет v_order_data.user_id даже когда p_table_name = 'guest_checkouts'
--
-- РЕШЕНИЕ:
-- Использовать отдельные переменные для user_id и bonuses_spent вместо RECORD
-- =====================================================================================

DROP FUNCTION IF EXISTS public.cancel_order(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id UUID,
  p_table_name TEXT DEFAULT 'orders',
  p_cancelled_by TEXT DEFAULT 'admin'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status TEXT;
  v_user_id UUID := NULL;
  v_bonuses_spent NUMERIC := 0;
  v_item_record RECORD;
  v_result TEXT;
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
    SELECT status, user_id, COALESCE(bonuses_spent, 0)
    INTO v_status, v_user_id, v_bonuses_spent
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

  -- Возвращаем бонусы (только для orders с user_id)
  IF p_table_name = 'orders' AND v_user_id IS NOT NULL AND v_bonuses_spent > 0 THEN
    UPDATE public.profiles
    SET active_bonus_balance = active_bonus_balance + v_bonuses_spent
    WHERE id = v_user_id;

    INSERT INTO public.bonus_transactions (
      user_id, order_id, amount, transaction_type, status, description
    ) VALUES (
      v_user_id,
      p_order_id,
      v_bonuses_spent,
      'refund',
      'completed',
      'Возврат бонусов при отмене заказа'
    );

    RAISE NOTICE 'Возвращены бонусы: %', v_bonuses_spent;
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
'Отменяет заказ и возвращает товары на склад + бонусы пользователю.
ИСПРАВЛЕНИЕ (2026-02-07): Исправлена ошибка user_id для гостевых заказов';

-- Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
