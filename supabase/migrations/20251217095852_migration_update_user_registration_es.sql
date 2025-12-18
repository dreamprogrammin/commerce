-- =====================================================================================
-- МАКСИМАЛЬНО ПРОСТАЯ ЛОГИКА РЕГИСТРАЦИИ (ИСПРАВЛЕННАЯ)
-- =====================================================================================

-- === 1. ВАЖНО: СНАЧАЛА УДАЛЯЕМ ТРИГГЕРЫ ===
-- Удаляем триггер с таблицы auth.users, чтобы он "отпустил" функцию
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- === 2. ТЕПЕРЬ МОЖНО УДАЛЯТЬ ФУНКЦИИ ===
DROP FUNCTION IF EXISTS public.handle_new_user_profile_creation();
DROP FUNCTION IF EXISTS public.merge_anon_user_into_real_user(UUID, UUID);
DROP FUNCTION IF EXISTS public.find_guest_orders_by_email(TEXT);
DROP FUNCTION IF EXISTS public.link_guest_orders_to_user(TEXT);
DROP FUNCTION IF EXISTS public.get_user_emails();

-- === 3. НАСТРАИВАЕМ ПРИВЕТСТВЕННЫЙ БОНУС ===

-- Проверяем/обновляем функцию выдачи бонуса
CREATE OR REPLACE FUNCTION public.grant_welcome_bonus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Выдаем 1000 бонусов новому пользователю при создании профиля
  NEW.pending_bonus_balance := 1000;
  NEW.has_received_welcome_bonus := TRUE;
  
  RETURN NEW;
END;
$$;

-- Пересоздаем триггер на таблице profiles
DROP TRIGGER IF EXISTS on_profile_created_grant_bonus ON public.profiles;

CREATE TRIGGER on_profile_created_grant_bonus
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_welcome_bonus();