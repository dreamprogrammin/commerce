-- =====================================================================================
-- FEATURE: Умный парсинг имени и фамилии из Google OAuth
-- Проблема: Google передаёт полное имя одной строкой в full_name ("Иван Иванов"),
--           а предыдущие триггеры записывали всю строку в first_name.
-- Решение: Разбиваем full_name по первому пробелу → first_name + last_name.
--          Приоритет: явные first_name/last_name поля > split(full_name/name) > email > 'Гость'
-- =====================================================================================


-- =====================================================================================
-- ШАГ 1: Обновляем handle_new_user() — умный парсинг имени
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
  v_full_name  TEXT;
  v_avatar_url TEXT;
BEGIN
  -- Пробуем явные поля first_name / last_name (некоторые провайдеры их отдают напрямую)
  v_first_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'first_name', '')), '');
  v_last_name  := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'last_name',  '')), '');

  -- Если явного first_name нет — берём full_name или name и разбиваем по первому пробелу
  IF v_first_name IS NULL THEN
    v_full_name := NULLIF(TRIM(COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      ''
    )), '');

    IF v_full_name IS NOT NULL THEN
      IF position(' ' IN v_full_name) > 0 THEN
        -- "Иван Иванов" → first_name="Иван", last_name="Иванов"
        -- Берём substring после первого пробела — покрывает двойные фамилии: "Мария Иванова-Петрова"
        v_first_name := split_part(v_full_name, ' ', 1);
        v_last_name  := NULLIF(TRIM(substring(v_full_name FROM position(' ' IN v_full_name) + 1)), '');
      ELSE
        -- Одно слово — всё в first_name, last_name не трогаем
        v_first_name := v_full_name;
      END IF;
    END IF;
  END IF;

  -- Финальный фолбэк: email-префикс или 'Гость'
  IF v_first_name IS NULL THEN
    v_first_name := COALESCE(
      NULLIF(TRIM(split_part(COALESCE(NEW.email, ''), '@', 1)), ''),
      'Гость'
    );
  END IF;

  -- Google OAuth: аватарка передаётся как 'avatar_url' или 'picture'
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
  'Создаёт профиль при OAuth-регистрации. '
  'Приоритет имени: explicit first_name → split(full_name/name) → email_prefix → Гость. '
  'Сохраняет avatar_url из Google OAuth.';


