-- =====================================================================================
-- ИСПРАВЛЕНИЕ: Использование правильной таблицы bonus_transactions вместо bonuses
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

  -- Рассчитываем стоимость и бонусы с товаров
  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT price, bonus_points_award, stock_quantity INTO v_product_record
    FROM public.products WHERE id = v_cart_item.product_id AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар не найден';
    END IF;

    IF v_product_record.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара на складе';
    END IF;

    v_total_price := v_total_price + (v_product_record.price * v_cart_item.quantity);
    v_total_award_bonuses := v_total_award_bonuses + (COALESCE(v_product_record.bonus_points_award, 0) * v_cart_item.quantity);
  END LOOP;

  -- Применяем бонусы к оплате
  IF COALESCE(p_bonuses_to_spend, 0) > 0 THEN
    IF COALESCE(v_user_profile.active_bonus_balance, 0) < p_bonuses_to_spend THEN
      RAISE EXCEPTION 'Недостаточно бонусов. Доступно: %, запрошено: %',
        COALESCE(v_user_profile.active_bonus_balance, 0), p_bonuses_to_spend;
    END IF;

    SELECT COALESCE((value->>'bonus_conversion_rate')::NUMERIC, 1.0)
    INTO v_bonus_rate FROM public.settings WHERE key = 'bonus_system';

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

  -- Добавляем товары в заказ
  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT price, bonus_points_award INTO v_product_record FROM public.products WHERE id = v_cart_item.product_id;

    INSERT INTO public.order_items (order_id, product_id, quantity, price_per_item, bonus_points_per_item)
    VALUES (v_new_order_id, v_cart_item.product_id, v_cart_item.quantity, v_product_record.price, COALESCE(v_product_record.bonus_points_award, 0));
  END LOOP;

  -- ✅ ЛОГИРОВАНИЕ: Списываем потраченные бонусы
  IF COALESCE(p_bonuses_to_spend, 0) > 0 THEN
    UPDATE public.profiles
    SET active_bonus_balance = GREATEST(COALESCE(active_bonus_balance, 0) - p_bonuses_to_spend, 0)
    WHERE id = v_current_user_id
    RETURNING active_bonus_balance, pending_bonus_balance INTO v_new_active_balance, v_new_pending_balance;

    INSERT INTO public.bonus_transactions (
      user_id, order_id, transaction_type, amount,
      balance_after, pending_balance_after,
      description, status
    ) VALUES (
      v_current_user_id, v_new_order_id, 'spent', -p_bonuses_to_spend,
      v_new_active_balance, v_new_pending_balance,
      'Оплата заказа', 'completed'
    );
  END IF;

  -- ✅ ЛОГИРОВАНИЕ: Приветственный бонус
  IF v_is_first_order AND NOT COALESCE(v_user_profile.has_received_welcome_bonus, FALSE) THEN
    UPDATE public.profiles
    SET
      active_bonus_balance = COALESCE(active_bonus_balance, 0) + 1000,
      has_received_welcome_bonus = TRUE
    WHERE id = v_current_user_id
    RETURNING active_bonus_balance, pending_bonus_balance INTO v_new_active_balance, v_new_pending_balance;

    INSERT INTO public.bonus_transactions (
      user_id, order_id, transaction_type, amount,
      balance_after, pending_balance_after,
      description, status
    ) VALUES (
      v_current_user_id, v_new_order_id, 'welcome', 1000,
      v_new_active_balance, v_new_pending_balance,
      'Приветственный бонус за первый заказ', 'completed'
    );
  END IF;

  -- ✅ ЛОГИРОВАНИЕ: Бонусы за товары (pending, активация через 7 дней)
  IF COALESCE(v_total_award_bonuses, 0) > 0 THEN
    UPDATE public.profiles
    SET pending_bonus_balance = COALESCE(pending_bonus_balance, 0) + v_total_award_bonuses
    WHERE id = v_current_user_id
    RETURNING active_bonus_balance, pending_bonus_balance INTO v_new_active_balance, v_new_pending_balance;

    INSERT INTO public.bonus_transactions (
      user_id, order_id, transaction_type, amount,
      balance_after, pending_balance_after,
      description, status, activation_date
    ) VALUES (
      v_current_user_id, v_new_order_id, 'earned', v_total_award_bonuses,
      v_new_active_balance, v_new_pending_balance,
      'Бонусы за покупку', 'pending',
      NOW() + INTERVAL '7 days'
    );
  END IF;

  RETURN v_new_order_id;
END;
$$;

COMMENT ON FUNCTION public.create_user_order IS
'Создает заказ для авторизованного пользователя с автоматическим созданием профиля и логированием бонусов в bonus_transactions.';
