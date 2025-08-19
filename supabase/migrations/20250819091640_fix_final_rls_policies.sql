-- Назначение: Финальная корректировка политик безопасности (RLS)
-- для корректной работы профилей и оформления заказов
-- как для авторизованных пользователей, так и для гостей.

-- === 1. Политики для таблицы `profiles` ===
-- Гарантируем, что пользователи могут читать и обновлять только свой профиль.

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);


-- === 2. Политики для таблицы `orders` ===
-- Устанавливаем четкие правила для создания и просмотра заказов.

-- 2.1 Для АВТОРИЗОВАННЫХ пользователей (`authenticated`)
DROP POLICY IF EXISTS "Users can create orders for themselves" ON public.orders;
CREATE POLICY "Users can create orders for themselves"
    ON public.orders FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders"
    ON public.orders FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- 2.2 Для ГОСТЕЙ (`anon`)
DROP POLICY IF EXISTS "Guests can create orders" ON public.orders;
CREATE POLICY "Guests can create orders"
    ON public.orders FOR INSERT
    TO anon -- Применяется только к неавторизованным запросам
    WITH CHECK (user_id IS NULL); -- Гость может создать заказ только БЕЗ user_id