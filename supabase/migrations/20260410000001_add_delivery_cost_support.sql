-- Обновление функции create_user_order для поддержки delivery_cost
DROP FUNCTION IF EXISTS public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER, TEXT, TEXT, TEXT);

CREATE FUNCTION public.create_user_order(
  p_cart_items       JSONB,
  p_delivery_method  TEXT,
  p_payment_method   TEXT    DEFAULT NULL,
  p_delivery_address JSONB   DEFAULT NULL,
  p_bonuses_to_spend INTEGER DEFAULT 0,
  p_promo_code       TEXT    DEFAULT NULL,
  p_contact_name     TEXT    DEFAULT NULL,
  p_contact_phone    TEXT    DEFAULT NULL,
  p_delivery_cost    NUMERIC DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id     UUID    := auth.uid();
  v_user_profile        RECORD;
  v_new_order_id        UUID;
  v_total_price         NUMERIC := 0;
  v_total_award_bonuses INTEGER := 0;
  v_final_price         NUMERIC;
  v_calculated_discount NUMERIC := 0;
  v_promo_discount      NUMERIC := 0;
  v_cart_item           RECORD;
  v_product_record      RECORD;
  v_bonus_rate          NUMERIC := 1.0;
  v_is_first_order      BOOLEAN;
  v_new_active_balance  INTEGER;
  v_new_pending_balance INTEGER;
  v_user_email          TEXT;
  v_user_name           TEXT;
  v_validated_items     JSONB   := '[]'::JSONB;
  v_promo_record        RECORD;
  v_contact_name        TEXT;
  v_contact_phone       TEXT;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация для оформления заказа';
  END IF;

  v_contact_name  := NULLIF(TRIM(COALESCE(p_contact_name,  '')), '');
  v_contact_phone := NULLIF(TRIM(COALESCE(p_contact_phone, '')), '');

  SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_current_user_id;

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
    FROM auth.users WHERE id = v_current_user_id;

    INSERT INTO public.profiles (
      id, first_name, active_bonus_balance, pending_bonus_balance, created_at, updated_at
    ) VALUES (
      v_current_user_id, v_user_name, 0, 0, NOW(), NOW()
    );

    SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_current_user_id;
  END IF;

  IF p_bonuses_to_spend > v_user_profile.active_bonus_balance THEN
    RAISE EXCEPTION 'Недостаточно бонусов. Доступно: %, запрошено: %',
      v_user_profile.active_bonus_balance, p_bonuses_to_spend;
  END IF;

  IF p_promo_code IS NOT NULL AND TRIM(p_promo_code) <> '' THEN
    SELECT * INTO v_promo_record
    FROM public.promo_campaigns
    WHERE code = UPPER(TRIM(p_promo_code))
      AND is_active = TRUE
      AND (valid_from IS NULL OR valid_from <= NOW())
      AND (valid_until IS NULL OR valid_until >= NOW());

    IF v_promo_record IS NOT NULL THEN
      v_bonus_rate := v_promo_record.bonus_multiplier;
    END IF;
  END IF;

  FOR v_cart_item IN SELECT * FROM jsonb_array_elements(p_cart_items)
  LOOP
    SELECT * INTO v_product_record
    FROM public.products
    WHERE id = (v_cart_item.value->>'product_id')::UUID
      AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар % не найден или неактивен', v_cart_item.value->>'product_id';
    END IF;

    IF v_product_record.stock_quantity < (v_cart_item.value->>'quantity')::INTEGER THEN
      RAISE EXCEPTION 'Недостаточно товара "%" на складе. Доступно: %, запрошено: %',
        v_product_record.name,
        v_product_record.stock_quantity,
        (v_cart_item.value->>'quantity')::INTEGER;
    END IF;

    UPDATE public.products
    SET stock_quantity = stock_quantity - (v_cart_item.value->>'quantity')::INTEGER,
        updated_at = NOW()
    WHERE id = v_product_record.id;

    v_total_price := v_total_price + (v_product_record.final_price * (v_cart_item.value->>'quantity')::INTEGER);
    v_total_award_bonuses := v_total_award_bonuses +
      (COALESCE(v_product_record.bonus_points_award, 0) * (v_cart_item.value->>'quantity')::INTEGER);

    v_validated_items := v_validated_items || jsonb_build_object(
      'product_id', v_product_record.id,
      'quantity', (v_cart_item.value->>'quantity')::INTEGER,
      'price', v_product_record.final_price
    );
  END LOOP;

  v_calculated_discount := LEAST(p_bonuses_to_spend, v_total_price);
  v_final_price := v_total_price - v_calculated_discount + p_delivery_cost;

  IF v_final_price < 0 THEN
    v_final_price := 0;
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.orders WHERE user_id = v_current_user_id
  ) INTO v_is_first_order;

  v_total_award_bonuses := FLOOR(v_total_award_bonuses * v_bonus_rate);

  INSERT INTO public.orders (
    user_id,
    total_amount,
    discount_amount,
    final_amount,
    delivery_method,
    delivery_address,
    payment_method,
    bonuses_spent,
    bonuses_awarded,
    bonuses_activation_date,
    status,
    source,
    customer_name,
    customer_phone,
    delivery_cost,
    created_at,
    updated_at
  ) VALUES (
    v_current_user_id,
    v_total_price,
    v_calculated_discount,
    v_final_price,
    p_delivery_method,
    p_delivery_address,
    p_payment_method,
    p_bonuses_to_spend,
    v_total_award_bonuses,
    NOW() + INTERVAL '14 days',
    'new',
    'web',
    COALESCE(v_contact_name, v_user_profile.first_name),
    COALESCE(v_contact_phone, v_user_profile.phone),
    p_delivery_cost,
    NOW(),
    NOW()
  ) RETURNING id INTO v_new_order_id;

  FOR v_cart_item IN SELECT * FROM jsonb_array_elements(v_validated_items)
  LOOP
    INSERT INTO public.order_items (
      order_id,
      product_id,
      quantity,
      price_at_purchase,
      created_at
    ) VALUES (
      v_new_order_id,
      (v_cart_item.value->>'product_id')::UUID,
      (v_cart_item.value->>'quantity')::INTEGER,
      (v_cart_item.value->>'price')::NUMERIC,
      NOW()
    );
  END LOOP;

  IF p_bonuses_to_spend > 0 THEN
    v_new_active_balance := v_user_profile.active_bonus_balance - p_bonuses_to_spend;

    UPDATE public.profiles
    SET active_bonus_balance = v_new_active_balance,
        updated_at = NOW()
    WHERE id = v_current_user_id;

    INSERT INTO public.bonus_transactions (
      profile_id,
      amount,
      transaction_type,
      description,
      order_id,
      created_at
    ) VALUES (
      v_current_user_id,
      -p_bonuses_to_spend,
      'spent',
      'Списание бонусов за заказ',
      v_new_order_id,
      NOW()
    );
  END IF;

  v_new_pending_balance := v_user_profile.pending_bonus_balance + v_total_award_bonuses;

  UPDATE public.profiles
  SET pending_bonus_balance = v_new_pending_balance,
      updated_at = NOW()
  WHERE id = v_current_user_id;

  INSERT INTO public.bonus_transactions (
    profile_id,
    amount,
    transaction_type,
    description,
    order_id,
    activation_date,
    created_at
  ) VALUES (
    v_current_user_id,
    v_total_award_bonuses,
    'pending',
    'Начисление бонусов за заказ (ожидание активации)',
    v_new_order_id,
    NOW() + INTERVAL '14 days',
    NOW()
  );

  RETURN v_new_order_id;
