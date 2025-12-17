-- =====================================================================================
-- МАКСИМАЛЬНО ПРОСТАЯ ЛОГИКА РЕГИСТРАЦИИ
-- Только приветственный бонус 1000, никакой привязки гостевых заказов
-- =====================================================================================

-- === 1. УДАЛЯЕМ ВСЕ СТАРЫЕ ФУНКЦИИ ===
DROP FUNCTION IF EXISTS public.merge_anon_user_into_real_user(UUID, UUID);
DROP FUNCTION IF EXISTS public.handle_new_user_profile_creation();
DROP FUNCTION IF EXISTS public.find_guest_orders_by_email(TEXT);
DROP FUNCTION IF EXISTS public.link_guest_orders_to_user(TEXT);
DROP FUNCTION IF EXISTS public.get_user_emails();

-- === 2. УДАЛЯЕМ СТАРЫЕ ТРИГГЕРЫ ===
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- === 3. ПРОВЕРЯЕМ ТРИГГЕР НА ПРИВЕТСТВЕННЫЙ БОНУС ===
-- Этот триггер должен быть единственным способом создания профиля
-- Он срабатывает при INSERT в profiles и выдает 1000 бонусов

-- Проверяем, что функция grant_welcome_bonus() существует
CREATE OR REPLACE FUNCTION public.grant_welcome_bonus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Выдаем 1000 бонусов новому пользователю
  NEW.pending_bonus_balance := 1000;
  NEW.has_received_welcome_bonus := TRUE;
  
  RETURN NEW;
END;
$$;

-- Проверяем, что триггер существует
DROP TRIGGER IF EXISTS on_profile_created_grant_bonus ON public.profiles;

CREATE TRIGGER on_profile_created_grant_bonus
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_welcome_bonus();

-- =====================================================================================
-- ВАЖНО: 
-- - Профиль создается ТОЛЬКО когда пользователь сам регистрируется через OAuth
-- - Гостевые заказы просто хранятся с guest_email, user_id = NULL
-- - Никакой автоматической привязки заказов НЕТ
-- =====================================================================================