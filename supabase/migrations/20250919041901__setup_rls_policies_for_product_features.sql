-- migration.sql
-- Название: setup_rls_policies_for_product_features

-- Шаг 1: Создание или замена helper-функции для проверки роли администратора.
-- Функция проверяет, есть ли у текущего аутентифицированного пользователя
-- в его метаданных поле "role" со значением "admin".
-- SECURITY DEFINER используется для безопасного доступа к данным аутентификации.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  )
$$;

-- Шаг 2: Включение Row Level Security (RLS) для новых таблиц.
-- Это "включает рубильник". Без этого шага политики не будут работать.
ALTER TABLE public.product_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_accessories ENABLE ROW LEVEL SECURITY;

-- Шаг 3: Удаление старых политик, чтобы избежать конфликтов при повторном запуске.
-- Это делает миграцию идемпотентной (безопасной для многократного выполнения).
DROP POLICY IF EXISTS "Allow public read access for product_types" ON public.product_types;
DROP POLICY IF EXISTS "Allow full access for admins on product_types" ON public.product_types;
DROP POLICY IF EXISTS "Allow public read access for product_accessories" ON public.product_accessories;
DROP POLICY IF EXISTS "Allow full access for admins on product_accessories" ON public.product_accessories;

-- Шаг 4: Создание политик для таблицы 'product_types'.

-- Политика 4.1: Разрешает ЧТЕНИЕ (SELECT) для всех пользователей (включая анонимных).
-- Роль 'public' охватывает всех.
CREATE POLICY "Allow public read access for product_types"
ON public.product_types
FOR SELECT
TO public
USING (true);

-- Политика 4.2: Разрешает ВСЕ операции (INSERT, UPDATE, DELETE) только для администраторов.
-- Проверяется для аутентифицированных пользователей с помощью функции is_admin().
CREATE POLICY "Allow full access for admins on product_types"
ON public.product_types
FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());


-- Шаг 5: Создание политик для таблицы 'product_accessories'.

-- Политика 5.1: Разрешает ЧТЕНИЕ (SELECT) для всех пользователей.
CREATE POLICY "Allow public read access for product_accessories"
ON public.product_accessories
FOR SELECT
TO public
USING (true);

-- Политика 5.2: Разрешает ВСЕ операции только для администраторов.
CREATE POLICY "Allow full access for admins on product_accessories"
ON public.product_accessories
FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());