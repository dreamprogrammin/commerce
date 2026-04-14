-- ============================================================================
-- FIX: Гостевые заказы не отправляют уведомления в Telegram
-- ============================================================================
-- ПРОБЛЕМА:
-- Функция create_guest_checkout создает заказ в таблице orders,
-- а триггер trigger_notify_guest_checkout настроен на таблицу guest_checkouts
--
-- РЕШЕНИЕ:
-- 1. Добавляем недостающие колонки в guest_checkouts
-- 2. Исправляем функцию create_guest_checkout, чтобы она создавала заказ
--    в таблице guest_checkouts, а не в orders
-- ============================================================================

-- Добавляем недостающие колонки
ALTER TABLE public.guest_checkouts 
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'online' CHECK (source IN ('online', 'offline')),
  ADD COLUMN IF NOT EXISTS delivery_cost NUMERIC(10, 2) DEFAULT 0 CHECK (delivery_cost >= 0),
  ADD COLUMN IF NOT EXISTS telegram_message_id TEXT,
  ADD COLUMN IF NOT EXISTS comment TEXT;

-- Добавляем created_at в guest_checkout_items если его нет
ALTER TABLE public.guest_checkout_items
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DROP FUNCTION IF EXISTS public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT, TEXT, NUMERIC);

CREATE FUNCTION public.create_guest_checkout(
  p_cart_items      JSONB,
  p_guest_info      JSONB,
  p_delivery_method TEXT,
  p_delivery_address JSONB DEFAULT NULL,
  p_payment_method  TEXT  DEFAULT NULL,
  p_promo_code      TEXT  DEFAULT NULL,
  p_delivery_cost   NUMERIC DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_order_id    UUID;
  v_total_price     NUMERIC := 0;
  v_promo_discount  NUMERIC := 0;
  v_final_price     NUMERIC;
  v_cart_item       RECORD;
  v_product_record  RECORD;
  v_validated_items JSONB   := '[]'::JSONB;
  v_promo_record    RECORD;
BEGIN
  -- Проверяем обязательные поля
  IF p_guest_info->>'name' IS NULL OR p_guest_info->>'email' IS NULL OR p_guest_info->>'phone' IS NULL THEN
    RAISE EXCEPTION 'Необходимо указать имя, email и телефон';
  END IF;

  -- Валидация и резервирование товаров
  FOR v_cart_item IN
    SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER)
  LOOP
    SELECT final_price, stock_quantity, name
    INTO v_product_record
    FROM public.products
    WHERE id = v_cart_item.product_id AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар не найден или недоступен (ID: %)', v_cart_item.product_id;
    END IF;

    IF v_product_record.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара "%" на складе. Доступно: %, запрошено: %',
        v_product_record.name, v_product_record.stock_quantity, v_cart_item.quantity;
    END IF;

    -- Резервируем товар
    UPDATE public.products
    SET stock_quantity = stock_quantity - v_cart_item.quantity,
        updated_at = NOW()
    WHERE id = v_cart_item.product_id;

    v_total_price := v_total_price + (v_product_record.final_price * v_cart_item.quantity);

    v_validated_items := v_validated_items || jsonb_build_object(
      'product_id', v_cart_item.product_id,
      'quantity',   v_cart_item.quantity,
      'final_price', v_product_record.final_price
    );
  END LOOP;

  -- Рассчитываем финальную цену
  v_final_price := v_total_price - v_promo_discount + p_delivery_cost;

  IF v_final_price < 0 THEN
    v_final_price := 0;
  END IF;

  -- ✅ ИСПРАВЛЕНИЕ: Создаем заказ в таблице guest_checkouts, а не orders
  INSERT INTO public.guest_checkouts (
    guest_name,
    guest_email,
    guest_phone,
    total_amount,
    final_amount,
    delivery_method,
    delivery_address,
    payment_method,
    status,
    source,
    delivery_cost,
    created_at,
    updated_at
  ) VALUES (
    p_guest_info->>'name',
    p_guest_info->>'email',
    p_guest_info->>'phone',
    v_total_price,
    v_final_price,
    p_delivery_method,
    p_delivery_address,
    p_payment_method,
    'new',
    'online',
    p_delivery_cost,
    NOW(),
    NOW()
  ) RETURNING id INTO v_new_order_id;

  -- Создаем товары заказа в guest_checkout_items
  FOR v_cart_item IN SELECT * FROM jsonb_array_elements(v_validated_items)
  LOOP
    INSERT INTO public.guest_checkout_items (
      checkout_id,
      product_id,
      quantity,
      price_per_item,
      created_at
    ) VALUES (
      v_new_order_id,
      (v_cart_item.value->>'product_id')::UUID,
      (v_cart_item.value->>'quantity')::INTEGER,
      (v_cart_item.value->>'final_price')::NUMERIC,
      NOW()
    );
  END LOOP;

  RETURN v_new_order_id;
END;
$$;

COMMENT ON FUNCTION public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT, TEXT, NUMERIC) IS
  'Создает гостевой заказ в таблице guest_checkouts с резервированием товара';

GRANT EXECUTE ON FUNCTION public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT, TEXT, NUMERIC) TO anon, authenticated;

-- Проверяем наличие триггера
DO $$
DECLARE
  v_trigger_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'guest_checkouts'
      AND event_object_schema = 'public'
      AND trigger_name = 'trigger_notify_guest_checkout'
  ) INTO v_trigger_exists;

  IF v_trigger_exists THEN
    RAISE NOTICE '✅ Триггер trigger_notify_guest_checkout активен на таблице guest_checkouts';
  ELSE
    RAISE WARNING '❌ Триггер trigger_notify_guest_checkout НЕ НАЙДЕН на таблице guest_checkouts';
  END IF;
END $$;

-- Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
