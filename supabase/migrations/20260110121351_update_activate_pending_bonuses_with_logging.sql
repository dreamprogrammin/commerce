-- =====================================================================================
-- МИГРАЦИЯ: Обновление activate_pending_bonuses с логированием транзакций
-- =====================================================================================
-- Назначение:
-- - Добавляет автоматическое логирование в bonus_transactions при активации бонусов
-- - Сохраняет всю существующую логику работы с orders
-- - Создает транзакции типа 'activation' для каждой активации
-- =====================================================================================

-- Удаляем функцию чтобы пересоздать с той же сигнатурой
DROP FUNCTION IF EXISTS public.activate_pending_bonuses();

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
  -- Активируем бонусы за подтвержденные заказы (через 7 дней)
  FOR v_order_row IN
    SELECT
      o.id,
      o.user_id,
      o.bonuses_awarded,
      p.pending_bonus_balance as current_pending
    FROM public.orders o
    JOIN public.profiles p ON p.id = o.user_id
    WHERE
      o.status = 'confirmed'
      AND o.bonuses_activation_date IS NOT NULL
      AND o.bonuses_activation_date <= NOW()
      AND o.user_id IS NOT NULL
      -- Проверяем, что у пользователя достаточно pending бонусов
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

      -- ✅ НОВОЕ: Логируем активацию в bonus_transactions
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
        'Активация бонусов после 7 дней',
        'completed'
      );

      -- Помечаем заказ как завершенный
      UPDATE public.orders
      SET status = 'completed'
      WHERE id = v_order_row.id;

      v_total_activated := v_total_activated + v_order_row.bonuses_awarded;
      v_processed_orders := v_processed_orders + 1;

    EXCEPTION WHEN OTHERS THEN
      -- Логируем ошибку, но продолжаем обработку других заказов
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
'Активирует ожидающие бонусы за заказы через 7 дней после подтверждения.
Логирует каждую активацию в bonus_transactions для истории.
Запускается через pg_cron ежедневно.';

-- =====================================================================================
-- КОНЕЦ МИГРАЦИИ
-- =====================================================================================
