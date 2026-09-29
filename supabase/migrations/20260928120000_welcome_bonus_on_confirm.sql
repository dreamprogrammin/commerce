-- Подтверждение заказа покупателя: приветственный бонус и счётчик продаж.
--
-- ЧТО НЕ ТАК (боевая база, 28 сентября 2026, только чтение). Приветственный
-- бонус не получил никто: has_received_welcome_bonus — у 0 профилей из 12,
-- записей welcome в bonus_transactions нет ни одной, хотя у шести покупателей
-- есть неотменённые заказы. Сайт его обещает (GuestBonusModal.vue: «1000
-- бонусов после подтверждения первого заказа»).
--
-- Почему. Подтверждение заказа (статус → confirmed) триггером
-- trigger_auto_confirm_order вызывает process_confirmed_order. Та считала
-- заказ уже обработанным, если у него есть bonuses_activation_date, — а её
-- ставит create_user_order ещё при создании заказа (NOW() + 14 дней). Каждый
-- заказ покупателя выходил на «уже обработан»: ни приветственного бонуса, ни
-- sales_count (он рос только от гостевых заказов). Бонусы за сам заказ при
-- этом активировались — по дате из create_user_order.
--
-- Вторая ошибка — ниже в той же функции: IF v_user_profile IS NOT NULL над
-- записью profiles. Запись с любым пустым полем (фамилия, телефон, Telegram)
-- для такого сравнения — NULL, и ветка с бонусами пропускалась бы и после
-- первой правки.
--
-- ЧТО МЕНЯЕТСЯ:
--   • orders.confirmation_processed_at — отметка «подтверждение обработано».
--     Её ставит только process_confirmed_order, и повторный вызов функция
--     узнаёт по ней, а не по дате активации;
--   • process_confirmed_order: проверка по отметке; IF FOUND вместо
--     сравнения записи с NULL; приветственный бонус 1000, как обещает сайт
--     (было 500; в неиспользуемой confirm_and_process_order — 1000). Дата
--     активации бонусов за заказ теперь считается от подтверждения — так эта
--     функция и была написана, и так написано на сайте («Активация через 14
--     дней после подтверждения»). Больше в теле не меняется ничего;
--     обновление bonus_transactions по типу 'earned' записей не находит
--     (create_user_order пишет тип 'pending'), как и прежде.
--   • прошлые заказы не трогаются: разовое начисление — отдельный файл
--     docs/WELCOME_BONUS_BACKFILL_2026_09_28.sql, по решению владельца.
--
-- Тело снято с прода 28 сентября (pg_get_functiondef), md5 сверяется ниже.
-- CREATE OR REPLACE, а не DROP + CREATE: права, отозванные 20260927120000 у
-- PUBLIC, anon и authenticated, сохраняются — это проверяется в конце.

-- ── Проверка состояния ─────────────────────────────────────────────────────
DO $check$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc
           WHERE oid = to_regprocedure('public.process_confirmed_order(uuid)')))
     IS DISTINCT FROM '3bd17392d664930d3e8651b87e9d72cd' THEN
    RAISE EXCEPTION 'public.process_confirmed_order(uuid) на базе не та, что снята с прода 28.09.2026 — тело надо снять заново';
  END IF;
  IF (SELECT count(*) FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace AND proname = 'process_confirmed_order') <> 1 THEN
    RAISE EXCEPTION 'process_confirmed_order больше одной версии — база не та, под которую готовилась миграция';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.orders'::regclass AND tgname = 'trigger_auto_confirm_order') THEN
    RAISE EXCEPTION 'Нет триггера trigger_auto_confirm_order — подтверждение заказа не вызывает process_confirmed_order';
  END IF;
END
$check$;

-- ── Отметка «подтверждение обработано» ─────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS confirmation_processed_at timestamptz;

COMMENT ON COLUMN public.orders.confirmation_processed_at IS
  'Когда process_confirmed_order обработала подтверждение заказа (приветственный бонус, sales_count, дата активации). Повторный вызов по ней пропускается.';

-- ── Функция ────────────────────────────────────────────────────────────────
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
      -- Приветственный бонус (только первый заказ)
      IF NOT v_user_profile.has_received_welcome_bonus THEN
        UPDATE public.profiles
        SET active_bonus_balance    = active_bonus_balance + v_welcome_bonus,
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

-- ── Проверка после ─────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE oid = to_regprocedure('public.process_confirmed_order(uuid)');
  IF v_src NOT LIKE '%v_target_order.confirmation_processed_at IS NOT NULL%'
     OR v_src NOT LIKE '%IF FOUND THEN%'
     OR v_src NOT LIKE '%SET confirmation_processed_at = NOW()%'
     OR v_src NOT LIKE '%v_welcome_bonus   INTEGER := 1000;%' THEN
    RAISE EXCEPTION 'Правка process_confirmed_order не встала';
  END IF;
  IF (SELECT count(*) FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace AND proname = 'process_confirmed_order') <> 1 THEN
    RAISE EXCEPTION 'process_confirmed_order больше одной версии — появилась перегрузка';
  END IF;
  IF has_function_privilege('anon', 'public.process_confirmed_order(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.process_confirmed_order(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'process_confirmed_order снова исполняется ролью anon или authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.process_confirmed_order(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'process_confirmed_order потеряла права service_role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'orders'
                    AND column_name = 'confirmation_processed_at') THEN
    RAISE EXCEPTION 'Нет колонки orders.confirmation_processed_at';
  END IF;
END
$verify$;
