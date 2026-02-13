-- =====================================================================================
-- МИГРАЦИЯ: Исправление активации бонусов
-- =====================================================================================
-- КОРНЕВАЯ ПРИЧИНА:
-- Триггер trigger_auto_confirm_order срабатывал ТОЛЬКО при переходе:
--   new → confirmed
-- Но реальный flow заказа:
--   new → processing (Взять в работу) → confirmed (Подтвердить)
-- Поэтому OLD.status = 'processing' (не 'new'), триггер НЕ срабатывал,
-- process_confirmed_order() не вызывался, bonuses_activation_date не устанавливался,
-- и activate_pending_bonuses() не находил заказы для активации.
--
-- ИСПРАВЛЕНИЯ:
-- 1. Триггер: OLD.status IN ('new', 'processing') вместо OLD.status = 'new'
-- 2. On-demand функция activate_my_pending_bonuses() как подстраховка
-- 3. Ретроактивное исправление уже застрявших заказов
-- =====================================================================================

-- =====================================================================================
-- ШАГ 1: Исправляем триггер — учитываем промежуточный статус 'processing'
-- =====================================================================================
DROP TRIGGER IF EXISTS trigger_auto_confirm_order ON public.orders;

CREATE TRIGGER trigger_auto_confirm_order
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed' AND OLD.status IN ('new', 'processing'))
  EXECUTE FUNCTION public.trigger_process_confirmed_order();

COMMENT ON TRIGGER trigger_auto_confirm_order ON public.orders IS
'Автоматически обрабатывает подтверждённый заказ (списание товаров, начисление бонусов).
Срабатывает при переходе из new или processing в confirmed.';

-- =====================================================================================
-- ШАГ 2: Ретроактивно исправляем уже застрявшие заказы
-- Устанавливаем bonuses_activation_date для confirmed/delivered заказов где он NULL
-- =====================================================================================
UPDATE public.orders
SET bonuses_activation_date = created_at + INTERVAL '7 days'
WHERE status IN ('confirmed', 'delivered')
  AND bonuses_awarded > 0
  AND bonuses_activation_date IS NULL
  AND user_id IS NOT NULL;

-- =====================================================================================
-- ШАГ 3: On-demand функция (подстраховка, работает без pg_cron)
-- =====================================================================================
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
  -- Проверка авторизации
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Необходима авторизация');
  END IF;

  -- Ищем заказы текущего пользователя с просроченной датой активации
  FOR v_order_row IN
    SELECT
      o.id,
      o.bonuses_awarded,
      o.status
    FROM public.orders o
    JOIN public.profiles p ON p.id = o.user_id
    WHERE
      o.user_id = v_user_id
      AND o.status IN ('confirmed', 'delivered')
      AND o.bonuses_activation_date IS NOT NULL
      AND o.bonuses_activation_date <= NOW()
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
      WHERE id = v_user_id
      RETURNING active_bonus_balance, pending_bonus_balance
      INTO v_new_active_balance, v_new_pending_balance;

      -- Логируем активацию
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
        v_user_id,
        v_order_row.id,
        'activation',
        v_order_row.bonuses_awarded,
        v_new_active_balance,
        v_new_pending_balance,
        'Активация бонусов за заказ (7 дней)',
        'completed'
      )
      ON CONFLICT DO NOTHING;

      -- Помечаем заказ как завершённый
      UPDATE public.orders
      SET status = 'completed'
      WHERE id = v_order_row.id;

      v_total_activated := v_total_activated + v_order_row.bonuses_awarded;
      v_processed_orders := v_processed_orders + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Ошибка активации бонусов для заказа %: %',
        v_order_row.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'activated', v_total_activated,
    'orders_processed', v_processed_orders
  );
END;
$$;

-- Разрешаем вызов для авторизованных пользователей
GRANT EXECUTE ON FUNCTION public.activate_my_pending_bonuses() TO authenticated;

COMMENT ON FUNCTION public.activate_my_pending_bonuses() IS
'Активирует pending бонусы текущего пользователя (через 7 дней после подтверждения заказа).
Вызывается через RPC при загрузке профиля как подстраховка к pg_cron.';

-- Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
