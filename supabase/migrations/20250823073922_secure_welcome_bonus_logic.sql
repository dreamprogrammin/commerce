-- Назначение: Добавление проверки флага `has_received_welcome_bonus`
-- для предотвращения повторного начисления приветственных бонусов.

-- === 1. Обновляем триггер ОБЫЧНОЙ регистрации ===
CREATE OR REPLACE FUNCTION public.handle_new_user_profile_creation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
    -- Создаем профиль, но БЕЗ начисления бонусов.
    -- Бонусы будут начислены только если профиль действительно новый.
    INSERT INTO public.profiles (id, first_name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        'user'
    )
    -- `ON CONFLICT DO NOTHING` - если профиль уже есть (например, после слияния),
    -- мы его не трогаем.
    ON CONFLICT (id) DO NOTHING;

    -- Начисляем бонус, ТОЛЬКО ЕСЛИ профиль был только что создан.
    -- `INSERT ... RETURNING id` вернет `id`, если вставка была, и ничего - если нет.
    IF FOUND THEN
        UPDATE public.profiles
        SET
            pending_bonus_balance = 1000,
            has_received_welcome_bonus = TRUE
        WHERE id = NEW.id;
    END IF;

    -- Привязка старых гостевых заказов (логика без изменений)
    UPDATE public.orders
    SET user_id = NEW.id
    WHERE guest_email = NEW.email AND user_id IS NULL;
        
    RETURN NEW;
END;
$$;


-- === 2. Обновляем функцию СЛИЯНИЯ анонимного аккаунта ===
CREATE OR REPLACE FUNCTION public.merge_anon_user_into_real_user(
    old_anon_user_id UUID,
    new_real_user_id UUID
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    anon_profile_data RECORD;
    real_user_profile RECORD;
BEGIN
    -- 1. Получаем оба профиля
    SELECT * INTO anon_profile_data FROM public.profiles WHERE id = old_anon_user_id;
    SELECT * INTO real_user_profile FROM public.profiles WHERE id = new_real_user_id;

    -- 2. Перепривязываем заказы
    UPDATE public.orders SET user_id = new_real_user_id WHERE user_id = old_anon_user_id;
    
    -- 3. Удаляем профиль анонима
    IF anon_profile_data IS NOT NULL THEN
        DELETE FROM public.profiles WHERE id = old_anon_user_id;
    END IF;
    
    -- 4. === ГЛАВНАЯ ПРОВЕРКА ===
    -- Начисляем приветственный бонус, ТОЛЬКО ЕСЛИ у реального пользователя
    -- еще НЕТ флага о его получении.
    IF real_user_profile IS NOT NULL AND real_user_profile.has_received_welcome_bonus = FALSE THEN
        UPDATE public.profiles
        SET
            -- Добавляем 1000 бонусов к его отложенному балансу
            pending_bonus_balance = COALESCE(real_user_profile.pending_bonus_balance, 0) + 1000,
            -- И ставим флаг
            has_received_welcome_bonus = TRUE
        WHERE id = new_real_user_id;
    END IF;

    -- 5. Удаляем старого анонимного пользователя из auth.users
    DELETE FROM auth.users WHERE id = old_anon_user_id;
    
    RETURN 'Пользователь ' || old_anon_user_id || ' успешно слит в ' || new_real_user_id;
END;
$$;