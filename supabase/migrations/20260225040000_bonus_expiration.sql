-- ============================================================================
-- Сгорание бонусов: expires_at, предупреждение за 3 дня, фактическое списание
-- ============================================================================

-- 1. Добавляем колонку expires_at
ALTER TABLE public.bonus_transactions
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 2. Обновляем constraint (финальная версия со всеми типами)
ALTER TABLE public.bonus_transactions
  DROP CONSTRAINT IF EXISTS bonus_transactions_transaction_type_check;

ALTER TABLE public.bonus_transactions
  ADD CONSTRAINT bonus_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'earned', 'spent', 'welcome', 'refund_spent', 'refund_earned',
    'activation', 'review', 'birthday', 'expiration'
  ));

-- 3. Проставляем expires_at для существующих completed activation/welcome/review/birthday
UPDATE public.bonus_transactions
SET expires_at = created_at + interval '90 days'
WHERE expires_at IS NULL
  AND status = 'completed'
  AND transaction_type IN ('activation', 'welcome', 'review', 'birthday')
  AND amount > 0;

-- 4. Обновляем activate_pending_bonuses: при INSERT activation → expires_at = now() + 90 days
-- (Патчим только INSERT в activate_pending_bonuses и activate_my_pending_bonuses)
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
    SELECT o.id, o.bonuses_awarded, o.status
    FROM public.orders o
    JOIN public.profiles p ON p.id = o.user_id
    WHERE o.user_id = v_user_id
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
        balance_after, pending_balance_after, description, status, expires_at
      ) VALUES (
        v_user_id, v_order_row.id, 'activation', v_order_row.bonuses_awarded,
        v_new_active_balance, v_new_pending_balance,
        'Активация бонусов за заказ (14 дней)', 'completed',
        now() + interval '90 days'
      )
      ON CONFLICT DO NOTHING;

      UPDATE public.orders
      SET status = 'completed'
      WHERE id = v_order_row.id;

      v_total_activated := v_total_activated + v_order_row.bonuses_awarded;
      v_processed_orders := v_processed_orders + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Ошибка активации бонусов для заказа %: %', v_order_row.id, SQLERRM;
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
    SELECT o.id, o.user_id, o.bonuses_awarded, o.status,
           p.pending_bonus_balance as current_pending
    FROM public.orders o
    JOIN public.profiles p ON p.id = o.user_id
    WHERE o.status IN ('confirmed', 'delivered')
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
        balance_after, pending_balance_after, description, status, expires_at
      ) VALUES (
        v_order_row.user_id, v_order_row.id, 'activation', v_order_row.bonuses_awarded,
        v_new_active_balance, v_new_pending_balance,
        'Активация бонусов за заказ (14 дней)', 'completed',
        now() + interval '90 days'
      )
      ON CONFLICT DO NOTHING;

      UPDATE public.orders
      SET status = 'completed'
      WHERE id = v_order_row.id;

      v_total_activated := v_total_activated + v_order_row.bonuses_awarded;
      v_processed_orders := v_processed_orders + 1;

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
      RAISE WARNING 'Ошибка при активации бонусов для заказа %: %', v_order_row.id, SQLERRM;
    END;
  END LOOP;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT
    (kv.key)::UUID,
    'bonus_activated',
    'Бонусы активированы!',
    format('%s бонусов теперь доступны для использования', kv.value::INTEGER),
    '/profile/bonuses'
  FROM jsonb_each(v_user_bonuses) AS kv;

  RETURN format('Заказы: %s обработано, %s бонусов активировано.', v_processed_orders, v_total_activated);
END;
$$;

-- 5. Предупреждение о сгорании (за 3 дня)
CREATE OR REPLACE FUNCTION public.check_expiring_bonuses()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_processed INTEGER := 0;
BEGIN
  FOR v_user IN
    SELECT
      bt.user_id,
      SUM(bt.amount) AS expiring_amount
    FROM public.bonus_transactions bt
    WHERE bt.expires_at BETWEEN now() + interval '3 days' AND now() + interval '4 days'
      AND bt.status = 'completed'
      AND bt.amount > 0
      AND bt.transaction_type IN ('activation', 'welcome', 'review', 'birthday')
      -- Дедупликация: нет ли уведомления bonus_expiring сегодня
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = bt.user_id
          AND n.type = 'bonus_expiring'
          AND n.created_at::date = current_date
      )
    GROUP BY bt.user_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
    VALUES (
      v_user.user_id,
      'bonus_expiring',
      '⏳ Бонусы скоро сгорят!',
      format('У вас %s бонусов сгорит через 3 дня. Используйте их!', v_user.expiring_amount::INTEGER),
      '/profile/bonuses',
      false
    );

    v_processed := v_processed + 1;
  END LOOP;

  RETURN format('Отправлено %s предупреждений о сгорании бонусов', v_processed);
END;
$$;

-- 6. Фактическое сгорание бонусов
CREATE OR REPLACE FUNCTION public.expire_bonuses()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_expired_amount INTEGER;
  v_new_balance INTEGER;
  v_processed INTEGER := 0;
BEGIN
  FOR v_user IN
    SELECT
      bt.user_id,
      SUM(bt.amount)::INTEGER AS total_expiring
    FROM public.bonus_transactions bt
    WHERE bt.expires_at < now()
      AND bt.status = 'completed'
      AND bt.amount > 0
      AND bt.transaction_type IN ('activation', 'welcome', 'review', 'birthday')
    GROUP BY bt.user_id
  LOOP
    -- Обновляем баланс (не ниже 0)
    UPDATE public.profiles
    SET active_bonus_balance = GREATEST(active_bonus_balance - v_user.total_expiring, 0)
    WHERE id = v_user.user_id
    RETURNING active_bonus_balance INTO v_new_balance;

    -- Помечаем истёкшие транзакции как cancelled
    UPDATE public.bonus_transactions
    SET status = 'cancelled'
    WHERE user_id = v_user.user_id
      AND expires_at < now()
      AND status = 'completed'
      AND amount > 0
      AND transaction_type IN ('activation', 'welcome', 'review', 'birthday');

    -- Записываем транзакцию списания
    INSERT INTO public.bonus_transactions (
      user_id, amount, transaction_type, status, balance_after, description
    ) VALUES (
      v_user.user_id,
      -v_user.total_expiring,
      'expiration',
      'completed',
      v_new_balance,
      format('Сгорело %s бонусов (срок действия 90 дней)', v_user.total_expiring)
    );

    -- Уведомление
    INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
    VALUES (
      v_user.user_id,
      'bonus_expired',
      '💔 Бонусы сгорели',
      format('%s бонусов сгорело. Используйте оставшиеся бонусы вовремя!', v_user.total_expiring),
      '/profile/bonuses',
      false
    );

    v_processed := v_processed + 1;
  END LOOP;

  RETURN format('Сгорело бонусов у %s пользователей', v_processed);
END;
$$;

-- 7. Cron задачи
SELECT cron.schedule(
  'check-expiring-bonuses',
  '0 8 * * *',
  $$SELECT public.check_expiring_bonuses()$$
);

SELECT cron.schedule(
  'expire-bonuses',
  '0 2 * * *',
  $$SELECT public.expire_bonuses()$$
);

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
