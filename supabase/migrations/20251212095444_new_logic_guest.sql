-- =====================================================================================
-- Функционал для привязки гостевых заказов к зарегистрированному пользователю
-- Решает проблему разных email при оформлении и регистрации
-- =====================================================================================

-- === 1. RPC-ФУНКЦИЯ ДЛЯ ПОИСКА ГОСТЕВЫХ ЗАКАЗОВ ПО EMAIL ===
CREATE OR REPLACE FUNCTION public.find_guest_orders_by_email(p_email TEXT)
RETURNS TABLE(
    order_id UUID,
    guest_name TEXT,
    guest_email TEXT,
    guest_phone TEXT,
    total_amount NUMERIC,
    bonuses_awarded INT,
    created_at TIMESTAMPTZ,
    items_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.guest_name,
        o.guest_email,
        o.guest_phone,
        o.final_amount,
        o.bonuses_awarded,
        o.created_at,
        COUNT(oi.id) as items_count
    FROM public.orders o
    LEFT JOIN public.order_items oi ON oi.order_id = o.id
    WHERE 
        LOWER(o.guest_email) = LOWER(p_email)
        AND o.user_id IS NULL  -- Только гостевые заказы
        AND o.status != 'cancelled'  -- Исключаем отмененные
    GROUP BY o.id, o.guest_name, o.guest_email, o.guest_phone, o.final_amount, o.bonuses_awarded, o.created_at
    ORDER BY o.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.find_guest_orders_by_email IS 
'Ищет гостевые заказы по email для ручной привязки к аккаунту';


-- === 2. RPC-ФУНКЦИЯ ДЛЯ ПРИВЯЗКИ ЗАКАЗОВ К ТЕКУЩЕМУ ПОЛЬЗОВАТЕЛЮ ===
CREATE OR REPLACE FUNCTION public.link_guest_orders_to_user(p_email TEXT)
RETURNS TABLE(
    linked_orders INT,
    total_bonuses_awarded INT,
    message TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    linked_count INT := 0;
    total_bonuses INT := 0;
    order_record RECORD;
BEGIN
    -- Проверка авторизации
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Необходимо войти в систему';
    END IF;

    -- Проверяем, есть ли такие заказы
    IF NOT EXISTS (
        SELECT 1 FROM public.orders 
        WHERE LOWER(guest_email) = LOWER(p_email) 
        AND user_id IS NULL
    ) THEN
        RETURN QUERY SELECT 0, 0, 'Заказы с таким email не найдены'::TEXT;
        RETURN;
    END IF;

    -- Привязываем все гостевые заказы с указанным email к текущему пользователю
    FOR order_record IN 
        SELECT id, bonuses_awarded, status
        FROM public.orders
        WHERE LOWER(guest_email) = LOWER(p_email)
        AND user_id IS NULL
        AND status != 'cancelled'
    LOOP
        -- Привязываем заказ
        UPDATE public.orders
        SET user_id = current_user_id
        WHERE id = order_record.id;

        linked_count := linked_count + 1;

        -- Если заказ был подтвержден, начисляем бонусы в pending
        IF order_record.status = 'confirmed' THEN
            total_bonuses := total_bonuses + order_record.bonuses_awarded;
            
            UPDATE public.profiles
            SET pending_bonus_balance = pending_bonus_balance + order_record.bonuses_awarded
            WHERE id = current_user_id;

            -- Устанавливаем дату активации (14 дней от сейчас)
            UPDATE public.orders
            SET bonuses_activation_date = now() + interval '14 days'
            WHERE id = order_record.id;
        END IF;
    END LOOP;

    RETURN QUERY SELECT 
        linked_count, 
        total_bonuses,
        format('Успешно привязано %s заказов, начислено %s бонусов', linked_count, total_bonuses)::TEXT;
END;
$$;

COMMENT ON FUNCTION public.link_guest_orders_to_user IS 
'Привязывает гостевые заказы с указанным email к текущему пользователю и начисляет бонусы';


-- === 3. ОБНОВЛЯЕМ ТРИГГЕР СОЗДАНИЯ ПРОФИЛЯ ===
-- Теперь он ищет заказы по нескольким email (если есть в metadata)
CREATE OR REPLACE FUNCTION public.handle_new_user_profile_creation()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path TO 'public' 
AS $$
DECLARE
    guest_orders_count INT;
    linked_bonuses INT := 0;
    order_record RECORD;
BEGIN
    -- Создаем профиль с приветственным бонусом
    INSERT INTO public.profiles (
        id, 
        first_name, 
        role,
        pending_bonus_balance,
        has_received_welcome_bonus
    )
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name', 
            NEW.raw_user_meta_data->>'name',
            'Новый пользователь'
        ),
        'user',
        1000,  -- Приветственный бонус
        TRUE
    );

    -- Привязываем все старые гостевые заказы по email
    IF NEW.email IS NOT NULL THEN
        -- Обновляем заказы и считаем бонусы
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


-- === 4. ФУНКЦИЯ ДЛЯ ПОЛУЧЕНИЯ СПИСКА ВСЕХ EMAIL ПОЛЬЗОВАТЕЛЯ ===
-- Полезно для поиска заказов по альтернативным адресам
CREATE OR REPLACE FUNCTION public.get_user_emails()
RETURNS TABLE(
    primary_email TEXT,
    alternative_emails TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    user_email TEXT;
    order_emails TEXT[];
BEGIN
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Необходимо войти в систему';
    END IF;

    -- Получаем основной email
    SELECT email INTO user_email
    FROM auth.users
    WHERE id = current_user_id;

    -- Получаем все уникальные email из заказов пользователя
    SELECT array_agg(DISTINCT guest_email)
    INTO order_emails
    FROM public.orders
    WHERE user_id = current_user_id
    AND guest_email IS NOT NULL
    AND LOWER(guest_email) != LOWER(user_email);

    RETURN QUERY SELECT user_email, order_emails;
END;
$$;

COMMENT ON FUNCTION public.get_user_emails IS 
'Возвращает основной email пользователя и список email из его заказов';


-- === 5. ПРАВА ДОСТУПА ===
GRANT EXECUTE ON FUNCTION public.find_guest_orders_by_email(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_guest_orders_to_user(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_emails() TO authenticated;


-- =====================================================================================
-- КОНЕЦ
-- =====================================================================================