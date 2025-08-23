-- Назначение: Адаптация всей серверной логики под новую систему
-- с активным и отложенным балансом бонусов.

-- === 1. Обновляем триггер создания профиля ===
-- Теперь он начисляет приветственные бонусы в ОТЛОЖЕННЫЙ баланс.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile_creation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
    INSERT INTO public.profiles (id, first_name, role, pending_bonus_balance, has_received_welcome_bonus)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        'user',
        1000, -- Приветственный бонус в 1000
        TRUE  -- Сразу ставим флаг
    )
    ON CONFLICT (id) DO NOTHING;

    -- Привязываем старые гостевые заказы
    UPDATE public.orders
    SET user_id = NEW.id
    WHERE guest_email = NEW.email AND user_id IS NULL;
        
    RETURN NEW;
END;
$$;


-- === 2. Обновляем функцию подтверждения заказа ===
-- Теперь она работает с active/pending балансами.
CREATE OR REPLACE FUNCTION public.confirm_and_process_order(p_order_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    target_order RECORD; order_item_record RECORD;
BEGIN
    SELECT * INTO target_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF target_order IS NULL THEN RETURN 'Ошибка: Заказ не найден.'; END IF;
    IF target_order.status <> 'new' THEN RETURN 'Ошибка: Заказ уже обработан.'; END IF;

    FOR order_item_record IN SELECT oi.quantity, p.stock_quantity FROM public.order_items oi JOIN public.products p ON oi.product_id = p.id WHERE oi.order_id = p_order_id LOOP
        IF order_item_record.stock_quantity < order_item_record.quantity THEN
            RAISE EXCEPTION 'Недостаточно товара на складе.';
        END IF;
    END LOOP;

    FOR order_item_record IN SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id LOOP
        UPDATE public.products SET stock_quantity = stock_quantity - order_item_record.quantity, sales_count = sales_count + order_item_record.quantity WHERE id = order_item_record.product_id;
    END LOOP;

    IF target_order.user_id IS NOT NULL THEN
        UPDATE public.profiles
        SET 
            pending_bonus_balance = pending_bonus_balance + target_order.bonuses_awarded,
            active_bonus_balance = active_bonus_balance - target_order.bonuses_spent
        WHERE id = target_order.user_id;
        
        UPDATE public.orders
        SET status = 'confirmed', bonuses_activation_date = now() + interval '14 days'
        WHERE id = p_order_id;
    ELSE
        UPDATE public.orders SET status = 'confirmed' WHERE id = p_order_id;
    END IF;
    
    RETURN 'Успех: Заказ ' || p_order_id || ' подтвержден и обработан.';
END;
$$;


-- === 3. Обновляем функцию отмены заказа ===
-- Теперь она корректно работает с active/pending балансами
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    target_order RECORD;
    order_item_record RECORD;
BEGIN
    -- Находим заказ и проверяем его
    SELECT * INTO target_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF target_order IS NULL THEN
        RETURN 'Ошибка: Заказ не найден.';
    END IF;
    IF target_order.status NOT IN ('new', 'confirmed') THEN
        RETURN 'Ошибка: Этот заказ уже нельзя отменить (возможно, он выполнен или уже отменен).';
    END IF;
    
    -- === ГЛАВНАЯ ЛОГИКА "ОТКАТА" ===
    -- Этот блок сработает, только если мы отменяем уже ПОДТВЕРЖДЕННЫЙ заказ.
    -- Если заказ был 'new', он просто пропустится.
    IF target_order.status = 'confirmed' THEN
        -- 1. Возвращаем товары на склад
        FOR order_item_record IN SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id LOOP
            UPDATE public.products
            SET 
                stock_quantity = stock_quantity + order_item_record.quantity,
                sales_count = sales_count - order_item_record.quantity
            WHERE id = order_item_record.product_id;
        END LOOP;

        -- 2. "Откатываем" бонусные операции
        IF target_order.user_id IS NOT NULL THEN
            UPDATE public.profiles
            SET
                -- Потраченные бонусы возвращаются в АКТИВНЫЙ баланс
                active_bonus_balance = active_bonus_balance + target_order.bonuses_spent,
                -- Начисленные (но еще не активированные) бонусы вычитаются из ОЖИДАЕМОГО баланса
                pending_bonus_balance = pending_bonus_balance - target_order.bonuses_awarded
            WHERE id = target_order.user_id;
        END IF;
    END IF;

    -- Финальный шаг: меняем статус заказа на 'cancelled'
    UPDATE public.orders
    SET status = 'cancelled'
    WHERE id = p_order_id;

    RETURN 'Успех: Заказ ' || p_order_id || ' был отменен.';
END;
$$;

-- === 4. Обновляем функцию слияния пользователей ===
CREATE OR REPLACE FUNCTION public.merge_anon_user_into_real_user(old_anon_user_id UUID, new_real_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    anon_profile_data RECORD;
    new_user_profile_exists BOOLEAN;
BEGIN
    SELECT * INTO anon_profile_data FROM public.profiles WHERE id = old_anon_user_id;
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = new_real_user_id) INTO new_user_profile_exists;

    -- Переносим заказы
    UPDATE public.orders SET user_id = new_real_user_id WHERE user_id = old_anon_user_id;
    
    IF FOUND AND NOT new_user_profile_exists THEN
      -- Если у анонима был профиль, а у нового юзера - нет
      -- Переименовываем старый профиль и начисляем приветственный бонус
      UPDATE public.profiles
      SET 
          id = new_real_user_id,
          pending_bonus_balance = COALESCE(anon_profile_data.pending_bonus_balance, 0) + 1000,
          has_received_welcome_bonus = TRUE
      WHERE id = old_anon_user_id;
    ELSIF new_user_profile_exists THEN
       -- Если у нового юзера уже есть профиль (маловероятно, но возможно),
       -- просто переносим его отложенные бонусы
       UPDATE public.profiles
       SET pending_bonus_balance = pending_bonus_balance + COALESCE(anon_profile_data.pending_bonus_balance, 0)
       WHERE id = new_real_user_id;
       -- И удаляем старый профиль анонима
       DELETE FROM public.profiles WHERE id = old_anon_user_id;
    END IF;

    DELETE FROM auth.users WHERE id = old_anon_user_id;
    RETURN 'Пользователь ' || old_anon_user_id || ' успешно слит в ' || new_real_user_id;
END;
$$;


-- === 5. Создаем функцию-активатор для Cron Job ===
CREATE OR REPLACE FUNCTION public.activate_pending_bonuses()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    order_row RECORD;
    total_activated INT := 0;
BEGIN
    -- Начисляем приветственные бонусы, если прошло 14 дней с регистрации
    UPDATE public.profiles
    SET 
        active_bonus_balance = active_bonus_balance + pending_bonus_balance,
        pending_bonus_balance = 0
    WHERE 
        has_received_welcome_bonus = TRUE 
        AND pending_bonus_balance > 0
        AND created_at < now() - interval '14 days';

    -- Активируем бонусы за заказы
    FOR order_row IN
        SELECT id, user_id, bonuses_awarded FROM public.orders
        WHERE status = 'confirmed' AND bonuses_activation_date IS NOT NULL AND bonuses_activation_date <= now()
    LOOP
        UPDATE public.profiles
        SET 
            pending_bonus_balance = pending_bonus_balance - order_row.bonuses_awarded,
            active_bonus_balance = active_bonus_balance + order_row.bonuses_awarded
        WHERE id = order_row.user_id;

        UPDATE public.orders SET status = 'completed' WHERE id = order_row.id;
        total_activated := total_activated + order_row.bonuses_awarded;
    END LOOP;

    RETURN 'Активировано бонусов за заказы: ' || total_activated;
END;
$$;