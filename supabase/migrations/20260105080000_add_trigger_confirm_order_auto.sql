-- =====================================================================================
-- АВТОМАТИЧЕСКОЕ СПИСАНИЕ ТОВАРОВ ПРИ ПОДТВЕРЖДЕНИИ ЗАКАЗА
-- =====================================================================================
-- Проблема:
-- - В админ-панели нет интерфейса для управления заказами
-- - Функция confirm_and_process_order нигде не вызывается
-- - Администратор меняет статус заказа вручную в Supabase Dashboard
-- - Товары не списываются со склада при подтверждении заказа
--
-- Решение:
-- - Создать триггер, который автоматически вызывает confirm_and_process_order
--   при изменении статуса заказа с 'new' на 'confirmed'
-- =====================================================================================

-- Функция для обработки подтвержденного заказа (БЕЗ изменения статуса)
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

      -- Устанавливаем дату активации бонусов за покупку
      UPDATE public.orders
      SET bonuses_activation_date = NOW() + INTERVAL '7 days'
      WHERE id = p_order_id;
    END IF;
  END IF;

  RETURN 'Успех: Заказ ' || p_order_id || ' обработан (товары списаны, бонусы начислены).';
END;
$$;

-- Функция-триггер для автоматической обработки подтвержденного заказа
CREATE OR REPLACE FUNCTION public.trigger_process_confirmed_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result TEXT;
BEGIN
  -- Вызываем функцию обработки заказа ПОСЛЕ того как статус изменен
  SELECT public.process_confirmed_order(NEW.id) INTO v_result;

  -- Логируем результат
  RAISE NOTICE 'Триггер: %', v_result;

  -- Возвращаем NEW (статус уже изменен)
  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Если возникла ошибка, логируем её и откатываем транзакцию
  RAISE EXCEPTION 'Ошибка при обработке заказа %: %', NEW.id, SQLERRM;
END;
$$;

-- Создаем триггер AFTER UPDATE на таблице orders
DROP TRIGGER IF EXISTS trigger_auto_confirm_order ON public.orders;

CREATE TRIGGER trigger_auto_confirm_order
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed' AND OLD.status = 'new')
  EXECUTE FUNCTION public.trigger_process_confirmed_order();

COMMENT ON FUNCTION public.process_confirmed_order(UUID) IS
'Обрабатывает подтвержденный заказ: списывает товары со склада и начисляет бонусы.
Вызывается автоматически триггером при изменении статуса заказа на confirmed.
Это нужно потому что в админ-панели нет интерфейса для подтверждения заказов.';

COMMENT ON FUNCTION public.trigger_process_confirmed_order() IS
'Триггерная функция для автоматической обработки подтвержденного заказа.
Вызывает process_confirmed_order при изменении статуса с new на confirmed.';

COMMENT ON TRIGGER trigger_auto_confirm_order ON public.orders IS
'Автоматически вызывает confirm_and_process_order при подтверждении заказа.
Работает когда администратор меняет статус заказа на confirmed вручную в Supabase Dashboard.';
