-- =====================================================================================
-- ДОБАВЛЕНИЕ: Поле cancelled_by для отслеживания кто отменил заказ
-- =====================================================================================
-- ПРОБЛЕМА:
-- Когда клиент отменяет заказ, в Telegram приходит сообщение
-- "отменен администратором", хотя отменил клиент
--
-- РЕШЕНИЕ:
-- Добавить колонку cancelled_by (TEXT) в orders и guest_checkouts
-- Значения: 'client', 'admin', 'system'
-- =====================================================================================

-- Добавляем колонку в orders
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'orders'
          AND column_name = 'cancelled_by'
    ) THEN
        ALTER TABLE public.orders
        ADD COLUMN cancelled_by TEXT CHECK (cancelled_by IN ('client', 'admin', 'system'));

        COMMENT ON COLUMN public.orders.cancelled_by IS
          'Кто отменил заказ: client (клиент), admin (администратор), system (автоматически)';

        RAISE NOTICE '✅ Добавлена колонка: orders.cancelled_by';
    ELSE
        RAISE NOTICE '✅ Колонка orders.cancelled_by уже существует';
    END IF;
END $$;

-- Добавляем колонку в guest_checkouts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'guest_checkouts'
          AND column_name = 'cancelled_by'
    ) THEN
        ALTER TABLE public.guest_checkouts
        ADD COLUMN cancelled_by TEXT CHECK (cancelled_by IN ('client', 'admin', 'system'));

        COMMENT ON COLUMN public.guest_checkouts.cancelled_by IS
          'Кто отменил заказ: client (клиент), admin (администратор), system (автоматически)';

        RAISE NOTICE '✅ Добавлена колонка: guest_checkouts.cancelled_by';
    ELSE
        RAISE NOTICE '✅ Колонка guest_checkouts.cancelled_by уже существует';
    END IF;
END $$;

-- =====================================================================================
-- ОБНОВЛЕНИЕ: Функция cancel_order с параметром cancelled_by
-- =====================================================================================

DROP FUNCTION IF EXISTS public.cancel_order(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id UUID,
  p_table_name TEXT DEFAULT 'orders',
  p_cancelled_by TEXT DEFAULT 'admin'  -- ✅ Новый параметр
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_data RECORD;
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
    SELECT * INTO v_order_data FROM public.orders WHERE id = p_order_id;
  ELSE
    SELECT * INTO v_order_data FROM public.guest_checkouts WHERE id = p_order_id;
  END IF;

  IF v_order_data IS NULL THEN
    RETURN 'Ошибка: Заказ не найден в таблице ' || p_table_name;
  END IF;

  -- Проверяем статус заказа
  IF v_order_data.status = 'cancelled' THEN
    RETURN 'Ошибка: Заказ уже отменён';
  END IF;

  IF v_order_data.status NOT IN ('new', 'pending', 'confirmed', 'processing') THEN
    RETURN 'Ошибка: Заказ в статусе "' || v_order_data.status || '" нельзя отменить';
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
  IF p_table_name = 'orders' AND v_order_data.user_id IS NOT NULL THEN
    IF COALESCE(v_order_data.bonuses_spent, 0) > 0 THEN
      UPDATE public.profiles
      SET active_bonus_balance = active_bonus_balance + v_order_data.bonuses_spent
      WHERE id = v_order_data.user_id;

      INSERT INTO public.bonus_transactions (
        user_id, order_id, amount, transaction_type, status, description
      ) VALUES (
        v_order_data.user_id,
        p_order_id,
        v_order_data.bonuses_spent,
        'refund',
        'completed',
        'Возврат бонусов при отмене заказа'
      );

      RAISE NOTICE 'Возвращены бонусы: %', v_order_data.bonuses_spent;
    END IF;
  END IF;

  -- ✅ Обновляем статус И cancelled_by
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
ИСПРАВЛЕНИЕ (2026-02-05): Добавлен параметр cancelled_by для отслеживания кто отменил';

-- Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
