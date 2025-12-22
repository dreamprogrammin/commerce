-- =====================================================================================
-- ФИНАЛЬНАЯ ЛОГИКА: ГОСТЕВЫЕ ЗАКАЗЫ + БОНУСЫ ТОЛЬКО ДЛЯ ЗАРЕГИСТРИРОВАННЫХ (БЕЗОПАСНАЯ)
-- =====================================================================================

-- === ЧАСТЬ 0: СОЗДАЕМ НЕДОСТАЮЩИЕ ТАБЛИЦЫ (ДЛЯ ЛОКАЛКИ) ===

-- Создаем bonus_activation_skipped, если её нет
CREATE TABLE IF NOT EXISTS public.bonus_activation_skipped (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID,
    user_id UUID,
    reason TEXT NOT NULL,
    bonuses_amount INT,
    pending_balance INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.bonus_activation_skipped IS 
'Лог пропущенных активаций бонусов для диагностики проблем';

CREATE INDEX IF NOT EXISTS idx_bonus_activation_skipped_created 
ON public.bonus_activation_skipped(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bonus_activation_skipped_user 
ON public.bonus_activation_skipped(user_id);

CREATE INDEX IF NOT EXISTS idx_bonus_activation_skipped_order 
ON public.bonus_activation_skipped(order_id);


-- === ЧАСТЬ 1: ИСПРАВЛЯЕМ CONSTRAINT НА ORDERS ===

-- Удаляем старый constraint
DO $$
BEGIN
  ALTER TABLE public.orders 
    DROP CONSTRAINT IF EXISTS "orders_user_id_fkey";
  
  ALTER TABLE public.orders 
    DROP CONSTRAINT IF EXISTS "orders_user_id_fkey_to_profiles";
END $$;

-- Создаем constraint только для проверки auth.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'orders_user_id_fkey' 
    AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders 
      ADD CONSTRAINT "orders_user_id_fkey" 
      FOREIGN KEY (user_id) 
      REFERENCES auth.users(id) 
      ON DELETE SET NULL
      NOT VALID;
    
    -- Валидируем constraint
    ALTER TABLE public.orders 
      VALIDATE CONSTRAINT "orders_user_id_fkey";
  END IF;
END $$;

COMMENT ON CONSTRAINT "orders_user_id_fkey" ON public.orders IS 
  'Проверяет только auth.users. Профиль создается триггером автоматически.';

-- Удаляем старые триггеры и функции
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_profile_created_grant_bonus ON public.profiles;
DROP TRIGGER IF EXISTS on_first_order_grant_welcome_bonus ON public.orders;

DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.handle_new_user_profile_creation();
DROP FUNCTION IF EXISTS public.grant_welcome_bonus();
DROP FUNCTION IF EXISTS public.grant_welcome_bonus_on_first_order();

COMMENT ON TABLE public.profiles IS 
  'Профили создаются ТОЛЬКО вручную (админом или при первой покупке зарегистрированного пользователя)';


-- === ЧАСТЬ 2: ИСПРАВЛЯЕМ ДРУГИЕ CONSTRAINTS ===

-- Все остальные таблицы тоже должны ссылаться на auth.users

-- 2.1 user_addresses
DO $$
BEGIN
  ALTER TABLE public.user_addresses 
    DROP CONSTRAINT IF EXISTS "user_addresses_user_id_fkey";
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_addresses_user_id_fkey' 
    AND conrelid = 'public.user_addresses'::regclass
  ) THEN
    ALTER TABLE public.user_addresses 
      ADD CONSTRAINT "user_addresses_user_id_fkey" 
      FOREIGN KEY (user_id) 
      REFERENCES auth.users(id) 
      ON DELETE CASCADE;
  END IF;
END $$;

-- 2.2 children
DO $$
BEGIN
  ALTER TABLE public.children 
    DROP CONSTRAINT IF EXISTS "children_user_id_fkey";
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'children_user_id_fkey' 
    AND conrelid = 'public.children'::regclass
  ) THEN
    ALTER TABLE public.children 
      ADD CONSTRAINT "children_user_id_fkey" 
      FOREIGN KEY (user_id) 
      REFERENCES auth.users(id) 
      ON DELETE CASCADE;
  END IF;
END $$;

