-- Fix: activate_pending_bonuses не обрабатывала review транзакции (order_id = NULL)

CREATE OR REPLACE FUNCTION public.activate_pending_bonuses()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_row RECORD;
  v_review_row RECORD;
  v_total_activated INTEGER := 0;
  v_processed_orders INTEGER := 0;
  v_new_active_balance INTEGER;
  v_new_pending_balance INTEGER;
  v_user_bonuses JSONB := '{}';
  v_user_key TEXT;
BEGIN
  -- 1. Активируем бонусы за ЗАКАЗЫ (без изменений)
  FOR v_order_row IN
    SELECT o.id, o.user_id, o.bonuses_awarded, p.pending_bonus_balance
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
      SET pending_bonus_balance = pending_bonus_balance - v_order_row.bonuses_awarded,
          active_bonus_balance  = active_bonus_balance  + v_order_row.bonuses_awarded
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
      ) ON CONFLICT DO NOTHING;

      UPDATE public.orders SET status = 'completed' WHERE id = v_order_row.id;

      v_total_activated  := v_total_activated  + v_order_row.bonuses_awarded;
      v_processed_orders := v_processed_orders + 1;

      v_user_key := v_order_row.user_id::TEXT;
      v_user_bonuses := v_user_bonuses || jsonb_build_object(
        v_user_key,
        COALESCE((v_user_bonuses ->> v_user_key)::INTEGER, 0) + v_order_row.bonuses_awarded
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Ошибка активации бонусов для заказа %: %', v_order_row.id, SQLERRM;
    END;
  END LOOP;

  -- 2. Активируем бонусы за ОТЗЫВЫ (через 14 дней после начисления)
  FOR v_review_row IN
    SELECT bt.id, bt.user_id, bt.amount
    FROM public.bonus_transactions bt
    WHERE bt.transaction_type = 'review'
      AND bt.status = 'pending'
      AND bt.created_at <= NOW() - INTERVAL '14 days'
    FOR UPDATE OF bt SKIP LOCKED
  LOOP
    BEGIN
      UPDATE public.profiles
      SET pending_bonus_balance = GREATEST(pending_bonus_balance - v_review_row.amount, 0),
          active_bonus_balance  = active_bonus_balance + v_review_row.amount
      WHERE id = v_review_row.user_id
      RETURNING active_bonus_balance, pending_bonus_balance
      INTO v_new_active_balance, v_new_pending_balance;

      UPDATE public.bonus_transactions
      SET status          = 'completed',
          balance_after   = v_new_active_balance,
          pending_balance_after = v_new_pending_balance,
          activation_date = NOW()
      WHERE id = v_review_row.id;

      v_total_activated  := v_total_activated  + v_review_row.amount;
      v_processed_orders := v_processed_orders + 1;

      v_user_key := v_review_row.user_id::TEXT;
      v_user_bonuses := v_user_bonuses || jsonb_build_object(
        v_user_key,
        COALESCE((v_user_bonuses ->> v_user_key)::INTEGER, 0) + v_review_row.amount
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Ошибка активации бонусов за отзыв %: %', v_review_row.id, SQLERRM;
    END;
  END LOOP;

  -- Уведомления
  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT
    (kv.key)::UUID, 'bonus_activated',
    'Бонусы активированы!',
    format('%s бонусов теперь доступны для использования', kv.value::INTEGER),
    '/profile/bonuses'
  FROM jsonb_each(v_user_bonuses) AS kv;

  RETURN format('Обработано: %s, активировано: %s бонусов.', v_processed_orders, v_total_activated);
END;
$$;

-- Backfill: активируем зависшие review бонусы старше 14 дней
UPDATE public.bonus_transactions bt
SET status = 'completed',
    activation_date = NOW()
FROM (
  SELECT bt2.id, bt2.user_id, bt2.amount
  FROM public.bonus_transactions bt2
  WHERE bt2.transaction_type = 'review'
    AND bt2.status = 'pending'
    AND bt2.created_at <= NOW() - INTERVAL '14 days'
) old_bt
WHERE bt.id = old_bt.id;

UPDATE public.profiles p
SET active_bonus_balance  = active_bonus_balance  + sub.total,
    pending_bonus_balance = GREATEST(pending_bonus_balance - sub.total, 0)
FROM (
  SELECT user_id, SUM(amount) AS total
  FROM public.bonus_transactions
  WHERE transaction_type = 'review'
    AND status = 'completed'
    AND activation_date >= NOW() - INTERVAL '1 minute'
  GROUP BY user_id
) sub
WHERE p.id = sub.user_id;

NOTIFY pgrst, 'reload schema';
