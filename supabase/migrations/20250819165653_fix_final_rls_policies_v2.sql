-- =================================================================
-- ==                                                             ==
-- ==      ФИНАЛЬНАЯ КОРРЕКТИРОВКА ПОЛИТИК БЕЗОПАСНОСТИ (RLS)       ==
-- ==                                                             ==
-- =================================================================

-- Включаем RLS для таблиц, если это не было сделано ранее.
-- `IF NOT EXISTS` не работает с `ENABLE`, поэтому просто выполняем.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-------------------------------------------------------------------
-- 1. Политики для таблицы `profiles`
-------------------------------------------------------------------
-- ЦЕЛЬ: Авторизованный пользователь должен иметь возможность
--       читать и изменять ТОЛЬКО свой собственный профиль.

-- Сначала удаляем старые версии политик, чтобы избежать конфликтов.
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- ПОЛИТИКА НА ЧТЕНИЕ (`SELECT`)
-- Разрешаем роли `authenticated` читать строки,
-- где `id` в таблице `profiles` совпадает с ID текущего пользователя.
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- ПОЛИТИКА НА ОБНОВЛЕНИЕ (`UPDATE`)
-- Разрешаем роли `authenticated` обновлять строки,
-- где `id` совпадает с ID текущего пользователя.
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

-------------------------------------------------------------------
-- 2. Политики для таблицы `orders`
-------------------------------------------------------------------
-- ЦЕЛЬ: И гости, и авторизованные пользователи должны иметь
--       возможность создавать заказы, но безопасно.
--       Авторизованные пользователи могут просматривать свои заказы.

-- Сначала удаляем все старые политики для `orders`.
DROP POLICY IF EXISTS "Users can create orders for themselves" ON public.orders;
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Guests can create orders" ON public.orders;

-- 2.1 ПОЛИТИКИ ДЛЯ АВТОРИЗОВАННЫХ ПОЛЬЗОВАТЕЛЕЙ (`authenticated`)

-- ПОЛИТИКА НА СОЗДАНИЕ (`INSERT`)
-- Разрешаем `authenticated` вставлять строки.
-- `WITH CHECK` - это "предохранитель": вставляемая строка
-- будет проверена, и если `user_id` в ней не равен `auth.uid()`,
-- база данных вернет ошибку.
CREATE POLICY "Users can create orders for themselves"
    ON public.orders FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ПОЛИТИКА НА ЧТЕНИЕ (`SELECT`)
-- Разрешаем `authenticated` читать строки, где `user_id`
-- совпадает с их ID.
CREATE POLICY "Users can view their own orders"
    ON public.orders FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- 2.2 ПОЛИТИКА ДЛЯ ГОСТЕЙ (`anon`)

-- ПОЛИТИКА НА СОЗДАНИЕ (`INSERT`)
-- Разрешаем роли `anon` (гостям) вставлять строки.
-- "Предохранитель" `WITH CHECK` гарантирует, что гость может
-- создать заказ только если `user_id` ПУСТОЙ (`NULL`).
-- Это не дает гостю создать заказ от имени другого пользователя.
CREATE POLICY "Guests can create orders"
    ON public.orders FOR INSERT
    TO anon
    WITH CHECK (user_id IS NULL);