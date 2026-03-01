-- =====================================================================================
-- FIX: Добавление колонки avatar_url в public.profiles
-- Проблема: reviewsStore запрашивал avatar_url через PostgREST JOIN,
--           но колонки не существовало → ошибка 42703
-- Решение: Добавляем колонку, обновляем триггеры, бэкфиллируем существующих юзеров
-- =====================================================================================


-- =====================================================================================
-- ШАГ 1: Добавляем колонку
-- =====================================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;


-- =====================================================================================
-- ШАГ 2: Обновляем handle_new_user() — сохраняем аватарку при регистрации
-- Google OAuth передаёт URL картинки в raw_user_meta_data как 'avatar_url' или 'picture'
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
  v_avatar_url TEXT;
BEGIN
  v_first_name := COALESCE(
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'first_name', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name',  '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'name',       '')), ''),
    NULLIF(TRIM(COALESCE(split_part(COALESCE(NEW.email, ''), '@', 1), '')), ''),
    'Гость'
  );

  v_last_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'last_name', '')), '');

  -- Google OAuth: пробуем 'avatar_url', затем 'picture'
  v_avatar_url := COALESCE(
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'picture',    '')), '')
  );

  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    phone,
    avatar_url,
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
    v_avatar_url,
    'user',
    0,
    0,
    FALSE
  )
  ON CONFLICT (id) DO UPDATE
    SET avatar_url = EXCLUDED.avatar_url
    WHERE profiles.avatar_url IS NULL AND EXCLUDED.avatar_url IS NOT NULL;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] Failed to create profile for user %: % (SQLSTATE: %)',
      NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Создаёт профиль для нового пользователя после OAuth/email регистрации. '
  'Сохраняет avatar_url из Google OAuth (поля avatar_url или picture). '
  'Никогда не блокирует авторизацию (EXCEPTION handler).';


-- =====================================================================================
-- ШАГ 3: Обновляем ensure_profile_exists() — тоже сохраняем аватарку
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
  v_avatar_url TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация (auth.uid() is NULL)';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF v_profile IS NOT NULL THEN
    -- Если профиль есть, но аватарка пустая — попробуем обновить из auth.users
    IF v_profile.avatar_url IS NULL THEN
      UPDATE public.profiles p
      SET avatar_url = COALESCE(
        NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'avatar_url', '')), ''),
        NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'picture',    '')), '')
      )
      FROM auth.users u
      WHERE p.id = v_user_id AND u.id = v_user_id
        AND (
          NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'avatar_url', '')), '') IS NOT NULL
          OR NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'picture',    '')), '') IS NOT NULL
        );

      SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
    END IF;
    RETURN v_profile;
  END IF;

  SELECT
    COALESCE(
      NULLIF(TRIM(COALESCE(raw_user_meta_data->>'first_name', '')), ''),
      NULLIF(TRIM(COALESCE(raw_user_meta_data->>'full_name',  '')), ''),
      NULLIF(TRIM(COALESCE(raw_user_meta_data->>'name',       '')), ''),
      NULLIF(TRIM(COALESCE(split_part(COALESCE(email, ''), '@', 1), '')), ''),
      'Гость'
    ),
    NULLIF(TRIM(COALESCE(raw_user_meta_data->>'last_name', '')), ''),
    phone,
    COALESCE(
      NULLIF(TRIM(COALESCE(raw_user_meta_data->>'avatar_url', '')), ''),
      NULLIF(TRIM(COALESCE(raw_user_meta_data->>'picture',    '')), '')
    )
  INTO v_first_name, v_last_name, v_phone, v_avatar_url
  FROM auth.users
  WHERE id = v_user_id;

  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    phone,
    avatar_url,
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
    v_avatar_url,
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

GRANT EXECUTE ON FUNCTION public.ensure_profile_exists() TO authenticated;

COMMENT ON FUNCTION public.ensure_profile_exists() IS
  'Client-side fallback: создаёт профиль для текущего авторизованного пользователя. '
  'Сохраняет avatar_url из Google OAuth. Идемпотентна.';


-- =====================================================================================
-- ШАГ 4: Бэкфилл — заполняем avatar_url для существующих профилей
-- =====================================================================================

UPDATE public.profiles p
SET avatar_url = COALESCE(
  NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'avatar_url', '')), ''),
  NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'picture',    '')), '')
)
FROM auth.users u
WHERE p.id = u.id
  AND p.avatar_url IS NULL
  AND (
    NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'avatar_url', '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'picture',    '')), '') IS NOT NULL
  );


-- =====================================================================================
-- ШАГ 5: Перезагружаем схему PostgREST
-- =====================================================================================

NOTIFY pgrst, 'reload schema';
