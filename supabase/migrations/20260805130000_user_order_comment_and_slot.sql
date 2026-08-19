-- ============================================================================
-- create_user_order: комментарий к адресу и желаемое время доставки
-- ============================================================================
-- Тело функции снято с ПРОДА (pg_get_functiondef), а не взято из каталога
-- миграций. Причина: версии разошлись. В проде из DECLARE убраны мёртвые
-- v_promo_discount и v_is_first_order и выброшен считающий их SELECT — всего
-- 5 строк, бизнес-логика идентична. Пересоздание из файла репозитория вернуло
-- бы этот мусор; берём то, что реально работает.
--
-- ИЗМЕНЕНО РОВНО ПЯТЬ МЕСТ: три параметра в сигнатуре, два объявления, две
-- строки нормализации, три колонки в INSERT и три значения. Больше ничего.
--
-- DROP обязателен: параметры с DEFAULT создают перегрузку, и прежний вызов
-- подошёл бы обеим версиям — PostgREST ответил бы «function is not unique».
--
-- ГРАНТЫ воспроизводят прод: anon, authenticated, service_role (плюс PUBLIC,
-- который CREATE FUNCTION выдаёт сам).
--
-- НЕ ЧИНИМ ЗДЕСЬ: блок промокода обращается к promo_campaigns.code, а такой
-- колонки нет ни в проде, ни локально — заказ авторизованного с промокодом
-- падает уже сейчас. Это отдельное решение, трогать его заодно нельзя.
-- ============================================================================

DROP FUNCTION IF EXISTS public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER, TEXT, TEXT, TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION public.create_user_order(p_cart_items jsonb, p_delivery_method text, p_payment_method text DEFAULT NULL::text, p_delivery_address jsonb DEFAULT NULL::jsonb, p_bonuses_to_spend integer DEFAULT 0, p_promo_code text DEFAULT NULL::text, p_contact_name text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text, p_delivery_cost numeric DEFAULT 0, p_comment text DEFAULT NULL::text, p_delivery_date date DEFAULT NULL::date, p_delivery_slot text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_current_user_id     UUID    := auth.uid();
  v_user_profile        RECORD;
  v_new_order_id        UUID;
  v_total_price         NUMERIC := 0;
  v_total_award_bonuses INTEGER := 0;
  v_final_price         NUMERIC;
  v_calculated_discount NUMERIC := 0;
  v_cart_item           RECORD;
  v_product_record      RECORD;
  v_bonus_rate          NUMERIC := 1.0;
  v_new_active_balance  INTEGER;
  v_new_pending_balance INTEGER;
  v_user_email          TEXT;
  v_user_name           TEXT;
  v_validated_items     JSONB   := '[]'::JSONB;
  v_promo_record        RECORD;
  v_contact_name        TEXT;
  v_contact_phone       TEXT;
  v_comment             TEXT;
  v_slot                TEXT;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация для оформления заказа';
  END IF;

  v_contact_name  := NULLIF(TRIM(COALESCE(p_contact_name,  '')), '');
  v_contact_phone := NULLIF(TRIM(COALESCE(p_contact_phone, '')), '');
  -- Пустые строки храним как NULL: уведомление печатает эти блоки
  -- по IS NOT NULL, иначе оператор получил бы пустые заголовки.
  v_comment       := NULLIF(TRIM(COALESCE(p_comment, '')), '');
  v_slot          := NULLIF(TRIM(COALESCE(p_delivery_slot, '')), '');

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
    comment,
    delivery_date,
    delivery_slot,
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
    v_comment,
    p_delivery_date,
    v_slot,
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

COMMENT ON FUNCTION public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT) IS
  'Создает заказ авторизованного пользователя. p_comment — комментарий к адресу, p_delivery_date и p_delivery_slot — желаемые дата и интервал доставки; всё попадает в orders и в уведомление Telegram.';

GRANT EXECUTE ON FUNCTION public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
