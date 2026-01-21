-- =====================================================================================
-- МИГРАЦИЯ: Исправление cancel_order - использование checkout_id для guest_checkout_items
-- =====================================================================================
-- Назначение:
-- - Исправляет ошибку "column order_id does not exist" при отмене гостевых заказов
-- - Таблица guest_checkout_items использует checkout_id, а не order_id
-- =====================================================================================

DROP FUNCTION IF EXISTS public.cancel_order(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id UUID,
  p_table_name TEXT DEFAULT 'orders'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target_order RECORD;
  v_order_item_record RECORD;
  v_user_profile RECORD;
  v_welcome_bonus INTEGER := 1000;
  v_order_items_table TEXT;
  v_order_items_fk_column TEXT;  -- ✅ НОВОЕ: колонка для FK
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

  -- ✅ ИСПРАВЛЕНИЕ: Определяем правильное имя колонки FK
  v_order_items_fk_column := CASE
    WHEN p_table_name = 'guest_checkouts' THEN 'checkout_id'
    ELSE 'order_id'
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
      -- ✅ ИСПРАВЛЕНИЕ: Используем v_order_items_fk_column вместо hardcoded order_id
      v_sql := format('SELECT product_id, quantity FROM public.%I WHERE %I = $1', v_order_items_table, v_order_items_fk_column);
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

  -- ✅ ЛОГИРОВАНИЕ: Откатываем бонусы для ВСЕХ статусов
  IF v_target_order.user_id IS NOT NULL THEN
    SELECT * INTO v_user_profile
    FROM public.profiles
    WHERE id = v_target_order.user_id;

    IF v_user_profile IS NOT NULL THEN
      -- Для заказов в статусе NEW/PENDING
      IF v_target_order.status IN ('pending', 'new') THEN
        -- ✅ Возвращаем потраченные бонусы
        IF COALESCE(v_target_order.bonuses_spent, 0) > 0 THEN
          UPDATE public.profiles
          SET active_bonus_balance = active_bonus_balance + v_target_order.bonuses_spent
          WHERE id = v_target_order.user_id
          RETURNING active_bonus_balance, pending_bonus_balance INTO v_new_active_balance, v_new_pending_balance;

          -- ✅ Логируем возврат бонусов
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

        -- ✅ Убираем начисленные бонусы
        IF COALESCE(v_target_order.bonuses_awarded, 0) > 0 THEN
          UPDATE public.profiles
          SET pending_bonus_balance = GREATEST(pending_bonus_balance - v_target_order.bonuses_awarded, 0)
          WHERE id = v_target_order.user_id
          RETURNING active_bonus_balance, pending_bonus_balance INTO v_new_active_balance, v_new_pending_balance;

          -- ✅ Логируем откат начисленных бонусов
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

        RAISE NOTICE 'Откачены бонусы для заказа % (статус: %): spent=%, awarded=%',
          p_order_id, v_target_order.status, v_target_order.bonuses_spent, v_target_order.bonuses_awarded;

      -- Для подтвержденных заказов
      ELSIF v_target_order.status IN ('confirmed', 'processing') THEN
        DECLARE
          v_other_confirmed_orders INTEGER;
        BEGIN
          SELECT COUNT(*) INTO v_other_confirmed_orders
          FROM public.orders
          WHERE user_id = v_target_order.user_id
            AND id != p_order_id
            AND status IN ('confirmed', 'processing', 'completed');

          -- Откат приветственного бонуса (если это был единственный заказ)
          IF v_other_confirmed_orders = 0 AND v_user_profile.has_received_welcome_bonus THEN
            UPDATE public.profiles
            SET
              active_bonus_balance = active_bonus_balance + v_target_order.bonuses_spent - v_welcome_bonus,
              pending_bonus_balance = GREATEST(pending_bonus_balance - v_target_order.bonuses_awarded, 0),
              has_received_welcome_bonus = FALSE
            WHERE id = v_target_order.user_id
            RETURNING active_bonus_balance, pending_bonus_balance INTO v_new_active_balance, v_new_pending_balance;

            -- ✅ Логируем откат приветственного бонуса
            INSERT INTO public.bonus_transactions (
              user_id, order_id, transaction_type, amount,
              balance_after, pending_balance_after,
              description, status
            ) VALUES (
              v_target_order.user_id, p_order_id, 'refund_spent', -v_welcome_bonus,
              v_new_active_balance, v_new_pending_balance,
              'Откат приветственного бонуса', 'completed'
            );

            -- ✅ Логируем возврат потраченных бонусов (если были)
            IF COALESCE(v_target_order.bonuses_spent, 0) > 0 THEN
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

            -- ✅ Логируем откат начисленных бонусов
            IF COALESCE(v_target_order.bonuses_awarded, 0) > 0 THEN
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

            RAISE NOTICE 'Откачен приветственный бонус для пользователя %', v_target_order.user_id;
          ELSE
            -- Обычный откат (без приветственного бонуса)
            UPDATE public.profiles
            SET
              active_bonus_balance = active_bonus_balance + v_target_order.bonuses_spent,
              pending_bonus_balance = GREATEST(pending_bonus_balance - v_target_order.bonuses_awarded, 0)
            WHERE id = v_target_order.user_id
            RETURNING active_bonus_balance, pending_bonus_balance INTO v_new_active_balance, v_new_pending_balance;

            -- ✅ Логируем возврат потраченных бонусов
            IF COALESCE(v_target_order.bonuses_spent, 0) > 0 THEN
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

            -- ✅ Логируем откат начисленных бонусов
            IF COALESCE(v_target_order.bonuses_awarded, 0) > 0 THEN
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

            RAISE NOTICE 'Откачены бонусы: spent=% awarded=% для пользователя %',
              v_target_order.bonuses_spent, v_target_order.bonuses_awarded, v_target_order.user_id;
          END IF;
        END;
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

ОБНОВЛЕНИЕ v2.1 (2026-01-21):
  - Исправлена ошибка: guest_checkout_items использует checkout_id, а не order_id
  - Добавлена переменная v_order_items_fk_column для динамического выбора колонки FK';