-- 2.3 wishlist
DO $$
BEGIN
  ALTER TABLE public.wishlist 
    DROP CONSTRAINT IF EXISTS "wishlist_user_id_fkey";
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'wishlist_user_id_fkey' 
    AND conrelid = 'public.wishlist'::regclass
  ) THEN
    ALTER TABLE public.wishlist 
      ADD CONSTRAINT "wishlist_user_id_fkey" 
      FOREIGN KEY (user_id) 
      REFERENCES auth.users(id) 
      ON DELETE CASCADE;
  END IF;
END $$;

-- 2.4 bonus_activation_skipped (только если таблица существует)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'bonus_activation_skipped'
  ) THEN
    ALTER TABLE public.bonus_activation_skipped 
      DROP CONSTRAINT IF EXISTS "bonus_activation_skipped_user_id_fkey";
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'bonus_activation_skipped_user_id_fkey' 
      AND conrelid = 'public.bonus_activation_skipped'::regclass
    ) THEN
      ALTER TABLE public.bonus_activation_skipped 
        ADD CONSTRAINT "bonus_activation_skipped_user_id_fkey" 
        FOREIGN KEY (user_id) 
        REFERENCES auth.users(id) 
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;


-- === ЧАСТЬ 3: ЛОГИКА ПРИВЕТСТВЕННОГО БОНУСА ПРИ ПЕРВОЙ ПОКУПКЕ ===

-- Функция выдачи приветственного бонуса при первом заказе
CREATE OR REPLACE FUNCTION public.grant_welcome_bonus_on_first_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_profile RECORD;
  v_user_exists BOOLEAN;
BEGIN
  -- Только для авторизованных пользователей
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Проверяем, существует ли профиль
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = NEW.user_id
  ) INTO v_user_exists;

  -- Если профиля нет - создаем его
  IF NOT v_user_exists THEN
    INSERT INTO public.profiles (
      id,
      first_name,
      role,
      active_bonus_balance,
      pending_bonus_balance,
      has_received_welcome_bonus
    )
    SELECT 
      NEW.user_id,
      COALESCE(
        au.raw_user_meta_data->>'first_name',
        au.raw_user_meta_data->>'name',
        split_part(au.email, '@', 1)
      ),
      'user',
      0,
      1000, -- Сразу 1000 бонусов в pending
      TRUE  -- Отмечаем, что получил приветственный бонус
    FROM auth.users au
    WHERE au.id = NEW.user_id
    ON CONFLICT (id) DO NOTHING;
    
    RAISE NOTICE 'Создан профиль для user_id=% с приветственным бонусом 1000', NEW.user_id;
    RETURN NEW;
  END IF;

  -- Если профиль уже существует, проверяем приветственный бонус
  SELECT * INTO v_user_profile 
  FROM public.profiles 
  WHERE id = NEW.user_id;

  -- Если еще не получал приветственный бонус - выдаем
  IF NOT v_user_profile.has_received_welcome_bonus THEN
    UPDATE public.profiles
    SET 
      pending_bonus_balance = pending_bonus_balance + 1000,
      has_received_welcome_bonus = TRUE
    WHERE id = NEW.user_id;
    
    RAISE NOTICE 'Начислено 1000 бонусов пользователю %', NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.grant_welcome_bonus_on_first_order IS 
  'Выдает 1000 бонусов при первом заказе. Если профиля нет - создает его автоматически.';

-- Триггер на таблице orders
CREATE TRIGGER on_first_order_grant_welcome_bonus
  AFTER INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION public.grant_welcome_bonus_on_first_order();


