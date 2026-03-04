-- =====================================================================================
-- CRITICAL FIX: Правильное управление складскими остатками (Stock Management)
-- =====================================================================================
-- ПРОБЛЕМА:
--   1. create_user_order / create_guest_checkout НЕ резервируют товар при создании —
--      stock_quantity не уменьшается, когда клиент жмёт «Заказать».
--   2. process_confirmed_order списывает сток при ПОДТВЕРЖДЕНИИ, но в cancel_order
--      (3-param) возврат stock происходит ВСЕГДА — даже для заказов в статусе 'new',
--      где сток никогда не уменьшался. Результат: stock_quantity РАСТЁТ при отмене.
--   3. Триггер on_order_item_insert_update_sales_count увеличивает sales_count
--      в момент создания заказа, а не при подтверждении — нарушая бизнес-логику.
--
-- НОВЫЙ ДИЗАЙН (единственная правда):
--   create_user_order        → stock_quantity -= qty  (резервирование при создании)
--   create_guest_checkout    → stock_quantity -= qty  (резервирование при создании)
--   process_confirmed_order  → НЕ трогает stock, sales_count += qty (факт продажи)
--   process_confirmed_guest  → НЕ трогает stock, sales_count += qty (факт продажи)
--   cancel_order             → stock_quantity += qty  ВСЕГДА (возврат резерва)
--                              sales_count -= qty      только если статус был confirmed/processing
--
-- БЭКФИЛЛ (переходный период):
--   Существующие заказы в статусе 'new'/'pending' созданы по старой логике.
--   Их сток не был уменьшён — делаем это сейчас.
--   Триггер уже увеличил sales_count при их создании — откатываем.
-- =====================================================================================


-- =====================================================================================
-- ШАГ 1: Удалить триггер, который увеличивал sales_count при СОЗДАНИИ заказа
--         Sales_count теперь управляется через process_confirmed_order
-- =====================================================================================
DROP TRIGGER IF EXISTS on_order_item_insert_update_sales_count ON public.order_items;
DROP FUNCTION IF EXISTS public.update_product_sales_count();


-- =====================================================================================
-- ШАГ 2: create_user_order — добавить декремент stock_quantity при создании
-- =====================================================================================
DROP FUNCTION IF EXISTS public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER, TEXT, TEXT, TEXT);

