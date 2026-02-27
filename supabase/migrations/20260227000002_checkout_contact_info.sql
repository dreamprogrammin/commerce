-- ============================================================================
-- Фича: Автоматическое обновление профиля при оформлении заказа
-- ============================================================================
-- 1. Добавляем customer_name и customer_phone в таблицу orders,
--    чтобы Telegram-уведомления не зависели от профиля (race-free).
-- 2. create_user_order получает p_contact_name и p_contact_phone:
--    - сохраняет контакты прямо в заказе;
--    - обновляет profiles.phone если он пустой;
--    - обновляет profiles.first_name ТОЛЬКО если оно = 'Гость' или NULL.
-- ============================================================================


-- ============================================================================
-- ШАГ 1: Добавляем колонки в orders
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_name  TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT;

COMMENT ON COLUMN public.orders.customer_name  IS
  'Имя получателя, введённое при оформлении заказа. Первичный источник для Telegram-уведомлений.';
COMMENT ON COLUMN public.orders.customer_phone IS
  'Телефон получателя, введённый при оформлении заказа. Первичный источник для Telegram-уведомлений.';


-- ============================================================================
-- ШАГ 2: Пересоздаём create_user_order с новыми параметрами
-- ============================================================================

-- Удаляем все известные сигнатуры функции
DROP FUNCTION IF EXISTS public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER);
DROP FUNCTION IF EXISTS public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER, TEXT, TEXT, TEXT);

