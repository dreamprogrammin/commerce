-- ============================================================================
-- Изменение срока активации бонусов с 7 дней на 14 дней
-- ============================================================================

-- 1. Обновляем process_confirmed_order — устанавливает bonuses_activation_date
DROP FUNCTION IF EXISTS public.process_confirmed_order(UUID);

CREATE FUNCTION public.process_confirmed_order(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_order RECORD;
  v_welcome_bonus INTEGER := 500;
  v_user_profile RECORD;
BEGIN
  -- Получаем данные заказа
  SELECT
    o.id,
    o.user_id,
    o.bonuses_awarded,
    o.bonuses_activation_date,
    o.status
  INTO v_target_order
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RETURN 'Ошибка: Заказ ' || p_order_id || ' не найден.';
  END IF;

  -- ✅ Идемпотентность: если бонусы уже обработаны, пропускаем
  IF v_target_order.bonuses_activation_date IS NOT NULL THEN
    RETURN 'Заказ ' || p_order_id || ' уже обработан (bonuses_activation_date установлена).';
  END IF;

  -- Списываем товары со склада
  UPDATE public.products p
  SET stock_quantity = p.stock_quantity - oi.quantity
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND p.id = oi.product_id;

  IF v_target_order.user_id IS NOT NULL THEN
    -- Получаем профиль пользователя
    SELECT * INTO v_user_profile
    FROM public.profiles
    WHERE id = v_target_order.user_id;

    IF v_user_profile IS NOT NULL AND v_target_order.bonuses_awarded > 0 THEN
      -- Проверяем приветственный бонус
      IF NOT v_user_profile.has_received_welcome_bonus THEN
        UPDATE public.profiles
        SET
          pending_bonus_balance = pending_bonus_balance + v_target_order.bonuses_awarded,
          active_bonus_balance = active_bonus_balance + v_welcome_bonus,
          has_received_welcome_bonus = TRUE
        WHERE id = v_target_order.user_id;

        RAISE NOTICE 'Начислен приветственный бонус % пользователю %', v_welcome_bonus, v_target_order.user_id;
      ELSE
        UPDATE public.profiles
        SET
          pending_bonus_balance = pending_bonus_balance + v_target_order.bonuses_awarded
        WHERE id = v_target_order.user_id;
      END IF;

      -- ✅ Устанавливаем дату активации бонусов за покупку (14 дней)
      UPDATE public.orders
      SET bonuses_activation_date = NOW() + INTERVAL '14 days'
      WHERE id = p_order_id;

      RAISE NOTICE 'Установлена дата активации бонусов для заказа %', p_order_id;
    END IF;
  ELSE
    -- Для гостевых заказов ставим маркер обработки
    UPDATE public.orders
    SET bonuses_activation_date = NOW()
    WHERE id = p_order_id;
  END IF;

  RETURN 'Успех: Заказ ' || p_order_id || ' обработан (товары списаны, бонусы начислены).';
END;
$$;

-- 2. Обновляем activate_my_pending_bonuses — описание в логах
CREATE OR REPLACE FUNCTION public.activate_my_pending_bonuses()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_order_row RECORD;
  v_total_activated INTEGER := 0;
  v_processed_orders INTEGER := 0;
  v_new_active_balance INTEGER;
  v_new_pending_balance INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Необходима авторизация');
  END IF;

  FOR v_order_row IN
    SELECT
      o.id,
      o.bonuses_awarded,
      o.status
    FROM public.orders o
    JOIN public.profiles p ON p.id = o.user_id
    WHERE
      o.user_id = v_user_id
      AND o.status IN ('confirmed', 'delivered')
      AND o.bonuses_activation_date IS NOT NULL
      AND o.bonuses_activation_date <= NOW()
      AND o.bonuses_awarded > 0
      AND p.pending_bonus_balance >= o.bonuses_awarded
    ORDER BY o.bonuses_activation_date ASC
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    BEGIN
      UPDATE public.profiles
      SET
        pending_bonus_balance = pending_bonus_balance - v_order_row.bonuses_awarded,
        active_bonus_balance = active_bonus_balance + v_order_row.bonuses_awarded
      WHERE id = v_user_id
      RETURNING active_bonus_balance, pending_bonus_balance
      INTO v_new_active_balance, v_new_pending_balance;

      INSERT INTO public.bonus_transactions (
        user_id, order_id, transaction_type, amount,
        balance_after, pending_balance_after, description, status
      ) VALUES (
        v_user_id, v_order_row.id, 'activation', v_order_row.bonuses_awarded,
        v_new_active_balance, v_new_pending_balance,
        'Активация бонусов за заказ (14 дней)', 'completed'
      )
      ON CONFLICT DO NOTHING;

      UPDATE public.orders
      SET status = 'completed'
      WHERE id = v_order_row.id;

      v_total_activated := v_total_activated + v_order_row.bonuses_awarded;
      v_processed_orders := v_processed_orders + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Ошибка активации бонусов для заказа %: %',
        v_order_row.id, SQLERRM;
    END;
  END LOOP;

  IF v_total_activated > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      v_user_id, 'bonus_activated',
      'Бонусы активированы!',
      format('%s бонусов теперь доступны для использования', v_total_activated),
      '/profile/bonuses'
    );
  END IF;

  RETURN jsonb_build_object(
    'activated', v_total_activated,
    'orders_processed', v_processed_orders
  );