CREATE FUNCTION public.create_user_order(
  p_cart_items       JSONB,
  p_delivery_method  TEXT,
  p_payment_method   TEXT    DEFAULT NULL,
  p_delivery_address JSONB   DEFAULT NULL,
  p_bonuses_to_spend INTEGER DEFAULT 0,
  p_promo_code       TEXT    DEFAULT NULL,
  p_contact_name     TEXT    DEFAULT NULL,
  p_contact_phone    TEXT    DEFAULT NULL
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

  -- Валидация корзины и сбор данных
  FOR v_cart_item IN
    SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER)
  LOOP
    SELECT final_price, bonus_points_award, stock_quantity
    INTO v_product_record
    FROM public.products
    WHERE id = v_cart_item.product_id AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар не найден или недоступен (ID: %)', v_cart_item.product_id;
    END IF;

    -- ✅ Проверка остатка перед резервированием
    IF v_product_record.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара на складе (ID: %, в наличии: %, запрошено: %)',
        v_cart_item.product_id, v_product_record.stock_quantity, v_cart_item.quantity;
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

  -- Расчёт скидки бонусами
  IF COALESCE(p_bonuses_to_spend, 0) > 0 THEN
    IF COALESCE(v_user_profile.active_bonus_balance, 0) < p_bonuses_to_spend THEN
      RAISE EXCEPTION 'Недостаточно бонусов. Доступно: %, запрошено: %',
        COALESCE(v_user_profile.active_bonus_balance, 0), p_bonuses_to_spend;
    END IF;
    v_calculated_discount := COALESCE(p_bonuses_to_spend, 0) * v_bonus_rate;
  END IF;

  -- Расчёт скидки промокодом
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

  -- Создаём заказ
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
    COALESCE(v_total_price,         0),
    COALESCE(v_calculated_discount, 0),
    COALESCE(v_final_price,         0),
    COALESCE(p_bonuses_to_spend,    0),
    COALESCE(v_total_award_bonuses, 0),
    p_delivery_method,
    p_delivery_address,
    p_payment_method,
    'new',
    v_contact_name,
    v_contact_phone
  )
  RETURNING id INTO v_new_order_id;

  -- Вставляем позиции и ✅ РЕЗЕРВИРУЕМ СТОК при создании заказа
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

    -- ✅ РЕЗЕРВИРОВАНИЕ: уменьшаем остаток атомарно (защита от гонки)
    UPDATE public.products
    SET stock_quantity = stock_quantity - v_cart_item.quantity
    WHERE id = v_cart_item.product_id
      AND stock_quantity >= v_cart_item.quantity;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Товар с ID % закончился на складе в момент оформления заказа (конкурентный заказ)',
        v_cart_item.product_id;
    END IF;
  END LOOP;

  -- Списываем активные бонусы если тратим
  IF COALESCE(p_bonuses_to_spend, 0) > 0 THEN
    UPDATE public.profiles
    SET active_bonus_balance = GREATEST(active_bonus_balance - p_bonuses_to_spend, 0)
    WHERE id = v_current_user_id
    RETURNING active_bonus_balance, pending_bonus_balance
    INTO v_new_active_balance, v_new_pending_balance;

    INSERT INTO public.bonus_transactions (
      user_id, order_id, amount, transaction_type, status,
      balance_after, pending_balance_after, description
    ) VALUES (
      v_current_user_id,
      v_new_order_id,
      -p_bonuses_to_spend,
      'spent',
      'completed',
      v_new_active_balance,
      v_new_pending_balance,
      'Списание бонусов при оформлении заказа'
    );
  END IF;

  -- Записываем начисленные бонусы и сразу обновляем pending_bonus_balance
  IF COALESCE(v_total_award_bonuses, 0) > 0 THEN
    UPDATE public.profiles
    SET pending_bonus_balance = pending_bonus_balance + v_total_award_bonuses
    WHERE id = v_current_user_id
    RETURNING active_bonus_balance, pending_bonus_balance
    INTO v_new_active_balance, v_new_pending_balance;

    INSERT INTO public.bonus_transactions (
      user_id, order_id, transaction_type, amount,
      balance_after, pending_balance_after, description, status
    ) VALUES (
      v_current_user_id,
      v_new_order_id,
      'earned',
      v_total_award_bonuses,
      v_new_active_balance,
      v_new_pending_balance,
      'Бонусы за покупку (активируются через 14 дней после подтверждения)',
      'pending'
    );
  END IF;

  -- Обновляем контактные данные профиля
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
  'Заказ для авторизованного пользователя. '
  'Резервирует товар на складе (stock_quantity -= qty) сразу при создании. '
  'Обновляет pending_bonus_balance для начисленных бонусов.';

GRANT EXECUTE ON FUNCTION public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER, TEXT, TEXT, TEXT) TO authenticated;


-- =====================================================================================
-- ШАГ 3: create_guest_checkout — добавить декремент stock_quantity при создании
-- =====================================================================================
DROP FUNCTION IF EXISTS public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT, TEXT);

