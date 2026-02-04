-- ============================================================================
-- Исправление RLS политики для products - переход на is_admin()
-- ============================================================================
--
-- ПРОБЛЕМА:
-- Старая политика использует current_user_has_role_internal('admin'),
-- которая проверяет profiles.role. Но у пользователя может не быть записи в profiles.
--
-- РЕШЕНИЕ:
-- Используем is_admin(), которая проверяет роль в profiles таблице.
-- Если пользователь не admin - разрешаем только чтение активных товаров.
-- ============================================================================

-- Удаляем старые политики
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
DROP POLICY IF EXISTS "Public can read active products" ON public.products;
DROP POLICY IF EXISTS "Admins can manage all products" ON public.products;
DROP POLICY IF EXISTS "Service role can manage products" ON public.products;

-- Создаём новые политики

-- 1. Публичный доступ на чтение активных товаров
CREATE POLICY "Public can read active products"
ON public.products
FOR SELECT
USING (is_active = TRUE);

-- 2. Админы могут делать всё
CREATE POLICY "Admins can manage all products"
ON public.products
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 3. Service role может делать всё (для edge functions)
CREATE POLICY "Service role can manage products"
ON public.products
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON POLICY "Public can read active products" ON public.products IS
'Все могут читать активные товары';

COMMENT ON POLICY "Admins can manage all products" ON public.products IS
'Администраторы могут создавать, редактировать и удалять товары';

COMMENT ON POLICY "Service role can manage products" ON public.products IS
'Service role имеет полный доступ (для edge functions и бэкенд операций)';
