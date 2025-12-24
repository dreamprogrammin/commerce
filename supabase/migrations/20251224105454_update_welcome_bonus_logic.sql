-- =====================================================================================
-- МИГРАЦИЯ: НОВАЯ ЛОГИКА ПРИВЕТСТВЕННЫХ БОНУСОВ
-- Дата: 2025-12-24
-- Описание: 1000 бонусов начисляются ПОСЛЕ подтверждения первого заказа
-- =====================================================================================

-- =====================================================================================
-- ШАГ 1: УДАЛЕНИЕ СТАРОЙ ЛОГИКИ (бонусы при создании заказа)
-- =====================================================================================

-- Удаляем триггер, который давал бонусы при создании заказа
DROP TRIGGER IF EXISTS on_first_order_grant_welcome_bonus ON public.orders;

-- Удаляем функцию выдачи приветственного бонуса при создании заказа
DROP FUNCTION IF EXISTS public.grant_welcome_bonus_on_first_order() CASCADE;

-- =====================================================================================
-- ШАГ 2: ОБНОВЛЕНИЕ ФУНКЦИИ ПОДТВЕРЖДЕНИЯ ЗАКАЗА
-- =====================================================================================

-- Новая логика:
-- 1. При подтверждении заказа проверяем has_received_welcome_bonus
-- 2. Если FALSE - начисляем 1000 бонусов СРАЗУ в active_bonus_balance
-- 3. Устанавливаем has_received_welcome_bonus = TRUE
-- 4. Обычные бонусы за покупку идут в pending_bonus_balance (как раньше)