CREATE FUNCTION public.create_guest_checkout(
  p_cart_items      JSONB,
  p_guest_info      JSONB,
  p_delivery_method TEXT,
  p_delivery_address JSONB DEFAULT NULL,
  p_payment_method  TEXT  DEFAULT NULL,
  p_promo_code      TEXT  DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_checkout_id UUID;
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

  -- Валидация корзины
  FOR v_cart_item IN
    SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER)
  LOOP
    SELECT final_price, stock_quantity
    INTO v_product_record
    FROM public.products
    WHERE id = v_cart_item.product_id AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар не найден или недоступен (ID: %)', v_cart_item.product_id;
    END IF;

    -- ✅ Проверка остатка перед резервированием
    IF v_product_record.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара на складе (ID: %, в наличии: %, запрошено: %)',
        v_cart_item.product_id, v_product_record.stock_quantity, v_cart_item.quantity;
    END IF;

    v_total_price := v_total_price + (v_product_record.final_price * v_cart_item.quantity);

    v_validated_items := v_validated_items || jsonb_build_object(
      'product_id', v_cart_item.product_id,
      'quantity',   v_cart_item.quantity,
      'final_price', v_product_record.final_price
    );
  END LOOP;

  -- Валидация промокода
  IF p_promo_code IS NOT NULL AND TRIM(p_promo_code) <> '' THEN
    SELECT * INTO v_promo_record
    FROM public.promo_codes
    WHERE code = UPPER(TRIM(p_promo_code))
      AND expires_at > now()
      AND uses_count < max_uses
      AND user_id IS NULL;  -- гостевые заказы — только универсальные промокоды

    IF v_promo_record IS NOT NULL AND v_total_price >= v_promo_record.min_order_amount THEN
      v_promo_discount := ROUND(v_total_price * v_promo_record.discount_percent / 100, 0);
    END IF;
  END IF;

  v_final_price := GREATEST(v_total_price - v_promo_discount, 0);

  INSERT INTO public.guest_checkouts (
    guest_name, guest_email, guest_phone,
    total_amount, final_amount,
    delivery_method, delivery_address, payment_method, status
  )
  VALUES (
    p_guest_info->>'name', p_guest_info->>'email', p_guest_info->>'phone',
    v_total_price, v_final_price,
    p_delivery_method, p_delivery_address, p_payment_method, 'new'
  )
  RETURNING id INTO v_new_checkout_id;

  -- Вставляем позиции и ✅ РЕЗЕРВИРУЕМ СТОК при создании
  FOR v_cart_item IN
    SELECT * FROM jsonb_to_recordset(v_validated_items)
    AS x(product_id UUID, quantity INTEGER, final_price NUMERIC)
  LOOP
    INSERT INTO public.guest_checkout_items (
      checkout_id, product_id, quantity, price_per_item
    )
    VALUES (v_new_checkout_id, v_cart_item.product_id, v_cart_item.quantity, v_cart_item.final_price);

    -- ✅ РЕЗЕРВИРОВАНИЕ: уменьшаем остаток атомарно
    UPDATE public.products
    SET stock_quantity = stock_quantity - v_cart_item.quantity
    WHERE id = v_cart_item.product_id
      AND stock_quantity >= v_cart_item.quantity;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Товар с ID % закончился на складе в момент оформления заказа (конкурентный заказ)',
        v_cart_item.product_id;
    END IF;
  END LOOP;

  -- Помечаем промокод как использованный
  IF v_promo_record IS NOT NULL AND v_promo_discount > 0 THEN
    UPDATE public.promo_codes
    SET uses_count = uses_count + 1, used_at = now()
    WHERE id = v_promo_record.id;
  END IF;

  RETURN v_new_checkout_id;
END;
$$;

COMMENT ON FUNCTION public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT, TEXT) IS
  'Гостевой заказ с поддержкой промокодов. '
  'Резервирует товар на складе (stock_quantity -= qty) сразу при создании.';

GRANT EXECUTE ON FUNCTION public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT, TEXT) TO anon, authenticated;


-- =====================================================================================
-- ШАГ 4: process_confirmed_order — убрать декремент stock, добавить инкремент sales_count
--         Сток уже зарезервирован при создании заказа — не трогаем.
--         Увеличиваем sales_count как факт состоявшейся продажи.
-- =====================================================================================
DROP FUNCTION IF EXISTS public.process_confirmed_order(UUID);

