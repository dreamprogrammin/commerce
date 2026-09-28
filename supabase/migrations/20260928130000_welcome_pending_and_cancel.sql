-- Приветственный бонус — в ожидании 14 дней и с откатом при отмене; при
-- отмене sales_count уменьшается только у засчитанного заказа.
--
-- ЗАЧЕМ. Миграция 20260928120000 включила приветственный бонус (до неё его не
-- получал никто) и дала его сразу на активный баланс при подтверждении
-- заказа. А подтверждённый заказ покупатель отменяет на сайте сам, и
-- cancel_order приветственный бонус не откатывала: заказ → подтверждение →
-- 1000 → отмена → скидка на следующий заказ. Сайт к тому же обещает иначе
-- (GuestBonusModal.vue): «Бонусы начисляются при подтверждении заказа
-- администратором», «Активация через 14 дней после подтверждения».
--
-- Вторая находка того же разбора (28 сентября 2026, данные с боя):
-- cancel_order уменьшала sales_count при любой отмене — и у заказа,
-- отменённого до подтверждения, которого никто не засчитывал. Счётчик читают
-- «Популярные», подбор на лендинге LEGO, список дозаказа, статистика админки.
--
-- ЧТО МЕНЯЕТСЯ (тела — с прода 28 сентября, md5 сверяется ниже):
--   • process_confirmed_order — приветственный в pending_bonus_balance и
--     запись welcome со статусом pending (было — сразу активный баланс);
--   • activate_pending_bonuses, activate_my_pending_bonuses — цикл бонусов за
--     отзыв берёт и приветственный: 14 дней после записи, то есть после
--     подтверждения;
--   • cancel_order — ожидающий приветственный бонус заказа отменяется
--     (запись cancelled, из pending_bonus_balance вычитается, право на бонус
--     переходит к следующему заказу); продажа снимается, только если её
--     засчитали: у заказа — confirmation_processed_at (20260928120000), у
--     гостевого — статус confirmed, processing или shipped (засчитан
--     process_confirmed_guest_checkout при подтверждении).
--
-- ПРИМЕНЯТЬ ВМЕСТЕ С 20260928120000 — одним запуском: без этой она оставляет
-- лазейку с отменой. Проверка состояния ниже требует, чтобы та уже встала.
--
-- CREATE OR REPLACE: права всех четырёх функций сохраняются — проверяется в
-- конце.

-- ── Проверка состояния ─────────────────────────────────────────────────────
DO $check$
DECLARE
  v_fn  text;
  v_md5 text;
BEGIN
  FOR v_fn, v_md5 IN
    SELECT * FROM (VALUES
      ('public.process_confirmed_order(uuid)', 'f4f8ff79fdb09fde6b2328b467fbd3e9'),
      ('public.activate_pending_bonuses()', 'e4f82e5bb38a36583ec707535adf12de'),
      ('public.activate_my_pending_bonuses()', '9dd0e571f0611df10d6447794ce9015b'),
      ('public.cancel_order(uuid,text,text)', '2e257ba58abf9f841a00d095921d6ef9')
    ) AS t(fn, m)
  LOOP
    IF md5((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure(v_fn))) IS DISTINCT FROM v_md5 THEN
      RAISE EXCEPTION '% на базе не та, под которую готовилась миграция (для process_confirmed_order — после 20260928120000)', v_fn;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'orders'
                    AND column_name = 'confirmation_processed_at') THEN
    RAISE EXCEPTION 'Нет orders.confirmation_processed_at — сначала 20260928120000';
  END IF;
END
$check$;

