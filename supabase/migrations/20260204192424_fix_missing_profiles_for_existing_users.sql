-- =====================================================================================
-- ИСПРАВЛЕНИЕ: Создание профилей для пользователей без профилей
-- Проблема: После OAuth авторизации у некоторых пользователей нет профилей
-- Решение: Создаем профили для всех пользователей и улучшаем create_user_order
-- =====================================================================================

-- =====================================================================================
-- ШАГ 1: СОЗДАНИЕ ПРОФИЛЕЙ ДЛЯ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ БЕЗ ПРОФИЛЕЙ
-- =====================================================================================

INSERT INTO public.profiles (
  id,
  first_name,
  last_name,
  phone,
  role,
  active_bonus_balance,
  pending_bonus_balance,
  has_received_welcome_bonus
)
SELECT
  u.id,
  COALESCE(
    u.raw_user_meta_data->>'first_name',
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1),
    'Гость'
  ),
  COALESCE(u.raw_user_meta_data->>'last_name', NULL),
  u.phone,
  'user',
  0,
  0,
  FALSE
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- =====================================================================================
-- ШАГ 2: УЛУЧШЕНИЕ ФУНКЦИИ create_user_order
-- Добавляем автоматическое создание профиля, если его нет
-- =====================================================================================

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
  v_calculated_discount NUMERIC := 0;
  v_cart_item RECORD;
  v_product_record RECORD;
  v_bonus_rate NUMERIC;
  v_is_first_order BOOLEAN;
  v_user_email TEXT;
  v_user_name TEXT;
