-- =====================================================================================
-- Fix: pending_bonus_balance не обновляется при создании заказа
--
-- Проблема:
--   create_user_order делает INSERT earned/pending в bonus_transactions,
--   но НЕ обновляет profiles.pending_bonus_balance.
--   Пользователь видит 0 (или старую сумму) в виджете «Ожидают активации»
--   сразу после заказа — хотя запись в истории уже есть.
--
-- Новый дизайн:
--   create_user_order        → pending_bonus_balance += bonuses_awarded  (сразу при заказе)
--   process_confirmed_order  → НЕ трогает pending_bonus_balance (уже добавлено)
--                            → только ставит bonuses_activation_date
--   cancel_order             → pending_bonus_balance -= bonuses_awarded  (ВСЕГДА, не только после confirm)
--   activate_pending_bonuses → pending -= bonuses, active += bonuses     (без изменений)
-- =====================================================================================


-- =====================================================================================
-- 1. FIX: create_user_order — добавить UPDATE pending_bonus_balance
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

  IF COALESCE(p_bonuses_to_spend, 0) > 0 THEN
    IF COALESCE(v_user_profile.active_bonus_balance, 0) < p_bonuses_to_spend THEN
      RAISE EXCEPTION 'Недостаточно бонусов. Доступно: %, запрошено: %',
        COALESCE(v_user_profile.active_bonus_balance, 0), p_bonuses_to_spend;
    END IF;
    v_calculated_discount := COALESCE(p_bonuses_to_spend, 0) * v_bonus_rate;
  END IF;

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

  -- ✅ Записываем начисленные бонусы и сразу обновляем pending_bonus_balance
  IF COALESCE(v_total_award_bonuses, 0) > 0 THEN
    -- ✅ НОВОЕ: pending_bonus_balance растёт сразу при создании заказа
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

  -- Обновляем профиль контактными данными из чекаута
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
  'Логирует earned бонусы в bonus_transactions и СРАЗУ обновляет pending_bonus_balance в profiles.';


-- =====================================================================================
-- 2. FIX: process_confirmed_order — НЕ трогать pending_bonus_balance (уже добавлено при создании)
--    Только ставить bonuses_activation_date + activation_date в транзакции
-- =====================================================================================
DROP FUNCTION IF EXISTS public.process_confirmed_order(UUID);