-- ── Функции ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_confirmed_order(p_order_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target_order    RECORD;
  v_item_record     RECORD;
  -- 1000 — как обещает сайт (GuestBonusModal.vue: «1000 бонусов после
  -- подтверждения первого заказа»); было 500.
  v_welcome_bonus   INTEGER := 1000;
  v_user_profile    RECORD;
  v_activation_date TIMESTAMPTZ;
BEGIN
  SELECT o.id, o.user_id, o.bonuses_awarded, o.bonuses_activation_date, o.status,
         o.confirmation_processed_at
  INTO v_target_order
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RETURN 'Ошибка: Заказ ' || p_order_id || ' не найден.';
  END IF;

  -- Идемпотентность: повторный вызов — безопасно пропускаем. По своей
  -- отметке, а не по дате активации: её ставит create_user_order ещё при
  -- создании заказа, и каждый заказ покупателя считался обработанным
  -- (бой, 28.09.2026: приветственного бонуса не получил никто).
  IF v_target_order.confirmation_processed_at IS NOT NULL THEN
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

    -- IF FOUND, а не v_user_profile IS NOT NULL: запись с любым пустым
    -- полем (фамилия, телефон, Telegram) для такого сравнения — NULL.
    IF FOUND THEN
      -- Приветственный бонус (только первый заказ) — в ожидании 14 дней, как
      -- бонус за отзыв: активируют activate_pending_bonuses и
      -- activate_my_pending_bonuses по created_at, отмена заказа до этого —
      -- cancel_order откатывает (20260928130000). Сразу на активный баланс
      -- нельзя: подтверждённый заказ покупатель отменяет на сайте сам.
      IF NOT v_user_profile.has_received_welcome_bonus THEN
        UPDATE public.profiles
        SET pending_bonus_balance   = pending_bonus_balance + v_welcome_bonus,
            has_received_welcome_bonus = TRUE
        WHERE id = v_target_order.user_id;

        INSERT INTO public.bonus_transactions (
          user_id, order_id, transaction_type, amount,
          balance_after, pending_balance_after, description, status, activation_date
        ) VALUES (
          v_target_order.user_id, p_order_id, 'welcome', v_welcome_bonus,
          COALESCE(v_user_profile.active_bonus_balance, 0),
          COALESCE(v_user_profile.pending_bonus_balance, 0) + v_welcome_bonus,
          'Приветственный бонус за первый заказ',
          'pending', NOW() + INTERVAL '14 days'
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

  UPDATE public.orders SET confirmation_processed_at = NOW() WHERE id = p_order_id;

  RETURN 'Успех: Заказ ' || p_order_id || ' обработан.';
END;
$function$;

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

  -- Бонусы за отзыв и приветственный (с 20260928130000): 14 дней после записи
  FOR v_review_row IN
    SELECT bt.id, bt.user_id, bt.amount
    FROM public.bonus_transactions bt
    WHERE bt.transaction_type IN ('review', 'welcome')
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

  -- Бонусы за отзыв и приветственный (с 20260928130000): 14 дней после записи
  FOR v_review_row IN
    SELECT bt.id, bt.amount
    FROM public.bonus_transactions bt
    WHERE bt.user_id = v_user_id
      AND bt.transaction_type IN ('review', 'welcome')
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

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid, p_table_name text DEFAULT 'orders'::text, p_cancelled_by text DEFAULT 'admin'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status           TEXT;
  v_user_id          UUID    := NULL;
  v_bonuses_spent    NUMERIC := 0;
  v_bonuses_awarded  INTEGER := 0;
  v_item_record      RECORD;
  v_result           TEXT;
  v_new_active_bal   INTEGER;
  v_new_pending_bal  INTEGER;
  v_counted          BOOLEAN := FALSE;
  v_welcome_tx       RECORD;
BEGIN
  -- Через API без прав администратора — только покупатель, свой заказ и те
  -- статусы, где сайт показывает «Отменить»: миграция 20260927120000.
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
    IF p_table_name IS DISTINCT FROM 'orders'
       OR p_cancelled_by IS DISTINCT FROM 'client'
       OR NOT EXISTS (
            SELECT 1
              FROM public.orders o
             WHERE o.id = p_order_id
               AND o.user_id = auth.uid()
               AND o.status IN ('new', 'confirmed')) THEN
      RAISE EXCEPTION 'Отменить на сайте можно только свой заказ, пока он новый или подтверждён'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_cancelled_by NOT IN ('client', 'admin', 'system') THEN
    RAISE EXCEPTION 'Неверное значение cancelled_by: %', p_cancelled_by;
  END IF;

  IF p_table_name NOT IN ('orders', 'guest_checkouts') THEN
    RAISE EXCEPTION 'Неверная таблица: %', p_table_name;
  END IF;

  IF p_table_name = 'orders' THEN
    SELECT status, user_id, COALESCE(bonuses_spent, 0), COALESCE(bonuses_awarded, 0),
           confirmation_processed_at IS NOT NULL
    INTO v_status, v_user_id, v_bonuses_spent, v_bonuses_awarded, v_counted
    FROM public.orders WHERE id = p_order_id;
  ELSE
    SELECT status INTO v_status
    FROM public.guest_checkouts WHERE id = p_order_id;
    -- гостевой засчитан при подтверждении (process_confirmed_guest_checkout)
    v_counted := COALESCE(v_status IN ('confirmed', 'processing', 'shipped'), FALSE);
  END IF;

  IF v_status IS NULL THEN
    RETURN 'Ошибка: Заказ не найден в таблице ' || p_table_name;
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN 'Ошибка: Заказ уже отменён';
  END IF;
  -- ✅ ИЗМЕНЕНО: добавлен shipped в список разрешённых статусов
  IF v_status NOT IN ('new', 'pending', 'confirmed', 'processing', 'shipped') THEN
    RETURN 'Ошибка: Заказ в статусе "' || v_status || '" нельзя отменить';
  END IF;

  -- Возвращаем товары на склад. Продажу снимаем, только если её засчитали
  -- (20260928130000): раньше sales_count уменьшался и у заказа, отменённого
  -- до подтверждения, — а его никто не прибавлял.
  IF p_table_name = 'orders' THEN
    FOR v_item_record IN
      SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id
    LOOP
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_item_record.quantity,
          sales_count    = CASE WHEN v_counted
                                THEN GREATEST(sales_count - v_item_record.quantity, 0)
                                ELSE sales_count END
      WHERE id = v_item_record.product_id;
    END LOOP;
  ELSE
    FOR v_item_record IN
      SELECT product_id, quantity FROM public.guest_checkout_items WHERE checkout_id = p_order_id
    LOOP
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_item_record.quantity,
          sales_count    = CASE WHEN v_counted
                                THEN GREATEST(sales_count - v_item_record.quantity, 0)
                                ELSE sales_count END
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

    -- B) Вычитаем НАЧИСЛЕННЫЕ бонусы из pending
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
        v_user_id, p_order_id, -v_bonuses_awarded, 'rollback_earned', 'completed',
        v_new_active_bal, v_new_pending_bal,
        'Откат начисленных бонусов при отмене заказа'
      );
    END IF;

    -- C) Приветственный бонус этого заказа, пока он в ожидании, — отменяем, а
    --    право на него переходит к следующему заказу (20260928130000).
    SELECT id, amount INTO v_welcome_tx
      FROM public.bonus_transactions
     WHERE order_id = p_order_id AND transaction_type = 'welcome' AND status = 'pending'
     FOR UPDATE;
    IF FOUND THEN
      UPDATE public.profiles
      SET pending_bonus_balance      = GREATEST(pending_bonus_balance - v_welcome_tx.amount, 0),
          has_received_welcome_bonus = FALSE
      WHERE id = v_user_id;

      UPDATE public.bonus_transactions
      SET status = 'cancelled'
      WHERE id = v_welcome_tx.id;
    END IF;
  END IF;

  -- Обновляем статус заказа
  IF p_table_name = 'orders' THEN
    UPDATE public.orders
    SET status = 'cancelled', cancelled_by = p_cancelled_by
    WHERE id = p_order_id;
  ELSE
    UPDATE public.guest_checkouts
    SET status = 'cancelled', cancelled_by = p_cancelled_by
    WHERE id = p_order_id;
  END IF;

  v_result := 'Заказ ' || p_order_id || ' успешно отменён';
  IF v_bonuses_spent > 0 THEN
    v_result := v_result || '. Возвращено бонусов: ' || v_bonuses_spent;
  END IF;

  RETURN v_result;
