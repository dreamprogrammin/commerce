-- =====================================================================================
-- ИДЕМПОТЕНТНОСТЬ ДЛЯ ГОСТЕВЫХ ЗАКАЗОВ
-- =====================================================================================
-- Решение:
-- - Добавить поле processed_at в guest_checkouts для маркера обработки
-- - Обновить функцию process_confirmed_guest_checkout с проверкой
-- =====================================================================================

-- Добавляем поле processed_at в guest_checkouts
ALTER TABLE public.guest_checkouts
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.guest_checkouts.processed_at IS
'Дата и время обработки заказа (списания товаров).
Используется для идемпотентности - если установлена, заказ уже обработан.';

-- Обновляем функцию с идемпотентностью
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

  -- ✅ ИДЕМПОТЕНТНОСТЬ: Если заказ уже обработан, пропускаем
  IF v_target_checkout.processed_at IS NOT NULL THEN
    RAISE NOTICE 'Гостевой заказ % уже обработан (processed_at: %), пропускаем',
      p_checkout_id, v_target_checkout.processed_at;
    RETURN 'Пропущено: Гостевой заказ ' || p_checkout_id || ' уже был обработан ранее.';
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

  -- ✅ Устанавливаем маркер обработки
  UPDATE public.guest_checkouts
  SET processed_at = NOW()
  WHERE id = p_checkout_id;

  RAISE NOTICE 'Установлен маркер обработки для гостевого заказа %', p_checkout_id;

  RETURN 'Успех: Гостевой заказ ' || p_checkout_id || ' обработан (товары списаны).';
END;
$$;

COMMENT ON FUNCTION public.process_confirmed_guest_checkout(UUID) IS
'Обрабатывает подтвержденный гостевой заказ: списывает товары со склада.
Вызывается автоматически триггером при изменении статуса на confirmed.

ИДЕМПОТЕНТНОСТЬ:
  - Проверяет processed_at перед обработкой
  - Если уже установлена, пропускает обработку (защита от повторного списания)';
