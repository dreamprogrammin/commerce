-- =====================================================================================
-- ИСПРАВЛЕНИЕ: Откат бонусов ТОЛЬКО для заказов, где бонусы были НАЧИСЛЕНЫ
-- =====================================================================================
-- Проблема:
-- - Бонусы начисляются ТОЛЬКО при подтверждении заказа (confirm_and_process_order)
-- - Текущая функция cancel_order откатывает бонусы для ВСЕХ статусов
-- - Если отменить заказ в статусе 'pending'/'new', функция пытается вычесть бонусы,
--   которые НЕ были начислены → pending_bonus_balance становится отрицательным!
--
-- Решение:
-- - Откатывать бонусы ТОЛЬКО если bonuses_activation_date IS NOT NULL
--   (это поле устанавливается только при подтверждении заказа)
-- - Это гарантирует, что мы откатываем только те бонусы, которые были начислены
-- =====================================================================================

DROP FUNCTION IF EXISTS public.cancel_order(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id UUID,
  p_table_name TEXT DEFAULT 'orders'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target_order RECORD;
  v_order_item_record RECORD;
  v_user_profile RECORD;
  v_welcome_bonus INTEGER := 1000;
  v_order_items_table TEXT;
  v_sql TEXT;
BEGIN
  -- Валидация имени таблицы (защита от SQL injection)
  IF p_table_name NOT IN ('orders', 'guest_checkouts') THEN
    RETURN 'Ошибка: Неверное имя таблицы.';
  END IF;

  -- Определяем таблицу для order_items
  v_order_items_table := CASE
    WHEN p_table_name = 'guest_checkouts' THEN 'guest_checkout_items'
    ELSE 'order_items'
  END;

  -- =========================================================================
  -- GUEST_CHECKOUTS (гостевые заказы)
  -- =========================================================================
  IF p_table_name = 'guest_checkouts' THEN
    -- Находим гостевой заказ
    v_sql := format('SELECT * FROM public.%I WHERE id = $1 FOR UPDATE', p_table_name);
    EXECUTE v_sql INTO v_target_order USING p_order_id;

    IF v_target_order IS NULL THEN
      RETURN 'Ошибка: Заказ не найден.';
    END IF;

    -- Проверяем статус
    IF v_target_order.status NOT IN ('pending', 'new', 'confirmed', 'processing') THEN
      RETURN 'Ошибка: Этот заказ уже нельзя отменить.';
    END IF;

    -- Для подтвержденных/обработанных заказов возвращаем товары
    IF v_target_order.status IN ('confirmed', 'processing') THEN
      v_sql := format('SELECT product_id, quantity FROM public.%I WHERE order_id = $1', v_order_items_table);
      FOR v_order_item_record IN EXECUTE v_sql USING p_order_id
      LOOP
        UPDATE public.products
        SET
          stock_quantity = stock_quantity + v_order_item_record.quantity,
          sales_count = sales_count - v_order_item_record.quantity
        WHERE id = v_order_item_record.product_id;
      END LOOP;
    END IF;

    -- Отменяем заказ
    v_sql := format('UPDATE public.%I SET status = $1 WHERE id = $2', p_table_name);
    EXECUTE v_sql USING 'cancelled', p_order_id;

    RETURN 'Успех: Гостевой заказ ' || p_order_id || ' был отменен.';
  END IF;

  -- =========================================================================
  -- ORDERS (заказы зарегистрированных пользователей)
  -- =========================================================================
  -- Находим заказ
  SELECT * INTO v_target_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_target_order IS NULL THEN
    RETURN 'Ошибка: Заказ не найден.';
  END IF;

  -- Проверяем статус (поддерживаем pending, new, confirmed, processing)
  IF v_target_order.status NOT IN ('pending', 'new', 'confirmed', 'processing') THEN
    RETURN 'Ошибка: Этот заказ уже нельзя отменить (возможно, он выполнен или уже отменен).';
  END IF;

  -- ✅ Возврат товаров ТОЛЬКО для confirmed/processing
  -- (товары списываются со склада только при подтверждении заказа)
  IF v_target_order.status IN ('confirmed', 'processing') THEN
    FOR v_order_item_record IN
      SELECT product_id, quantity
      FROM public.order_items
      WHERE order_id = p_order_id
    LOOP
      UPDATE public.products
      SET
        stock_quantity = stock_quantity + v_order_item_record.quantity,
        sales_count = sales_count - v_order_item_record.quantity
      WHERE id = v_order_item_record.product_id;
    END LOOP;
  END IF;

  -- ✅ КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: Откат бонусов ТОЛЬКО если они были начислены
  -- Проверяем bonuses_activation_date - это поле устанавливается ТОЛЬКО при подтверждении заказа
  IF v_target_order.user_id IS NOT NULL
     AND v_target_order.bonuses_activation_date IS NOT NULL THEN

    -- Получаем профиль пользователя
    SELECT * INTO v_user_profile
    FROM public.profiles
    WHERE id = v_target_order.user_id;

    IF v_user_profile IS NOT NULL THEN
      -- Проверяем, был ли это первый заказ с приветственным бонусом
      DECLARE
        v_other_confirmed_orders INTEGER;
      BEGIN
        SELECT COUNT(*) INTO v_other_confirmed_orders
        FROM public.orders
        WHERE user_id = v_target_order.user_id
          AND id != p_order_id
          AND status IN ('confirmed', 'processing', 'completed');

        -- Если это был единственный подтвержденный заказ и пользователь получил бонус
        IF v_other_confirmed_orders = 0 AND v_user_profile.has_received_welcome_bonus THEN
          -- Откатываем приветственный бонус
          UPDATE public.profiles
          SET
            active_bonus_balance = active_bonus_balance + v_target_order.bonuses_spent - v_welcome_bonus,
            pending_bonus_balance = pending_bonus_balance - v_target_order.bonuses_awarded,
            has_received_welcome_bonus = FALSE
          WHERE id = v_target_order.user_id;

          RAISE NOTICE 'Откачен приветственный бонус для пользователя %', v_target_order.user_id;
        ELSE
          -- Обычный откат (без приветственного бонуса)
          UPDATE public.profiles
          SET
            active_bonus_balance = active_bonus_balance + v_target_order.bonuses_spent,
            pending_bonus_balance = pending_bonus_balance - v_target_order.bonuses_awarded
          WHERE id = v_target_order.user_id;

          RAISE NOTICE 'Откачены бонусы: spent=% awarded=% для пользователя %',
            v_target_order.bonuses_spent, v_target_order.bonuses_awarded, v_target_order.user_id;
        END IF;
      END;
    END IF;
  ELSE
    -- Заказ не был подтвержден или это гостевой заказ - бонусы не начислялись
    RAISE NOTICE 'Заказ % не был подтвержден или бонусы не были начислены - откат бонусов пропущен', p_order_id;
  END IF;

  -- Финальный шаг: меняем статус заказа на 'cancelled'
  UPDATE public.orders
  SET status = 'cancelled'
  WHERE id = p_order_id;

  RETURN 'Успех: Заказ ' || p_order_id || ' был отменен.';
END;
$$;

COMMENT ON FUNCTION public.cancel_order(UUID, TEXT) IS
'Универсальная функция отмены заказа с поддержкой обеих таблиц (orders и guest_checkouts).
Параметры:
  - p_order_id: UUID заказа
  - p_table_name: Имя таблицы (orders или guest_checkouts), по умолчанию orders

Поддерживает статусы: pending, new, confirmed, processing.

Логика отката:
  - Товары на склад: ТОЛЬКО для confirmed/processing (товары списываются при подтверждении)
  - Бонусы: ТОЛЬКО если bonuses_activation_date IS NOT NULL (бонусы были начислены при подтверждении)
  - Приветственный бонус откатывается если это был единственный подтвержденный заказ

Ключевое отличие от предыдущей версии:
  - НЕ откатываем бонусы для заказов в статусе pending/new (бонусы еще не были начислены)
  - Откатываем бонусы ТОЛЬКО для заказов где bonuses_activation_date установлена';
