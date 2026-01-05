-- =====================================================================================
-- ИСПРАВЛЕНИЕ: create_user_order - NULL safety и корректное списание бонусов
-- =====================================================================================
-- Проблема:
-- - v_bonus_rate может быть NULL если в settings нет записи с key='bonus_system'
-- - Это приводит к NULL в v_calculated_discount (NULL * число = NULL)
-- - Бонусы не списываются корректно
--
-- Решение:
-- - Инициализировать v_bonus_rate значением по умолчанию 1.0
-- - Использовать COALESCE для всех вычислений с бонусами
-- - Гарантировать, что все числовые поля имеют non-NULL значения
-- =====================================================================================

DROP FUNCTION IF EXISTS public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER);

CREATE OR REPLACE FUNCTION public.create_user_order(
  p_cart_items JSONB,
  p_delivery_method TEXT,
  p_payment_method TEXT DEFAULT NULL,
  p_delivery_address JSONB DEFAULT NULL,
  p_bonuses_to_spend INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_user_profile RECORD;
  v_new_order_id UUID;
  v_total_price NUMERIC := 0;
  v_total_award_bonuses INTEGER := 0;
  v_final_price NUMERIC;
  v_calculated_discount NUMERIC := 0;  -- ✅ По умолчанию 0
  v_cart_item RECORD;
  v_product_record RECORD;
  v_bonus_rate NUMERIC := 1.0;  -- ✅ По умолчанию 1.0
  v_is_first_order BOOLEAN;
BEGIN
  -- Проверка авторизации
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация для оформления заказа';
  END IF;

  -- Получаем профиль пользователя (должен существовать после авторизации)
  SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_current_user_id;

  IF v_user_profile IS NULL THEN
    RAISE EXCEPTION 'Профиль пользователя не найден';
  END IF;

  -- Проверяем, первый ли это заказ
  SELECT NOT EXISTS(SELECT 1 FROM public.orders WHERE user_id = v_current_user_id) INTO v_is_first_order;

  -- Рассчитываем стоимость и бонусы с товаров
  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT price, bonus_points_award, stock_quantity INTO v_product_record
    FROM public.products WHERE id = v_cart_item.product_id AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар не найден';
    END IF;

    IF v_product_record.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара на складе';
    END IF;

    v_total_price := v_total_price + (v_product_record.price * v_cart_item.quantity);
    v_total_award_bonuses := v_total_award_bonuses + (COALESCE(v_product_record.bonus_points_award, 0) * v_cart_item.quantity);
  END LOOP;

  -- ✅ ИСПРАВЛЕНИЕ: Применяем бонусы к оплате с COALESCE защитой
  IF COALESCE(p_bonuses_to_spend, 0) > 0 THEN
    -- Проверяем достаточность бонусов
    IF COALESCE(v_user_profile.active_bonus_balance, 0) < p_bonuses_to_spend THEN
      RAISE EXCEPTION 'Недостаточно бонусов. Доступно: %, запрошено: %',
        COALESCE(v_user_profile.active_bonus_balance, 0), p_bonuses_to_spend;
    END IF;

    -- ✅ Получаем курс конвертации бонусов с гарантией non-NULL значения
    SELECT COALESCE((value->>'bonus_conversion_rate')::NUMERIC, 1.0)
    INTO v_bonus_rate FROM public.settings WHERE key = 'bonus_system';

    -- ✅ Гарантируем, что v_bonus_rate не NULL
    v_bonus_rate := COALESCE(v_bonus_rate, 1.0);

    -- ✅ Вычисляем скидку (всегда будет число, не NULL)
    v_calculated_discount := COALESCE(p_bonuses_to_spend, 0) * v_bonus_rate;
  END IF;

  -- ✅ Гарантируем, что финальная цена не отрицательная и не NULL
  v_final_price := GREATEST(COALESCE(v_total_price, 0) - COALESCE(v_calculated_discount, 0), 0);

  -- Создаем заказ
  INSERT INTO public.orders (
    user_id, total_amount, discount_amount, final_amount,
    bonuses_spent, bonuses_awarded, delivery_method, delivery_address, payment_method, status
  )
  VALUES (
    v_current_user_id,
    COALESCE(v_total_price, 0),
    COALESCE(v_calculated_discount, 0),  -- ✅ ИСПРАВЛЕНИЕ: Гарантируем 0 вместо NULL
    COALESCE(v_final_price, 0),
    COALESCE(p_bonuses_to_spend, 0),
    COALESCE(v_total_award_bonuses, 0),
    p_delivery_method,
    p_delivery_address,
    p_payment_method,
    'new'
  )
  RETURNING id INTO v_new_order_id;

  -- Добавляем товары в заказ
  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT price, bonus_points_award INTO v_product_record FROM public.products WHERE id = v_cart_item.product_id;

    INSERT INTO public.order_items (order_id, product_id, quantity, price_per_item, bonus_points_per_item)
    VALUES (v_new_order_id, v_cart_item.product_id, v_cart_item.quantity, v_product_record.price, COALESCE(v_product_record.bonus_points_award, 0));
  END LOOP;

  -- ✅ ИСПРАВЛЕНИЕ: Списываем потраченные бонусы СРАЗУ с защитой от отрицательных значений
  IF COALESCE(p_bonuses_to_spend, 0) > 0 THEN
    UPDATE public.profiles
    SET active_bonus_balance = GREATEST(COALESCE(active_bonus_balance, 0) - p_bonuses_to_spend, 0)
    WHERE id = v_current_user_id;

    -- ✅ Логируем списание бонусов для отладки
    RAISE NOTICE 'Списано бонусов: % для пользователя %', p_bonuses_to_spend, v_current_user_id;
  END IF;

  -- НАЧИСЛЯЕМ 1000 БОНУСОВ СРАЗУ (если первый заказ и еще не получал)
  IF v_is_first_order AND NOT COALESCE(v_user_profile.has_received_welcome_bonus, FALSE) THEN
    UPDATE public.profiles
    SET
      active_bonus_balance = COALESCE(active_bonus_balance, 0) + 1000,
      has_received_welcome_bonus = TRUE
    WHERE id = v_current_user_id;

    RAISE NOTICE 'Начислен приветственный бонус 1000 для пользователя %', v_current_user_id;
  END IF;

  -- Бонусы с товаров пойдут в pending и начислятся через 7 дней
  IF COALESCE(v_total_award_bonuses, 0) > 0 THEN
    UPDATE public.profiles
    SET pending_bonus_balance = COALESCE(pending_bonus_balance, 0) + v_total_award_bonuses
    WHERE id = v_current_user_id;

    RAISE NOTICE 'Добавлено в pending бонусов: % для пользователя %', v_total_award_bonuses, v_current_user_id;
  END IF;

  RETURN v_new_order_id;
END;
$$;

COMMENT ON FUNCTION public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER) IS
'Создает новый заказ для авторизованного пользователя с поддержкой бонусной системы.
Параметры:
  - p_cart_items: JSON массив товаров [{product_id, quantity}]
  - p_delivery_method: Способ доставки
  - p_payment_method: Способ оплаты
  - p_delivery_address: JSON с адресом доставки
  - p_bonuses_to_spend: Количество бонусов к списанию

ИСПРАВЛЕНИЕ v1.1 (2026-01-05):
  - Добавлена NULL safety для всех числовых полей (используем COALESCE)
  - Гарантируем, что v_bonus_rate не NULL (default 1.0)
  - Гарантируем, что discount_amount, final_amount никогда не NULL
  - Добавлены RAISE NOTICE для отладки списания бонусов
  - Защита от отрицательных балансов (GREATEST)';
