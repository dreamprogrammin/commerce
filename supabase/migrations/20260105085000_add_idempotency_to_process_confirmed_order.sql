-- =====================================================================================
-- ДОБАВЛЕНИЕ ИДЕМПОТЕНТНОСТИ: Защита от повторного списания товаров
-- =====================================================================================
-- Проблема:
-- - Если триггер сработает дважды, товары спишутся дважды ❌
-- - Или если администратор подтвердит заказ повторно
--
-- Решение:
-- - Проверять bonuses_activation_date - если уже установлена, значит заказ уже обработан
-- - Пропускать обработку для уже обработанных заказов
-- =====================================================================================

-- Обновляем функцию обработки заказа с проверкой идемпотентности
CREATE OR REPLACE FUNCTION public.process_confirmed_order(p_order_id UUID)
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
  -- Получаем заказ
  SELECT * INTO v_target_order
  FROM public.orders
  WHERE id = p_order_id;

  IF v_target_order IS NULL THEN
    RETURN 'Ошибка: Заказ не найден.';
  END IF;

  -- Проверяем, что заказ уже подтвержден
  IF v_target_order.status <> 'confirmed' THEN
    RETURN 'Ошибка: Заказ должен быть в статусе confirmed.';
  END IF;

  -- ✅ ИДЕМПОТЕНТНОСТЬ: Если заказ уже обработан (bonuses_activation_date установлена), пропускаем
  IF v_target_order.bonuses_activation_date IS NOT NULL THEN
    RAISE NOTICE 'Заказ % уже обработан (bonuses_activation_date: %), пропускаем',
      p_order_id, v_target_order.bonuses_activation_date;
    RETURN 'Пропущено: Заказ ' || p_order_id || ' уже был обработан ранее.';
  END IF;

  -- Проверяем наличие товаров на складе
  FOR v_order_item_record IN
    SELECT oi.quantity, p.stock_quantity, p.name
    FROM public.order_items oi
    JOIN public.products p ON oi.product_id = p.id
    WHERE oi.order_id = p_order_id
  LOOP
    IF v_order_item_record.stock_quantity < v_order_item_record.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара "%" на складе.', v_order_item_record.name;
    END IF;
  END LOOP;

  -- ✅ Списываем товары со склада и обновляем счетчик продаж
  FOR v_order_item_record IN
    SELECT product_id, quantity
    FROM public.order_items
    WHERE order_id = p_order_id
  LOOP
    UPDATE public.products
    SET
      stock_quantity = stock_quantity - v_order_item_record.quantity,
      sales_count = sales_count + v_order_item_record.quantity
    WHERE id = v_order_item_record.product_id;

    RAISE NOTICE 'Списан товар %: количество %', v_order_item_record.product_id, v_order_item_record.quantity;
  END LOOP;

  -- Обрабатываем бонусы (только для зарегистрированных пользователей)
  IF v_target_order.user_id IS NOT NULL THEN
    SELECT * INTO v_user_profile
    FROM public.profiles
    WHERE id = v_target_order.user_id;

    IF v_user_profile IS NOT NULL THEN
      -- Проверяем, получал ли пользователь приветственный бонус
      IF NOT v_user_profile.has_received_welcome_bonus THEN
        -- Начисляем 1000 бонусов СРАЗУ в active_bonus_balance
        UPDATE public.profiles
        SET
          pending_bonus_balance = pending_bonus_balance + v_target_order.bonuses_awarded,
          active_bonus_balance = active_bonus_balance + v_welcome_bonus,
          has_received_welcome_bonus = TRUE
        WHERE id = v_target_order.user_id;

        RAISE NOTICE 'Начислен приветственный бонус % пользователю %', v_welcome_bonus, v_target_order.user_id;
      ELSE
        -- Обычная логика для пользователей, уже получивших приветственный бонус
        UPDATE public.profiles
        SET
          pending_bonus_balance = pending_bonus_balance + v_target_order.bonuses_awarded
        WHERE id = v_target_order.user_id;
      END IF;

      -- ✅ Устанавливаем дату активации бонусов за покупку (маркер обработки)
      UPDATE public.orders
      SET bonuses_activation_date = NOW() + INTERVAL '7 days'
      WHERE id = p_order_id;

      RAISE NOTICE 'Установлена дата активации бонусов для заказа %', p_order_id;
    END IF;
  ELSE
    -- Для гостевых заказов (в таблице orders с user_id = NULL) всё равно ставим маркер
    UPDATE public.orders
    SET bonuses_activation_date = NOW()
    WHERE id = p_order_id;
  END IF;

  RETURN 'Успех: Заказ ' || p_order_id || ' обработан (товары списаны, бонусы начислены).';
END;
$$;

COMMENT ON FUNCTION public.process_confirmed_order(UUID) IS
'Обрабатывает подтвержденный заказ: списывает товары со склада и начисляет бонусы.
Вызывается автоматически триггером при изменении статуса заказа на confirmed.

ИДЕМПОТЕНТНОСТЬ:
  - Проверяет bonuses_activation_date перед обработкой
  - Если уже установлена, пропускает обработку (защита от повторного списания)
  - Это позволяет безопасно вызывать функцию несколько раз';
