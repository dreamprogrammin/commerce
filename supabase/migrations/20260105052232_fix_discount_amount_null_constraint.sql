-- =====================================================================================
-- ИСПРАВЛЕНИЕ: NULL значение в discount_amount при создании заказа
-- =====================================================================================
-- Проблема:
-- - При создании заказа БЕЗ бонусов discount_amount получает NULL вместо 0
-- - Это нарушает NOT NULL constraint в таблице orders
-- - Ошибка: null value in column "discount_amount" violates not-null constraint
--
-- Решение:
-- - Гарантировать, что v_calculated_discount всегда имеет значение (0 или расчетное)
-- - Использовать COALESCE для всех вычислений с бонусами
-- =====================================================================================

DROP FUNCTION IF EXISTS public.create_order(JSONB, TEXT, TEXT, JSONB, JSONB, INTEGER);

CREATE OR REPLACE FUNCTION public.create_order(
  p_cart_items JSONB,
  p_delivery_method TEXT,
  p_payment_method TEXT DEFAULT NULL,
  p_delivery_address JSONB DEFAULT NULL,
  p_guest_info JSONB DEFAULT NULL,
  p_bonuses_to_spend INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_user_profile RECORD;
  v_new_order_id UUID;
  v_total_price NUMERIC := 0;
  v_total_award_bonuses INTEGER := 0;
  v_final_price NUMERIC;
  v_calculated_discount NUMERIC := 0;  -- ✅ По умолчанию 0
  v_cart_item RECORD;
  v_product_record RECORD;
  v_bonus_rate NUMERIC := 1.0;  -- ✅ По умолчанию 1.0
BEGIN
  -- Рассчитываем общую стоимость и бонусы к начислению
  FOR v_cart_item IN
    SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER)
  LOOP
    SELECT price, bonus_points_award, stock_quantity
    INTO v_product_record
    FROM public.products
    WHERE id = v_cart_item.product_id AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар с ID % не найден или неактивен', v_cart_item.product_id;
    END IF;

    IF v_product_record.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара на складе для товара %', v_cart_item.product_id;
    END IF;

    v_total_price := v_total_price + (v_product_record.price * v_cart_item.quantity);
    v_total_award_bonuses := v_total_award_bonuses + (v_product_record.bonus_points_award * v_cart_item.quantity);
  END LOOP;

  -- ✅ ИСПРАВЛЕНИЕ: Обрабатываем бонусы только если пользователь авторизован И бонусы > 0
  IF v_current_user_id IS NOT NULL AND COALESCE(p_bonuses_to_spend, 0) > 0 THEN
    SELECT * INTO v_user_profile
    FROM public.profiles
    WHERE id = v_current_user_id;

    IF v_user_profile IS NULL THEN
      RAISE EXCEPTION 'Профиль не найден. Зарегистрируйтесь для использования бонусов.';
    END IF;

    IF COALESCE(v_user_profile.active_bonus_balance, 0) < p_bonuses_to_spend THEN
      RAISE EXCEPTION 'Недостаточно активных бонусов. Доступно: %, запрошено: %',
        COALESCE(v_user_profile.active_bonus_balance, 0), p_bonuses_to_spend;
    END IF;

    -- ✅ Получаем коэффициент конверсии с гарантией non-NULL значения
    SELECT COALESCE((value->>'bonus_conversion_rate')::NUMERIC, 1.0)
    INTO v_bonus_rate
    FROM public.settings
    WHERE key = 'bonus_system';

    -- ✅ Гарантируем, что v_bonus_rate не NULL
    v_bonus_rate := COALESCE(v_bonus_rate, 1.0);

    -- ✅ Вычисляем скидку (всегда будет число, не NULL)
    v_calculated_discount := COALESCE(p_bonuses_to_spend, 0) * v_bonus_rate;
  END IF;

  -- ✅ Гарантируем, что финальная цена не отрицательная и не NULL
  v_final_price := GREATEST(COALESCE(v_total_price, 0) - COALESCE(v_calculated_discount, 0), 0);

  -- Создаем заказ
  INSERT INTO public.orders (
    user_id,
    guest_name,
    guest_email,
    guest_phone,
    total_amount,
    discount_amount,  -- ✅ Всегда будет число (0 или расчетное), не NULL
    final_amount,
    bonuses_spent,
    bonuses_awarded,
    delivery_method,
    delivery_address,
    payment_method,
    status
  )
  VALUES (
    v_current_user_id,
    p_guest_info->>'name',
    p_guest_info->>'email',
    p_guest_info->>'phone',
    COALESCE(v_total_price, 0),
    COALESCE(v_calculated_discount, 0),  -- ✅ ИСПРАВЛЕНИЕ: Гарантируем 0 вместо NULL
    COALESCE(v_final_price, 0),
    CASE WHEN v_current_user_id IS NOT NULL THEN COALESCE(p_bonuses_to_spend, 0) ELSE 0 END,
    CASE WHEN v_current_user_id IS NOT NULL THEN COALESCE(v_total_award_bonuses, 0) ELSE 0 END,
    p_delivery_method,
    p_delivery_address,
    p_payment_method,
    'new'
  )
  RETURNING id INTO v_new_order_id;

  -- Вставляем товары заказа
  FOR v_cart_item IN
    SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER)
  LOOP
    SELECT price INTO v_product_record
    FROM public.products
    WHERE id = v_cart_item.product_id;

    INSERT INTO public.order_items (order_id, product_id, quantity, price_at_purchase)
    VALUES (v_new_order_id, v_cart_item.product_id, v_cart_item.quantity, v_product_record.price);
  END LOOP;

  -- ✅ Списываем бонусы ТОЛЬКО если они были применены
  IF v_current_user_id IS NOT NULL AND COALESCE(p_bonuses_to_spend, 0) > 0 THEN
    UPDATE public.profiles
    SET active_bonus_balance = GREATEST(active_bonus_balance - p_bonuses_to_spend, 0)
    WHERE id = v_current_user_id;
  END IF;

  RETURN v_new_order_id;
END;
$$;

COMMENT ON FUNCTION public.create_order(JSONB, TEXT, TEXT, JSONB, JSONB, INTEGER) IS
'Создает новый заказ (для авторизованных и гостей).
Параметры:
  - p_cart_items: JSON массив товаров [{product_id, quantity}]
  - p_delivery_method: Способ доставки
  - p_payment_method: Способ оплаты
  - p_delivery_address: JSON с адресом доставки
  - p_guest_info: JSON с данными гостя {name, email, phone} (для неавторизованных)
  - p_bonuses_to_spend: Количество бонусов к списанию (только для авторизованных)

ИСПРАВЛЕНИЕ v1.1:
  - Гарантируем, что discount_amount никогда не NULL (используем COALESCE)
  - Гарантируем, что все числовые поля имеют значения (0 вместо NULL)';
