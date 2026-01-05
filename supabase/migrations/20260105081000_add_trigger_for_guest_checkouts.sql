-- =====================================================================================
-- АВТОМАТИЧЕСКОЕ СПИСАНИЕ ТОВАРОВ ДЛЯ ГОСТЕВЫХ ЗАКАЗОВ
-- =====================================================================================
-- Проблема:
-- - Триггер для автоматического списания товаров есть только для таблицы orders
-- - Гостевые заказы (guest_checkouts) тоже нужно обрабатывать
--
-- Решение:
-- - Создать аналогичный триггер для guest_checkouts
-- - Функция будет списывать только товары (без бонусов, т.к. у гостей их нет)
-- =====================================================================================

-- Функция для обработки подтвержденного гостевого заказа (БЕЗ бонусов)
CREATE OR REPLACE FUNCTION public.process_confirmed_guest_checkout(p_checkout_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target_checkout RECORD;
  v_checkout_item_record RECORD;
BEGIN
  -- Получаем гостевой заказ
  SELECT * INTO v_target_checkout
  FROM public.guest_checkouts
  WHERE id = p_checkout_id;

  IF v_target_checkout IS NULL THEN
    RETURN 'Ошибка: Гостевой заказ не найден.';
  END IF;

  -- Проверяем, что заказ уже подтвержден
  IF v_target_checkout.status <> 'confirmed' THEN
    RETURN 'Ошибка: Гостевой заказ должен быть в статусе confirmed.';
  END IF;

  -- Проверяем наличие товаров на складе
  FOR v_checkout_item_record IN
    SELECT gci.quantity, p.stock_quantity, p.name
    FROM public.guest_checkout_items gci
    JOIN public.products p ON gci.product_id = p.id
    WHERE gci.checkout_id = p_checkout_id
  LOOP
    IF v_checkout_item_record.stock_quantity < v_checkout_item_record.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара "%" на складе.', v_checkout_item_record.name;
    END IF;
  END LOOP;

  -- ✅ Списываем товары со склада и обновляем счетчик продаж
  FOR v_checkout_item_record IN
    SELECT product_id, quantity
    FROM public.guest_checkout_items
    WHERE checkout_id = p_checkout_id
  LOOP
    UPDATE public.products
    SET
      stock_quantity = stock_quantity - v_checkout_item_record.quantity,
      sales_count = sales_count + v_checkout_item_record.quantity
    WHERE id = v_checkout_item_record.product_id;

    RAISE NOTICE 'Списан товар % (гостевой заказ): количество %',
      v_checkout_item_record.product_id, v_checkout_item_record.quantity;
  END LOOP;

  RETURN 'Успех: Гостевой заказ ' || p_checkout_id || ' обработан (товары списаны).';
END;
$$;

-- Функция-триггер для автоматической обработки гостевого заказа
CREATE OR REPLACE FUNCTION public.trigger_process_confirmed_guest_checkout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result TEXT;
BEGIN
  -- Вызываем функцию обработки гостевого заказа
  SELECT public.process_confirmed_guest_checkout(NEW.id) INTO v_result;

  -- Логируем результат
  RAISE NOTICE 'Триггер (guest_checkouts): %', v_result;

  -- Возвращаем NEW (статус уже изменен)
  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Если возникла ошибка, логируем её и откатываем транзакцию
  RAISE EXCEPTION 'Ошибка при обработке гостевого заказа %: %', NEW.id, SQLERRM;
END;
$$;

-- Создаем триггер AFTER UPDATE на таблице guest_checkouts
DROP TRIGGER IF EXISTS trigger_auto_confirm_guest_checkout ON public.guest_checkouts;

CREATE TRIGGER trigger_auto_confirm_guest_checkout
  AFTER UPDATE ON public.guest_checkouts
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed' AND OLD.status = 'new')
  EXECUTE FUNCTION public.trigger_process_confirmed_guest_checkout();

COMMENT ON FUNCTION public.process_confirmed_guest_checkout(UUID) IS
'Обрабатывает подтвержденный гостевой заказ: списывает товары со склада.
Вызывается автоматически триггером при изменении статуса на confirmed.
Не обрабатывает бонусы, т.к. у гостей их нет.';

COMMENT ON FUNCTION public.trigger_process_confirmed_guest_checkout() IS
'Триггерная функция для автоматической обработки гостевого заказа.
Вызывает process_confirmed_guest_checkout при изменении статуса с new на confirmed.';

COMMENT ON TRIGGER trigger_auto_confirm_guest_checkout ON public.guest_checkouts IS
'Автоматически обрабатывает гостевой заказ при подтверждении.
Работает когда администратор подтверждает заказ через Telegram бота.';
