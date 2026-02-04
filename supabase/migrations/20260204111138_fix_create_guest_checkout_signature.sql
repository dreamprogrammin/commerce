-- ============================================================================
-- FIX: Пересоздание create_guest_checkout для обновления кэша PostgREST
-- ============================================================================
-- ПРОБЛЕМА:
-- PostgREST не находит функцию create_guest_checkout в кэше
-- Ошибка PGRST204: Could not find the function public.create_guest_checkout
--
-- РЕШЕНИЕ:
-- Удаляем все версии функции и пересоздаём с правильной сигнатурой
-- Обновляем кэш PostgREST
-- ============================================================================

-- Удаляем все версии create_guest_checkout
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT oid::regprocedure as func_signature
        FROM pg_proc
        WHERE proname = 'create_guest_checkout'
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.func_signature);
        RAISE NOTICE 'Dropped function: %', r.func_signature;
    END LOOP;
END $$;

-- Пересоздаём функцию с правильной сигнатурой
CREATE FUNCTION public.create_guest_checkout(
  p_cart_items JSONB,
  p_guest_info JSONB,
  p_delivery_method TEXT,
  p_delivery_address JSONB DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_checkout_id UUID;
  v_total_price NUMERIC := 0;
  v_cart_item RECORD;
  v_product_record RECORD;
BEGIN
  -- Валидация гостевых данных
  IF p_guest_info->>'name' IS NULL OR p_guest_info->>'email' IS NULL OR p_guest_info->>'phone' IS NULL THEN
    RAISE EXCEPTION 'Необходимо указать имя, email и телефон';
  END IF;

  -- Рассчитываем общую стоимость и проверяем наличие
  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT price, stock_quantity INTO v_product_record
    FROM public.products WHERE id = v_cart_item.product_id AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар не найден';
    END IF;

    IF v_product_record.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара на складе';
    END IF;

    v_total_price := v_total_price + (v_product_record.price * v_cart_item.quantity);
  END LOOP;

  -- Создаем гостевой заказ
  INSERT INTO public.guest_checkouts (
    guest_name, guest_email, guest_phone,
    total_amount, final_amount, delivery_method, delivery_address, payment_method, status
  )
  VALUES (
    p_guest_info->>'name', p_guest_info->>'email', p_guest_info->>'phone',
    v_total_price, v_total_price, p_delivery_method, p_delivery_address, p_payment_method, 'new'
  )
  RETURNING id INTO v_new_checkout_id;

  -- Добавляем товары в гостевой заказ
  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT price INTO v_product_record FROM public.products WHERE id = v_cart_item.product_id;

    INSERT INTO public.guest_checkout_items (checkout_id, product_id, quantity, price_per_item)
    VALUES (v_new_checkout_id, v_cart_item.product_id, v_cart_item.quantity, v_product_record.price);
  END LOOP;

  RETURN v_new_checkout_id;
END;
$$;

COMMENT ON FUNCTION public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT) IS
'Создает гостевой заказ без регистрации и без бонусов.
Параметры:
  - p_cart_items: JSON массив товаров [{product_id, quantity}]
  - p_guest_info: JSON с данными гостя {name, email, phone}
  - p_delivery_method: Способ доставки
  - p_delivery_address: JSON с адресом доставки (опционально)
  - p_payment_method: Способ оплаты (опционально)

ИСПРАВЛЕНИЕ (2026-02-04):
  - Пересоздана для обновления кэша PostgREST
  - Добавлен SET search_path = public';

-- Принудительно обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
