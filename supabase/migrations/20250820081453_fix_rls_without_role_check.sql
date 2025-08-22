-- Назначение: Переписываем RLS-политики, чтобы они не зависели от `auth.role()`,
-- что может вызывать конфликты при обработке `anon` ключа.

-- --- Удаляем все старые политики ---
DROP POLICY IF EXISTS "Allow order creation for guests and users" ON public.orders;
DROP POLICY IF EXISTS "Allow adding items to orders for guests and users" ON public.order_items;

-- === 1. НОВАЯ, БОЛЕЕ ПРОСТАЯ ПОЛИТИКА ДЛЯ `orders` ===
CREATE POLICY "Allow order creation"
    ON public.orders FOR INSERT
    TO public
    WITH CHECK (
        -- Условие:
        -- Либо `user_id` совпадает с ID залогиненного пользователя
        ( user_id = auth.uid() ) OR
        -- Либо `user_id` пустой (для гостевого заказа)
        ( user_id IS NULL )
    );

-- === 2. НОВАЯ, БОЛЕЕ ПРОСТАЯ ПОЛИТИКА ДЛЯ `order_items` ===
CREATE POLICY "Allow adding items to orders"
    ON public.order_items FOR INSERT
    TO public
    WITH CHECK (
        -- Условие:
        -- Либо ID пользователя совпадает с user_id заказа
        ( auth.uid() = (SELECT user_id FROM public.orders WHERE id = order_id) ) OR
        -- Либо у заказа пустой user_id (для гостевого заказа)
        ( (SELECT user_id FROM public.orders WHERE id = order_id) IS NULL )
    );