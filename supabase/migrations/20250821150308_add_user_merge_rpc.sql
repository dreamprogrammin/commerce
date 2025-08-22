-- Назначение: Создание RPC-функции для "слияния" анонимного
-- пользователя с новым, зарегистрированным через OAuth.
-- Это позволяет сохранить гостевую корзину и другие данные.

CREATE OR REPLACE FUNCTION public.merge_anon_user_into_real_user(
    old_anon_user_id UUID,
    new_real_user_id UUID
)
RETURNS TEXT -- Возвращаем сообщение для отладки
LANGUAGE plpgsql
-- SECURITY DEFINER - КРИТИЧЕСКИ ВАЖНО!
-- Дает функции права супер-администратора для работы с `auth.users`.
SECURITY DEFINER
AS $$
DECLARE
    anon_profile_exists BOOLEAN;
BEGIN
    -- 1. Перепривязываем все заказы со старого анонимного ID на новый реальный ID.
    UPDATE public.orders
    SET user_id = new_real_user_id
    WHERE user_id = old_anon_user_id;

    -- 2. "Сливаем" профили.
    -- Проверяем, есть ли вообще профиль у анонимного пользователя.
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = old_anon_user_id) INTO anon_profile_exists;

    IF anon_profile_exists THEN
        -- Удаляем новый, автоматически созданный пустой профиль для real_user.
        DELETE FROM public.profiles WHERE id = new_real_user_id;
        
        -- "Переименовываем" старый анонимный профиль, присваивая ему новый ID.
        UPDATE public.profiles
        SET id = new_real_user_id
        WHERE id = old_anon_user_id;
    END IF;
    
    -- (Здесь в будущем можно добавить логику переноса других данных: избранное, отзывы и т.д.)
    
    -- 3. Удаляем старого анонимного пользователя из `auth.users`, чтобы не засорять базу.
    -- Это безопасная операция, так как все его данные уже "переехали".
    DELETE FROM auth.users WHERE id = old_anon_user_id;
    
    RETURN 'Пользователь ' || old_anon_user_id || ' успешно слит в ' || new_real_user_id;
END;
$$;

-- Не забываем дать права на выполнение этой функции авторизованным пользователям
GRANT EXECUTE ON FUNCTION public.merge_anon_user_into_real_user(UUID, UUID) TO authenticated;