-- === ЧАСТЬ 4: ОБНОВЛЯЕМ ФУНКЦИЮ CREATE_ORDER ===

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

  -- 2. Обработка бонусов (ТОЛЬКО для авторизованных с профилем)
  IF v_current_user_id IS NOT NULL AND p_bonuses_to_spend > 0 THEN
    -- Проверяем существование профиля
    SELECT * INTO v_user_profile
    FROM public.profiles
    WHERE id = v_current_user_id;

    IF v_user_profile IS NULL THEN
      RAISE EXCEPTION 'Профиль не найден. Зарегистрируйтесь для использования бонусов.';
    END IF;

    IF v_user_profile.active_bonus_balance < p_bonuses_to_spend THEN
      RAISE EXCEPTION 'Недостаточно активных бонусов. Доступно: %, запрошено: %', 
        v_user_profile.active_bonus_balance, p_bonuses_to_spend;
    END IF;

    -- Получаем курс конвертации бонусов (1 бонус = 1 тенге)
    SELECT COALESCE((value->>'bonus_conversion_rate')::NUMERIC, 1.0)
    INTO v_bonus_rate
    FROM public.settings
    WHERE key = 'bonus_system';

    v_calculated_discount := p_bonuses_to_spend * v_bonus_rate;
  END IF;

  v_final_price := GREATEST(v_total_price - v_calculated_discount, 0);

  -- 3. Создаем заказ
  INSERT INTO public.orders (
    user_id,               -- NULL для гостей, UUID для авторизованных
    guest_name,            -- Заполнено для гостей
    guest_email,           -- Заполнено для гостей
    guest_phone,           -- Заполнено для гостей
    total_amount,
    discount_amount,
    final_amount,
    bonuses_spent,         -- Только для авторизованных
    bonuses_awarded,       -- Только для авторизованных (будет начислено)
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
    CASE WHEN v_current_user_id IS NOT NULL THEN p_bonuses_to_spend ELSE 0 END,
    CASE WHEN v_current_user_id IS NOT NULL THEN v_total_award_bonuses ELSE 0 END,
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
      CASE WHEN v_current_user_id IS NOT NULL 
           THEN v_product_record.bonus_points_award 
           ELSE 0 
      END
    );
  END LOOP;

  RAISE NOTICE 'Заказ % создан. User: %, Guest: %', 
    v_new_order_id, 
    v_current_user_id, 
    COALESCE(p_guest_info->>'name', 'N/A');

  RETURN v_new_order_id;
END;
$$;

COMMENT ON FUNCTION public.create_order IS 
  'Создает заказ. Гости оформляют без профиля. Зарегистрированные получают бонусы.';


-- === ЧАСТЬ 5: ПРОВЕРКА И СТАТИСТИКА ===

DO $$
DECLARE
  v_total_orders INTEGER;
  v_user_orders INTEGER;
  v_guest_orders INTEGER;
  v_users_with_profiles INTEGER;
  v_users_without_profiles INTEGER;
BEGIN
  -- Статистика по заказам
  SELECT COUNT(*) INTO v_total_orders FROM orders;
  SELECT COUNT(*) INTO v_user_orders FROM orders WHERE user_id IS NOT NULL;
  SELECT COUNT(*) INTO v_guest_orders FROM orders WHERE user_id IS NULL;
  
  -- Статистика по пользователям
  SELECT COUNT(*) INTO v_users_with_profiles 
  FROM auth.users au
  WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.id = au.id);
  
  SELECT COUNT(*) INTO v_users_without_profiles 
  FROM auth.users au
  WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = au.id);
  
  RAISE NOTICE '====================================';
  RAISE NOTICE 'СТАТИСТИКА ЗАКАЗОВ:';
  RAISE NOTICE 'Всего заказов: %', v_total_orders;
  RAISE NOTICE 'От зарегистрированных: %', v_user_orders;
  RAISE NOTICE 'Гостевых: %', v_guest_orders;
  RAISE NOTICE '';
  RAISE NOTICE 'СТАТИСТИКА ПОЛЬЗОВАТЕЛЕЙ:';
  RAISE NOTICE 'С профилями: %', v_users_with_profiles;
  RAISE NOTICE 'Без профилей: %', v_users_without_profiles;
  RAISE NOTICE '====================================';
END;
$$;


-- === ЧАСТЬ 6: КОММЕНТАРИИ ДЛЯ ЯСНОСТИ ===

COMMENT ON COLUMN public.orders.user_id IS 
  'NULL для гостевых заказов, UUID для авторизованных пользователей';

COMMENT ON COLUMN public.orders.guest_name IS 
  'Имя гостя (заполняется только для гостевых заказов)';

COMMENT ON COLUMN public.orders.bonuses_awarded IS 
  'Бонусы к начислению (только для авторизованных пользователей)';


-- =====================================================================================
-- ИТОГО:
-- ✅ Миграция безопасна для повторного запуска (идемпотентна)
-- ✅ Работает как в продакшене, так и локально
-- ✅ Создает bonus_activation_skipped если её нет
-- ✅ Гости могут оформлять заказы БЕЗ создания профиля
-- ✅ При регистрации профиль НЕ создается автоматически
-- ✅ Профиль создается только при первой покупке авторизованного пользователя
-- ✅ Приветственный бонус 1000₸ выдается при первой покупке
-- ✅ Гостевые заказы хранятся с guest_name, guest_email, guest_phone
-- =====================================================================================