-- =====================================================================================
-- УПРОЩЕННАЯ ЛОГИКА РЕГИСТРАЦИИ
-- Убираем анонимных пользователей, оставляем только привязку гостевых заказов
-- =====================================================================================

-- === 1. УДАЛЯЕМ СТАРЫЕ ФУНКЦИИ СЛИЯНИЯ ===
DROP FUNCTION IF EXISTS public.merge_anon_user_into_real_user(UUID, UUID);

-- === 2. ОБНОВЛЯЕМ ТРИГГЕР СОЗДАНИЯ ПРОФИЛЯ ===
-- Теперь он только создает профиль и привязывает старые гостевые заказы
CREATE OR REPLACE FUNCTION public.handle_new_user_profile_creation()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path TO 'public' 
AS $$
DECLARE
    linked_bonuses INT := 0;
    order_record RECORD;
BEGIN
    -- Создаем профиль (бонусы выдаст другой триггер grant_welcome_bonus)
    INSERT INTO public.profiles (
        id, 
        first_name, 
        role
    )
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name', 
            NEW.raw_user_meta_data->>'name',
            'Новый пользователь'
        ),
        'user'
    );

    -- Привязываем все старые гостевые заказы по email
    IF NEW.email IS NOT NULL THEN
        FOR order_record IN 
            SELECT id, bonuses_awarded, status
            FROM public.orders
            WHERE LOWER(guest_email) = LOWER(NEW.email)
            AND user_id IS NULL
            AND status != 'cancelled'
        LOOP
            -- Привязываем заказ
            UPDATE public.orders
            SET user_id = NEW.id
            WHERE id = order_record.id;

            -- Если заказ подтвержден, начисляем бонусы
            IF order_record.status = 'confirmed' THEN
                linked_bonuses := linked_bonuses + order_record.bonuses_awarded;
                
                -- Устанавливаем дату активации
                UPDATE public.orders
                SET bonuses_activation_date = now() + interval '14 days'
                WHERE id = order_record.id;
            END IF;
        END LOOP;

        -- Добавляем бонусы за старые заказы к профилю
        IF linked_bonuses > 0 THEN
            UPDATE public.profiles
            SET pending_bonus_balance = pending_bonus_balance + linked_bonuses
            WHERE id = NEW.id;

            RAISE NOTICE 'Привязано старых заказов с бонусами: %', linked_bonuses;
        END IF;
    END IF;
        
    RETURN NEW;
END;
$$;

-- === 3. ПРОВЕРЯЕМ ТРИГГЕР НА AUTH.USERS ===
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile_creation();

-- =====================================================================================
-- ВАЖНО: Приветственный бонус 1000 выдается отдельным триггером grant_welcome_bonus()
-- который срабатывает при INSERT в таблицу profiles
-- =====================================================================================