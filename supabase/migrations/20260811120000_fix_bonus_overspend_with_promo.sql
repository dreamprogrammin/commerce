-- Бонусы сгорали, когда в заказе был промокод.
--
-- create_user_order урезал СКИДКУ бонусами до остатка после промокода
--   v_calculated_discount := LEAST(p_bonuses_to_spend, v_total_price - v_promo_discount)
-- но с баланса списывал ПОЛНУЮ запрошенную сумму p_bonuses_to_spend и её же
-- писал в orders.bonuses_spent. Разница исчезала без следа и без ошибки.
--
-- Воспроизведено на копии прод-базы, в транзакции с ROLLBACK:
--   корзина 1090 ₸, промокод −327 ₸, запрошено 1090 бонусов
--   → скидка бонусами 763 ₸, списано 1090, баланс 0, сгорело 327.
--
-- Здесь списывается ровно то, что дало скидку. Дополнительно скидка
-- округляется вниз до целого: бонус равен одному тенге, дробных бонусов нет,
-- а final_price у товаров NUMERIC и остаток после промокода бывает дробным.
--
-- Отмена заказа не ломается: cancel_order возвращает orders.bonuses_spent,
-- то есть ровно списанное.
--
-- Сигнатура не меняется, перегрузки не возникает (см. п. 10 CLAUDE.md).

-- Проверка состояния: миграция готовилась против конкретного тела функции.
-- Если на базе другое — падаем, а не затираем чужую правку молча.
DO $check$
DECLARE
  v_hash TEXT;
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_user_order';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Ожидалась ровно одна версия create_user_order, найдено %', v_count;
  END IF;

  SELECT md5(pg_get_functiondef(p.oid)) INTO v_hash
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_user_order';

  IF v_hash <> 'd591a4f4ec64646d42f15fd1a14fce50' THEN
    RAISE EXCEPTION 'Тело create_user_order не то, под которое готовилась миграция (md5 %)', v_hash;
  END IF;
END
$check$;

CREATE OR REPLACE FUNCTION public.create_user_order(p_cart_items jsonb, p_delivery_method text, p_payment_method text DEFAULT NULL::text, p_delivery_address jsonb DEFAULT NULL::jsonb, p_bonuses_to_spend integer DEFAULT 0, p_promo_code text DEFAULT NULL::text, p_contact_name text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text, p_delivery_cost numeric DEFAULT 0, p_comment text DEFAULT NULL::text, p_delivery_date date DEFAULT NULL::date, p_delivery_slot text DEFAULT NULL::text, p_pickup_point_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_promo_discount      NUMERIC := 0;
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

  -- Промокод раньше искался в promo_campaigns по колонке code, которой у той
  -- таблицы нет вовсе, — заказ с кодом падал. Коды живут в promo_codes, и по
  -- ней же их проверяет validate_promo_code, которую вызывает фронт.
  -- Гасим код ниже, когда известна сумма корзины.

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

  -- Скидку по промокоду считаем на сервере от фактической суммы корзины:
  -- значение с клиента не принимаем вовсе.
  v_promo_discount := public.redeem_promo_code(p_promo_code, v_total_price, v_current_user_id);

  -- Бонусами можно закрыть только то, что осталось после промокода.
  v_calculated_discount := FLOOR(LEAST(p_bonuses_to_spend, v_total_price - v_promo_discount));
  IF v_calculated_discount < 0 THEN
    v_calculated_discount := 0;
  END IF;

  v_final_price := v_total_price - v_promo_discount - v_calculated_discount + p_delivery_cost;

  IF v_final_price < 0 THEN
    v_final_price := 0;
  END IF;

  v_total_award_bonuses := FLOOR(v_total_award_bonuses * v_bonus_rate);

  INSERT INTO public.orders (
    user_id,
    total_amount,
    discount_amount,
    promo_code,
    promo_discount,
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
    pickup_point_id,
    created_at,
    updated_at
  ) VALUES (
    v_current_user_id,
    v_total_price,
    v_calculated_discount,
    NULLIF(UPPER(TRIM(COALESCE(p_promo_code, ''))), ''),
    v_promo_discount,
    v_final_price,
    p_delivery_method,
    p_delivery_address,
    p_payment_method,
    v_calculated_discount,
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
    -- Пункт пишем только при самовывозе: корзина запоминает выбор между
    -- заходами, и иначе он уехал бы в заказ с доставкой курьером.
    CASE WHEN p_delivery_method = 'pickup' THEN p_pickup_point_id END,
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

  IF v_calculated_discount > 0 THEN
    v_new_active_balance := v_user_profile.active_bonus_balance - v_calculated_discount::INTEGER;

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
      -v_calculated_discount,
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
$function$;


-- Итоговая проверка: версия по-прежнему одна.
DO $verify$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_user_order';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'После миграции версий create_user_order: %', v_count;
  END IF;
END
$verify$;