END;
$$;

-- 3. Обновляем activate_pending_bonuses (pg_cron) — описание в логах
CREATE OR REPLACE FUNCTION public.activate_pending_bonuses()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_row RECORD;
  v_total_activated INTEGER := 0;
  v_processed_orders INTEGER := 0;
  v_new_active_balance INTEGER;
  v_new_pending_balance INTEGER;
  v_user_bonuses JSONB := '{}';
  v_user_key TEXT;
BEGIN
  FOR v_order_row IN
    SELECT
      o.id,
      o.user_id,
      o.bonuses_awarded,
      o.status,
      p.pending_bonus_balance as current_pending
    FROM public.orders o
    JOIN public.profiles p ON p.id = o.user_id
    WHERE
      o.status IN ('confirmed', 'delivered')
      AND o.bonuses_activation_date IS NOT NULL
      AND o.bonuses_activation_date <= NOW()
      AND o.user_id IS NOT NULL
      AND o.bonuses_awarded > 0
      AND p.pending_bonus_balance >= o.bonuses_awarded
    ORDER BY o.bonuses_activation_date ASC
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    BEGIN
      UPDATE public.profiles
      SET
        pending_bonus_balance = pending_bonus_balance - v_order_row.bonuses_awarded,
        active_bonus_balance = active_bonus_balance + v_order_row.bonuses_awarded
      WHERE id = v_order_row.user_id
      RETURNING active_bonus_balance, pending_bonus_balance
      INTO v_new_active_balance, v_new_pending_balance;

      INSERT INTO public.bonus_transactions (
        user_id, order_id, transaction_type, amount,
        balance_after, pending_balance_after, description, status
      ) VALUES (
        v_order_row.user_id, v_order_row.id, 'activation', v_order_row.bonuses_awarded,
        v_new_active_balance, v_new_pending_balance,
        'Активация бонусов за заказ (14 дней)', 'completed'
      )
      ON CONFLICT DO NOTHING;

      UPDATE public.orders
      SET status = 'completed'
      WHERE id = v_order_row.id;

      v_total_activated := v_total_activated + v_order_row.bonuses_awarded;
      v_processed_orders := v_processed_orders + 1;

      -- Агрегируем бонусы по user_id для уведомлений
      v_user_key := v_order_row.user_id::TEXT;
      IF v_user_bonuses ? v_user_key THEN
        v_user_bonuses := jsonb_set(
          v_user_bonuses,
          ARRAY[v_user_key],
          to_jsonb((v_user_bonuses ->> v_user_key)::INTEGER + v_order_row.bonuses_awarded)
        );
      ELSE
        v_user_bonuses := v_user_bonuses || jsonb_build_object(v_user_key, v_order_row.bonuses_awarded);
      END IF;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Ошибка при активации бонусов для заказа %: %',
        v_order_row.id, SQLERRM;
    END;
  END LOOP;

  -- Создаём уведомления для каждого пользователя
  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT
    (kv.key)::UUID,
    'bonus_activated',
    'Бонусы активированы!',
    format('%s бонусов теперь доступны для использования', kv.value::INTEGER),
    '/profile/bonuses'
  FROM jsonb_each(v_user_bonuses) AS kv;

  RETURN format(
    'Заказы: %s обработано, %s бонусов активировано.',
    v_processed_orders,
    v_total_activated
  );
END;
$$;

-- Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
