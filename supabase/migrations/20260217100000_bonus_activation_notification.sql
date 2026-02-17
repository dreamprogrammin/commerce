-- =====================================================================================
-- МИГРАЦИЯ: Уведомление пользователей при активации бонусов
-- =====================================================================================
-- При активации pending бонусов (через 7 дней) создаём запись в notifications,
-- чтобы клиент узнал об этом через in-app уведомление и Web Push.
-- =====================================================================================

-- =====================================================================================
-- ШАГ 1: Обновляем activate_my_pending_bonuses() — on-demand вызов от пользователя
-- =====================================================================================
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
  -- Проверка авторизации
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Необходима авторизация');
  END IF;

  -- Ищем заказы текущего пользователя с просроченной датой активации
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
      -- Перемещаем бонусы из pending в active
      UPDATE public.profiles
      SET
        pending_bonus_balance = pending_bonus_balance - v_order_row.bonuses_awarded,
        active_bonus_balance = active_bonus_balance + v_order_row.bonuses_awarded
      WHERE id = v_user_id
      RETURNING active_bonus_balance, pending_bonus_balance
      INTO v_new_active_balance, v_new_pending_balance;

      -- Логируем активацию
      INSERT INTO public.bonus_transactions (
        user_id,
        order_id,
        transaction_type,
        amount,
        balance_after,
        pending_balance_after,
        description,
        status
      ) VALUES (
        v_user_id,
        v_order_row.id,
        'activation',
        v_order_row.bonuses_awarded,
        v_new_active_balance,
        v_new_pending_balance,
        'Активация бонусов за заказ (7 дней)',
        'completed'
      )
      ON CONFLICT DO NOTHING;

      -- Помечаем заказ как завершённый
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

  -- Создаём уведомление, если были активированы бонусы
  IF v_total_activated > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      v_user_id,
      'bonus_activated',
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

-- =====================================================================================
-- ШАГ 2: Обновляем activate_pending_bonuses() — pg_cron для всех пользователей
-- =====================================================================================
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
  v_user_amount INTEGER;
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
      -- Перемещаем бонусы из pending в active
      UPDATE public.profiles
      SET
        pending_bonus_balance = pending_bonus_balance - v_order_row.bonuses_awarded,
        active_bonus_balance = active_bonus_balance + v_order_row.bonuses_awarded
      WHERE id = v_order_row.user_id
      RETURNING active_bonus_balance, pending_bonus_balance
      INTO v_new_active_balance, v_new_pending_balance;

      -- Логируем активацию в bonus_transactions
      INSERT INTO public.bonus_transactions (
        user_id,
        order_id,
        transaction_type,
        amount,
        balance_after,
        pending_balance_after,
        description,
        status
      ) VALUES (
        v_order_row.user_id,
        v_order_row.id,
        'activation',
        v_order_row.bonuses_awarded,
        v_new_active_balance,
        v_new_pending_balance,
        'Активация бонусов за заказ (7 дней)',
        'completed'
      )
      ON CONFLICT DO NOTHING;

      -- Помечаем заказ как завершенный
      UPDATE public.orders
      SET status = 'completed'
      WHERE id = v_order_row.id;

      v_total_activated := v_total_activated + v_order_row.bonuses_awarded;
      v_processed_orders := v_processed_orders + 1;

      -- Агрегируем бонусы по user_id
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
        v_order_row.id,
        SQLERRM;
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
