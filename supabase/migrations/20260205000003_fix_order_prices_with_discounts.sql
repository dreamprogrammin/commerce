-- =====================================================================================
-- ИСПРАВЛЕНИЕ: Цены в заказах без учёта скидок
-- =====================================================================================
-- ПРОБЛЕМА:
-- При создании заказа в order_items сохраняется полная цена (price),
-- а не цена со скидкой (price с учётом discount_percentage)
-- В уведомлениях Telegram показывается цена без акции
--
-- ПРИЧИНА:
-- Функции create_user_order и create_guest_checkout берут только products.price,
-- не учитывая discount_percentage
--
-- РЕШЕНИЕ:
-- Вычислять финальную цену с учётом скидки:
-- final_price = price * (100 - discount_percentage) / 100
-- =====================================================================================

-- =====================================================================================
-- ИСПРАВЛЕНИЕ: create_user_order
-- =====================================================================================

DROP FUNCTION IF EXISTS public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER);

CREATE OR REPLACE FUNCTION public.create_user_order(
  p_cart_items JSONB,
  p_delivery_method TEXT,
  p_payment_method TEXT DEFAULT NULL,
  p_delivery_address JSONB DEFAULT NULL,
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
  v_calculated_discount NUMERIC := 0;
  v_cart_item RECORD;
  v_product_record RECORD;
  v_bonus_rate NUMERIC := 1.0;
  v_is_first_order BOOLEAN;
  v_new_active_balance INTEGER;
  v_new_pending_balance INTEGER;
  v_user_email TEXT;
  v_user_name TEXT;
  v_item_final_price NUMERIC;  -- ✅ Финальная цена товара с учётом скидки
BEGIN
  -- Проверка авторизации
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация для оформления заказа';
  END IF;

  -- Получаем профиль пользователя
  SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_current_user_id;

  -- АВТОМАТИЧЕСКОЕ СОЗДАНИЕ ПРОФИЛЯ, ЕСЛИ ЕГО НЕТ
  IF v_user_profile IS NULL THEN
    SELECT email,
           COALESCE(
             raw_user_meta_data->>'first_name',
             raw_user_meta_data->>'full_name',
             raw_user_meta_data->>'name',
             split_part(email, '@', 1),
             'Гость'
           )
    INTO v_user_email, v_user_name
    FROM auth.users
    WHERE id = v_current_user_id;

    INSERT INTO public.profiles (
      id, first_name, role,
      active_bonus_balance, pending_bonus_balance, has_received_welcome_bonus
    )
    VALUES (
      v_current_user_id, v_user_name, 'user', 0, 0, FALSE
    )
    ON CONFLICT (id) DO NOTHING;

    SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_current_user_id;

    IF v_user_profile IS NULL THEN
      RAISE EXCEPTION 'Не удалось создать профиль. Email: %, User ID: %', v_user_email, v_current_user_id;
    END IF;
  END IF;

  -- Проверяем, первый ли это заказ
  SELECT NOT EXISTS(SELECT 1 FROM public.orders WHERE user_id = v_current_user_id) INTO v_is_first_order;

  -- ✅ ИСПРАВЛЕНИЕ: Рассчитываем стоимость С УЧЁТОМ СКИДОК
  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT
      price,
      COALESCE(discount_percentage, 0) as discount_percentage,
      bonus_points_award,
      stock_quantity
    INTO v_product_record
    FROM public.products
    WHERE id = v_cart_item.product_id AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар не найден';
    END IF;

    IF v_product_record.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара на складе';
    END IF;

    -- ✅ Вычисляем финальную цену товара с учётом скидки
    v_item_final_price := v_product_record.price * (100 - v_product_record.discount_percentage) / 100;

    v_total_price := v_total_price + (v_item_final_price * v_cart_item.quantity);
    v_total_award_bonuses := v_total_award_bonuses + (COALESCE(v_product_record.bonus_points_award, 0) * v_cart_item.quantity);
  END LOOP;

  -- Применяем бонусы к оплате
  IF COALESCE(p_bonuses_to_spend, 0) > 0 THEN
    IF COALESCE(v_user_profile.active_bonus_balance, 0) < p_bonuses_to_spend THEN
      RAISE EXCEPTION 'Недостаточно бонусов. Доступно: %, запрошено: %',
        COALESCE(v_user_profile.active_bonus_balance, 0), p_bonuses_to_spend;
    END IF;

    v_bonus_rate := COALESCE(v_bonus_rate, 1.0);
    v_calculated_discount := COALESCE(p_bonuses_to_spend, 0) * v_bonus_rate;
  END IF;

  v_final_price := GREATEST(COALESCE(v_total_price, 0) - COALESCE(v_calculated_discount, 0), 0);

  -- Создаем заказ
  INSERT INTO public.orders (
    user_id, total_amount, discount_amount, final_amount,
    bonuses_spent, bonuses_awarded, delivery_method, delivery_address, payment_method, status
  )
  VALUES (
    v_current_user_id,
    COALESCE(v_total_price, 0),
    COALESCE(v_calculated_discount, 0),
    COALESCE(v_final_price, 0),
    COALESCE(p_bonuses_to_spend, 0),
    COALESCE(v_total_award_bonuses, 0),
    p_delivery_method,
    p_delivery_address,
    p_payment_method,
    'new'
  )
  RETURNING id INTO v_new_order_id;

  -- ✅ ИСПРАВЛЕНИЕ: Сохраняем товары С ФИНАЛЬНОЙ ЦЕНОЙ (с учётом скидки)
  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT
      price,
      COALESCE(discount_percentage, 0) as discount_percentage,
      bonus_points_award
    INTO v_product_record
    FROM public.products
    WHERE id = v_cart_item.product_id;

    -- ✅ Вычисляем финальную цену товара с учётом скидки
    v_item_final_price := v_product_record.price * (100 - v_product_record.discount_percentage) / 100;

    INSERT INTO public.order_items (order_id, product_id, quantity, price_per_item, bonus_points_per_item)
    VALUES (
      v_new_order_id,
      v_cart_item.product_id,
      v_cart_item.quantity,
      v_item_final_price,  -- ✅ Сохраняем цену СО СКИДКОЙ
      COALESCE(v_product_record.bonus_points_award, 0)
    );
  END LOOP;

  -- Списываем бонусы
  IF COALESCE(p_bonuses_to_spend, 0) > 0 THEN
    v_new_active_balance := GREATEST(COALESCE(v_user_profile.active_bonus_balance, 0) - p_bonuses_to_spend, 0);

    UPDATE public.profiles
    SET active_bonus_balance = v_new_active_balance
    WHERE id = v_current_user_id;

    INSERT INTO public.bonus_transactions (
      user_id, order_id, amount, transaction_type, status, description
    ) VALUES (
      v_current_user_id,
      v_new_order_id,
      -p_bonuses_to_spend,
      'spent',
      'completed',
      'Списание бонусов при оформлении заказа'
    );
  END IF;

  RETURN v_new_order_id;
END;
$$;

COMMENT ON FUNCTION public.create_user_order IS
'Создаёт заказ для авторизованного пользователя с учётом бонусов.
ИСПРАВЛЕНИЕ (2026-02-05): Учитывается discount_percentage при расчёте цены';

-- =====================================================================================
-- ИСПРАВЛЕНИЕ: create_guest_checkout
-- =====================================================================================

DROP FUNCTION IF EXISTS public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT);

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
  v_item_final_price NUMERIC;  -- ✅ Финальная цена товара с учётом скидки
