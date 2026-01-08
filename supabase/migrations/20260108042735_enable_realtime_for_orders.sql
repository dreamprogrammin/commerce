-- =====================================================================================
-- ВКЛЮЧЕНИЕ SUPABASE REALTIME ДЛЯ МГНОВЕННОГО ОБНОВЛЕНИЯ ОСТАТКОВ
-- =====================================================================================
-- Цель:
-- - Мгновенное обновление остатков товаров на фронтенде
-- - Когда заказ подтверждается через Telegram → все пользователи видят новые остатки
-- - Не нужно ждать истечения кеша или обновлять страницу
--
-- Подход:
-- - Включаем Realtime на таблицах orders и guest_checkouts
-- - Подписываемся на событие UPDATE с фильтром status='confirmed'
-- - При получении события → инвалидируем кеш товаров на клиенте
-- =====================================================================================

-- ============================================
-- Шаг 1: Включить Realtime для таблицы orders
-- ============================================

-- Публикация для Realtime (если не существует)
DO $$
BEGIN
  -- Проверяем, существует ли публикация
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- ✅ Безопасно добавляем таблицу orders в публикацию (проверка на существование)
DO $$
BEGIN
  -- Проверяем, есть ли таблица orders в публикации
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
    RAISE NOTICE 'Added orders to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'orders already in supabase_realtime publication';
  END IF;
END $$;

-- Включаем Realtime для orders
ALTER TABLE orders REPLICA IDENTITY FULL;

-- Комментарий
COMMENT ON TABLE orders IS 'Заказы пользователей. Realtime включен для мгновенного обновления остатков при подтверждении.';

-- ============================================
-- Шаг 2: Включить Realtime для guest_checkouts
-- ============================================

-- ✅ Безопасно добавляем таблицу guest_checkouts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'guest_checkouts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE guest_checkouts;
    RAISE NOTICE 'Added guest_checkouts to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'guest_checkouts already in supabase_realtime publication';
  END IF;
END $$;

-- Включаем Realtime для guest_checkouts
ALTER TABLE guest_checkouts REPLICA IDENTITY FULL;

-- Комментарий
COMMENT ON TABLE guest_checkouts IS 'Гостевые заказы. Realtime включен для мгновенного обновления остатков при подтверждении.';

-- ============================================
-- Шаг 3 (Опционально): Включить Realtime для products
-- ============================================

-- ✅ Безопасно добавляем таблицу products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE products;
    RAISE NOTICE 'Added products to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'products already in supabase_realtime publication';
  END IF;
END $$;

ALTER TABLE products REPLICA IDENTITY FULL;

COMMENT ON TABLE products IS 'Товары. Realtime включен для отслеживания изменений цен и остатков.';

-- =====================================================================================
-- Проверка настроек
-- =====================================================================================
-- После применения миграции можно проверить:
--
-- SELECT schemaname, tablename
-- FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime';
--
-- Должно показать:
-- - public.orders
-- - public.guest_checkouts
-- - public.products
-- =====================================================================================

-- =====================================================================================
-- Использование на клиенте (см. composables/useOrderRealtime.ts)
-- =====================================================================================
-- supabase
--   .channel('orders-realtime')
--   .on('postgres_changes', {
--     event: 'UPDATE',
--     schema: 'public',
--     table: 'orders',
--     filter: 'status=eq.confirmed'
--   }, (payload) => {
--     console.log('Order confirmed:', payload.new.id)
--     invalidateAllProducts() // Обновить кеш товаров
--   })
--   .subscribe()
-- =====================================================================================