CREATE FUNCTION public.process_confirmed_order(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_order    RECORD;
  v_item_record     RECORD;
  v_welcome_bonus   INTEGER := 500;
  v_user_profile    RECORD;
  v_activation_date TIMESTAMPTZ;
BEGIN
  SELECT o.id, o.user_id, o.bonuses_awarded, o.bonuses_activation_date, o.status
  INTO v_target_order
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RETURN 'Ошибка: Заказ ' || p_order_id || ' не найден.';
  END IF;

  -- Идемпотентность: повторный вызов — безопасно пропускаем
  IF v_target_order.bonuses_activation_date IS NOT NULL THEN
    RETURN 'Заказ ' || p_order_id || ' уже обработан.';
  END IF;

  -- ✅ Увеличиваем sales_count (факт продажи) — сток уже зарезервирован при создании
  FOR v_item_record IN
    SELECT product_id, quantity
    FROM public.order_items
    WHERE order_id = p_order_id
  LOOP
    UPDATE public.products
    SET sales_count = sales_count + v_item_record.quantity
    WHERE id = v_item_record.product_id;
  END LOOP;

  IF v_target_order.user_id IS NOT NULL THEN
    SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_target_order.user_id;

    IF v_user_profile IS NOT NULL THEN
      -- Приветственный бонус (только первый заказ)
      IF NOT v_user_profile.has_received_welcome_bonus THEN
        UPDATE public.profiles
        SET active_bonus_balance    = active_bonus_balance + v_welcome_bonus,
            has_received_welcome_bonus = TRUE
        WHERE id = v_target_order.user_id;

        INSERT INTO public.bonus_transactions (
          user_id, order_id, transaction_type, amount,
          balance_after, pending_balance_after, description, status
        ) VALUES (
          v_target_order.user_id, p_order_id, 'welcome', v_welcome_bonus,
          COALESCE(v_user_profile.active_bonus_balance, 0) + v_welcome_bonus,
          COALESCE(v_user_profile.pending_bonus_balance, 0),
          'Приветственный бонус за первый заказ',
          'completed'
        );

        RAISE NOTICE 'Начислен приветственный бонус % пользователю %', v_welcome_bonus, v_target_order.user_id;
      END IF;

      -- Устанавливаем дату активации earned-бонусов (14 дней)
      IF v_target_order.bonuses_awarded > 0 THEN
        v_activation_date := NOW() + INTERVAL '14 days';

        UPDATE public.orders
        SET bonuses_activation_date = v_activation_date
        WHERE id = p_order_id;

        UPDATE public.bonus_transactions
        SET activation_date = v_activation_date
        WHERE order_id = p_order_id
          AND transaction_type = 'earned'
          AND status = 'pending';

        RAISE NOTICE 'Дата активации бонусов установлена для заказа %', p_order_id;
      ELSE
        -- Нет бонусов за покупку, ставим маркер обработки
        UPDATE public.orders
        SET bonuses_activation_date = NOW()
        WHERE id = p_order_id;
      END IF;
    END IF;
  ELSE
    -- Гостевые заказы: только маркер обработки
    UPDATE public.orders SET bonuses_activation_date = NOW() WHERE id = p_order_id;
  END IF;

  RETURN 'Успех: Заказ ' || p_order_id || ' обработан.';
END;
$$;

COMMENT ON FUNCTION public.process_confirmed_order IS
  'Подтверждение заказа: увеличивает sales_count, начисляет приветственный бонус, '
  'устанавливает bonuses_activation_date. '
  'НЕ трогает stock_quantity — уже зарезервирован при create_user_order.';


-- =====================================================================================
-- ШАГ 5: process_confirmed_guest_checkout — убрать декремент stock, сохранить sales_count
-- =====================================================================================
DROP FUNCTION IF EXISTS public.process_confirmed_guest_checkout(UUID);

CREATE FUNCTION public.process_confirmed_guest_checkout(p_checkout_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_checkout   RECORD;
  v_checkout_item     RECORD;
BEGIN
  SELECT * INTO v_target_checkout
  FROM public.guest_checkouts
  WHERE id = p_checkout_id;

  IF v_target_checkout IS NULL THEN
    RETURN 'Ошибка: Гостевой заказ не найден.';
  END IF;

  IF v_target_checkout.status <> 'confirmed' THEN
    RETURN 'Ошибка: Гостевой заказ должен быть в статусе confirmed.';
  END IF;

  -- ✅ Увеличиваем sales_count (факт продажи) — сток уже зарезервирован при создании
  FOR v_checkout_item IN
    SELECT product_id, quantity
    FROM public.guest_checkout_items
    WHERE checkout_id = p_checkout_id
  LOOP
    UPDATE public.products
    SET sales_count = sales_count + v_checkout_item.quantity
    WHERE id = v_checkout_item.product_id;

    RAISE NOTICE 'Обновлён sales_count для товара % (гостевой заказ): +%',
      v_checkout_item.product_id, v_checkout_item.quantity;
  END LOOP;

  RETURN 'Успех: Гостевой заказ ' || p_checkout_id || ' обработан (sales_count обновлён).';
END;
$$;

COMMENT ON FUNCTION public.process_confirmed_guest_checkout IS
  'Подтверждение гостевого заказа: увеличивает sales_count. '
  'НЕ трогает stock_quantity — уже зарезервирован при create_guest_checkout.';


-- =====================================================================================
-- ШАГ 6: cancel_order (3-param) — всегда возвращать сток, sales_count декрементить
--         только если заказ был в статусе confirmed/processing
-- =====================================================================================
DROP FUNCTION IF EXISTS public.cancel_order(UUID, TEXT, TEXT);

CREATE FUNCTION public.cancel_order(
  p_order_id     UUID,
  p_table_name   TEXT DEFAULT 'orders',
  p_cancelled_by TEXT DEFAULT 'admin'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status          TEXT;
  v_user_id         UUID    := NULL;
  v_bonuses_spent   NUMERIC := 0;
  v_bonuses_awarded INTEGER := 0;
  v_item_record     RECORD;
  v_result          TEXT;
  v_new_active_bal  INTEGER;
  v_new_pending_bal INTEGER;
  -- Флаг: был ли заказ уже подтверждён (sales_count уже увеличен)
  v_was_confirmed   BOOLEAN := FALSE;
BEGIN
  IF p_cancelled_by NOT IN ('client', 'admin', 'system') THEN
    RAISE EXCEPTION 'Неверное значение cancelled_by: %', p_cancelled_by;
  END IF;

  IF p_table_name NOT IN ('orders', 'guest_checkouts') THEN
    RAISE EXCEPTION 'Неверная таблица: %', p_table_name;
  END IF;

  IF p_table_name = 'orders' THEN
    SELECT status, user_id,
           COALESCE(bonuses_spent,   0),
           COALESCE(bonuses_awarded, 0)
    INTO v_status, v_user_id, v_bonuses_spent, v_bonuses_awarded
    FROM public.orders WHERE id = p_order_id;
  ELSE
    SELECT status INTO v_status
    FROM public.guest_checkouts WHERE id = p_order_id;
  END IF;

  IF v_status IS NULL THEN
    RETURN 'Ошибка: Заказ не найден в таблице ' || p_table_name;
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN 'Ошибка: Заказ уже отменён';
  END IF;
  IF v_status NOT IN ('new', 'pending', 'confirmed', 'processing') THEN
    RETURN 'Ошибка: Заказ в статусе "' || v_status || '" нельзя отменить';
  END IF;

  -- sales_count был увеличен только если заказ дошёл до confirmed/processing
  v_was_confirmed := v_status IN ('confirmed', 'processing');

  -- ✅ Возвращаем товары на склад ВСЕГДА (сток был зарезервирован при создании)
  --    sales_count уменьшаем только если заказ был подтверждён
  IF p_table_name = 'orders' THEN
    FOR v_item_record IN
      SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id
    LOOP
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_item_record.quantity,
          sales_count    = CASE
            WHEN v_was_confirmed THEN GREATEST(sales_count - v_item_record.quantity, 0)
            ELSE sales_count
          END
      WHERE id = v_item_record.product_id;
    END LOOP;
  ELSE
    FOR v_item_record IN
      SELECT product_id, quantity FROM public.guest_checkout_items WHERE checkout_id = p_order_id
    LOOP
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_item_record.quantity,
          sales_count    = CASE
            WHEN v_was_confirmed THEN GREATEST(sales_count - v_item_record.quantity, 0)
            ELSE sales_count
          END
      WHERE id = v_item_record.product_id;
    END LOOP;
  END IF;

  -- Возврат бонусов (только для orders с user_id)
  IF p_table_name = 'orders' AND v_user_id IS NOT NULL THEN

    -- A) Возвращаем потраченные активные бонусы
    IF v_bonuses_spent > 0 THEN
      UPDATE public.profiles
      SET active_bonus_balance = active_bonus_balance + v_bonuses_spent
      WHERE id = v_user_id
      RETURNING active_bonus_balance, pending_bonus_balance
      INTO v_new_active_bal, v_new_pending_bal;

      INSERT INTO public.bonus_transactions (
        user_id, order_id, amount, transaction_type, status,
        balance_after, pending_balance_after, description
      ) VALUES (
        v_user_id, p_order_id, v_bonuses_spent, 'refund_spent', 'completed',
        v_new_active_bal, v_new_pending_bal,
        'Возврат потраченных бонусов при отмене заказа'
      );
    END IF;

    -- B) Вычитаем начисленные бонусы из pending
    --    (они были добавлены в pending при create_user_order)
    IF v_bonuses_awarded > 0 THEN
      UPDATE public.profiles
      SET pending_bonus_balance = GREATEST(pending_bonus_balance - v_bonuses_awarded, 0)
      WHERE id = v_user_id
      RETURNING active_bonus_balance, pending_bonus_balance
      INTO v_new_active_bal, v_new_pending_bal;

      INSERT INTO public.bonus_transactions (
        user_id, order_id, amount, transaction_type, status,
        balance_after, pending_balance_after, description
      ) VALUES (
        v_user_id, p_order_id, -v_bonuses_awarded, 'refund_earned', 'completed',
        v_new_active_bal, v_new_pending_bal,
        'Отмена начисленных бонусов при отмене заказа'
      );

      UPDATE public.bonus_transactions
      SET status = 'cancelled'
      WHERE order_id = p_order_id
        AND transaction_type = 'earned'
        AND status = 'pending';
    END IF;

  END IF;

  IF p_table_name = 'orders' THEN
    UPDATE public.orders
    SET status = 'cancelled', cancelled_by = p_cancelled_by
    WHERE id = p_order_id;
  ELSE
    UPDATE public.guest_checkouts
    SET status = 'cancelled', cancelled_by = p_cancelled_by
    WHERE id = p_order_id;
  END IF;

  v_result := 'Успех: Заказ ' || p_order_id || ' отменён';
  IF p_cancelled_by = 'client'  THEN v_result := v_result || ' (клиентом)';
  ELSIF p_cancelled_by = 'admin' THEN v_result := v_result || ' (администратором)';
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.cancel_order(UUID, TEXT, TEXT) IS
  'Отменяет заказ. '
  'Возвращает stock_quantity ВСЕГДА (был зарезервирован при создании). '
  'Уменьшает sales_count только если заказ был в статусе confirmed/processing. '
  'Возвращает потраченные бонусы и отменяет начисленные.';

GRANT EXECUTE ON FUNCTION public.cancel_order(UUID, TEXT, TEXT) TO authenticated, anon, service_role;


-- =====================================================================================
-- ШАГ 7: Удалить устаревшую 2-параметрическую cancel_order
--         Она работала по старой логике: возвращала сток только для confirmed/processing.
--         Теперь всё управление через 3-param версию.
-- =====================================================================================
DROP FUNCTION IF EXISTS public.cancel_order(UUID, TEXT);


-- =====================================================================================
-- ШАГ 8: БЭКФИЛЛ — переходный период
--
-- Существующие 'new'/'pending' заказы были созданы по СТАРОЙ логике:
--   - stock_quantity НЕ был уменьшён при создании
--   - sales_count БЫЛ увеличен триггером при создании
--
-- После деплоя новой логики:
--   - process_confirmed_order НЕ уменьшает сток (уже ожидает, что резерв есть)
--   - cancel_order ВСЕГДА возвращает сток
--
-- Нужно привести данные в порядок:
--   A) Декрементировать stock для активных заказов (резерв сделать сейчас)
--   B) Откатить sales_count для этих же заказов (триггер наинкрементил при создании)
-- =====================================================================================

