-- =====================================================================================
-- МИГРАЦИЯ: Функция активации pending бонусов
-- =====================================================================================
-- Назначение:
-- - Активирует pending бонусы которые прошли период ожидания (7 дней)
-- - Переносит бонусы из pending_bonus_balance в active_bonus_balance
-- - Обновляет статус транзакций с 'pending' на 'completed'
-- - Создает новые транзакции типа 'activation'
-- - Должна вызываться ежедневно (например через cron или pg_cron)
-- =====================================================================================

-- Удаляем старую версию функции, если существует
DROP FUNCTION IF EXISTS public.activate_pending_bonuses();

CREATE OR REPLACE FUNCTION public.activate_pending_bonuses()
RETURNS TABLE (
  user_id UUID,
  activated_amount INTEGER,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction RECORD;
  v_new_active_balance INTEGER;
  v_new_pending_balance INTEGER;
BEGIN
  -- Находим все pending транзакции, у которых наступила дата активации
  FOR v_transaction IN
    SELECT
      bt.id,
      bt.user_id,
      bt.amount,
      bt.order_id
    FROM public.bonus_transactions bt
    WHERE bt.status = 'pending'
      AND bt.transaction_type = 'earned'
      AND bt.activation_date <= NOW()
    ORDER BY bt.activation_date ASC
  LOOP
    -- Переносим бонусы из pending в active
    UPDATE public.profiles
    SET
      active_bonus_balance = active_bonus_balance + v_transaction.amount,
      pending_bonus_balance = GREATEST(pending_bonus_balance - v_transaction.amount, 0)
    WHERE id = v_transaction.user_id
    RETURNING active_bonus_balance, pending_bonus_balance
    INTO v_new_active_balance, v_new_pending_balance;

    -- Обновляем статус исходной транзакции
    UPDATE public.bonus_transactions
    SET status = 'completed'
    WHERE id = v_transaction.id;

    -- Создаем новую транзакцию типа 'activation'
    INSERT INTO public.bonus_transactions (
      user_id, order_id, transaction_type, amount,
      balance_after, pending_balance_after,
      description, status
    ) VALUES (
      v_transaction.user_id,
      v_transaction.order_id,
      'activation',
      v_transaction.amount,
      v_new_active_balance,
      v_new_pending_balance,
      'Активация бонусов после 7 дней',
      'completed'
    );

    -- Возвращаем результат для каждого пользователя
    user_id := v_transaction.user_id;
    activated_amount := v_transaction.amount;
    message := format('Активировано %s бонусов для пользователя %s', v_transaction.amount, v_transaction.user_id);

    RETURN NEXT;

    RAISE NOTICE 'Активировано % бонусов для пользователя %', v_transaction.amount, v_transaction.user_id;
  END LOOP;

  -- Если не было активаций
  IF NOT FOUND THEN
    user_id := NULL;
    activated_amount := 0;
    message := 'Нет бонусов для активации';
    RETURN NEXT;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.activate_pending_bonuses() IS
'Активирует pending бонусы, у которых наступила дата активации (7 дней после начисления).
Переносит бонусы из pending_bonus_balance в active_bonus_balance.
Обновляет статус транзакций с pending на completed.
Создает новые транзакции типа activation для аудита.

Должна вызываться ежедневно через:
  - pg_cron расширение PostgreSQL
  - Supabase Edge Function по расписанию
  - External cron job

Пример вызова:
  SELECT * FROM activate_pending_bonuses();';

-- Даем права на выполнение (для админов и сервисных аккаунтов)
GRANT EXECUTE ON FUNCTION public.activate_pending_bonuses() TO service_role;

-- =====================================================================================
-- ДОКУМЕНТАЦИЯ: Как настроить автоматический запуск
-- =====================================================================================

-- ВАРИАНТ 1: pg_cron (если установлен)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule(
--   'activate-pending-bonuses',
--   '0 1 * * *', -- Каждый день в 01:00
--   'SELECT activate_pending_bonuses();'
-- );

-- ВАРИАНТ 2: Supabase Edge Function (рекомендуется)
-- Создайте Edge Function: supabase/functions/activate-bonuses/index.ts
-- Настройте расписание через Supabase Dashboard или GitHub Actions

-- ВАРИАНТ 3: External Cron Job
-- Создайте скрипт который вызывает функцию через API
-- Настройте cron на сервере для ежедневного выполнения
