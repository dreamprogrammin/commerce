-- =====================================================================================
-- Миграция: Автоматическое создание профиля при регистрации
-- Для Supabase CLI (локальная и продуктовая БД)
-- =====================================================================================

-- 1. Создаем функцию с правильными настройками безопасности
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    first_name,
    role,
    active_bonus_balance,
    pending_bonus_balance,
    has_received_welcome_bonus
  )
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'first_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    'user',
    0,
    0,
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- 2. Даем необходимые права на функцию
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;

-- 3. Комментарий к функции
COMMENT ON FUNCTION public.handle_new_user() IS 
'Автоматически создает профиль пользователя при регистрации';

-- 4. Создаем триггер с повышенными привилегиями
DO $$
BEGIN
  -- Удаляем старый триггер если существует
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  
  -- Создаем новый триггер
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
    
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Недостаточно прав для создания триггера. Используйте Dashboard.';
  WHEN OTHERS THEN
    RAISE NOTICE 'Ошибка при создании триггера: %', SQLERRM;
END $$;