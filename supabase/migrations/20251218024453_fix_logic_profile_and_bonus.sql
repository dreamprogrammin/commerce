-- =====================================================================================
-- ИСПРАВЛЕНИЕ СВЯЗЕЙ И УПРОЩЕНИЕ БОНУСНОЙ СИСТЕМЫ
-- =====================================================================================

-- === ЧАСТЬ 1: УДАЛЯЕМ СТАРЫЕ ТРИГГЕРЫ И ФУНКЦИИ ===

-- Удаляем триггер с auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Удаляем функции
DROP FUNCTION IF EXISTS public.handle_new_user_profile_creation();
DROP FUNCTION IF EXISTS public.merge_anon_user_into_real_user(UUID, UUID);
DROP FUNCTION IF EXISTS public.find_guest_orders_by_email(TEXT);
DROP FUNCTION IF EXISTS public.link_guest_orders_to_user(TEXT);
DROP FUNCTION IF EXISTS public.get_user_emails();


-- === ЧАСТЬ 2: ИСПРАВЛЯЕМ ДАННЫЕ И СВЯЗИ ===

-- 2.0 Создаем профили для всех пользователей, у которых их нет
INSERT INTO public.profiles (id, first_name, role)
SELECT 
  au.id,
  COALESCE(
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'name',
    au.email,
    'User'
  ),
  'user'
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = au.id
)
ON CONFLICT (id) DO NOTHING;

-- 2.1 Очищаем "битые" user_id в orders (которых нет в auth.users)
UPDATE public.orders
SET user_id = NULL
WHERE user_id IS NOT NULL 
  AND NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = orders.user_id
  );

-- 2.2 Исправляем orders -> profiles (вместо auth.users)
ALTER TABLE public.orders 
  DROP CONSTRAINT IF EXISTS "orders_user_id_fkey";

ALTER TABLE public.orders 
  DROP CONSTRAINT IF EXISTS "orders_user_id_fkey_to_profiles";

-- Теперь можно безопасно добавить constraint
ALTER TABLE public.orders 
  ADD CONSTRAINT "orders_user_id_fkey" 
  FOREIGN KEY (user_id) 
  REFERENCES public.profiles(id) 
  ON DELETE SET NULL;

-- 2.3 Очищаем "битые" user_id в user_addresses
UPDATE public.user_addresses
SET user_id = NULL
WHERE user_id IS NOT NULL 
  AND NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = user_addresses.user_id
  );

-- Удаляем адреса без пользователя (так как CASCADE требует наличия профиля)
DELETE FROM public.user_addresses
WHERE user_id IS NULL;

-- 2.4 Исправляем user_addresses -> profiles
ALTER TABLE public.user_addresses 
  DROP CONSTRAINT IF EXISTS "user_addresses_user_id_fkey";

ALTER TABLE public.user_addresses 
  ADD CONSTRAINT "user_addresses_user_id_fkey" 
  FOREIGN KEY (user_id) 
  REFERENCES public.profiles(id) 
  ON DELETE CASCADE;

-- 2.5 Очищаем "битые" user_id в children
DELETE FROM public.children
WHERE user_id IS NOT NULL 
  AND NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = children.user_id
  );

-- 2.6 Исправляем children -> profiles
ALTER TABLE public.children 
  DROP CONSTRAINT IF EXISTS "children_user_id_fkey";

ALTER TABLE public.children 
  ADD CONSTRAINT "children_user_id_fkey" 
  FOREIGN KEY (user_id) 
  REFERENCES public.profiles(id) 
  ON DELETE CASCADE;

-- 2.7 Очищаем "битые" user_id в wishlist
DELETE FROM public.wishlist
WHERE user_id IS NOT NULL 
  AND NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = wishlist.user_id
  );

-- 2.8 Исправляем wishlist -> profiles
ALTER TABLE public.wishlist 
  DROP CONSTRAINT IF EXISTS "wishlist_user_id_fkey";

ALTER TABLE public.wishlist 
  ADD CONSTRAINT "wishlist_user_id_fkey" 
  FOREIGN KEY (user_id) 
  REFERENCES public.profiles(id) 
  ON DELETE CASCADE;