BEGIN
  -- Проверка авторизации
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация для оформления заказа';
  END IF;

  -- Получаем профиль пользователя
  SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_current_user_id;

  -- ИСПРАВЛЕНИЕ: Если профиля нет - создаем его автоматически
  IF v_user_profile IS NULL THEN
    -- Получаем данные из auth.users
    SELECT email,
           COALESCE(
             raw_user_meta_data->>'first_name',
             raw_user_meta_data->>'full_name',
             raw_user_meta_data->>'name',
             split_part(email, '@', 1),
             'Гость'
           )
    INTO v_user_email, v_user_name
    FROM auth.users
    WHERE id = v_current_user_id;

    -- Создаем профиль
    INSERT INTO public.profiles (
      id,
      first_name,
      role,
      active_bonus_balance,
      pending_bonus_balance,
      has_received_welcome_bonus
    )
    VALUES (
      v_current_user_id,
      v_user_name,
      'user',
      0,
      0,
      FALSE
    )
    ON CONFLICT (id) DO NOTHING;

    -- Перечитываем профиль
    SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_current_user_id;

    -- Если всё равно не создался - выдаем понятную ошибку
    IF v_user_profile IS NULL THEN
      RAISE EXCEPTION 'Не удалось создать профиль пользователя. Email: %, User ID: %', v_user_email, v_current_user_id;
    END IF;
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

  -- Применяем бонусы к оплате (если пользователь хочет потратить)
  IF p_bonuses_to_spend > 0 THEN
    IF v_user_profile.active_bonus_balance < p_bonuses_to_spend THEN
      RAISE EXCEPTION 'Недостаточно бонусов. Доступно: %', v_user_profile.active_bonus_balance;
    END IF;

    -- Получаем курс конвертации бонусов
    SELECT COALESCE((value->>'bonus_conversion_rate')::NUMERIC, 1.0)
    INTO v_bonus_rate FROM public.settings WHERE key = 'bonus_system';

    v_calculated_discount := p_bonuses_to_spend * v_bonus_rate;
  END IF;

  v_final_price := GREATEST(v_total_price - v_calculated_discount, 0);

  -- Создаем заказ
  INSERT INTO public.orders (
    user_id, total_amount, discount_amount, final_amount,
    bonuses_spent, bonuses_awarded, delivery_method, delivery_address, payment_method, status
  )
  VALUES (
    v_current_user_id, v_total_price, v_calculated_discount, v_final_price,
    p_bonuses_to_spend, v_total_award_bonuses, p_delivery_method, p_delivery_address, p_payment_method, 'new'
  )
  RETURNING id INTO v_new_order_id;

  -- Добавляем товары в заказ
  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT price, bonus_points_award INTO v_product_record FROM public.products WHERE id = v_cart_item.product_id;

    INSERT INTO public.order_items (order_id, product_id, quantity, price_per_item, bonus_points_per_item)
    VALUES (v_new_order_id, v_cart_item.product_id, v_cart_item.quantity, v_product_record.price, COALESCE(v_product_record.bonus_points_award, 0));
  END LOOP;

  -- Списываем потраченные бонусы СРАЗУ
  IF p_bonuses_to_spend > 0 THEN
    UPDATE public.profiles
    SET active_bonus_balance = active_bonus_balance - p_bonuses_to_spend
    WHERE id = v_current_user_id;
  END IF;

  -- НАЧИСЛЯЕМ 1000 БОНУСОВ СРАЗУ (если первый заказ и еще не получал)
  IF v_is_first_order AND NOT COALESCE(v_user_profile.has_received_welcome_bonus, FALSE) THEN
    UPDATE public.profiles
    SET
      active_bonus_balance = active_bonus_balance + 1000,
      has_received_welcome_bonus = TRUE
    WHERE id = v_current_user_id;

    -- Записываем транзакцию бонусов
    INSERT INTO public.bonuses (
      user_id,
      order_id,
      amount,
      transaction_type,
      description,
      balance_after,
      pending_balance_after,
      activated_at
    )
    VALUES (
      v_current_user_id,
      v_new_order_id,
      1000,
      'earned',
      'Приветственный бонус за первый заказ',
      v_user_profile.active_bonus_balance + 1000 - COALESCE(p_bonuses_to_spend, 0),
      v_user_profile.pending_bonus_balance,
      NOW()
    );
  END IF;

  -- Записываем заработанные бонусы (в холде на 7 дней)
  IF v_total_award_bonuses > 0 THEN
    UPDATE public.profiles
    SET pending_bonus_balance = pending_bonus_balance + v_total_award_bonuses
    WHERE id = v_current_user_id;

    INSERT INTO public.bonuses (
      user_id,
      order_id,
      amount,
      transaction_type,
      description,
      balance_after,
      pending_balance_after,
      activated_at
    )
    VALUES (
      v_current_user_id,
      v_new_order_id,
      v_total_award_bonuses,
      'earned',
      'Бонусы за заказ',
      v_user_profile.active_bonus_balance - COALESCE(p_bonuses_to_spend, 0),
      v_user_profile.pending_bonus_balance + v_total_award_bonuses,
      NOW() + INTERVAL '7 days'
    );
  END IF;

  -- Записываем потраченные бонусы
  IF p_bonuses_to_spend > 0 THEN
    INSERT INTO public.bonuses (
      user_id,
      order_id,
      amount,
      transaction_type,
      description,
      balance_after,
      pending_balance_after,
      activated_at
    )
    VALUES (
      v_current_user_id,
      v_new_order_id,
      -p_bonuses_to_spend,
      'spent',
      'Оплата бонусами',
      v_user_profile.active_bonus_balance - p_bonuses_to_spend + (CASE WHEN v_is_first_order THEN 1000 ELSE 0 END),
      v_user_profile.pending_bonus_balance + v_total_award_bonuses,
      NOW()
    );
  END IF;

  RETURN v_new_order_id;
END;
$$;

COMMENT ON FUNCTION public.create_user_order IS
'Создает заказ для авторизованного пользователя. Автоматически создает профиль, если его нет.';

-- =====================================================================================
-- ШАГ 3: ПРОВЕРКА И СТАТИСТИКА
-- =====================================================================================

DO $$
DECLARE
  v_total_users INTEGER;
  v_users_with_profiles INTEGER;
  v_users_without_profiles INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_users FROM auth.users;

  SELECT COUNT(*) INTO v_users_with_profiles
  FROM auth.users au
  WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = au.id);

  SELECT COUNT(*) INTO v_users_without_profiles
  FROM auth.users au
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = au.id);

  RAISE NOTICE '====================================';
  RAISE NOTICE 'СТАТИСТИКА ПОСЛЕ МИГРАЦИИ:';
  RAISE NOTICE 'Всего пользователей: %', v_total_users;
  RAISE NOTICE 'С профилями: %', v_users_with_profiles;
  RAISE NOTICE 'Без профилей: %', v_users_without_profiles;
  RAISE NOTICE '====================================';

  IF v_users_without_profiles > 0 THEN
    RAISE WARNING 'Обнаружены пользователи без профилей!';
  ELSE
    RAISE NOTICE 'Все пользователи имеют профили!';
  END IF;
END;
$$;
