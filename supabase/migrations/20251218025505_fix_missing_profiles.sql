-- =====================================================================================
-- ИСПРАВЛЕНИЕ: Создание профилей для всех пользователей
-- =====================================================================================

-- 1. Создаем профили для ВСЕХ пользователей из auth.users
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
  au.id,
  COALESCE(
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'name',
    split_part(au.email, '@', 1), -- Используем часть email до @
    'User'
  ) as first_name,
  au.raw_user_meta_data->>'last_name' as last_name,
  au.phone as phone,
  'user' as role,
  0 as active_bonus_balance,
  0 as pending_bonus_balance,
  false as has_received_welcome_bonus
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = au.id
)
ON CONFLICT (id) DO UPDATE SET
  first_name = COALESCE(profiles.first_name, EXCLUDED.first_name),
  phone = COALESCE(profiles.phone, EXCLUDED.phone);

-- 2. Проверяем результат
DO $$
DECLARE
  v_users_count INTEGER;
  v_profiles_count INTEGER;
  v_missing INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_users_count FROM auth.users;
  SELECT COUNT(*) INTO v_profiles_count FROM public.profiles;
  v_missing := v_users_count - v_profiles_count;
  
  RAISE NOTICE '====================================';
  RAISE NOTICE 'Пользователей в auth.users: %', v_users_count;
  RAISE NOTICE 'Профилей в profiles: %', v_profiles_count;
  RAISE NOTICE 'Недостающих профилей: %', v_missing;
  RAISE NOTICE '====================================';
  
  IF v_missing > 0 THEN
    RAISE WARNING 'Внимание! Есть пользователи без профилей!';
  ELSE
    RAISE NOTICE '✅ Все пользователи имеют профили';
  END IF;
END;
$$;

-- 3. Исправляем "битые" заказы (устанавливаем user_id в NULL)
UPDATE public.orders
SET user_id = NULL
WHERE user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = orders.user_id
  );

-- 4. Показываем статистику по заказам
DO $$
DECLARE
  v_total_orders INTEGER;
  v_user_orders INTEGER;
  v_guest_orders INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_orders FROM orders;
  SELECT COUNT(*) INTO v_user_orders FROM orders WHERE user_id IS NOT NULL;
  SELECT COUNT(*) INTO v_guest_orders FROM orders WHERE user_id IS NULL;
  
  RAISE NOTICE '====================================';
  RAISE NOTICE 'Всего заказов: %', v_total_orders;
  RAISE NOTICE 'Заказов от пользователей: %', v_user_orders;
  RAISE NOTICE 'Гостевых заказов: %', v_guest_orders;
  RAISE NOTICE '====================================';
END;
$$;

-- =====================================================================================
-- АВТОМАТИЧЕСКОЕ СОЗДАНИЕ ПРОФИЛЕЙ ПРИ РЕГИСТРАЦИИ
-- =====================================================================================

-- 5. Создаем функцию для автоматического создания профиля
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    phone,
    role
  )
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1),
      'User'
    ),
    NEW.raw_user_meta_data->>'last_name',
    NEW.phone,
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- 6. Создаем триггер на auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================================
-- ПРОВЕРКА: Все ли constraints на месте
-- =====================================================================================

DO $$
BEGIN
  -- Проверяем constraint на orders
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'orders_user_id_fkey' 
      AND conrelid = 'orders'::regclass
  ) THEN
    RAISE NOTICE 'Создаем constraint orders_user_id_fkey...';
    EXECUTE 'ALTER TABLE public.orders 
      ADD CONSTRAINT orders_user_id_fkey 
      FOREIGN KEY (user_id) 
      REFERENCES public.profiles(id) 
      ON DELETE SET NULL';
  ELSE
    RAISE NOTICE '✅ Constraint orders_user_id_fkey существует';
  END IF;
END;
$$;

-- =====================================================================================
-- ИТОГОВАЯ ПРОВЕРКА
-- =====================================================================================

SELECT 
  'auth.users' as table_name,
  COUNT(*) as count
FROM auth.users
UNION ALL
SELECT 
  'profiles' as table_name,
  COUNT(*) as count
FROM profiles
UNION ALL
SELECT 
  'orders (user)' as table_name,
  COUNT(*) as count
FROM orders WHERE user_id IS NOT NULL
UNION ALL
SELECT 
  'orders (guest)' as table_name,
  COUNT(*) as count
FROM orders WHERE user_id IS NULL;