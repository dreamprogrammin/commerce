-- =====================================================================================
-- 🚀 БЫСТРЫЙ ФИКС: Одним запуском решаем все проблемы с bonus_balance
-- =====================================================================================

BEGIN;

-- === 1. ОБНОВЛЯЕМ СТРУКТУРУ ТАБЛИЦЫ ===
DO $$
BEGIN
    -- Проверяем, есть ли старая колонка
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'bonus_balance'
    ) THEN
        RAISE NOTICE '✅ Найдена старая колонка bonus_balance. Начинаем миграцию...';
        
        -- Добавляем новые колонки
        ALTER TABLE public.profiles 
            ADD COLUMN IF NOT EXISTS active_bonus_balance INT NOT NULL DEFAULT 0 CHECK (active_bonus_balance >= 0),
            ADD COLUMN IF NOT EXISTS pending_bonus_balance INT NOT NULL DEFAULT 0 CHECK (pending_bonus_balance >= 0),
            ADD COLUMN IF NOT EXISTS has_received_welcome_bonus BOOLEAN NOT NULL DEFAULT FALSE;
        
        RAISE NOTICE '✅ Новые колонки созданы';
        
        -- Переносим данные
        UPDATE public.profiles 
        SET 
            active_bonus_balance = COALESCE(bonus_balance, 0),
            has_received_welcome_bonus = CASE WHEN COALESCE(bonus_balance, 0) > 0 THEN TRUE ELSE FALSE END
        WHERE bonus_balance IS NOT NULL;
        
        RAISE NOTICE '✅ Данные перенесены';
        
        -- Удаляем старую колонку
        ALTER TABLE public.profiles DROP COLUMN bonus_balance;
        
        RAISE NOTICE '✅ Старая колонка удалена';
    ELSE
        RAISE NOTICE '✅ Колонка bonus_balance уже не существует. Проверяем новые колонки...';
        
        -- Просто убеждаемся, что новые колонки есть
        ALTER TABLE public.profiles 
            ADD COLUMN IF NOT EXISTS active_bonus_balance INT NOT NULL DEFAULT 0 CHECK (active_bonus_balance >= 0),
            ADD COLUMN IF NOT EXISTS pending_bonus_balance INT NOT NULL DEFAULT 0 CHECK (pending_bonus_balance >= 0),
            ADD COLUMN IF NOT EXISTS has_received_welcome_bonus BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

-- === 2. ОБНОВЛЯЕМ ФУНКЦИЮ CREATE_ORDER ===
CREATE OR REPLACE FUNCTION public.create_order(
    p_cart_items JSONB, 
    p_delivery_method TEXT, 
    p_payment_method TEXT,
    p_delivery_address JSONB DEFAULT NULL, 
    p_guest_info JSONB DEFAULT NULL, 
    p_bonuses_to_spend INT DEFAULT 0
)
RETURNS UUID 
LANGUAGE plpgsql 
VOLATILE 
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    user_profile RECORD;
    new_order_id UUID;
    total_price NUMERIC := 0;
    total_award_bonuses INT := 0;
    final_price NUMERIC;
    calculated_discount NUMERIC := 0;
    cart_item RECORD;
    product_record RECORD;
    bonus_rate NUMERIC;
BEGIN
    FOR cart_item IN 
        SELECT * FROM jsonb_to_recordset(p_cart_items) 
        AS x(product_id UUID, quantity INT) 
    LOOP
        SELECT price, bonus_points_award, stock_quantity
        INTO product_record 
        FROM public.products 
        WHERE id = cart_item.product_id AND is_active = TRUE;
        
        IF product_record IS NULL THEN 
            RAISE EXCEPTION 'Товар с ID % не найден или неактивен.', cart_item.product_id;
        END IF;
        
        total_price := total_price + (product_record.price * cart_item.quantity);
        total_award_bonuses := total_award_bonuses + (product_record.bonus_points_award * cart_item.quantity);
    END LOOP;

    IF current_user_id IS NOT NULL THEN
        SELECT * INTO user_profile FROM public.profiles WHERE id = current_user_id;
        
        IF p_bonuses_to_spend > 0 THEN
            -- ✅ ИСПОЛЬЗУЕМ active_bonus_balance
            IF user_profile.active_bonus_balance < p_bonuses_to_spend THEN 
                RAISE EXCEPTION 'Недостаточно активных бонусов. Доступно: %, запрошено: %', 
                    user_profile.active_bonus_balance, p_bonuses_to_spend;
            END IF;
            
            SELECT (value->>'rate')::NUMERIC 
            INTO bonus_rate 
            FROM public.settings 
            WHERE key = 'bonus_conversion_rate';
            
            IF bonus_rate IS NOT NULL THEN 
                calculated_discount := p_bonuses_to_spend * bonus_rate;
            END IF;
        END IF;
    ELSE
        IF p_bonuses_to_spend > 0 THEN
            RAISE EXCEPTION 'Гости не могут использовать бонусы. Зарегистрируйтесь!';
        END IF;
        total_award_bonuses := 0;
    END IF;

    final_price := GREATEST(total_price - calculated_discount, 0);

    INSERT INTO public.orders (
        user_id, guest_name, guest_email, guest_phone, 
        total_amount, discount_amount, final_amount, 
        bonuses_spent, bonuses_awarded, 
        delivery_method, delivery_address, payment_method
    )
    VALUES (
        current_user_id,
        p_guest_info->>'name', p_guest_info->>'email', p_guest_info->>'phone',
        total_price, calculated_discount, final_price,
        p_bonuses_to_spend, total_award_bonuses,
        p_delivery_method, p_delivery_address, p_payment_method
    )
    RETURNING id INTO new_order_id;

    FOR cart_item IN 
        SELECT * FROM jsonb_to_recordset(p_cart_items) 
        AS x(product_id UUID, quantity INT) 
    LOOP
        SELECT price, bonus_points_award 
        INTO product_record 
        FROM public.products 
        WHERE id = cart_item.product_id;
        
        INSERT INTO public.order_items (order_id, product_id, quantity, price_per_item, bonus_points_per_item)
        VALUES (new_order_id, cart_item.product_id, cart_item.quantity, product_record.price, product_record.bonus_points_award);
    END LOOP;

    RETURN new_order_id;
END;
$$;

COMMIT;

-- === 3. ПРОВЕРКА РЕЗУЛЬТАТА ===
DO $$
DECLARE
    col_count INT;
BEGIN
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles'
    AND column_name IN ('active_bonus_balance', 'pending_bonus_balance', 'has_received_welcome_bonus');
    
    IF col_count = 3 THEN
        RAISE NOTICE '🎉 УСПЕХ! Все колонки на месте';
    ELSE
        RAISE WARNING '⚠️ ВНИМАНИЕ! Найдено только % из 3 колонок', col_count;
    END IF;
    
    -- Проверяем старую колонку
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles'
    AND column_name = 'bonus_balance';
    
    IF col_count = 0 THEN
        RAISE NOTICE '✅ Старая колонка bonus_balance успешно удалена';
    ELSE
        RAISE WARNING '⚠️ Старая колонка bonus_balance всё ещё существует!';
    END IF;
END $$;

-- =====================================================================================
-- 🎯 ГОТОВО! Теперь можно использовать новую систему бонусов
-- =====================================================================================