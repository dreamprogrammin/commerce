-- Назначение: Финальная и полная настройка RLS-политик для `order_items`,
-- чтобы разрешить создание заказов и для гостей, и для авторизованных пользователей.

-- --- Сначала удаляем старые версии, чтобы избежать конфликтов ---
DROP POLICY IF EXISTS "Users can insert items for their own new orders" ON public.order_items;
DROP POLICY IF EXISTS "Guests can insert items into guest orders" ON public.order_items;


-- === 1. Политика для АВТОРИЗОВАННЫХ пользователей (`authenticated`) ===
CREATE POLICY "Users can insert items for their own new orders"
    ON public.order_items FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Разрешаем вставку, если ID текущего пользователя (`auth.uid()`)
        -- совпадает с `user_id` заказа, которому принадлежит этот `order_item`.
        auth.uid() = (
            SELECT user_id
            FROM public.orders
            WHERE id = order_id
        )
    );
    
-- === 2. Политика для ГОСТЕЙ (`anon`) ===
CREATE POLICY "Guests can insert items into guest orders"
    ON public.order_items FOR INSERT
    TO anon -- Применяется только к гостям
    WITH CHECK (
        -- Разрешаем вставку, если у заказа, которому принадлежит
        -- этот `order_item`, поле `user_id` ПУСТОЕ (`NULL`).
        -- Это гарантирует, что гость добавляет товары только в гостевой заказ.
        (
            SELECT user_id
            FROM public.orders
            WHERE id = order_id
        ) IS NULL
    );
    
-- P.S. Политики на SELECT (`USING`) для `order_items` у нас уже должны быть,
-- но если нет, их тоже нужно добавить.