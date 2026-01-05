-- =====================================================================================
-- RLS ПОЛИТИКА ДЛЯ ОБНОВЛЕНИЯ PRODUCTS ИЗ ТРИГГЕРОВ
-- =====================================================================================
-- Проблема:
-- - Триггеры не могут обновлять таблицу products (списывать товары со склада)
-- - RLS политики разрешают UPDATE только для админов (authenticated с ролью admin)
-- - Триггеры выполняются с SECURITY DEFINER, но RLS всё равно применяется
--
-- Решение:
-- - Добавить политику, разрешающую UPDATE для service_role
-- - Это позволит триггерам обновлять stock_quantity и sales_count
-- =====================================================================================

-- ✅ КРИТИЧЕСКИ ВАЖНО: Service role может обновлять товары
-- Это нужно для триггеров подтверждения заказов
DROP POLICY IF EXISTS "Service role can update products" ON public.products;

CREATE POLICY "Service role can update products"
  ON public.products
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Также разрешаем для authenticated (для триггеров)
GRANT UPDATE ON public.products TO authenticated;
GRANT UPDATE ON public.products TO service_role;

COMMENT ON POLICY "Service role can update products" ON public.products IS
'Разрешает service_role обновлять товары.
Необходимо для корректной работы триггеров подтверждения заказов,
которые списывают товары со склада при изменении статуса на confirmed.';