END;
$function$;

-- ── Проверка после ─────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_fn text;
BEGIN
  IF (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.process_confirmed_order(uuid)'))
     NOT LIKE '%''welcome'', v_welcome_bonus%''pending'', NOW() + INTERVAL ''14 days''%' THEN
    RAISE EXCEPTION 'process_confirmed_order: приветственный не встал в ожидание';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.activate_pending_bonuses()'))
     NOT LIKE '%transaction_type IN (''review'', ''welcome'')%'
     OR (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.activate_my_pending_bonuses()'))
     NOT LIKE '%transaction_type IN (''review'', ''welcome'')%' THEN
    RAISE EXCEPTION 'Активация не берёт приветственный бонус';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.cancel_order(uuid,text,text)'))
     NOT LIKE '%transaction_type = ''welcome'' AND status = ''pending''%'
     OR (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.cancel_order(uuid,text,text)'))
     NOT LIKE '%CASE WHEN v_counted%' THEN
    RAISE EXCEPTION 'cancel_order: правка не встала';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY['process_confirmed_order', 'activate_pending_bonuses',
                              'activate_my_pending_bonuses', 'cancel_order'] LOOP
    IF (SELECT count(*) FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace AND proname = v_fn) <> 1 THEN
      RAISE EXCEPTION '% больше одной версии — появилась перегрузка', v_fn;
    END IF;
  END LOOP;

  -- Права — как до миграции (20260927120000)
  IF has_function_privilege('anon', 'public.process_confirmed_order(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.process_confirmed_order(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.activate_pending_bonuses()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.activate_pending_bonuses()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cancel_order(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Права вернулись к anon или authenticated';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.cancel_order(uuid,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.activate_my_pending_bonuses()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Сайт потерял доступ к cancel_order или activate_my_pending_bonuses';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.process_confirmed_order(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.activate_pending_bonuses()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.cancel_order(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role потеряла права';
  END IF;
END
$verify$;
