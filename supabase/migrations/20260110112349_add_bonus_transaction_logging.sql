-- =====================================================================================
-- МИГРАЦИЯ: Добавление автоматического логирования бонусных транзакций
-- =====================================================================================
-- Назначение:
-- - Обновляет create_user_order() для логирования всех операций с бонусами
-- - Обновляет cancel_order() для логирования возвратов и откатов
-- - Каждая операция с бонусами теперь записывается в bonus_transactions
-- =====================================================================================

-- =====================================================================================
-- ОБНОВЛЕНИЕ: create_user_order с логированием транзакций
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
BEGIN
  -- Проверка авторизации
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация для оформления заказа';
  END IF;

  -- Получаем профиль пользователя
  SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_current_user_id;

  IF v_user_profile IS NULL THEN
    RAISE EXCEPTION 'Профиль пользователя не найден';
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

  -- ✅ ЛОГИРОВАНИЕ: Списываем потраченные бонусы и записываем транзакцию
  IF COALESCE(p_bonuses_to_spend, 0) > 0 THEN
    UPDATE public.profiles
    SET active_bonus_balance = GREATEST(COALESCE(active_bonus_balance, 0) - p_bonuses_to_spend, 0)
    WHERE id = v_current_user_id
    RETURNING active_bonus_balance, pending_bonus_balance INTO v_new_active_balance, v_new_pending_balance;

    -- ✅ Логируем списание бонусов
    INSERT INTO public.bonus_transactions (
      user_id, order_id, transaction_type, amount,
      balance_after, pending_balance_after,
      description, status
    ) VALUES (
      v_current_user_id, v_new_order_id, 'spent', -p_bonuses_to_spend,
      v_new_active_balance, v_new_pending_balance,
      'Оплата заказа', 'completed'
    );

    RAISE NOTICE 'Списано бонусов: % для пользователя %', p_bonuses_to_spend, v_current_user_id;
  END IF;

  -- ✅ ЛОГИРОВАНИЕ: Приветственный бонус
  IF v_is_first_order AND NOT COALESCE(v_user_profile.has_received_welcome_bonus, FALSE) THEN
    UPDATE public.profiles
    SET
      active_bonus_balance = COALESCE(active_bonus_balance, 0) + 1000,
      has_received_welcome_bonus = TRUE
    WHERE id = v_current_user_id
    RETURNING active_bonus_balance, pending_bonus_balance INTO v_new_active_balance, v_new_pending_balance;

    -- ✅ Логируем приветственный бонус
    INSERT INTO public.bonus_transactions (
      user_id, order_id, transaction_type, amount,
      balance_after, pending_balance_after,
      description, status
    ) VALUES (
      v_current_user_id, v_new_order_id, 'welcome', 1000,
      v_new_active_balance, v_new_pending_balance,
      'Приветственный бонус за первый заказ', 'completed'
    );

    RAISE NOTICE 'Начислен приветственный бонус 1000 для пользователя %', v_current_user_id;
  END IF;

  -- ✅ ЛОГИРОВАНИЕ: Бонусы за товары (pending, активация через 7 дней)
  IF COALESCE(v_total_award_bonuses, 0) > 0 THEN
    UPDATE public.profiles
    SET pending_bonus_balance = COALESCE(pending_bonus_balance, 0) + v_total_award_bonuses
    WHERE id = v_current_user_id
    RETURNING active_bonus_balance, pending_bonus_balance INTO v_new_active_balance, v_new_pending_balance;

    -- ✅ Логируем начисление бонусов за покупку
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

    RAISE NOTICE 'Добавлено в pending бонусов: % для пользователя %', v_total_award_bonuses, v_current_user_id;
  END IF;

  RETURN v_new_order_id;
END;
$$;