-- 2.9 Очищаем "битые" user_id в bonus_activation_skipped
DELETE FROM public.bonus_activation_skipped
WHERE user_id IS NOT NULL 
  AND NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = bonus_activation_skipped.user_id
  );

-- 2.10 Исправляем bonus_activation_skipped -> profiles
ALTER TABLE public.bonus_activation_skipped 
  DROP CONSTRAINT IF EXISTS "bonus_activation_skipped_user_id_fkey";

ALTER TABLE public.bonus_activation_skipped 
  ADD CONSTRAINT "bonus_activation_skipped_user_id_fkey" 
  FOREIGN KEY (user_id) 
  REFERENCES public.profiles(id) 
  ON DELETE CASCADE;


-- === ЧАСТЬ 3: УБИРАЕМ СТАРУЮ ЛОГИКУ БОНУСОВ ===

-- Удаляем старое поле bonus_balance (если оно было)
ALTER TABLE public.profiles 
  DROP COLUMN IF EXISTS bonus_balance;

-- Убираем триггер приветственного бонуса при создании профиля
DROP TRIGGER IF EXISTS on_profile_created_grant_bonus ON public.profiles;
DROP FUNCTION IF EXISTS public.grant_welcome_bonus();


-- === ЧАСТЬ 4: СОЗДАЕМ ПРОСТУЮ ЛОГИКУ ПРИВЕТСТВЕННОГО БОНУСА ===

-- 4.1 Функция выдачи приветственного бонуса при первой покупке
CREATE OR REPLACE FUNCTION public.grant_welcome_bonus_on_first_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_profile RECORD;
BEGIN
  -- Проверяем, что заказ создан авторизованным пользователем
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Получаем профиль пользователя
  SELECT * INTO v_user_profile 
  FROM public.profiles 
  WHERE id = NEW.user_id;

  -- Если пользователь еще не получал приветственный бонус
  IF NOT v_user_profile.has_received_welcome_bonus THEN
    -- Добавляем 1000 бонусов к pending_balance
    UPDATE public.profiles
    SET 
      pending_bonus_balance = pending_bonus_balance + 1000,
      has_received_welcome_bonus = TRUE
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.grant_welcome_bonus_on_first_order IS 
  'Выдает 1000 бонусов пользователю при создании первого заказа';

-- 4.2 Триггер на таблице orders
DROP TRIGGER IF EXISTS on_first_order_grant_welcome_bonus ON public.orders;

CREATE TRIGGER on_first_order_grant_welcome_bonus
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_welcome_bonus_on_first_order();


-- === ЧАСТЬ 5: ОБНОВЛЯЕМ RPC ФУНКЦИЮ CREATE_ORDER ===

