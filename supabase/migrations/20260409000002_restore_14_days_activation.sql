-- Restore: review bonus activation back to 14 days (was 1 minute for testing)

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

  -- Review бонусы: 14 дней
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
      SET status = 'completed',
          balance_after = v_new_active_balance,
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

  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT (kv.key)::UUID, 'bonus_activated',
    'Бонусы активированы!',
    format('%s бонусов теперь доступны для использования', kv.value::INTEGER),
    '/profile/bonuses'
  FROM jsonb_each(v_user_bonuses) AS kv;

  RETURN format('Обработано: %s, активировано: %s бонусов.', v_processed_orders, v_total_activated);
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_my_pending_bonuses()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_order_row RECORD;
  v_review_row RECORD;
  v_total_activated INTEGER := 0;
  v_processed_orders INTEGER := 0;
  v_new_active_balance INTEGER;
  v_new_pending_balance INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Необходима авторизация');
  END IF;

  FOR v_order_row IN
    SELECT o.id, o.bonuses_awarded
    FROM public.orders o
    JOIN public.profiles p ON p.id = o.user_id
    WHERE o.user_id = v_user_id
      AND o.status IN ('confirmed', 'delivered')
      AND o.bonuses_activation_date IS NOT NULL
      AND o.bonuses_activation_date <= NOW()
      AND o.bonuses_awarded > 0
      AND p.pending_bonus_balance >= o.bonuses_awarded
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    UPDATE public.profiles
    SET pending_bonus_balance = pending_bonus_balance - v_order_row.bonuses_awarded,
        active_bonus_balance  = active_bonus_balance  + v_order_row.bonuses_awarded
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
    ) ON CONFLICT DO NOTHING;

    UPDATE public.orders SET status = 'completed' WHERE id = v_order_row.id;

    v_total_activated  := v_total_activated  + v_order_row.bonuses_awarded;
    v_processed_orders := v_processed_orders + 1;
  END LOOP;

  -- Review бонусы: 14 дней
  FOR v_review_row IN
    SELECT bt.id, bt.amount
    FROM public.bonus_transactions bt
    WHERE bt.user_id = v_user_id
      AND bt.transaction_type = 'review'
      AND bt.status = 'pending'
      AND bt.created_at <= NOW() - INTERVAL '14 days'
    FOR UPDATE OF bt SKIP LOCKED
  LOOP
    UPDATE public.profiles
    SET pending_bonus_balance = GREATEST(pending_bonus_balance - v_review_row.amount, 0),
        active_bonus_balance  = active_bonus_balance + v_review_row.amount
    WHERE id = v_user_id
    RETURNING active_bonus_balance, pending_bonus_balance
    INTO v_new_active_balance, v_new_pending_balance;

    UPDATE public.bonus_transactions
    SET status = 'completed',
        balance_after = v_new_active_balance,
        pending_balance_after = v_new_pending_balance,
        activation_date = NOW()
    WHERE id = v_review_row.id;

    v_total_activated  := v_total_activated  + v_review_row.amount;
    v_processed_orders := v_processed_orders + 1;
  END LOOP;

  IF v_total_activated > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (v_user_id, 'bonus_activated', 'Бонусы активированы!',
      format('%s бонусов теперь доступны', v_total_activated), '/profile/bonuses');
  END IF;

  RETURN jsonb_build_object('activated', v_total_activated, 'orders_processed', v_processed_orders);
END;
$$;

NOTIFY pgrst, 'reload schema';
