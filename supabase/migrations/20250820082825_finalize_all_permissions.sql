-- =================================================================
-- ==                                                             ==
-- ==      ФИНАЛЬНАЯ МИГРАЦИЯ ПРАВ ДОСТУПА ДЛЯ ВСЕГО ПРОЕКТА      ==
-- ==                                                             ==
-- =================================================================
-- Назначение: Установить все необходимые права (RLS и EXECUTE)
-- для корректной работы гостей и авторизованных пользователей.

-- === 1. ПРАВА НА ВЫПОЛНЕНИЕ RPC-ФУНКЦИЙ (`EXECUTE`) ===

GRANT EXECUTE ON FUNCTION public.get_filtered_products(TEXT, UUID[], NUMERIC, NUMERIC, TEXT, INT, INT)
    TO public; -- public = anon + authenticated

GRANT EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, JSONB, JSONB, INT)
    TO anon, authenticated;

-- === 2. ПОЛИТИКИ БЕЗОПАСНОСТИ (RLS) ДЛЯ ТАБЛИЦЫ `orders` ===

-- Сначала удаляем все возможные старые политики, чтобы избежать конфликтов
DROP POLICY IF EXISTS "Users can create orders for themselves" ON public.orders;
DROP POLICY IF EXISTS "Guests can create orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow order creation for guests and authenticated users" ON public.orders;
DROP POLICY IF EXISTS "Allow order creation for guests and users" ON public.orders; -- Добавил еще один вариант имени

-- Создаем ОДНУ ОБЩУЮ политику на СОЗДАНИЕ (`INSERT`)
CREATE POLICY "Allow order creation for guests and users"
    ON public.orders FOR INSERT
    TO public
    WITH CHECK (
        ( auth.role() = 'authenticated' AND auth.uid() = user_id ) OR 
        ( auth.role() = 'anon' AND user_id IS NULL )
    );

-- Политика на ЧТЕНИЕ (`SELECT`) только для авторизованных
CREATE POLICY "Users can view their own orders"
    ON public.orders FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- === 3. ПОЛИТИКИ БЕЗОПАСНОСТИ (RLS) ДЛЯ ТАБЛИЦЫ `order_items` ===

-- Удаляем все возможные старые политики
DROP POLICY IF EXISTS "Users can insert items for their own new orders" ON public.order_items;
DROP POLICY IF EXISTS "Guests can insert items into guest orders" ON public.order_items;
-- ИСПРАВЛЕНО: Теперь мы удаляем ВСЕ возможные имена, включая правильное.
DROP POLICY IF EXISTS "Allow adding items to orders for guests and users" ON public.order_items;
DROP POLICY IF EXISTS "Allow adding items to orders" ON public.order_items;

-- Создаем ОДНУ ОБЩУЮ политику на СОЗДАНИЕ (`INSERT`)
CREATE POLICY "Allow adding items to orders"
    ON public.order_items FOR INSERT
    TO public
    WITH CHECK (
        (
            auth.role() = 'authenticated'
            AND auth.uid() = (SELECT user_id FROM public.orders WHERE id = order_id)
        ) OR (
            auth.role() = 'anon'
            AND (SELECT user_id FROM public.orders WHERE id = order_id) IS NULL
        )
    );