BEGIN
  -- Валидация гостевых данных
  IF p_guest_info->>'name' IS NULL OR p_guest_info->>'email' IS NULL OR p_guest_info->>'phone' IS NULL THEN
    RAISE EXCEPTION 'Необходимо указать имя, email и телефон';
  END IF;

  -- ✅ ИСПРАВЛЕНИЕ: Рассчитываем общую стоимость С УЧЁТОМ СКИДОК
  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT
      price,
      COALESCE(discount_percentage, 0) as discount_percentage,
      stock_quantity
    INTO v_product_record
    FROM public.products
    WHERE id = v_cart_item.product_id AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар не найден';
    END IF;

    IF v_product_record.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара на складе';
    END IF;

    -- ✅ Вычисляем финальную цену товара с учётом скидки
    v_item_final_price := v_product_record.price * (100 - v_product_record.discount_percentage) / 100;

    v_total_price := v_total_price + (v_item_final_price * v_cart_item.quantity);
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

  -- ✅ ИСПРАВЛЕНИЕ: Добавляем товары С ФИНАЛЬНОЙ ЦЕНОЙ (с учётом скидки)
  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT
      price,
      COALESCE(discount_percentage, 0) as discount_percentage
    INTO v_product_record
    FROM public.products
    WHERE id = v_cart_item.product_id;

    -- ✅ Вычисляем финальную цену товара с учётом скидки
    v_item_final_price := v_product_record.price * (100 - v_product_record.discount_percentage) / 100;

    INSERT INTO public.guest_checkout_items (checkout_id, product_id, quantity, price_per_item)
    VALUES (
      v_new_checkout_id,
      v_cart_item.product_id,
      v_cart_item.quantity,
      v_item_final_price  -- ✅ Сохраняем цену СО СКИДКОЙ
    );
  END LOOP;

  RETURN v_new_checkout_id;
END;
$$;

COMMENT ON FUNCTION public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT) IS
'Создаёт гостевой заказ без регистрации и без бонусов.
ИСПРАВЛЕНИЕ (2026-02-05): Учитывается discount_percentage при расчёте цены';

-- Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