CREATE FUNCTION public.create_user_order(
  p_cart_items      JSONB,
  p_delivery_method TEXT,
  p_payment_method  TEXT    DEFAULT NULL,
  p_delivery_address JSONB  DEFAULT NULL,
  p_bonuses_to_spend INTEGER DEFAULT 0,
  p_promo_code      TEXT    DEFAULT NULL,
  p_contact_name    TEXT    DEFAULT NULL,   -- имя из формы чекаута
  p_contact_phone   TEXT    DEFAULT NULL    -- телефон из формы чекаута
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_user_profile    RECORD;
  v_new_order_id    UUID;
  v_total_price     NUMERIC := 0;
  v_total_award_bonuses INTEGER := 0;
  v_final_price     NUMERIC;
  v_calculated_discount NUMERIC := 0;
  v_promo_discount  NUMERIC := 0;
  v_cart_item       RECORD;
  v_product_record  RECORD;
  v_bonus_rate      NUMERIC := 1.0;
  v_is_first_order  BOOLEAN;
  v_new_active_balance INTEGER;
  v_user_email      TEXT;
  v_user_name       TEXT;
  v_validated_items JSONB := '[]'::JSONB;
  v_promo_record    RECORD;
  -- Нормализованные контакты
  v_contact_name    TEXT;
  v_contact_phone   TEXT;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация для оформления заказа';
  END IF;

  -- Нормализуем входные контакты (trim + null-safe)
  v_contact_name  := NULLIF(TRIM(COALESCE(p_contact_name,  '')), '');
  v_contact_phone := NULLIF(TRIM(COALESCE(p_contact_phone, '')), '');

  -- Получаем (или создаём) профиль пользователя
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
      id, first_name, role,
      active_bonus_balance, pending_bonus_balance, has_received_welcome_bonus
    )
    VALUES (v_current_user_id, v_user_name, 'user', 0, 0, FALSE)
    ON CONFLICT (id) DO NOTHING;

    SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_current_user_id;

    IF v_user_profile IS NULL THEN
      RAISE EXCEPTION 'Не удалось создать профиль. User ID: %', v_current_user_id;
    END IF;
  END IF;

  SELECT NOT EXISTS(SELECT 1 FROM public.orders WHERE user_id = v_current_user_id)
  INTO v_is_first_order;

  -- Валидируем товары и считаем цены
  FOR v_cart_item IN
    SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER)
  LOOP
    SELECT final_price, bonus_points_award, stock_quantity
    INTO v_product_record
    FROM public.products
    WHERE id = v_cart_item.product_id AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар не найден';
    END IF;
    IF v_product_record.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара на складе';
    END IF;

    v_total_price := v_total_price + (v_product_record.final_price * v_cart_item.quantity);
    v_total_award_bonuses := v_total_award_bonuses
      + (COALESCE(v_product_record.bonus_points_award, 0) * v_cart_item.quantity);

    v_validated_items := v_validated_items || jsonb_build_object(
      'product_id',   v_cart_item.product_id,
      'quantity',     v_cart_item.quantity,
      'final_price',  v_product_record.final_price,
      'bonus_points', COALESCE(v_product_record.bonus_points_award, 0)
    );
  END LOOP;

  -- Применяем бонусы
  IF COALESCE(p_bonuses_to_spend, 0) > 0 THEN
    IF COALESCE(v_user_profile.active_bonus_balance, 0) < p_bonuses_to_spend THEN
      RAISE EXCEPTION 'Недостаточно бонусов. Доступно: %, запрошено: %',
        COALESCE(v_user_profile.active_bonus_balance, 0), p_bonuses_to_spend;
    END IF;
    v_calculated_discount := COALESCE(p_bonuses_to_spend, 0) * v_bonus_rate;
  END IF;

  -- Применяем промокод
  IF p_promo_code IS NOT NULL AND TRIM(p_promo_code) <> '' THEN
    SELECT * INTO v_promo_record
    FROM public.promo_codes
    WHERE code = UPPER(TRIM(p_promo_code))
      AND expires_at > now()
      AND uses_count < max_uses
      AND (user_id IS NULL OR user_id = v_current_user_id);

    IF v_promo_record IS NOT NULL AND v_total_price >= v_promo_record.min_order_amount THEN
      v_promo_discount := ROUND(v_total_price * v_promo_record.discount_percent / 100, 0);
      v_calculated_discount := v_calculated_discount + v_promo_discount;
    END IF;
  END IF;

  v_final_price := GREATEST(
    COALESCE(v_total_price, 0) - COALESCE(v_calculated_discount, 0),
    0
  );

  -- Создаём заказ с контактами
  INSERT INTO public.orders (
    user_id,
    total_amount, discount_amount, final_amount,
    bonuses_spent, bonuses_awarded,
    delivery_method, delivery_address, payment_method,
    status,
    customer_name, customer_phone
  )
  VALUES (
    v_current_user_id,
    COALESCE(v_total_price,          0),
    COALESCE(v_calculated_discount,  0),
    COALESCE(v_final_price,          0),
    COALESCE(p_bonuses_to_spend,     0),
    COALESCE(v_total_award_bonuses,  0),
    p_delivery_method,
    p_delivery_address,
    p_payment_method,
    'new',
    v_contact_name,
    v_contact_phone
  )
  RETURNING id INTO v_new_order_id;

  -- Создаём order_items
  FOR v_cart_item IN
    SELECT * FROM jsonb_to_recordset(v_validated_items)
    AS x(product_id UUID, quantity INTEGER, final_price NUMERIC, bonus_points INTEGER)
  LOOP
    INSERT INTO public.order_items (
      order_id, product_id, quantity, price_per_item, bonus_points_per_item
    )
    VALUES (
      v_new_order_id,
      v_cart_item.product_id,
      v_cart_item.quantity,
      v_cart_item.final_price,
      v_cart_item.bonus_points
    );
  END LOOP;

  -- Списываем бонусы если нужно
  IF COALESCE(p_bonuses_to_spend, 0) > 0 THEN
    v_new_active_balance := GREATEST(
      COALESCE(v_user_profile.active_bonus_balance, 0) - p_bonuses_to_spend,
      0
    );

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

  -- -----------------------------------------------------------------------
  -- Обновляем профиль контактными данными из чекаута
  -- phone  — если в профиле пустой
  -- first_name — ТОЛЬКО если текущее значение NULL или 'Гость'
  -- -----------------------------------------------------------------------
  IF v_contact_phone IS NOT NULL THEN
    UPDATE public.profiles
    SET phone = v_contact_phone
    WHERE id = v_current_user_id
      AND (phone IS NULL OR TRIM(phone) = '');
  END IF;

  IF v_contact_name IS NOT NULL THEN
    UPDATE public.profiles
    SET first_name = v_contact_name
    WHERE id = v_current_user_id
      AND (first_name IS NULL OR TRIM(first_name) = '' OR first_name = 'Гость');
  END IF;

  -- Помечаем промокод использованным
  IF v_promo_record IS NOT NULL AND v_promo_discount > 0 THEN
    UPDATE public.promo_codes
    SET uses_count = uses_count + 1, used_at = now()
    WHERE id = v_promo_record.id;
  END IF;

  RETURN v_new_order_id;
END;
$$;

COMMENT ON FUNCTION public.create_user_order IS
  'Заказ для авторизованного пользователя. Хранит контакты прямо в заказе '
  'и обновляет профиль: phone (если пустой), first_name (если Гость/NULL).';

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
