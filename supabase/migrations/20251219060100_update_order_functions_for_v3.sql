-- =====================================================================================
-- ОБНОВЛЕНИЕ ФУНКЦИЙ ПОДТВЕРЖДЕНИЯ И ОТМЕНЫ ЗАКАЗОВ ДЛЯ АРХИТЕКТУРЫ V3
-- =====================================================================================
-- Добавляет поддержку гостевых заказов (guest_checkouts) в дополнение к orders
-- =====================================================================================

-- Удаляем старые версии функций (с другими сигнатурами)
DROP FUNCTION IF EXISTS public.confirm_and_process_order(UUID);
DROP FUNCTION IF EXISTS public.cancel_order(UUID);

-- =====================================================================================
-- 1. ФУНКЦИЯ ПОДТВЕРЖДЕНИЯ ЗАКАЗА (УНИВЕРСАЛЬНАЯ)
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.confirm_and_process_order(
  p_order_id UUID,
  p_table_name TEXT DEFAULT 'orders'
)
RETURNS TEXT 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
  target_order RECORD;
  order_item_record RECORD;
  items_table TEXT;
BEGIN
  -- Определяем таблицу товаров в зависимости от типа заказа
  IF p_table_name = 'guest_checkouts' THEN
    items_table := 'guest_checkout_items';
  ELSE
    items_table := 'order_items';
  END IF;

  -- Получаем заказ
  IF p_table_name = 'guest_checkouts' THEN
    SELECT * INTO target_order FROM public.guest_checkouts WHERE id = p_order_id FOR UPDATE;
  ELSE
    SELECT * INTO target_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  END IF;

  IF target_order IS NULL THEN 
    RETURN 'Ошибка: Заказ не найден.'; 
  END IF;

  IF target_order.status <> 'new' THEN 
    RETURN 'Ошибка: Заказ уже обработан.'; 
  END IF;

  -- Проверяем наличие товаров на складе
  IF p_table_name = 'guest_checkouts' THEN
    FOR order_item_record IN 
      SELECT oi.quantity, p.stock_quantity 
      FROM public.guest_checkout_items oi 
      JOIN public.products p ON oi.product_id = p.id 
      WHERE oi.checkout_id = p_order_id 
    LOOP
      IF order_item_record.stock_quantity < order_item_record.quantity THEN
        RAISE EXCEPTION 'Недостаточно товара на складе.';
      END IF;
    END LOOP;
  ELSE
    FOR order_item_record IN 
      SELECT oi.quantity, p.stock_quantity 
      FROM public.order_items oi 
      JOIN public.products p ON oi.product_id = p.id 
      WHERE oi.order_id = p_order_id 
    LOOP
      IF order_item_record.stock_quantity < order_item_record.quantity THEN
        RAISE EXCEPTION 'Недостаточно товара на складе.';
      END IF;
    END LOOP;
  END IF;

  -- Списываем товары со склада
  IF p_table_name = 'guest_checkouts' THEN
    FOR order_item_record IN 
      SELECT product_id, quantity 
      FROM public.guest_checkout_items 
      WHERE checkout_id = p_order_id 
    LOOP
      UPDATE public.products 
      SET 
        stock_quantity = stock_quantity - order_item_record.quantity, 
        sales_count = sales_count + order_item_record.quantity 
      WHERE id = order_item_record.product_id;
    END LOOP;
  ELSE
    FOR order_item_record IN 
      SELECT product_id, quantity 
      FROM public.order_items 
      WHERE order_id = p_order_id 
    LOOP
      UPDATE public.products 
      SET 
        stock_quantity = stock_quantity - order_item_record.quantity, 
        sales_count = sales_count + order_item_record.quantity 
      WHERE id = order_item_record.product_id;
    END LOOP;
  END IF;

  -- Обновляем статус и обрабатываем бонусы (только для пользовательских заказов)
  IF p_table_name = 'guest_checkouts' THEN
    -- Гостевой заказ - просто меняем статус
    UPDATE public.guest_checkouts 
    SET status = 'confirmed' 
    WHERE id = p_order_id;
  ELSE
    -- Пользовательский заказ - обрабатываем бонусы
    IF target_order.user_id IS NOT NULL THEN
      UPDATE public.profiles
      SET 
        pending_bonus_balance = pending_bonus_balance + target_order.bonuses_awarded,
        active_bonus_balance = active_bonus_balance - target_order.bonuses_spent
      WHERE id = target_order.user_id;
      
      UPDATE public.orders
      SET 
        status = 'confirmed', 
        bonuses_activation_date = now() + interval '14 days'
      WHERE id = p_order_id;
    ELSE
      UPDATE public.orders 
      SET status = 'confirmed' 
      WHERE id = p_order_id;
    END IF;
  END IF;
  
  RETURN 'Успех: Заказ ' || p_order_id || ' подтвержден и обработан.';
