-- =====================================================================================
-- Исправление функции cancel_order для поддержки статуса 'processing'
-- =====================================================================================
-- Проблема: Когда админ берет заказ в работу, статус меняется на 'processing',
-- но функция cancel_order разрешает отменять только 'new' и 'confirmed'.
--
-- Решение: Добавляем 'processing' в список разрешенных статусов для отмены
-- и в логику отката операций (возврат товаров на склад и бонусов).
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target_order RECORD;
  v_order_item_record RECORD;
  v_user_profile RECORD;
  v_welcome_bonus INTEGER := 1000;
BEGIN
  -- Находим заказ и проверяем его
  SELECT * INTO v_target_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_target_order IS NULL THEN
    RETURN 'Ошибка: Заказ не найден.';
  END IF;

  -- ✅ ИСПРАВЛЕНИЕ: Добавлен статус 'processing'
  IF v_target_order.status NOT IN ('new', 'confirmed', 'processing') THEN
    RETURN 'Ошибка: Этот заказ уже нельзя отменить (возможно, он выполнен или уже отменен).';
  END IF;

  -- ✅ ИСПРАВЛЕНИЕ: Добавлен статус 'processing' в условие отката операций
  -- Если заказ был подтвержден или в обработке, откатываем операции
  IF v_target_order.status IN ('confirmed', 'processing') THEN
    -- 1. Возвращаем товары на склад
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

    -- 2. Откатываем бонусные операции (только для зарегистрированных)
    IF v_target_order.user_id IS NOT NULL THEN
      -- Получаем профиль пользователя
      SELECT * INTO v_user_profile
      FROM public.profiles
      WHERE id = v_target_order.user_id;

      IF v_user_profile IS NOT NULL THEN
        -- Проверяем, был ли это первый заказ с приветственным бонусом
        -- Если has_received_welcome_bonus = TRUE и других подтвержденных заказов нет -
        -- значит это был первый заказ с приветственным бонусом
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
              -- Возвращаем потраченные бонусы
              active_bonus_balance = active_bonus_balance + v_target_order.bonuses_spent - v_welcome_bonus,
              -- Убираем начисленные бонусы за покупку
              pending_bonus_balance = pending_bonus_balance - v_target_order.bonuses_awarded,
              -- Сбрасываем флаг получения приветственного бонуса
              has_received_welcome_bonus = FALSE
            WHERE id = v_target_order.user_id;

            RAISE NOTICE 'Откачен приветственный бонус для пользователя %', v_target_order.user_id;
          ELSE
            -- Обычный откат (без приветственного бонуса)
            UPDATE public.profiles
            SET
              -- Возвращаем потраченные бонусы
              active_bonus_balance = active_bonus_balance + v_target_order.bonuses_spent,
              -- Убираем начисленные бонусы за покупку
              pending_bonus_balance = pending_bonus_balance - v_target_order.bonuses_awarded
            WHERE id = v_target_order.user_id;
          END IF;
        END;
      END IF;
    END IF;
  END IF;

  -- Финальный шаг: меняем статус заказа на 'cancelled'
  UPDATE public.orders
  SET status = 'cancelled'
  WHERE id = p_order_id;

  RETURN 'Успех: Заказ ' || p_order_id || ' был отменен.';
END;
$$;

COMMENT ON FUNCTION public.cancel_order(UUID) IS
'Отменяет заказ и откатывает все связанные операции (товары, бонусы).
Поддерживает статусы: new, confirmed, processing.
Если отменяется первый заказ - откатывает приветственный бонус 1000.';
