-- =====================================================================================
-- ИСПРАВЛЕНИЕ: Google OAuth — профиль не создаётся при пустом имени пользователя
-- Проблема: Google не всегда передаёт full_name/name, из-за чего триггер
--           handle_new_user() мог вставить NULL или упасть с ошибкой,
--           блокируя весь OAuth-поток (500 от Supabase callback).
-- Решение:
--   1. Улучшен handle_new_user(): NULLIF+TRIM + 'Гость' как финальный fallback
--      + EXCEPTION WHEN OTHERS — гарантирует что авторизация ВСЕГДА завершается.
--   2. Пересоздан триггер on_auth_user_created.
--   3. Новая RPC ensure_profile_exists() для восстановления профиля на клиенте,
--      если триггер всё же не отработал.
--   4. Заполнение профилей для пользователей, у которых их нет.
-- =====================================================================================


-- =====================================================================================
-- ШАГ 1: ОБНОВЛЯЕМ ФУНКЦИЮ handle_new_user() — ЗАЩИТНАЯ ВЕРСИЯ
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_name TEXT;
  v_last_name  TEXT;
BEGIN
  -- NULLIF(TRIM(...), '') обрабатывает и NULL, и пустую строку ''.
  -- Цепочка COALESCE гарантирует: всегда будет непустое имя.
  v_first_name := COALESCE(
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'first_name', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name',  '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'name',       '')), ''),
    NULLIF(TRIM(COALESCE(split_part(COALESCE(NEW.email, ''), '@', 1), '')), ''),
    'Гость'
  );

  v_last_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'last_name', '')), '');

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
    v_last_name,
    NEW.phone,
    'user',
    0,
    0,
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    -- Критично: никогда не блокируем авторизацию из-за ошибки создания профиля.
    -- Клиент восстановит профиль через ensure_profile_exists() RPC.
    RAISE WARNING '[handle_new_user] Failed to create profile for user %: % (SQLSTATE: %)',
      NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Создаёт профиль для нового пользователя после OAuth/email регистрации. '
  'Использует цепочку COALESCE для имени и никогда не блокирует авторизацию (EXCEPTION handler).';


-- =====================================================================================
-- ШАГ 2: ПЕРЕСОЗДАЁМ ТРИГГЕР (гарантируем правильную функцию)
-- =====================================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- =====================================================================================
-- ШАГ 3: RPC ensure_profile_exists() — CLIENT-SIDE FALLBACK
-- Вызывается фронтендом, если после OAuth профиль так и не появился.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.ensure_profile_exists()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_profile    public.profiles;
  v_first_name TEXT;
  v_last_name  TEXT;
  v_phone      TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация (auth.uid() is NULL)';
  END IF;

  -- Возвращаем сразу, если профиль уже есть
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF v_profile IS NOT NULL THEN
    RETURN v_profile;
  END IF;

  -- Читаем данные из auth.users
  SELECT
    COALESCE(
      NULLIF(TRIM(COALESCE(raw_user_meta_data->>'first_name', '')), ''),
      NULLIF(TRIM(COALESCE(raw_user_meta_data->>'full_name',  '')), ''),
      NULLIF(TRIM(COALESCE(raw_user_meta_data->>'name',       '')), ''),
      NULLIF(TRIM(COALESCE(split_part(COALESCE(email, ''), '@', 1), '')), ''),
      'Гость'
    ),
    NULLIF(TRIM(COALESCE(raw_user_meta_data->>'last_name', '')), ''),
    phone
  INTO v_first_name, v_last_name, v_phone
  FROM auth.users
  WHERE id = v_user_id;

  -- Создаём профиль (только если всё ещё нет — двойная защита)
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
    v_user_id,
    v_first_name,
    v_last_name,
    v_phone,
    'user',
    0,
    0,
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Не удалось создать профиль для пользователя %', v_user_id;
  END IF;

  RETURN v_profile;
END;
$$;

-- Только авторизованные пользователи могут создавать себе профиль
GRANT EXECUTE ON FUNCTION public.ensure_profile_exists() TO authenticated;

COMMENT ON FUNCTION public.ensure_profile_exists() IS
  'Client-side fallback: создаёт профиль для текущего авторизованного пользователя, '
  'если триггер handle_new_user не отработал. Безопасно при повторных вызовах (идемпотентна).';


-- =====================================================================================
-- ШАГ 4: ЗАПОЛНЕНИЕ ПРОФИЛЕЙ ДЛЯ ПОЛЬЗОВАТЕЛЕЙ БЕЗ ПРОФИЛЯ
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
    NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'first_name', '')), ''),
    NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'full_name',  '')), ''),
    NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'name',       '')), ''),
    NULLIF(TRIM(COALESCE(split_part(COALESCE(u.email, ''), '@', 1), '')), ''),
    'Гость'
  ),
  NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'last_name', '')), ''),
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
-- ШАГ 5: ИСПРАВЛЯЕМ ПУСТЫЕ first_name ДЛЯ СУЩЕСТВУЮЩИХ ПРОФИЛЕЙ
-- (NULL или '' → 'Гость')
-- =====================================================================================

UPDATE public.profiles p
SET first_name = COALESCE(
  NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'first_name', '')), ''),
  NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'full_name',  '')), ''),
  NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'name',       '')), ''),
  NULLIF(TRIM(COALESCE(split_part(COALESCE(u.email, ''), '@', 1), '')), ''),
  'Гость'
)
FROM auth.users u
WHERE p.id = u.id
  AND (p.first_name IS NULL OR TRIM(p.first_name) = '');
