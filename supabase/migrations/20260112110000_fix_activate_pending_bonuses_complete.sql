-- =====================================================================================
-- МИГРАЦИЯ: Полное исправление функции активации бонусов
-- =====================================================================================
-- ВАЖНО: Согласно документации WELCOME_BONUS_LOGIC.md:
-- - Приветственные бонусы (1000) начисляются СРАЗУ в active_bonus_balance
--   при подтверждении ПЕРВОГО заказа (функция process_confirmed_order)
-- - Бонусы за покупку идут в pending_bonus_balance и активируются через 7 дней
--
-- Эта функция активирует ТОЛЬКО бонусы за заказы (pending -> active)
-- Приветственные бонусы активируются сразу при подтверждении заказа!
-- =====================================================================================

-- Удаляем старую функцию
DROP FUNCTION IF EXISTS public.activate_pending_bonuses();

-- Создаем исправленную функцию
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
BEGIN
  -- =====================================================================================
  -- Активируем бонусы за ЗАКАЗЫ (confirmed ИЛИ delivered) через 7 дней
  -- Приветственные бонусы НЕ обрабатываются здесь - они начисляются сразу при подтверждении!
  -- =====================================================================================
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
      o.status IN ('confirmed', 'delivered')  -- Оба статуса!
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

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Ошибка при активации бонусов для заказа %: %',
        v_order_row.id,
        SQLERRM;
    END;
  END LOOP;

  RETURN format(
    'Заказы: %s обработано, %s бонусов активировано.',
    v_processed_orders,
    v_total_activated
  );
END;
$$;

COMMENT ON FUNCTION public.activate_pending_bonuses() IS
'Активирует ожидающие бонусы за заказы (confirmed/delivered) через 7 дней после подтверждения.
ВАЖНО: Приветственные бонусы (1000) начисляются СРАЗУ при подтверждении первого заказа
(см. функцию process_confirmed_order), а НЕ здесь!
Запускается через pg_cron ежедневно в 2:00 AM UTC.
Можно вызвать вручную: SELECT public.activate_pending_bonuses();';

-- =====================================================================================
-- Обновляем VIEW для мониторинга
-- =====================================================================================
DROP VIEW IF EXISTS public.bonus_system_status;

CREATE VIEW public.bonus_system_status AS
SELECT
  (SELECT COUNT(*) FROM public.profiles WHERE pending_bonus_balance > 0) as users_with_pending_bonuses,
  (SELECT COUNT(*) FROM public.profiles WHERE active_bonus_balance > 0) as users_with_active_bonuses,
  (SELECT COALESCE(SUM(pending_bonus_balance), 0) FROM public.profiles) as total_pending_bonuses,
  (SELECT COALESCE(SUM(active_bonus_balance), 0) FROM public.profiles) as total_active_bonuses,
  (SELECT COUNT(*) FROM public.orders
   WHERE status IN ('confirmed', 'delivered')
   AND bonuses_activation_date IS NOT NULL
   AND bonuses_activation_date <= NOW()
   AND bonuses_awarded > 0) as orders_ready_for_activation,
  (SELECT COALESCE(SUM(bonuses_awarded), 0) FROM public.orders
   WHERE status IN ('confirmed', 'delivered')
   AND bonuses_activation_date IS NOT NULL
   AND bonuses_activation_date <= NOW()
   AND bonuses_awarded > 0) as bonuses_ready_for_activation;

COMMENT ON VIEW public.bonus_system_status IS
'Мониторинг состояния бонусной системы.
- users_with_pending_bonuses: Пользователи с ожидающими бонусами за заказы
- orders_ready_for_activation: Заказы готовые к активации (прошло 7 дней)
ВАЖНО: Приветственные бонусы начисляются СРАЗУ при подтверждении первого заказа!';

-- =====================================================================================
-- Проверяем и настраиваем pg_cron (только для продакшена)
-- =====================================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Удаляем старое задание, если существует
    PERFORM cron.unschedule('Daily Bonus Activation');

    -- Создаем новое задание: каждый день в 2:00 AM UTC (8:00 по Алматы)
    PERFORM cron.schedule(
      'Daily Bonus Activation',
      '0 2 * * *',
      'SELECT public.activate_pending_bonuses();'
    );

    RAISE NOTICE 'pg_cron: задание "Daily Bonus Activation" настроено на 2:00 AM UTC';
  ELSE
    RAISE NOTICE 'pg_cron недоступен - функцию нужно вызывать вручную';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Ошибка настройки pg_cron: %. Функцию можно вызывать вручную.', SQLERRM;
END $$;

-- =====================================================================================
-- Тестовый запуск
-- =====================================================================================
SELECT public.activate_pending_bonuses() as result;
SELECT * FROM public.bonus_system_status;

-- =====================================================================================
-- КОНЕЦ МИГРАЦИИ
-- =====================================================================================
