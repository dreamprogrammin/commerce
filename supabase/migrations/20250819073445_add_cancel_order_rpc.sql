CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_order RECORD;
    order_item_record RECORD; -- <-- ИСПРАВЛЕНО: ОБЪЯВЛЯЕМ ПЕРЕМЕННУЮ ЗДЕСЬ
BEGIN
    SELECT * INTO target_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF target_order IS NULL THEN
        RETURN 'Ошибка: Заказ с ID ' || p_order_id || ' не найден.';
    END IF;

    IF target_order.status NOT IN ('new', 'confirmed') THEN
        RETURN 'Ошибка: Этот заказ уже выполнен или был отменен ранее. Текущий статус: ' || target_order.status;
    END IF;
    
    IF target_order.status = 'confirmed' THEN
        -- Теперь мы можем использовать `order_item_record` в цикле
        FOR order_item_record IN SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id LOOP
            UPDATE public.products
            SET 
                stock_quantity = stock_quantity + order_item_record.quantity,
                sales_count = sales_count - order_item_record.quantity
            WHERE id = order_item_record.product_id;
        END LOOP;

        IF target_order.user_id IS NOT NULL THEN
            UPDATE public.profiles
            SET bonus_balance = bonus_balance + target_order.bonuses_spent - target_order.bonuses_awarded
            WHERE id = target_order.user_id;
        END IF;
    END IF;

    UPDATE public.orders
    SET status = 'cancelled'
    WHERE id = p_order_id;

    RETURN 'Успех: Заказ ' || p_order_id || ' был успешно отменен.';
END;
$$;