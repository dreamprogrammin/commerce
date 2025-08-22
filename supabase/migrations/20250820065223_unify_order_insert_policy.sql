-- Назначение: Объединение RLS-политик на создание заказов в одну,
-- чтобы избежать конфликтов с обработкой `anon` ключа в заголовке `authorization`.

-- Сначала удаляем обе старые политики
DROP POLICY IF EXISTS "Users can create orders for themselves" ON public.orders;
DROP POLICY IF EXISTS "Guests can create orders" ON public.orders;

-- Создаем ОДНУ общую политику
CREATE POLICY "Allow order creation for guests and authenticated users"
    ON public.orders FOR INSERT
    TO public -- `public` включает в себя и `anon`, и `authenticated`
    WITH CHECK (
        -- Условие:
        -- Либо (пользователь авторизован И user_id в заказе совпадает с его ID)
        ( auth.role() = 'authenticated' AND auth.uid() = user_id )
        -- Либо (пользователь - гость И user_id в заказе пустой)
        OR ( auth.role() = 'anon' AND user_id IS NULL )
    );