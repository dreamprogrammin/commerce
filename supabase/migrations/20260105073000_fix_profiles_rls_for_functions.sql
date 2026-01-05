-- =====================================================================================
-- ИСПРАВЛЕНИЕ: RLS политики для profiles должны разрешать UPDATE из SECURITY DEFINER функций
-- =====================================================================================
-- Проблема:
-- - SECURITY DEFINER функции (create_user_order, cancel_order и т.д.) не могут обновлять
--   таблицу profiles из-за RLS политик
-- - Текущие политики разрешают UPDATE только если auth.uid() = id
-- - Но функции выполняются от имени другого пользователя
--
-- Решение:
-- - Добавить политику, разрешающую UPDATE для service role
-- - Функции с SECURITY DEFINER будут выполняться с правами service role
-- =====================================================================================

-- Удаляем старые политики
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service role can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- ✅ Пользователи могут просматривать свой профиль
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- ✅ Пользователи могут обновлять свой профиль
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- ✅ Service role может вставлять профили (для триггера after_auth_user_created)
CREATE POLICY "Service role can insert profiles"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ✅ КРИТИЧЕСКИ ВАЖНО: Service role может обновлять любые профили
-- Это нужно для SECURITY DEFINER функций (create_user_order, cancel_order и т.д.)
CREATE POLICY "Service role can update profiles"
  ON public.profiles
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ✅ Админы могут просматривать все профили
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.current_user_has_role_internal('admin'));

-- ✅ Админы могут обновлять все профили
CREATE POLICY "Admins can update all profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.current_user_has_role_internal('admin'));

COMMENT ON TABLE public.profiles IS
'Профили пользователей с бонусной системой.

RLS политики:
- Пользователи могут видеть и редактировать только свой профиль
- Service role может обновлять любые профили (для SECURITY DEFINER функций)
- Админы могут видеть и редактировать все профили

ИСПРАВЛЕНИЕ v1.1 (2026-01-05):
  - Добавлена политика "Service role can update profiles" для корректной работы SECURITY DEFINER функций
  - Это необходимо для списания бонусов в create_user_order и отката в cancel_order';