CREATE OR REPLACE FUNCTION public.create_order(
  p_cart_items JSONB,
  p_delivery_method TEXT,
  p_payment_method TEXT DEFAULT NULL,
  p_delivery_address JSONB DEFAULT NULL,
  p_guest_info JSONB DEFAULT NULL,
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
BEGIN
  -- 1. Подсчитываем стоимость корзины
  FOR v_cart_item IN 
    SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER)
  LOOP
    SELECT price, bonus_points_award, stock_quantity
    INTO v_product_record
    FROM public.products
    WHERE id = v_cart_item.product_id AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар с ID % не найден или неактивен', v_cart_item.product_id;
    END IF;

    IF v_product_record.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара на складе для товара %', v_cart_item.product_id;
    END IF;

    v_total_price := v_total_price + (v_product_record.price * v_cart_item.quantity);
    v_total_award_bonuses := v_total_award_bonuses + (v_product_record.bonus_points_award * v_cart_item.quantity);
  END LOOP;

  -- 2. Обработка бонусов (только для авторизованных)
  IF v_current_user_id IS NOT NULL AND p_bonuses_to_spend > 0 THEN
    SELECT * INTO v_user_profile
    FROM public.profiles
    WHERE id = v_current_user_id;

    IF v_user_profile.active_bonus_balance < p_bonuses_to_spend THEN
      RAISE EXCEPTION 'Недостаточно активных бонусов. Доступно: %, запрошено: %', 
        v_user_profile.active_bonus_balance, p_bonuses_to_spend;
    END IF;

    -- Получаем курс конвертации бонусов
    SELECT (value->>'bonus_conversion_rate')::NUMERIC
    INTO v_bonus_rate
    FROM public.settings
    WHERE key = 'bonus_system';

    IF v_bonus_rate IS NULL THEN
      v_bonus_rate := 1.0; -- По умолчанию 1 бонус = 1 тенге
    END IF;

    v_calculated_discount := p_bonuses_to_spend * v_bonus_rate;
  END IF;

  v_final_price := GREATEST(v_total_price - v_calculated_discount, 0);

  -- 3. Создаем заказ
  INSERT INTO public.orders (
    user_id,
    guest_name,
    guest_email,
    guest_phone,
    total_amount,
    discount_amount,
    final_amount,
    bonuses_spent,
    bonuses_awarded,
    delivery_method,
    delivery_address,
    payment_method,
    status
  )
  VALUES (
    v_current_user_id,
    p_guest_info->>'name',
    p_guest_info->>'email',
    p_guest_info->>'phone',
    v_total_price,
    v_calculated_discount,
    v_final_price,
    p_bonuses_to_spend,
    v_total_award_bonuses,
    p_delivery_method,
    p_delivery_address,
    p_payment_method,
    'new'
  )
  RETURNING id INTO v_new_order_id;

  -- 4. Добавляем товары в заказ
  FOR v_cart_item IN 
    SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER)
  LOOP
    SELECT price, bonus_points_award
    INTO v_product_record
    FROM public.products
    WHERE id = v_cart_item.product_id;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      quantity,
      price_per_item,
      bonus_points_per_item
    )
    VALUES (
      v_new_order_id,
      v_cart_item.product_id,
      v_cart_item.quantity,
      v_product_record.price,
      v_product_record.bonus_points_award
    );
  END LOOP;

  RETURN v_new_order_id;
END;
$$;

COMMENT ON FUNCTION public.create_order IS 
  'Создает новый заказ. Приветственный бонус выдается автоматически через триггер.';


-- === ЧАСТЬ 6: ПРОВЕРКА ДАННЫХ ===

-- Проверяем, что все пользователи имеют профили
DO $$
DECLARE
  v_missing_profiles INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_missing_profiles
  FROM auth.users au
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = au.id
  );

  IF v_missing_profiles > 0 THEN
    RAISE NOTICE 'Найдено % пользователей без профилей. Создаем...', v_missing_profiles;
    
    INSERT INTO public.profiles (id, first_name, role)
    SELECT 
      au.id,
      COALESCE(
        au.raw_user_meta_data->>'full_name',
        au.raw_user_meta_data->>'name',
        au.email
      ),
      'user'
    FROM auth.users au
    WHERE NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = au.id
    );
    
    RAISE NOTICE 'Профили созданы успешно';
  ELSE
    RAISE NOTICE 'Все пользователи имеют профили';
  END IF;
END;
$$;


-- === ЧАСТЬ 7: ОБНОВЛЯЕМ КОММЕНТАРИИ ===

COMMENT ON TABLE public.profiles IS 
  'Профили пользователей. Все связи должны ссылаться на эту таблицу, а не на auth.users';

COMMENT ON COLUMN public.profiles.active_bonus_balance IS 
  'Активные бонусы, доступные для списания';

COMMENT ON COLUMN public.profiles.pending_bonus_balance IS 
  'Бонусы в ожидании активации (активируются через 7 дней после подтверждения заказа)';

COMMENT ON COLUMN public.profiles.has_received_welcome_bonus IS 
  'Получил ли пользователь приветственный бонус (выдается при первой покупке)';


-- =====================================================================================
-- ИТОГО:
-- 1. ✅ Все таблицы теперь ссылаются на profiles, а не на auth.users
-- 2. ✅ Удалена сложная логика с автоматическим созданием профилей
-- 3. ✅ Приветственный бонус выдается при первой покупке (через триггер)
-- 4. ✅ Функция create_order обновлена и упрощена
-- 5. ✅ Все существующие пользователи получили профили
-- =====================================================================================