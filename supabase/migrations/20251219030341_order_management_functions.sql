-- =====================================================================================
-- УНИВЕРСАЛЬНЫЕ ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ ЗАКАЗАМИ
-- =====================================================================================

-- Функция подтверждения пользовательского заказа
CREATE OR REPLACE FUNCTION public.confirm_user_order(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_order RECORD;
  order_item_record RECORD;
BEGIN
  SELECT * INTO target_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  
  IF target_order IS NULL THEN 
    RETURN 'Ошибка: Заказ не найден.'; 
  END IF;
  
  IF target_order.status <> 'new' THEN 
    RETURN 'Ошибка: Заказ уже обработан.'; 
  END IF;

  -- Проверяем наличие товаров на складе
  FOR order_item_record IN 
    SELECT oi.quantity, p.stock_quantity, p.name 
    FROM public.order_items oi 
    JOIN public.products p ON oi.product_id = p.id 
    WHERE oi.order_id = p_order_id 
  LOOP
    IF order_item_record.stock_quantity < order_item_record.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара "%" на складе.', order_item_record.name;
    END IF;
  END LOOP;

  -- Списываем товары и обновляем sales_count
  FOR order_item_record IN 
    SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id 
  LOOP
    UPDATE public.products
    SET 
      stock_quantity = stock_quantity - order_item_record.quantity,
      sales_count = sales_count + order_item_record.quantity
    WHERE id = order_item_record.product_id;
  END LOOP;

  -- Обрабатываем бонусы (списываем + начисляем pending)
  IF target_order.user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET 
      active_bonus_balance = active_bonus_balance - target_order.bonuses_spent,
      pending_bonus_balance = pending_bonus_balance + target_order.bonuses_awarded
    WHERE id = target_order.user_id;
  END IF;

  -- Обновляем статус заказа и дату активации бонусов
  UPDATE public.orders 
  SET 
    status = 'confirmed',
    bonuses_activation_date = NOW() + INTERVAL '7 days'
  WHERE id = p_order_id;

  RETURN 'Успех: Заказ ' || p_order_id || ' подтвержден.';
END;
$$;

COMMENT ON FUNCTION public.confirm_user_order IS 
  'Подтверждает заказ пользователя: списывает товары, обрабатывает бонусы';


-- Функция подтверждения гостевого заказа
CREATE OR REPLACE FUNCTION public.confirm_guest_checkout(p_checkout_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_checkout RECORD;
  checkout_item_record RECORD;
BEGIN
  SELECT * INTO target_checkout FROM public.guest_checkouts WHERE id = p_checkout_id FOR UPDATE;
  
  IF target_checkout IS NULL THEN 
    RETURN 'Ошибка: Заказ не найден.'; 
  END IF;
  
  IF target_checkout.status <> 'new' THEN 
    RETURN 'Ошибка: Заказ уже обработан.'; 
  END IF;

  -- Проверяем наличие товаров на складе
  FOR checkout_item_record IN 
    SELECT ci.quantity, p.stock_quantity, p.name 
    FROM public.guest_checkout_items ci 
    JOIN public.products p ON ci.product_id = p.id 
    WHERE ci.checkout_id = p_checkout_id 
  LOOP
    IF checkout_item_record.stock_quantity < checkout_item_record.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара "%" на складе.', checkout_item_record.name;
    END IF;
  END LOOP;

  -- Списываем товары и обновляем sales_count
  FOR checkout_item_record IN 
    SELECT product_id, quantity FROM public.guest_checkout_items WHERE checkout_id = p_checkout_id 
  LOOP
    UPDATE public.products
    SET 
      stock_quantity = stock_quantity - checkout_item_record.quantity,
      sales_count = sales_count + checkout_item_record.quantity
    WHERE id = checkout_item_record.product_id;
  END LOOP;

  -- Обновляем статус
  UPDATE public.guest_checkouts 
  SET status = 'confirmed'
  WHERE id = p_checkout_id;

  RETURN 'Успех: Гостевой заказ ' || p_checkout_id || ' подтвержден.';
END;
$$;

COMMENT ON FUNCTION public.confirm_guest_checkout IS 
  'Подтверждает гостевой заказ: списывает товары со склада';


-- Функция отмены пользовательского заказа
CREATE OR REPLACE FUNCTION public.cancel_user_order(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_order RECORD;
BEGIN
  SELECT * INTO target_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  
  IF target_order IS NULL THEN 
    RETURN 'Ошибка: Заказ не найден.'; 
  END IF;
  
  IF target_order.status = 'cancelled' THEN 
    RETURN 'Ошибка: Заказ уже отменен.'; 
  END IF;

  -- Если заказ был подтвержден - возвращаем товары на склад
  IF target_order.status = 'confirmed' THEN
    UPDATE public.products p
    SET 
      stock_quantity = stock_quantity + oi.quantity,
      sales_count = GREATEST(sales_count - oi.quantity, 0)
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND p.id = oi.product_id;
    
    -- Возвращаем бонусы
    IF target_order.user_id IS NOT NULL THEN
      UPDATE public.profiles
      SET 
        active_bonus_balance = active_bonus_balance + target_order.bonuses_spent,
        pending_bonus_balance = pending_bonus_balance - target_order.bonuses_awarded
      WHERE id = target_order.user_id;
    END IF;
  END IF;

  UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
  
  RETURN 'Успех: Заказ ' || p_order_id || ' отменен.';
END;
$$;

COMMENT ON FUNCTION public.cancel_user_order IS 
  'Отменяет заказ пользователя и возвращает товары на склад';


-- Функция отмены гостевого заказа
CREATE OR REPLACE FUNCTION public.cancel_guest_checkout(p_checkout_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_checkout RECORD;
BEGIN
  SELECT * INTO target_checkout FROM public.guest_checkouts WHERE id = p_checkout_id FOR UPDATE;
  
  IF target_checkout IS NULL THEN 
    RETURN 'Ошибка: Заказ не найден.'; 
  END IF;
  
  IF target_checkout.status = 'cancelled' THEN 
    RETURN 'Ошибка: Заказ уже отменен.'; 
  END IF;

  -- Если заказ был подтвержден - возвращаем товары на склад
  IF target_checkout.status = 'confirmed' THEN
    UPDATE public.products p
    SET 
      stock_quantity = stock_quantity + ci.quantity,
      sales_count = GREATEST(sales_count - ci.quantity, 0)
    FROM public.guest_checkout_items ci
    WHERE ci.checkout_id = p_checkout_id AND p.id = ci.product_id;
  END IF;

  UPDATE public.guest_checkouts SET status = 'cancelled' WHERE id = p_checkout_id;
  
  RETURN 'Успех: Гостевой заказ ' || p_checkout_id || ' отменен.';
END;
$$;

COMMENT ON FUNCTION public.cancel_guest_checkout IS 
  'Отменяет гостевой заказ и возвращает товары на склад';