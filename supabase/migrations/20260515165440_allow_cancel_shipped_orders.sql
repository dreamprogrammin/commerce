-- Разрешить отмену заказов в статусе shipped
-- Заказ может быть отменён на любом этапе до доставки

DROP FUNCTION IF EXISTS public.cancel_order(UUID, TEXT, TEXT);

CREATE FUNCTION public.cancel_order(
  p_order_id     UUID,
  p_table_name   TEXT DEFAULT 'orders',
  p_cancelled_by TEXT DEFAULT 'admin'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status           TEXT;
  v_user_id          UUID    := NULL;
  v_bonuses_spent    NUMERIC := 0;
  v_bonuses_awarded  INTEGER := 0;
  v_item_record      RECORD;
  v_result           TEXT;
  v_new_active_bal   INTEGER;
  v_new_pending_bal  INTEGER;
BEGIN
  IF p_cancelled_by NOT IN ('client', 'admin', 'system') THEN
    RAISE EXCEPTION 'Неверное значение cancelled_by: %', p_cancelled_by;
  END IF;

  IF p_table_name NOT IN ('orders', 'guest_checkouts') THEN
    RAISE EXCEPTION 'Неверная таблица: %', p_table_name;
  END IF;

  IF p_table_name = 'orders' THEN
    SELECT status, user_id, COALESCE(bonuses_spent, 0), COALESCE(bonuses_awarded, 0)
    INTO v_status, v_user_id, v_bonuses_spent, v_bonuses_awarded
    FROM public.orders WHERE id = p_order_id;
  ELSE
    SELECT status INTO v_status
    FROM public.guest_checkouts WHERE id = p_order_id;
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

  -- Возвращаем товары на склад
  IF p_table_name = 'orders' THEN
    FOR v_item_record IN
      SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id
    LOOP
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_item_record.quantity,
          sales_count    = GREATEST(sales_count - v_item_record.quantity, 0)
      WHERE id = v_item_record.product_id;
    END LOOP;
  ELSE
    FOR v_item_record IN
      SELECT product_id, quantity FROM public.guest_checkout_items WHERE checkout_id = p_order_id
    LOOP
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_item_record.quantity,
          sales_count    = GREATEST(sales_count - v_item_record.quantity, 0)
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
$$;

COMMENT ON FUNCTION public.cancel_order(UUID, TEXT, TEXT) IS
  'Отменяет заказ (orders или guest_checkouts). Разрешена отмена до статуса delivered.';