END;
$$;

COMMENT ON FUNCTION public.create_user_order IS
  'Создает заказ для авторизованного пользователя с резервированием товара, списанием бонусов и начислением pending-бонусов';

GRANT EXECUTE ON FUNCTION public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER, TEXT, TEXT, TEXT, NUMERIC) TO authenticated;

-- Обновление функции create_guest_checkout для поддержки delivery_cost
DROP FUNCTION IF EXISTS public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT, TEXT);

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
  IF p_guest_info->>'name' IS NULL OR p_guest_info->>'email' IS NULL OR p_guest_info->>'phone' IS NULL THEN
    RAISE EXCEPTION 'Необходимо указать имя, email и телефон';
  END IF;

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

  v_final_price := v_total_price - v_promo_discount + p_delivery_cost;

  IF v_final_price < 0 THEN
    v_final_price := 0;
  END IF;

  INSERT INTO public.orders (
    user_id,
    total_amount,
    discount_amount,
    final_amount,
    delivery_method,
    delivery_address,
    payment_method,
    bonuses_spent,
    bonuses_awarded,
    status,
    source,
    guest_name,
    guest_email,
    guest_phone,
    delivery_cost,
    created_at,
    updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_total_price,
    v_promo_discount,
    v_final_price,
    p_delivery_method,
    p_delivery_address,
    p_payment_method,
    0,
    0,
    'new',
    'web',
    p_guest_info->>'name',
    p_guest_info->>'email',
    p_guest_info->>'phone',
    p_delivery_cost,
    NOW(),
    NOW()
  ) RETURNING id INTO v_new_order_id;

  FOR v_cart_item IN SELECT * FROM jsonb_array_elements(v_validated_items)
  LOOP
    INSERT INTO public.order_items (
      order_id,
      product_id,
      quantity,
      price_at_purchase,
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

COMMENT ON FUNCTION public.create_guest_checkout IS
  'Создает гостевой заказ с резервированием товара';

GRANT EXECUTE ON FUNCTION public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT, TEXT, NUMERIC) TO anon, authenticated;
