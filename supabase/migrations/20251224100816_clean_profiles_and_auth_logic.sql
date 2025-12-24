-- =====================================================================================
-- ЧИСТАЯ МИГРАЦИЯ: ПРОФИЛИ И АВТОРИЗАЦИЯ
-- Дата: 2025-12-24
-- Описание: Удаляет всю старую логику profiles и auth, создает единую систему
-- =====================================================================================

-- =====================================================================================
-- ШАГ 1: УДАЛЕНИЕ СТАРЫХ ТРИГГЕРОВ И ФУНКЦИЙ
-- =====================================================================================

-- Удаляем все триггеры связанные с profiles и авторизацией
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_profile_created_grant_bonus ON public.profiles;
DROP TRIGGER IF EXISTS on_first_order_grant_welcome_bonus ON public.orders;
DROP TRIGGER IF EXISTS trigger_protect_profile_role_update ON public.profiles;

-- Удаляем все функции связанные с profiles и авторизацией
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_profile_creation() CASCADE;
DROP FUNCTION IF EXISTS public.grant_welcome_bonus() CASCADE;
DROP FUNCTION IF EXISTS public.grant_welcome_bonus_on_first_order() CASCADE;
DROP FUNCTION IF EXISTS public.merge_anon_user_into_real_user(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.protect_profile_role_update() CASCADE;

-- =====================================================================================
-- ШАГ 2: ПЕРЕСОЗДАНИЕ ТАБЛИЦЫ PROFILES (если нужно)
-- =====================================================================================

-- Проверяем текущую структуру таблицы profiles
DO $$
BEGIN
  -- Убеждаемся что таблица profiles существует с правильной структурой
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'active_bonus_balance'
  ) THEN
    -- Если колонка active_bonus_balance не существует, добавляем её
    ALTER TABLE public.profiles
    ADD COLUMN active_bonus_balance INTEGER DEFAULT 0 NOT NULL CHECK (active_bonus_balance >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'pending_bonus_balance'
  ) THEN
    -- Если колонка pending_bonus_balance не существует, добавляем её
    ALTER TABLE public.profiles
    ADD COLUMN pending_bonus_balance INTEGER DEFAULT 0 NOT NULL CHECK (pending_bonus_balance >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'has_received_welcome_bonus'
  ) THEN
    -- Если колонка has_received_welcome_bonus не существует, добавляем её
    ALTER TABLE public.profiles
    ADD COLUMN has_received_welcome_bonus BOOLEAN DEFAULT FALSE NOT NULL;
  END IF;

  -- Удаляем старую колонку bonus_balance если она существует
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'bonus_balance'
  ) THEN
    ALTER TABLE public.profiles DROP COLUMN bonus_balance;
  END IF;
END $$;

-- =====================================================================================
-- ШАГ 3: СОЗДАНИЕ НОВОЙ ФУНКЦИИ ДЛЯ АВТОМАТИЧЕСКОГО СОЗДАНИЯ ПРОФИЛЯ
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_name TEXT;
BEGIN
  -- Извлекаем имя из метаданных или используем email
  v_first_name := COALESCE(
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Создаем профиль для нового пользователя
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
  VALUES (
    NEW.id,
    v_first_name,
    COALESCE(NEW.raw_user_meta_data->>'last_name', NULL),
    NEW.phone,
    'user',
    0,
    0,
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user IS
'Автоматически создает профиль пользователя при регистрации в auth.users';

-- =====================================================================================
-- ШАГ 4: СОЗДАНИЕ ТРИГГЕРА ДЛЯ АВТОМАТИЧЕСКОГО СОЗДАНИЯ ПРОФИЛЯ
-- =====================================================================================

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMENT ON TRIGGER on_auth_user_created ON auth.users IS
'Триггер автоматически создает профиль при регистрации нового пользователя';

-- =====================================================================================
-- ШАГ 5: СОЗДАНИЕ ФУНКЦИИ ДЛЯ ЗАЩИТЫ РОЛИ ПОЛЬЗОВАТЕЛЯ
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.protect_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Разрешаем изменение роли только если текущий пользователь - админ
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.current_user_has_role_internal('admin') THEN
      RAISE EXCEPTION 'У вас нет прав на изменение роли пользователя';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_profile_role_update IS
'Защищает поле role от несанкционированного изменения (только админы могут менять роли)';

-- =====================================================================================
-- ШАГ 6: СОЗДАНИЕ ТРИГГЕРА ДЛЯ ЗАЩИТЫ РОЛИ
-- =====================================================================================

CREATE TRIGGER trigger_protect_profile_role_update
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.protect_profile_role_update();

COMMENT ON TRIGGER trigger_protect_profile_role_update ON public.profiles IS
'Триггер защищает поле role от несанкционированного изменения';

-- =====================================================================================
-- ШАГ 7: СОЗДАНИЕ ПРОФИЛЕЙ ДЛЯ СУЩЕСТВУЮЩИХ ПОЛЬЗОВАТЕЛЕЙ БЕЗ ПРОФИЛЯ
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
    split_part(u.email, '@', 1)
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
-- ШАГ 8: ОБНОВЛЕНИЕ RLS ПОЛИТИК ДЛЯ PROFILES
-- =====================================================================================

-- Удаляем старые политики
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can see all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;

-- Включаем RLS на таблице profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Политика: пользователь может читать свой профиль
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Политика: пользователь может обновлять свой профиль
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Политика: система может создавать профили (через триггер)
CREATE POLICY "Service role can insert profiles"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Политика: админы могут видеть все профили
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.current_user_has_role_internal('admin'));

-- Политика: админы могут обновлять все профили
CREATE POLICY "Admins can update all profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.current_user_has_role_internal('admin'))
  WITH CHECK (public.current_user_has_role_internal('admin'));

-- =====================================================================================
-- ШАГ 9: ОБНОВЛЕНИЕ КОММЕНТАРИЕВ К ТАБЛИЦЕ И КОЛОНКАМ
-- =====================================================================================

COMMENT ON TABLE public.profiles IS
'Профили пользователей. Автоматически создаются при регистрации через триггер on_auth_user_created';

COMMENT ON COLUMN public.profiles.active_bonus_balance IS
'Активные бонусы, которые можно использовать для покупок прямо сейчас';

COMMENT ON COLUMN public.profiles.pending_bonus_balance IS
'Ожидающие бонусы (в холде на 7 дней после получения)';

COMMENT ON COLUMN public.profiles.has_received_welcome_bonus IS
'Флаг, указывающий, получил ли пользователь приветственный бонус';

COMMENT ON COLUMN public.profiles.role IS
'Роль пользователя (user или admin). Защищена триггером от несанкционированного изменения';

-- =====================================================================================
-- ШАГ 10: СТАТИСТИКА И ПРОВЕРКА
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
  RAISE NOTICE 'СТАТИСТИКА ПОЛЬЗОВАТЕЛЕЙ:';
  RAISE NOTICE 'Всего пользователей в auth.users: %', v_total_users;
  RAISE NOTICE 'Пользователей с профилями: %', v_users_with_profiles;
  RAISE NOTICE 'Пользователей без профилей: %', v_users_without_profiles;
  RAISE NOTICE '====================================';

  IF v_users_without_profiles > 0 THEN
    RAISE WARNING 'Обнаружены пользователи без профилей! Запустите миграцию повторно.';
  ELSE
    RAISE NOTICE 'Все пользователи имеют профили!';
  END IF;
END;
$$;

-- =====================================================================================
-- КОНЕЦ МИГРАЦИИ
-- =====================================================================================