-- =====================================================================================
-- ШАГ 2: Обновляем ensure_profile_exists() — та же логика разбивки
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
  v_full_name  TEXT;
  v_phone      TEXT;
  v_avatar_url TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация (auth.uid() is NULL)';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF v_profile IS NOT NULL THEN
    -- Профиль есть, но без аватарки — пробуем заполнить
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

  -- Профиля нет — создаём с умным парсингом имени
  SELECT
    raw_user_meta_data->>'first_name',
    raw_user_meta_data->>'last_name',
    TRIM(COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', '')),
    phone,
    COALESCE(
      NULLIF(TRIM(COALESCE(raw_user_meta_data->>'avatar_url', '')), ''),
      NULLIF(TRIM(COALESCE(raw_user_meta_data->>'picture',    '')), '')
    )
  INTO v_first_name, v_last_name, v_full_name, v_phone, v_avatar_url
  FROM auth.users
  WHERE id = v_user_id;

  -- Нормализуем first_name
  v_first_name := NULLIF(TRIM(COALESCE(v_first_name, '')), '');
  v_last_name  := NULLIF(TRIM(COALESCE(v_last_name,  '')), '');

  IF v_first_name IS NULL THEN
    v_full_name := NULLIF(v_full_name, '');
    IF v_full_name IS NOT NULL THEN
      IF position(' ' IN v_full_name) > 0 THEN
        v_first_name := split_part(v_full_name, ' ', 1);
        v_last_name  := NULLIF(TRIM(substring(v_full_name FROM position(' ' IN v_full_name) + 1)), '');
      ELSE
        v_first_name := v_full_name;
      END IF;
    END IF;
  END IF;

  IF v_first_name IS NULL THEN
    SELECT COALESCE(
      NULLIF(TRIM(split_part(COALESCE(email, ''), '@', 1)), ''),
      'Гость'
    ) INTO v_first_name FROM auth.users WHERE id = v_user_id;
  END IF;

  INSERT INTO public.profiles (
    id, first_name, last_name, phone, avatar_url,
    role, active_bonus_balance, pending_bonus_balance, has_received_welcome_bonus
  )
  VALUES (
    v_user_id, v_first_name, v_last_name, v_phone, v_avatar_url,
    'user', 0, 0, FALSE
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
  'Client-side fallback: создаёт профиль с умным парсингом имени из OAuth-метадаты. '
  'Идемпотентна. Не трогает уже заполненный профиль (только дополняет avatar_url).';


-- =====================================================================================
-- ШАГ 3: Бэкфилл существующих пользователей
-- Обновляем только тех, у кого first_name = 'Гость', NULL или пустая строка,
-- И у кого в auth.users есть данные для парсинга.
-- Пользователи с реальными именами НЕ затрагиваются.
-- =====================================================================================

WITH parsed_names AS (
  SELECT
    u.id,
    -- first_name: явное → split(full_name) → email → 'Гость'
    CASE
      WHEN NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'first_name', '')), '') IS NOT NULL
        THEN NULLIF(TRIM(u.raw_user_meta_data->>'first_name'), '')

      WHEN NULLIF(TRIM(COALESCE(
          u.raw_user_meta_data->>'full_name',
          u.raw_user_meta_data->>'name',
          ''
        )), '') IS NOT NULL
        AND position(' ' IN TRIM(COALESCE(
          u.raw_user_meta_data->>'full_name',
          u.raw_user_meta_data->>'name',
          ''
        ))) > 0
        THEN split_part(
          TRIM(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')),
          ' ', 1
        )

      WHEN NULLIF(TRIM(COALESCE(
          u.raw_user_meta_data->>'full_name',
          u.raw_user_meta_data->>'name',
          ''
        )), '') IS NOT NULL
        THEN TRIM(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'))

      ELSE COALESCE(NULLIF(TRIM(split_part(COALESCE(u.email, ''), '@', 1)), ''), 'Гость')
    END AS new_first_name,

    -- last_name: явное → substring после пробела в full_name → NULL
    CASE
      WHEN NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'last_name', '')), '') IS NOT NULL
        THEN NULLIF(TRIM(u.raw_user_meta_data->>'last_name'), '')

      WHEN NULLIF(TRIM(COALESCE(
          u.raw_user_meta_data->>'full_name',
          u.raw_user_meta_data->>'name',
          ''
        )), '') IS NOT NULL
        AND position(' ' IN TRIM(COALESCE(
          u.raw_user_meta_data->>'full_name',
          u.raw_user_meta_data->>'name',
          ''
        ))) > 0
        THEN NULLIF(TRIM(substring(
          TRIM(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')),
          position(' ' IN TRIM(COALESCE(
            u.raw_user_meta_data->>'full_name',
            u.raw_user_meta_data->>'name',
            ''
          ))) + 1
        )), '')

      ELSE NULL
    END AS new_last_name
  FROM auth.users u
  -- Только пользователи с данными для парсинга
  WHERE (
    NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'first_name', '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'full_name', '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'name',      '')), '') IS NOT NULL
  )
)
UPDATE public.profiles p
SET
  first_name = parsed_names.new_first_name,
  last_name  = parsed_names.new_last_name
FROM parsed_names
WHERE p.id = parsed_names.id
  -- Обновляем только профили с пустым/дефолтным именем
  AND (p.first_name IS NULL OR TRIM(p.first_name) = '' OR p.first_name = 'Гость')
  -- Не записываем 'Гость' — это бессмысленный апдейт
  AND parsed_names.new_first_name != 'Гость';


-- =====================================================================================
-- ШАГ 4: Перезагрузка схемы PostgREST (на случай изменений)
-- =====================================================================================

NOTIFY pgrst, 'reload schema';
