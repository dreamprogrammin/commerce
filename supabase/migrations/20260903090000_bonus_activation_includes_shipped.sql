-- Бонусы активируются и у заказа, который в пути.
--
-- ЧТО БЫЛО. Выборка обеих функций активации бралась по
-- `o.status IN ('confirmed', 'delivered')`. Заказ, который оператор передал
-- курьеру (`shipped`), в неё не попадал вовсе: дата созревания наступала, а
-- бонусы так и висели в отложенных — пока оператор не отметит доставку.
--
-- До 2 сентября 2026 это почти не проявлялось: тогда активация сама
-- переписывала статус в `completed`, и заказ обычно успевал «дозреть» ещё в
-- `confirmed`. После того как подмену статуса убрали (миграция
-- 20260902120000), дыра стала постоянной: заказ штатно доходит до `shipped`
-- и остаётся там до отметки о доставке.
--
-- На проде 3 сентября 2026 в таком положении был один заказ: 100 бонусов,
-- дата созревания 29 мая — то есть три месяца. Это ВСЕ отложенные бонусы,
-- какие были на проде.
--
-- ЧТО СТАЛО. К списку добавлены `shipped` и `completed`.
--   • `shipped` — ради чего всё и делается;
--   • `completed` — старый синоним «доставлен». Свежие заказы его больше не
--     получают (подмену статуса убрали), но одиннадцать прежних на проде в нём
--     остались, и правило «состоявшийся заказ активирует бонусы» должно
--     распространяться и на них.
--
-- `new`, `pending` и `processing` НЕ добавлены намеренно: заказ ещё не
-- подтверждён оператором, и начислять за него бонусы рано. `cancelled` — тем
-- более.
--
-- Повторного начисления это не открывает: признаком «уже начислено» служит
-- транзакция активации (`NOT EXISTS` ниже) и уникальный индекс
-- `uniq_bonus_activation_per_order` под ним — оба поставлены той же
-- миграцией 20260902120000.

-- ── Проверка состояния ─────────────────────────────────────────────────────
-- Ожидаем базу, где предыдущая миграция уже легла: статус не переписывается,
-- а список статусов ещё старый. Иначе — падаем, не тронув функции.
DO $$
DECLARE
  v_bad TEXT := '';
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname IN ('activate_my_pending_bonuses', 'activate_pending_bonuses')
      AND pg_get_functiondef(oid) LIKE '%UPDATE public.orders SET status%'
  ) THEN
    RAISE EXCEPTION 'Функции активации всё ещё переписывают статус заказа — сначала должна лечь миграция 20260902120000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uniq_bonus_activation_per_order'
  ) THEN
    RAISE EXCEPTION 'Нет индекса uniq_bonus_activation_per_order — сначала должна лечь миграция 20260902120000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'activate_my_pending_bonuses'
      AND pg_get_functiondef(oid) LIKE '%''confirmed'', ''delivered''%'
  ) THEN
    v_bad := v_bad || 'activate_my_pending_bonuses ';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'activate_pending_bonuses'
      AND pg_get_functiondef(oid) LIKE '%''confirmed'', ''delivered''%'
  ) THEN
    v_bad := v_bad || 'activate_pending_bonuses ';
  END IF;

  IF v_bad <> '' THEN
    RAISE EXCEPTION 'Ожидался старый список статусов (confirmed, delivered), но его нет в: %. База не та, под которую готовилась миграция.', v_bad;
  END IF;
END $$;

-- ── Пользовательская активация (зовётся фронтом при загрузке профиля) ───────
CREATE OR REPLACE FUNCTION public.activate_my_pending_bonuses()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
      AND o.status IN ('confirmed', 'shipped', 'delivered', 'completed')
      AND o.bonuses_activation_date IS NOT NULL
      AND o.bonuses_activation_date <= NOW()
      AND o.bonuses_awarded > 0
      AND p.pending_bonus_balance >= o.bonuses_awarded
      -- Признак «уже начислено». Раньше эту роль играла подмена статуса
      -- заказа на `completed` — из-за неё заказы и перескакивали шаги.
      AND NOT EXISTS (
        SELECT 1 FROM public.bonus_transactions bt
        WHERE bt.order_id = o.id
          AND bt.transaction_type = 'activation'
      )
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

  RETURN jsonb_build_object('activated', v_total_activated, 'orders_processed', v_processed_orders);
END;
$function$
;

-- ── Ночная активация (cron, 02:00) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.activate_pending_bonuses()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    WHERE o.status IN ('confirmed', 'shipped', 'delivered', 'completed')
      AND o.bonuses_activation_date IS NOT NULL
      AND o.bonuses_activation_date <= NOW()
      AND o.user_id IS NOT NULL
      AND o.bonuses_awarded > 0
      AND p.pending_bonus_balance >= o.bonuses_awarded
      -- См. пояснение в activate_my_pending_bonuses выше.
      AND NOT EXISTS (
        SELECT 1 FROM public.bonus_transactions bt
        WHERE bt.order_id = o.id
          AND bt.transaction_type = 'activation'
      )
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
$function$
;

-- ── Проверка результата ────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname IN ('activate_my_pending_bonuses', 'activate_pending_bonuses')
      AND pg_get_functiondef(oid) NOT LIKE '%''confirmed'', ''shipped'', ''delivered'', ''completed''%'
  ) THEN
    RAISE EXCEPTION 'В одной из функций активации остался старый список статусов';
  END IF;
END $$;
