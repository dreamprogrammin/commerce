-- Миграция: <timestamp>_create_profiles_table_and_auth_trigger.sql

-- Расширение для генерации UUID, если его еще нет (обычно в Supabase уже есть)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- 1. Создаем таблицу public.profiles
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    email TEXT UNIQUE, -- Если вы хотите хранить и делать email уникальным также в profiles
    phone TEXT,
    role TEXT DEFAULT 'user' NOT NULL CHECK (role IN ('user', 'admin', 'editor')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.profiles IS 'Профили пользователей, связанные с auth.users, содержат дополнительную информацию и роль.';
COMMENT ON COLUMN public.profiles.id IS 'Внешний ключ, ссылающийся на auth.users.id.';
COMMENT ON COLUMN public.profiles.role IS 'Роль пользователя в системе (user, admin, editor).';

-- Индексы для profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- 2. Создаем функцию для автоматического обновления 'updated_at'
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = '' -- Безопасный search_path, т.к. функция использует только NEW и now()
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- 3. Создаем триггер для 'updated_at' на таблице 'profiles'
CREATE TRIGGER trigger_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Создаем триггерную функцию для создания профиля при регистрации нового пользователя
CREATE OR REPLACE FUNCTION public.handle_new_user_profile_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Важно для прав на вставку в public.profiles
SET search_path = public -- Указываем схему по умолчанию для функции, т.к. она делает INSERT в public.profiles
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, first_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[PROFILE_CREATION_TRIGGER] Ошибка при создании профиля для user_id %: SQLSTATE: %, SQLERRM: %',
                   NEW.id, SQLSTATE, SQLERRM;
    RETURN NEW; -- Не прерываем регистрацию из-за ошибки в профиле
END;
$$;

-- 5. Создаем триггер на таблице auth.users, который вызывает эту функцию
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile_creation();

--COMMENT ON FUNCTION public.handle_new_user_profile_creation() IS 'Создает запись в public.profiles при регистрации нового пользователя в auth.users.';
--sCOMMENT ON TRIGGER on_auth_user_created ON auth.users IS 'Автоматически создает профиль пользователя в public.profiles после его регистрации в auth.users.';

-- 6. Включаем RLS для таблицы profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 7. Создаем функцию для проверки роли (если она еще не создана другой миграцией)
-- Эта функция будет использоваться RLS политиками других таблиц и новым триггером
CREATE OR REPLACE FUNCTION public.current_user_has_role_internal(required_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public -- Для доступа к public.profiles
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.id = auth.uid() AND pr.role = lower(required_role)
  );
$$;
GRANT EXECUTE ON FUNCTION public.current_user_has_role_internal(TEXT) TO authenticated;


-- 8. Создаем триггерную функцию для защиты поля 'role' от изменения не-админами
CREATE OR REPLACE FUNCTION public.protect_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        IF NOT public.current_user_has_role_internal('admin') THEN
            RAISE EXCEPTION 'У вас нет прав на изменение роли пользователя.';
            -- Или альтернатива:
            -- NEW.role = OLD.role; -- Тихо отменяем изменение роли
            -- RAISE NOTICE 'Попытка не-администратора изменить роль для user_id % отклонена. Роль оставлена: %', OLD.id, OLD.role;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
GRANT EXECUTE ON FUNCTION public.protect_profile_role_update() TO authenticated;

-- 9. Создаем триггер на public.profiles для защиты роли
DROP TRIGGER IF EXISTS trigger_protect_profile_role_update ON public.profiles;
CREATE TRIGGER trigger_protect_profile_role_update
    BEFORE UPDATE OF role ON public.profiles -- Срабатывает только при попытке обновить колонку 'role'
    FOR EACH ROW
    WHEN (OLD.role IS DISTINCT FROM NEW.role) -- Только если значение роли действительно меняется
    EXECUTE FUNCTION public.protect_profile_role_update();


-- 10. Создаем базовые RLS политики для profiles (теперь проще для UPDATE)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
    ON public.profiles
    FOR SELECT
    USING ( auth.uid() = id );

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles
    FOR UPDATE
    USING ( auth.uid() = id ) -- Пользователь может обновлять строки, где он владелец
    WITH CHECK ( auth.uid() = id ); -- И он может изменять только свои строки

-- (Политики для INSERT и DELETE как раньше, если нужны)

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
    ON public.profiles
    FOR SELECT
    USING ( public.current_user_has_role_internal('admin') );

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
    ON public.profiles
    FOR UPDATE
    USING ( public.current_user_has_role_internal('admin') )
    WITH CHECK ( public.current_user_has_role_internal('admin') );

-- (Политика для админского DELETE, если нужна)
-- DROP POLICY IF EXISTS "Admins can delete any profile" ON public.profiles;
-- CREATE POLICY "Admins can delete any profile"
--     ON public.profiles
--     FOR DELETE
--     USING ( public.current_user_has_role_internal('admin') );