CREATE FUNCTION public.process_confirmed_order(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_order  RECORD;
  v_welcome_bonus INTEGER := 500;
  v_user_profile  RECORD;
  v_activation_date TIMESTAMPTZ;
BEGIN
  SELECT o.id, o.user_id, o.bonuses_awarded, o.bonuses_activation_date, o.status
  INTO v_target_order
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RETURN 'Ошибка: Заказ ' || p_order_id || ' не найден.';
  END IF;

  IF v_target_order.bonuses_activation_date IS NOT NULL THEN
    RETURN 'Заказ ' || p_order_id || ' уже обработан.';
  END IF;

  -- Списываем товары со склада
  UPDATE public.products p
  SET stock_quantity = p.stock_quantity - oi.quantity
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id AND p.id = oi.product_id;

  IF v_target_order.user_id IS NOT NULL THEN
    SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_target_order.user_id;

    IF v_user_profile IS NOT NULL THEN
      -- Приветственный бонус (только первый заказ)
      IF NOT v_user_profile.has_received_welcome_bonus THEN
        UPDATE public.profiles
        SET active_bonus_balance  = active_bonus_balance + v_welcome_bonus,
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

      -- ✅ ИЗМЕНЕНО: pending_bonus_balance уже был обновлён в create_user_order.
      -- Здесь только ставим дату активации.
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
        -- Нет бонусов за покупку, просто ставим маркер обработки
        UPDATE public.orders
        SET bonuses_activation_date = NOW()
        WHERE id = p_order_id;
      END IF;
    END IF;
  ELSE
    UPDATE public.orders SET bonuses_activation_date = NOW() WHERE id = p_order_id;
  END IF;

  RETURN 'Успех: Заказ ' || p_order_id || ' обработан.';
END;
$$;

COMMENT ON FUNCTION public.process_confirmed_order IS
  'Подтверждение заказа: списывает товары, начисляет приветственный бонус, '
  'ставит bonuses_activation_date. pending_bonus_balance НЕ меняет — '
  'уже добавлено в create_user_order.';


-- =====================================================================================
-- 3. FIX: cancel_order — вычитать pending_bonus_balance ВСЕГДА (не только после confirm)
--    Т.к. pending растёт сразу при создании заказа, так же должен убывать при отмене
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
  v_status           TEXT;
  v_user_id          UUID    := NULL;
  v_bonuses_spent    NUMERIC := 0;
  v_bonuses_awarded  INTEGER := 0;
  v_item_record      RECORD;
  v_result           TEXT;
  v_new_active_bal   INTEGER;
  v_new_pending_bal  INTEGER;
BEGIN
  IF p_cancelled_by NOT IN ('client', 'admin', 'system') THEN
    RAISE EXCEPTION 'Неверное значение cancelled_by: %', p_cancelled_by;
  END IF;

  IF p_table_name NOT IN ('orders', 'guest_checkouts') THEN
    RAISE EXCEPTION 'Неверная таблица: %', p_table_name;
  END IF;

  IF p_table_name = 'orders' THEN
    SELECT status, user_id, COALESCE(bonuses_spent, 0), COALESCE(bonuses_awarded, 0)
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

  -- Возвращаем товары на склад
  IF p_table_name = 'orders' THEN
    FOR v_item_record IN
      SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id
    LOOP
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_item_record.quantity,
          sales_count    = GREATEST(sales_count - v_item_record.quantity, 0)
      WHERE id = v_item_record.product_id;
    END LOOP;
  ELSE
    FOR v_item_record IN
      SELECT product_id, quantity FROM public.guest_checkout_items WHERE checkout_id = p_order_id
    LOOP
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_item_record.quantity,
          sales_count    = GREATEST(sales_count - v_item_record.quantity, 0)
      WHERE id = v_item_record.product_id;
    END LOOP;
  END IF;

  IF p_table_name = 'orders' AND v_user_id IS NOT NULL THEN

    -- A) Возвращаем ПОТРАЧЕННЫЕ активные бонусы
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

    -- B) ✅ ИЗМЕНЕНО: вычитаем НАЧИСЛЕННЫЕ бонусы из pending ВСЕГДА
    --    (т.к. они были добавлены в pending ещё при create_user_order)
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
    UPDATE public.orders SET status = 'cancelled', cancelled_by = p_cancelled_by WHERE id = p_order_id;
  ELSE
    UPDATE public.guest_checkouts SET status = 'cancelled', cancelled_by = p_cancelled_by WHERE id = p_order_id;
  END IF;

  v_result := 'Успех: Заказ ' || p_order_id || ' отменён';
  IF p_cancelled_by = 'client' THEN v_result := v_result || ' (клиентом)';
  ELSIF p_cancelled_by = 'admin' THEN v_result := v_result || ' (администратором)';
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.cancel_order(UUID, TEXT, TEXT) IS
  'Отменяет заказ. Возвращает потраченные активные бонусы. '
  'Вычитает начисленные бонусы из pending_bonus_balance (добавленные при create_user_order).';


-- =====================================================================================
-- 4. BACKFILL: Пересчитать pending_bonus_balance для всех пользователей
--    Формула: сумма bonuses_awarded заказов, которые не отменены и не completed
--    (completed = activate_pending_bonuses уже переложил в active)
-- =====================================================================================
UPDATE public.profiles p
SET pending_bonus_balance = COALESCE(
  (
    SELECT SUM(o.bonuses_awarded)
    FROM public.orders o
    WHERE o.user_id = p.id
      AND o.status NOT IN ('cancelled', 'completed')
      AND o.bonuses_awarded > 0
  ),
  0
);


-- =====================================================================================
-- 5. BACKFILL: Пометить earned транзакции отменённых заказов как cancelled
-- =====================================================================================
UPDATE public.bonus_transactions bt
SET status = 'cancelled'
FROM public.orders o
WHERE bt.order_id = o.id
  AND bt.transaction_type = 'earned'
  AND bt.status = 'pending'
  AND o.status = 'cancelled';


-- =====================================================================================
-- 6. BACKFILL: Вставить earned записи для старых заказов (без транзакций)
-- =====================================================================================
INSERT INTO public.bonus_transactions (
  user_id, order_id, transaction_type, amount,
  balance_after, pending_balance_after,
  description, status, activation_date, created_at
)
SELECT
  o.user_id, o.id, 'earned', o.bonuses_awarded,
  0, 0,
  'Бонусы за покупку (ретроспективная запись)',
  CASE
    WHEN o.status IN ('completed', 'delivered') THEN 'completed'
    WHEN o.status = 'cancelled'                 THEN 'cancelled'
    ELSE 'pending'
  END,
  o.bonuses_activation_date,
  o.created_at
FROM public.orders o
WHERE o.user_id IS NOT NULL
  AND o.bonuses_awarded > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.bonus_transactions bt
    WHERE bt.order_id = o.id AND bt.transaction_type = 'earned'
  );


NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