COMMENT ON FUNCTION public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER) IS
'Создает новый заказ для авторизованного пользователя с поддержкой бонусной системы.
Параметры:
  - p_cart_items: JSON массив товаров [{product_id, quantity}]
  - p_delivery_method: Способ доставки
  - p_payment_method: Способ оплаты
  - p_delivery_address: JSON с адресом доставки
  - p_bonuses_to_spend: Количество бонусов к списанию

ОБНОВЛЕНИЕ v2.0 (2026-01-10):
  - Добавлено автоматическое логирование всех операций с бонусами в bonus_transactions
  - Логируются: списание (spent), приветственный (welcome), начисление (earned)';

-- =====================================================================================
-- ОБНОВЛЕНИЕ: cancel_order с логированием транзакций
-- =====================================================================================

DROP FUNCTION IF EXISTS public.cancel_order(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id UUID,
  p_table_name TEXT DEFAULT 'orders'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target_order RECORD;
  v_order_item_record RECORD;
  v_user_profile RECORD;
  v_welcome_bonus INTEGER := 1000;
  v_order_items_table TEXT;
  v_sql TEXT;
  v_new_active_balance INTEGER;
  v_new_pending_balance INTEGER;
BEGIN
  -- Валидация имени таблицы
  IF p_table_name NOT IN ('orders', 'guest_checkouts') THEN
    RETURN 'Ошибка: Неверное имя таблицы.';
  END IF;

  v_order_items_table := CASE
    WHEN p_table_name = 'guest_checkouts' THEN 'guest_checkout_items'
    ELSE 'order_items'
  END;

  -- =========================================================================
  -- GUEST_CHECKOUTS (без бонусов, логирование не требуется)
  -- =========================================================================
  IF p_table_name = 'guest_checkouts' THEN
    v_sql := format('SELECT * FROM public.%I WHERE id = $1 FOR UPDATE', p_table_name);
    EXECUTE v_sql INTO v_target_order USING p_order_id;

    IF v_target_order IS NULL THEN
      RETURN 'Ошибка: Заказ не найден.';
    END IF;

    IF v_target_order.status NOT IN ('pending', 'new', 'confirmed', 'processing') THEN
      RETURN 'Ошибка: Этот заказ уже нельзя отменить.';
    END IF;

    IF v_target_order.status IN ('confirmed', 'processing') THEN
      v_sql := format('SELECT product_id, quantity FROM public.%I WHERE order_id = $1', v_order_items_table);
      FOR v_order_item_record IN EXECUTE v_sql USING p_order_id
      LOOP
        UPDATE public.products
        SET
          stock_quantity = stock_quantity + v_order_item_record.quantity,
          sales_count = sales_count - v_order_item_record.quantity
        WHERE id = v_order_item_record.product_id;
      END LOOP;
    END IF;

    v_sql := format('UPDATE public.%I SET status = $1 WHERE id = $2', p_table_name);
    EXECUTE v_sql USING 'cancelled', p_order_id;

    RETURN 'Успех: Гостевой заказ ' || p_order_id || ' был отменен.';
  END IF;

  -- =========================================================================
  -- ORDERS (заказы зарегистрированных пользователей с бонусами)
  -- =========================================================================
  SELECT * INTO v_target_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_target_order IS NULL THEN
    RETURN 'Ошибка: Заказ не найден.';
  END IF;

  IF v_target_order.status NOT IN ('pending', 'new', 'confirmed', 'processing') THEN
    RETURN 'Ошибка: Этот заказ уже нельзя отменить (возможно, он выполнен или уже отменен).';
  END IF;

  -- Возврат товаров на склад (только для confirmed/processing)
  IF v_target_order.status IN ('confirmed', 'processing') THEN
    FOR v_order_item_record IN
      SELECT product_id, quantity
      FROM public.order_items
      WHERE order_id = p_order_id
    LOOP
      UPDATE public.products
      SET
        stock_quantity = stock_quantity + v_order_item_record.quantity,
        sales_count = sales_count - v_order_item_record.quantity
      WHERE id = v_order_item_record.product_id;
    END LOOP;
  END IF;

  -- ✅ ЛОГИРОВАНИЕ: Откатываем бонусы для ВСЕХ статусов
  IF v_target_order.user_id IS NOT NULL THEN
    SELECT * INTO v_user_profile
    FROM public.profiles
    WHERE id = v_target_order.user_id;

    IF v_user_profile IS NOT NULL THEN
      -- Для заказов в статусе NEW/PENDING
      IF v_target_order.status IN ('pending', 'new') THEN
        -- ✅ Возвращаем потраченные бонусы
        IF COALESCE(v_target_order.bonuses_spent, 0) > 0 THEN
          UPDATE public.profiles
          SET active_bonus_balance = active_bonus_balance + v_target_order.bonuses_spent
          WHERE id = v_target_order.user_id
          RETURNING active_bonus_balance, pending_bonus_balance INTO v_new_active_balance, v_new_pending_balance;

          -- ✅ Логируем возврат бонусов
          INSERT INTO public.bonus_transactions (
            user_id, order_id, transaction_type, amount,
            balance_after, pending_balance_after,
            description, status
          ) VALUES (
            v_target_order.user_id, p_order_id, 'refund_spent', v_target_order.bonuses_spent,
            v_new_active_balance, v_new_pending_balance,
            'Возврат бонусов при отмене заказа', 'completed'
          );
        END IF;

        -- ✅ Убираем начисленные бонусы
        IF COALESCE(v_target_order.bonuses_awarded, 0) > 0 THEN
          UPDATE public.profiles
          SET pending_bonus_balance = GREATEST(pending_bonus_balance - v_target_order.bonuses_awarded, 0)
          WHERE id = v_target_order.user_id
          RETURNING active_bonus_balance, pending_bonus_balance INTO v_new_active_balance, v_new_pending_balance;

          -- ✅ Логируем откат начисленных бонусов
          INSERT INTO public.bonus_transactions (
            user_id, order_id, transaction_type, amount,
            balance_after, pending_balance_after,
            description, status
          ) VALUES (
            v_target_order.user_id, p_order_id, 'refund_earned', -v_target_order.bonuses_awarded,
            v_new_active_balance, v_new_pending_balance,
            'Отмена начисления бонусов', 'completed'
          );
        END IF;

        RAISE NOTICE 'Откачены бонусы для заказа % (статус: %): spent=%, awarded=%',
          p_order_id, v_target_order.status, v_target_order.bonuses_spent, v_target_order.bonuses_awarded;

      -- Для подтвержденных заказов
      ELSIF v_target_order.status IN ('confirmed', 'processing') THEN
        DECLARE
          v_other_confirmed_orders INTEGER;
        BEGIN
          SELECT COUNT(*) INTO v_other_confirmed_orders
          FROM public.orders
          WHERE user_id = v_target_order.user_id
            AND id != p_order_id
            AND status IN ('confirmed', 'processing', 'completed');

          -- Откат приветственного бонуса (если это был единственный заказ)
          IF v_other_confirmed_orders = 0 AND v_user_profile.has_received_welcome_bonus THEN
            UPDATE public.profiles
            SET
              active_bonus_balance = active_bonus_balance + v_target_order.bonuses_spent - v_welcome_bonus,
              pending_bonus_balance = GREATEST(pending_bonus_balance - v_target_order.bonuses_awarded, 0),
              has_received_welcome_bonus = FALSE
            WHERE id = v_target_order.user_id
            RETURNING active_bonus_balance, pending_bonus_balance INTO v_new_active_balance, v_new_pending_balance;

            -- ✅ Логируем откат приветственного бонуса
            INSERT INTO public.bonus_transactions (
              user_id, order_id, transaction_type, amount,
              balance_after, pending_balance_after,
              description, status
            ) VALUES (
              v_target_order.user_id, p_order_id, 'refund_spent', -v_welcome_bonus,
              v_new_active_balance, v_new_pending_balance,
              'Откат приветственного бонуса', 'completed'
            );

            -- ✅ Логируем возврат потраченных бонусов (если были)
            IF COALESCE(v_target_order.bonuses_spent, 0) > 0 THEN
              INSERT INTO public.bonus_transactions (
                user_id, order_id, transaction_type, amount,
                balance_after, pending_balance_after,
                description, status
              ) VALUES (
                v_target_order.user_id, p_order_id, 'refund_spent', v_target_order.bonuses_spent,
                v_new_active_balance, v_new_pending_balance,
                'Возврат бонусов при отмене заказа', 'completed'
              );
            END IF;

            -- ✅ Логируем откат начисленных бонусов
            IF COALESCE(v_target_order.bonuses_awarded, 0) > 0 THEN
              INSERT INTO public.bonus_transactions (
                user_id, order_id, transaction_type, amount,
                balance_after, pending_balance_after,
                description, status
              ) VALUES (
                v_target_order.user_id, p_order_id, 'refund_earned', -v_target_order.bonuses_awarded,
                v_new_active_balance, v_new_pending_balance,
                'Отмена начисления бонусов', 'completed'
              );
            END IF;

            RAISE NOTICE 'Откачен приветственный бонус для пользователя %', v_target_order.user_id;
          ELSE
            -- Обычный откат (без приветственного бонуса)
            UPDATE public.profiles
            SET
              active_bonus_balance = active_bonus_balance + v_target_order.bonuses_spent,
              pending_bonus_balance = GREATEST(pending_bonus_balance - v_target_order.bonuses_awarded, 0)
            WHERE id = v_target_order.user_id
            RETURNING active_bonus_balance, pending_bonus_balance INTO v_new_active_balance, v_new_pending_balance;

            -- ✅ Логируем возврат потраченных бонусов
            IF COALESCE(v_target_order.bonuses_spent, 0) > 0 THEN
              INSERT INTO public.bonus_transactions (
                user_id, order_id, transaction_type, amount,
                balance_after, pending_balance_after,
                description, status
              ) VALUES (
                v_target_order.user_id, p_order_id, 'refund_spent', v_target_order.bonuses_spent,
                v_new_active_balance, v_new_pending_balance,
                'Возврат бонусов при отмене заказа', 'completed'
              );
            END IF;

            -- ✅ Логируем откат начисленных бонусов
            IF COALESCE(v_target_order.bonuses_awarded, 0) > 0 THEN
              INSERT INTO public.bonus_transactions (
                user_id, order_id, transaction_type, amount,
                balance_after, pending_balance_after,
                description, status
              ) VALUES (
                v_target_order.user_id, p_order_id, 'refund_earned', -v_target_order.bonuses_awarded,
                v_new_active_balance, v_new_pending_balance,
                'Отмена начисления бонусов', 'completed'
              );
            END IF;

            RAISE NOTICE 'Откачены бонусы: spent=% awarded=% для пользователя %',
              v_target_order.bonuses_spent, v_target_order.bonuses_awarded, v_target_order.user_id;
          END IF;
        END;
      END IF;
    END IF;
  END IF;

  -- Меняем статус заказа на cancelled
  UPDATE public.orders
  SET status = 'cancelled'
  WHERE id = p_order_id;

  RETURN 'Успех: Заказ ' || p_order_id || ' был отменен.';
END;
$$;

COMMENT ON FUNCTION public.cancel_order(UUID, TEXT) IS
'Универсальная функция отмены заказа с поддержкой обеих таблиц (orders и guest_checkouts).
Параметры:
  - p_order_id: UUID заказа
  - p_table_name: Имя таблицы (orders или guest_checkouts), по умолчанию orders

ОБНОВЛЕНИЕ v2.0 (2026-01-10):
  - Добавлено автоматическое логирование всех операций с бонусами в bonus_transactions
  - Логируются: возврат потраченных (refund_spent), откат начисленных (refund_earned)';
