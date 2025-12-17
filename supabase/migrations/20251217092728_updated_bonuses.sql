-- =====================================================================================
-- 🎁 АВТОМАТИЧЕСКАЯ ВЫДАЧА 1000 БОНУСОВ ПРИ РЕГИСТРАЦИИ
-- =====================================================================================

-- Функция для выдачи приветственного бонуса
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

-- Триггер на создание профиля
DROP TRIGGER IF EXISTS on_profile_created_grant_bonus ON public.profiles;

CREATE TRIGGER on_profile_created_grant_bonus
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_welcome_bonus();

-- =====================================================================================
-- 📝 ВАЖНО: Бонусы переходят в active_bonus_balance через 14 дней
-- Это делает отдельная функция activate_pending_bonuses()
-- =====================================================================================