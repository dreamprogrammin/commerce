-- ============================================================================
-- FIX: Создание get_order_table_name и пересоздание cancel_order
-- ============================================================================
-- ПРОБЛЕМА:
-- 1. Edge Function cancel-order падает: get_order_table_name не существует
-- 2. PostgREST не находит cancel_order в кэше (PGRST202)
-- 3. Edge Function assign-order-to-admin падает по тем же причинам
--
-- РЕШЕНИЕ:
-- 1. Создать get_order_table_name для определения таблицы заказа
-- 2. Пересоздать cancel_order с принудительным обновлением кэша
-- 3. Обновить кэш PostgREST
-- ============================================================================

-- Создаём функцию для определения таблицы заказа по ID
CREATE OR REPLACE FUNCTION public.get_order_table_name(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Проверяем в таблице orders
    IF EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
        RETURN 'orders';
    END IF;

    -- Проверяем в таблице guest_checkouts
    IF EXISTS (SELECT 1 FROM public.guest_checkouts WHERE id = p_order_id) THEN
        RETURN 'guest_checkouts';
    END IF;

    -- Заказ не найден
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.get_order_table_name(UUID) IS
'Определяет таблицу заказа (orders или guest_checkouts) по ID заказа. Возвращает NULL если заказ не найден.';

-- Удаляем все версии cancel_order
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT oid::regprocedure as func_signature
        FROM pg_proc
        WHERE proname = 'cancel_order'
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.func_signature);
        RAISE NOTICE 'Dropped function: %', r.func_signature;
    END LOOP;
END $$;

-- Пересоздаём cancel_order из последней версии (с логированием транзакций)
-- Берём из миграции 20260110112349_add_bonus_transaction_logging.sql
CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id UUID,
  p_table_name TEXT DEFAULT 'orders'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_order RECORD;
  v_order_item_record RECORD;
  v_user_profile RECORD;
  v_welcome_bonus INTEGER := 1000;
  v_order_items_table TEXT;
  v_sql TEXT;
  v_new_active_balance INTEGER;
  v_new_pending_balance INTEGER;
