-- Активация бонусов больше не переписывает статус заказа.
--
-- ЧТО БЫЛО. Обе функции активации — `activate_my_pending_bonuses` (её зовёт
-- фронт при каждой загрузке профиля, см. stores/core/profileStore.ts) и
-- `activate_pending_bonuses` (ночной cron в 02:00) — вместе с начислением
-- бонусов делали `UPDATE public.orders SET status = 'completed'`.
--
-- Дата активации ставится при СОЗДАНИИ заказа (`create_user_order`:
-- `NOW() + INTERVAL '14 days'`), а не при доставке. Поэтому через две недели
-- любой подтверждённый заказ сам становился «Доставлен» — минуя
-- «Комплектуется» и «В пути». Покупатель видел, что статусы идут не по
-- порядку: оператор только подтвердил заказ, а в кабинете он уже доставлен.
--
-- Проверено на локальной базе 2 сентября 2026: ставим заказу `confirmed`,
-- открываем /profile/order/<id> — запрос возвращает `"status":"completed"`,
-- полоса прогресса залита целиком. На проде это видно косвенно: там НЕТ НИ
-- ОДНОГО заказа в статусе `confirmed`, зато 11 `completed` — ровно столько
-- же, сколько транзакций активации.
--
-- ЧТО СТАЛО. Функции активируют бонусы и не трогают жизненный цикл заказа.
-- Статусом управляют только операторские эдж-функции confirm/ship/deliver.
--
-- ПОЧЕМУ НЕЛЬЗЯ ПРОСТО УБРАТЬ `UPDATE`. Именно статус `completed` служил
-- признаком «бонусы за этот заказ уже начислены»: заказ выпадал из выборки,
-- потому что менял статус. Убрать его в одиночку — значит начислять бонусы
-- заново при каждом заходе покупателя в кабинет, пока хватает pending-баланса.
-- Поэтому признак заменён на прямой: «по этому заказу ещё нет транзакции
-- активации», и он подпёрт уникальным индексом.
--
-- `ON CONFLICT DO NOTHING` в теле функций до сих пор был декорацией: под него
-- не существовало ни одного ограничения, конфликтовать было не с чем.
-- Индекс ниже делает его настоящим.

-- ── Проверка состояния ─────────────────────────────────────────────────────
-- Миграция готовилась под конкретные тела функций. Если база не та (кто-то
-- уже правил их руками), лучше упасть здесь, чем молча заменить чужую работу.
DO $$
DECLARE
  v_missing TEXT := '';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'activate_my_pending_bonuses'
      AND pg_get_functiondef(oid) LIKE '%UPDATE public.orders SET status = ''completed''%'
  ) THEN
    v_missing := v_missing || 'activate_my_pending_bonuses ';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'activate_pending_bonuses'
      AND pg_get_functiondef(oid) LIKE '%UPDATE public.orders SET status = ''completed''%'
  ) THEN
    v_missing := v_missing || 'activate_pending_bonuses ';
  END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION
      'Ожидалось, что функции ещё содержат UPDATE статуса заказа, но его нет в: %. База не та, под которую готовилась миграция.',
      v_missing;
  END IF;
END $$;

-- ── Защита от повторной активации ──────────────────────────────────────────
-- Одна активация на заказ. На 2 сентября 2026 дублей на проде нет (проверено
-- запросом), поэтому индекс встаёт без чистки. Если дубли появятся — миграция
-- упадёт здесь, и это правильно: молча схлопывать денежные записи нельзя.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bonus_activation_per_order
  ON public.bonus_transactions (order_id)
  WHERE transaction_type = 'activation' AND order_id IS NOT NULL;

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
      AND o.status IN ('confirmed', 'delivered')
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
$function$;

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
    WHERE o.status IN ('confirmed', 'delivered')
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
$function$;

-- ── Проверка результата ────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname IN ('activate_my_pending_bonuses', 'activate_pending_bonuses')
      AND pg_get_functiondef(oid) LIKE '%UPDATE public.orders SET status%'
  ) THEN
    RAISE EXCEPTION 'В функциях активации остался UPDATE статуса заказа';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uniq_bonus_activation_per_order'
  ) THEN
    RAISE EXCEPTION 'Не создан уникальный индекс uniq_bonus_activation_per_order';
  END IF;
END $$;