-- A) Резервируем сток для существующих 'new'/'pending' онлайн-заказов из orders.
--    ВАЖНО: офлайн-заказы (source='offline') исключаем — create_offline_sale уже
--    уменьшил stock_quantity при создании. Повторный декремент сделал бы двойное списание.
UPDATE public.products p
SET stock_quantity = GREATEST(p.stock_quantity - sub.total_qty, 0)
FROM (
  SELECT oi.product_id, SUM(oi.quantity) AS total_qty
  FROM public.order_items oi
  JOIN public.orders o ON oi.order_id = o.id
  WHERE o.status IN ('new', 'pending')
    AND COALESCE(o.source, 'online') = 'online'
  GROUP BY oi.product_id
) sub
WHERE p.id = sub.product_id;

-- A2) Резервируем сток для существующих 'new'/'pending' онлайн гостевых заказов.
--     Офлайн гостевые (source='offline') тоже исключаем по той же причине.
UPDATE public.products p
SET stock_quantity = GREATEST(p.stock_quantity - sub.total_qty, 0)
FROM (
  SELECT gci.product_id, SUM(gci.quantity) AS total_qty
  FROM public.guest_checkout_items gci
  JOIN public.guest_checkouts gc ON gci.checkout_id = gc.id
  WHERE gc.status IN ('new', 'pending')
    AND COALESCE(gc.source, 'online') = 'online'
  GROUP BY gci.product_id
) sub
WHERE p.id = sub.product_id;

-- B) Откатываем sales_count, который триггер увеличил при создании 'new'/'pending' заказов.
--    Триггер on_order_item_insert_update_sales_count срабатывает на INSERT в order_items
--    (authenticated + offline), поэтому откатываем для ВСЕХ заказов из orders,
--    включая офлайн — при подтверждении process_confirmed_order сам проинкрементирует.
UPDATE public.products p
SET sales_count = GREATEST(p.sales_count - sub.total_qty, 0)
FROM (
  SELECT oi.product_id, SUM(oi.quantity) AS total_qty
  FROM public.order_items oi
  JOIN public.orders o ON oi.order_id = o.id
  WHERE o.status IN ('new', 'pending')
  GROUP BY oi.product_id
) sub
WHERE p.id = sub.product_id;

-- B2) Для guest_checkout_items откат НЕ нужен:
--     триггер on_order_item_insert_update_sales_count привязан только к order_items,
--     на guest_checkout_items он никогда не срабатывал.
--     process_confirmed_guest_checkout сам инкрементирует sales_count при подтверждении.
--     (намеренно пропущено)


-- =====================================================================================
-- Перезагружаем кэш PostgREST
-- =====================================================================================
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