END;
$$;

COMMENT ON FUNCTION public.confirm_and_process_order IS 
  'Подтверждает заказ (пользовательский или гостевой): списывает товары со склада и обрабатывает бонусы для пользователей.';

-- =====================================================================================
-- 2. ФУНКЦИЯ ОТМЕНЫ ЗАКАЗА (УНИВЕРСАЛЬНАЯ)
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id UUID,
  p_table_name TEXT DEFAULT 'orders'
)
RETURNS TEXT 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
  target_order RECORD;
  order_item_record RECORD;
BEGIN
  -- Получаем заказ
  IF p_table_name = 'guest_checkouts' THEN
    SELECT * INTO target_order FROM public.guest_checkouts WHERE id = p_order_id FOR UPDATE;
  ELSE
    SELECT * INTO target_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  END IF;

  IF target_order IS NULL THEN
    RETURN 'Ошибка: Заказ не найден.';
  END IF;

  IF target_order.status NOT IN ('new', 'confirmed') THEN
    RETURN 'Ошибка: Этот заказ уже нельзя отменить (возможно, он выполнен или уже отменен).';
  END IF;
  
  -- Если заказ был подтвержден, откатываем изменения
  IF target_order.status = 'confirmed' THEN
    -- Возвращаем товары на склад
    IF p_table_name = 'guest_checkouts' THEN
      FOR order_item_record IN 
        SELECT product_id, quantity 
        FROM public.guest_checkout_items 
        WHERE checkout_id = p_order_id 
      LOOP
        UPDATE public.products
        SET 
          stock_quantity = stock_quantity + order_item_record.quantity,
          sales_count = sales_count - order_item_record.quantity
        WHERE id = order_item_record.product_id;
      END LOOP;
    ELSE
      FOR order_item_record IN 
        SELECT product_id, quantity 
        FROM public.order_items 
        WHERE order_id = p_order_id 
      LOOP
        UPDATE public.products
        SET 
          stock_quantity = stock_quantity + order_item_record.quantity,
          sales_count = sales_count - order_item_record.quantity
        WHERE id = order_item_record.product_id;
      END LOOP;
    END IF;

    -- Откатываем бонусы (только для пользовательских заказов)
    IF p_table_name = 'orders' AND target_order.user_id IS NOT NULL THEN
      UPDATE public.profiles
      SET
        active_bonus_balance = active_bonus_balance + target_order.bonuses_spent,
        pending_bonus_balance = pending_bonus_balance - target_order.bonuses_awarded
      WHERE id = target_order.user_id;
    END IF;
  END IF;

  -- Меняем статус на 'cancelled'
  IF p_table_name = 'guest_checkouts' THEN
    UPDATE public.guest_checkouts
    SET status = 'cancelled'
    WHERE id = p_order_id;
  ELSE
    UPDATE public.orders
    SET status = 'cancelled'
    WHERE id = p_order_id;
  END IF;

  RETURN 'Успех: Заказ ' || p_order_id || ' был отменен.';
END;
$$;

COMMENT ON FUNCTION public.cancel_order IS 
  'Отменяет заказ (пользовательский или гостевой): возвращает товары на склад и откатывает бонусные операции для пользователей.';

-- =====================================================================================
-- 3. ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ ОПРЕДЕЛЕНИЯ ТИПА ЗАКАЗА
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.get_order_table_name(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  -- Проверяем в orders
  SELECT EXISTS(SELECT 1 FROM public.orders WHERE id = p_order_id) INTO v_exists;
  IF v_exists THEN
    RETURN 'orders';
  END IF;

  -- Проверяем в guest_checkouts
  SELECT EXISTS(SELECT 1 FROM public.guest_checkouts WHERE id = p_order_id) INTO v_exists;
  IF v_exists THEN
    RETURN 'guest_checkouts';
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.get_order_table_name IS 
  'Определяет, в какой таблице находится заказ (orders или guest_checkouts)';

-- =====================================================================================
-- ПРОВЕРКА
-- =====================================================================================

-- Проверяем, что функции созданы
SELECT 
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public' 
  AND routine_name IN ('confirm_and_process_order', 'cancel_order', 'get_order_table_name')
ORDER BY routine_name;