BEGIN
  -- Валидация имени таблицы
  IF p_table_name NOT IN ('orders', 'guest_checkouts') THEN
    RETURN 'Ошибка: Неверное имя таблицы.';
  END IF;

  v_order_items_table := CASE
    WHEN p_table_name = 'guest_checkouts' THEN 'guest_checkout_items'
    ELSE 'order_items'
  END;

  -- =========================================================================
  -- GUEST_CHECKOUTS (без бонусов, логирование не требуется)
  -- =========================================================================
  IF p_table_name = 'guest_checkouts' THEN
    v_sql := format('SELECT * FROM public.%I WHERE id = $1 FOR UPDATE', p_table_name);
    EXECUTE v_sql INTO v_target_order USING p_order_id;

    IF v_target_order IS NULL THEN
      RETURN 'Ошибка: Заказ не найден.';
    END IF;

    IF v_target_order.status NOT IN ('pending', 'new', 'confirmed', 'processing') THEN
      RETURN 'Ошибка: Этот заказ уже нельзя отменить.';
    END IF;

    IF v_target_order.status IN ('confirmed', 'processing') THEN
      v_sql := format('SELECT product_id, quantity FROM public.%I WHERE order_id = $1', v_order_items_table);
      FOR v_order_item_record IN EXECUTE v_sql USING p_order_id
      LOOP
        UPDATE public.products
        SET
          stock_quantity = stock_quantity + v_order_item_record.quantity,
          sales_count = sales_count - v_order_item_record.quantity
        WHERE id = v_order_item_record.product_id;
      END LOOP;
    END IF;

    v_sql := format('UPDATE public.%I SET status = $1 WHERE id = $2', p_table_name);
    EXECUTE v_sql USING 'cancelled', p_order_id;

    RETURN 'Успех: Гостевой заказ ' || p_order_id || ' был отменен.';
  END IF;

  -- =========================================================================
  -- ORDERS (заказы зарегистрированных пользователей с бонусами)
  -- =========================================================================
  SELECT * INTO v_target_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_target_order IS NULL THEN
    RETURN 'Ошибка: Заказ не найден.';
  END IF;

  IF v_target_order.status NOT IN ('pending', 'new', 'confirmed', 'processing') THEN
    RETURN 'Ошибка: Этот заказ уже нельзя отменить (возможно, он выполнен или уже отменен).';
  END IF;

  -- Возврат товаров на склад (только для confirmed/processing)
  IF v_target_order.status IN ('confirmed', 'processing') THEN
    FOR v_order_item_record IN
      SELECT product_id, quantity
      FROM public.order_items
      WHERE order_id = p_order_id
    LOOP
      UPDATE public.products
      SET
        stock_quantity = stock_quantity + v_order_item_record.quantity,
        sales_count = sales_count - v_order_item_record.quantity
      WHERE id = v_order_item_record.product_id;
    END LOOP;
  END IF;

  -- Откатываем бонусы для заказов с user_id
  IF v_target_order.user_id IS NOT NULL THEN
    SELECT * INTO v_user_profile
    FROM public.profiles
    WHERE id = v_target_order.user_id;

    IF v_user_profile IS NOT NULL THEN
      -- Для заказов в статусе NEW/PENDING
      IF v_target_order.status IN ('pending', 'new') THEN
        -- Возвращаем потраченные бонусы
        IF COALESCE(v_target_order.bonuses_spent, 0) > 0 THEN
          UPDATE public.profiles
          SET active_bonus_balance = active_bonus_balance + v_target_order.bonuses_spent
          WHERE id = v_target_order.user_id
          RETURNING active_bonus_balance, pending_bonus_balance INTO v_new_active_balance, v_new_pending_balance;

          -- Логируем возврат бонусов
          INSERT INTO public.bonus_transactions (
            user_id, order_id, transaction_type, amount,
            balance_after, pending_balance_after,
            description, status
          ) VALUES (
            v_target_order.user_id, p_order_id, 'refund_spent', v_target_order.bonuses_spent,
            v_new_active_balance, v_new_pending_balance,
            'Возврат бонусов при отмене заказа', 'completed'
          );
        END IF;

        -- Убираем начисленные бонусы
        IF COALESCE(v_target_order.bonuses_awarded, 0) > 0 THEN
          UPDATE public.profiles
          SET pending_bonus_balance = GREATEST(pending_bonus_balance - v_target_order.bonuses_awarded, 0)
          WHERE id = v_target_order.user_id
          RETURNING active_bonus_balance, pending_bonus_balance INTO v_new_active_balance, v_new_pending_balance;

          -- Логируем откат начисленных бонусов
          INSERT INTO public.bonus_transactions (
            user_id, order_id, transaction_type, amount,
            balance_after, pending_balance_after,
            description, status
          ) VALUES (
            v_target_order.user_id, p_order_id, 'refund_earned', -v_target_order.bonuses_awarded,
            v_new_active_balance, v_new_pending_balance,
            'Отмена начисления бонусов', 'completed'
          );
        END IF;
      END IF;
    END IF;
  END IF;

  -- Меняем статус заказа на cancelled
  UPDATE public.orders
  SET status = 'cancelled'
  WHERE id = p_order_id;

  RETURN 'Успех: Заказ ' || p_order_id || ' был отменен.';
END;
$$;

COMMENT ON FUNCTION public.cancel_order(UUID, TEXT) IS
'Универсальная функция отмены заказа с поддержкой обеих таблиц (orders и guest_checkouts).
Параметры:
  - p_order_id: UUID заказа
  - p_table_name: Имя таблицы (orders или guest_checkouts), по умолчанию orders

ИСПРАВЛЕНИЕ (2026-02-04):
  - Пересоздана для обновления кэша PostgREST
  - Добавлен SET search_path = public';

-- Принудительно обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- Проверяем что функции созданы
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_order_table_name') THEN
        RAISE NOTICE '✅ Function get_order_table_name created';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cancel_order') THEN
        RAISE NOTICE '✅ Function cancel_order recreated';
    END IF;
END $$;