CREATE OR REPLACE FUNCTION public.confirm_and_process_order(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target_order RECORD;
  v_order_item_record RECORD;
  v_user_profile RECORD;
  v_welcome_bonus INTEGER := 1000;
BEGIN
  -- Получаем заказ и блокируем его для обновления
  SELECT * INTO v_target_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  -- Проверяем существование заказа
  IF v_target_order IS NULL THEN
    RETURN 'Ошибка: Заказ не найден.';
  END IF;

  -- Проверяем статус заказа
  IF v_target_order.status <> 'new' THEN
    RETURN 'Ошибка: Заказ уже обработан.';
  END IF;

  -- Проверяем наличие товаров на складе
  FOR v_order_item_record IN
    SELECT oi.quantity, p.stock_quantity, p.name
    FROM public.order_items oi
    JOIN public.products p ON oi.product_id = p.id
    WHERE oi.order_id = p_order_id
  LOOP
    IF v_order_item_record.stock_quantity < v_order_item_record.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара "%" на складе.', v_order_item_record.name;
    END IF;
  END LOOP;

  -- Списываем товары со склада и обновляем счетчик продаж
  FOR v_order_item_record IN
    SELECT product_id, quantity
    FROM public.order_items
    WHERE order_id = p_order_id
  LOOP
    UPDATE public.products
    SET
      stock_quantity = stock_quantity - v_order_item_record.quantity,
      sales_count = sales_count + v_order_item_record.quantity
    WHERE id = v_order_item_record.product_id;
  END LOOP;

  -- Обрабатываем бонусы (только для зарегистрированных пользователей)
  IF v_target_order.user_id IS NOT NULL THEN
    -- Получаем профиль пользователя
    SELECT * INTO v_user_profile
    FROM public.profiles
    WHERE id = v_target_order.user_id;

    -- Если профиль найден
    IF v_user_profile IS NOT NULL THEN
      -- Проверяем, получал ли пользователь приветственный бонус
      IF NOT v_user_profile.has_received_welcome_bonus THEN
        -- ✅ НОВАЯ ЛОГИКА: Начисляем 1000 бонусов СРАЗУ в active_bonus_balance
        UPDATE public.profiles
        SET
          -- Списываем потраченные бонусы
          active_bonus_balance = active_bonus_balance - v_target_order.bonuses_spent + v_welcome_bonus,
          -- Начисляем бонусы за покупку в pending (активируются через 7 дней)
          pending_bonus_balance = pending_bonus_balance + v_target_order.bonuses_awarded,
          -- Отмечаем, что приветственный бонус получен
          has_received_welcome_bonus = TRUE
        WHERE id = v_target_order.user_id;

        RAISE NOTICE 'Начислен приветственный бонус % пользователю %', v_welcome_bonus, v_target_order.user_id;
      ELSE
        -- Обычная логика для пользователей, уже получивших приветственный бонус
        UPDATE public.profiles
        SET
          -- Списываем потраченные бонусы
          active_bonus_balance = active_bonus_balance - v_target_order.bonuses_spent,
          -- Начисляем бонусы за покупку в pending (активируются через 7 дней)
          pending_bonus_balance = pending_bonus_balance + v_target_order.bonuses_awarded
        WHERE id = v_target_order.user_id;
      END IF;

      -- Обновляем статус заказа и устанавливаем дату активации бонусов за покупку
      UPDATE public.orders
      SET
        status = 'confirmed',
        bonuses_activation_date = NOW() + INTERVAL '7 days'
      WHERE id = p_order_id;
    ELSE
      -- Профиль не найден (не должно происходить, но на всякий случай)
      RAISE WARNING 'Профиль не найден для пользователя %', v_target_order.user_id;

      -- Обновляем только статус заказа
      UPDATE public.orders
      SET status = 'confirmed'
      WHERE id = p_order_id;
    END IF;
  ELSE
    -- Гостевой заказ - просто подтверждаем
    UPDATE public.orders
    SET status = 'confirmed'
    WHERE id = p_order_id;
  END IF;

  RETURN 'Успех: Заказ ' || p_order_id || ' подтвержден и обработан.';
END;
$$;

COMMENT ON FUNCTION public.confirm_and_process_order(UUID) IS
'Подтверждает заказ: списывает товары со склада, обрабатывает бонусы.
При первом заказе начисляет 1000 приветственных бонусов СРАЗУ в active_bonus_balance.
Бонусы за покупку начисляются в pending_bonus_balance с активацией через 7 дней.';

-- =====================================================================================
-- ШАГ 3: ОБНОВЛЕНИЕ ФУНКЦИИ АКТИВАЦИИ БОНУСОВ
-- =====================================================================================

-- Обновляем функцию активации, чтобы использовать 7 дней вместо 14

CREATE OR REPLACE FUNCTION public.activate_pending_bonuses()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_row RECORD;
  v_total_activated INTEGER := 0;
  v_processed_orders INTEGER := 0;
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
      WHERE id = v_order_row.user_id;

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
Запускается через pg_cron ежедневно.';

-- =====================================================================================
-- ШАГ 4: ОБНОВЛЕНИЕ ФУНКЦИИ ОТМЕНЫ ЗАКАЗА
-- =====================================================================================

-- Убедимся, что при отмене заказа корректно откатываются приветственные бонусы

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target_order RECORD;
  v_order_item_record RECORD;
  v_user_profile RECORD;
  v_welcome_bonus INTEGER := 1000;
BEGIN
  -- Находим заказ и проверяем его
  SELECT * INTO v_target_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_target_order IS NULL THEN
    RETURN 'Ошибка: Заказ не найден.';
  END IF;

  IF v_target_order.status NOT IN ('new', 'confirmed') THEN
    RETURN 'Ошибка: Этот заказ уже нельзя отменить (возможно, он выполнен или уже отменен).';
  END IF;

  -- Если заказ был подтвержден, откатываем операции
  IF v_target_order.status = 'confirmed' THEN
    -- 1. Возвращаем товары на склад
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

    -- 2. Откатываем бонусные операции (только для зарегистрированных)
    IF v_target_order.user_id IS NOT NULL THEN
      -- Получаем профиль пользователя
      SELECT * INTO v_user_profile
      FROM public.profiles
      WHERE id = v_target_order.user_id;

      IF v_user_profile IS NOT NULL THEN
        -- Проверяем, был ли это первый заказ с приветственным бонусом
        -- Если has_received_welcome_bonus = TRUE и других подтвержденных заказов нет -
        -- значит это был первый заказ с приветственным бонусом
        DECLARE
          v_other_confirmed_orders INTEGER;
        BEGIN
          SELECT COUNT(*) INTO v_other_confirmed_orders
          FROM public.orders
          WHERE user_id = v_target_order.user_id
            AND id != p_order_id
            AND status IN ('confirmed', 'completed');

          -- Если это был единственный подтвержденный заказ и пользователь получил бонус
          IF v_other_confirmed_orders = 0 AND v_user_profile.has_received_welcome_bonus THEN
            -- Откатываем приветственный бонус
            UPDATE public.profiles
            SET
              -- Возвращаем потраченные бонусы
              active_bonus_balance = active_bonus_balance + v_target_order.bonuses_spent - v_welcome_bonus,
              -- Убираем начисленные бонусы за покупку
              pending_bonus_balance = pending_bonus_balance - v_target_order.bonuses_awarded,
              -- Сбрасываем флаг получения приветственного бонуса
              has_received_welcome_bonus = FALSE
            WHERE id = v_target_order.user_id;

            RAISE NOTICE 'Откачен приветственный бонус для пользователя %', v_target_order.user_id;
          ELSE
            -- Обычный откат (без приветственного бонуса)
            UPDATE public.profiles
            SET
              -- Возвращаем потраченные бонусы
              active_bonus_balance = active_bonus_balance + v_target_order.bonuses_spent,
              -- Убираем начисленные бонусы за покупку
              pending_bonus_balance = pending_bonus_balance - v_target_order.bonuses_awarded
            WHERE id = v_target_order.user_id;
          END IF;
        END;
      END IF;
    END IF;
  END IF;

  -- Финальный шаг: меняем статус заказа на 'cancelled'
  UPDATE public.orders
  SET status = 'cancelled'
  WHERE id = p_order_id;

  RETURN 'Успех: Заказ ' || p_order_id || ' был отменен.';
END;
$$;

COMMENT ON FUNCTION public.cancel_order(UUID) IS
'Отменяет заказ и откатывает все связанные операции (товары, бонусы).
Если отменяется первый заказ - откатывает приветственный бонус 1000.';

-- =====================================================================================
-- ШАГ 5: СТАТИСТИКА И ПРОВЕРКА
-- =====================================================================================

DO $$
DECLARE
  v_users_without_bonus INTEGER;
  v_users_with_bonus INTEGER;
  v_total_users INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_users
  FROM public.profiles;

  SELECT COUNT(*) INTO v_users_without_bonus
  FROM public.profiles
  WHERE has_received_welcome_bonus = FALSE;

  SELECT COUNT(*) INTO v_users_with_bonus
  FROM public.profiles
  WHERE has_received_welcome_bonus = TRUE;

  RAISE NOTICE '====================================';
  RAISE NOTICE 'СТАТИСТИКА ПРИВЕТСТВЕННЫХ БОНУСОВ:';
  RAISE NOTICE 'Всего пользователей: %', v_total_users;
  RAISE NOTICE 'Без приветственного бонуса: %', v_users_without_bonus;
  RAISE NOTICE 'С приветственным бонусом: %', v_users_with_bonus;
  RAISE NOTICE '====================================';
  RAISE NOTICE '';
  RAISE NOTICE 'НОВАЯ ЛОГИКА:';
  RAISE NOTICE '✓ Регистрация БЕЗ покупки → профиль создается БЕЗ бонусов';
  RAISE NOTICE '✓ Регистрация + первый заказ → 1000 бонусов ПОСЛЕ подтверждения';
  RAISE NOTICE '✓ Приветственные бонусы начисляются СРАЗУ в active_bonus_balance';
  RAISE NOTICE '✓ Бонусы за покупку активируются через 7 дней';
  RAISE NOTICE '====================================';
END;
$$;

-- =====================================================================================
-- КОНЕЦ МИГРАЦИИ
-- =====================================================================================
