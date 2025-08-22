-- =================================================================
-- ==                                                             ==
-- ==      ФИНАЛЬНАЯ МИГРАЦИЯ ПРАВ ДОСТУПА ДЛЯ ПРОЦЕССА ЗАКАЗА      ==
-- ==                                                             ==
-- =================================================================
-- Назначение: Установить все необходимые права (RLS и EXECUTE)
-- для корректной работы гостей и авторизованных пользователей.

-------------------------------------------------------------------
-- 1. ПРАВА НА ВЫПОЛНЕНИЕ RPC-ФУНКЦИЙ
-------------------------------------------------------------------
-- ЦЕЛЬ: Разрешить гостям и пользователям "стучаться" в наши функции.

-- Разрешаем ВСЕМ (`public`) вызывать функцию получения товаров.
GRANT EXECUTE ON FUNCTION public.get_filtered_products(TEXT, UUID[], NUMERIC, NUMERIC, TEXT, INT, INT)
    TO public;

-- Разрешаем ГОСТЯМ (`anon`) и ПОЛЬЗОВАТЕЛЯМ (`authenticated`)
-- вызывать функцию создания заказа.
GRANT EXECUTE ON FUNCTION public.create_order(JSONB, TEXT, TEXT, JSONB, JSONB, INT)
    TO anon, authenticated;

-------------------------------------------------------------------
-- 2. ПОЛИТИКИ БЕЗОПАСНОСТИ (RLS) ДЛЯ ТАБЛИЦЫ `orders`
-------------------------------------------------------------------
-- ЦЕЛЬ: Установить, кто и какие строки может СОЗДАВАТЬ и ВИДЕТЬ.

-- Сначала удаляем все старые, потенциально конфликтующие политики
DROP POLICY IF EXISTS "Users can create orders for themselves" ON public.orders;
DROP POLICY IF EXISTS "Guests can create orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow order creation for guests and authenticated users" ON public.orders;

-- Создаем ОДНУ ОБЩУЮ политику на СОЗДАНИЕ (`INSERT`)
CREATE POLICY "Allow order creation for guests and users"
    ON public.orders FOR INSERT
    TO public -- Применяется ко всем
    WITH CHECK (
        -- Условие:
        -- Либо (роль 'authenticated' И user_id в заказе совпадает с ID пользователя)
        ( auth.role() = 'authenticated' AND auth.uid() = user_id )
        -- Либо (роль 'anon' И user_id в заказе пустой)
        OR ( auth.role() = 'anon' AND user_id IS NULL )
    );

-- Создаем политику на ЧТЕНИЕ (`SELECT`) только для авторизованных
CREATE POLICY "Users can view their own orders"
    ON public.orders FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-------------------------------------------------------------------
-- 3. ПОЛИТИКИ БЕЗОПАСНОСТИ (RLS) ДЛЯ ТАБЛИЦЫ `order_items`
-------------------------------------------------------------------
-- ЦЕЛЬ: Установить, кто и в какие заказы может добавлять товары.

-- Удаляем старые политики
DROP POLICY IF EXISTS "Users can insert items for their own new orders" ON public.order_items;
DROP POLICY IF EXISTS "Guests can insert items into guest orders" ON public.order_items;

-- Создаем ОДНУ ОБЩУЮ политику на СОЗДАНИЕ (`INSERT`)
CREATE POLICY "Allow adding items to orders for guests and users"
    ON public.order_items FOR INSERT
    TO public -- Применяется ко всем
    WITH CHECK (
        -- Условие:
        -- Либо (роль 'authenticated' И ID пользователя совпадает с user_id заказа)
        (
            auth.role() = 'authenticated'
            AND auth.uid() = (SELECT user_id FROM public.orders WHERE id = order_id)
        )
        -- Либо (роль 'anon' И у заказа пустой user_id)
        OR (
            auth.role() = 'anon'
            AND (SELECT user_id FROM public.orders WHERE id = order_id) IS NULL
        )
    );