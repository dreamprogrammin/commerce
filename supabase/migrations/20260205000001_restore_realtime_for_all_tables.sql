-- =====================================================================================
-- ВОССТАНОВЛЕНИЕ: Supabase Realtime для всех таблиц
-- =====================================================================================
-- ПРОБЛЕМА:
-- После миграций master_schema_consolidation настройки realtime были потеряны
-- Таблицы orders, guest_checkouts, products, notifications не имеют REPLICA IDENTITY
-- и не добавлены в публикацию supabase_realtime
--
-- РЕШЕНИЕ:
-- Восстанавливаем realtime для всех таблиц, которым это нужно
-- =====================================================================================

-- =====================================================================================
-- ШАГ 1: СОЗДАЁМ ПУБЛИКАЦИЮ (если не существует)
-- =====================================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
    RAISE NOTICE '✅ Создана публикация supabase_realtime';
  ELSE
    RAISE NOTICE '✅ Публикация supabase_realtime уже существует';
  END IF;
END $$;

-- =====================================================================================
-- ШАГ 2: ВКЛЮЧАЕМ REALTIME ДЛЯ ТАБЛИЦЫ orders
-- =====================================================================================

DO $$
BEGIN
  RAISE NOTICE '📋 Настройка realtime для: orders';

  -- Добавляем в публикацию если ещё не добавлена
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    RAISE NOTICE '   ✅ Добавлена в supabase_realtime';
  ELSE
    RAISE NOTICE '   ✅ Уже в supabase_realtime';
  END IF;
END $$;

-- Включаем REPLICA IDENTITY FULL для отслеживания всех изменений
ALTER TABLE public.orders REPLICA IDENTITY FULL;

COMMENT ON TABLE public.orders IS
  'Заказы пользователей. Realtime включен для мгновенного обновления статусов.';

-- =====================================================================================
-- ШАГ 3: ВКЛЮЧАЕМ REALTIME ДЛЯ ТАБЛИЦЫ guest_checkouts
-- =====================================================================================

DO $$
BEGIN
  RAISE NOTICE '📋 Настройка realtime для: guest_checkouts';

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'guest_checkouts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_checkouts;
    RAISE NOTICE '   ✅ Добавлена в supabase_realtime';
  ELSE
    RAISE NOTICE '   ✅ Уже в supabase_realtime';
  END IF;
END $$;

ALTER TABLE public.guest_checkouts REPLICA IDENTITY FULL;

COMMENT ON TABLE public.guest_checkouts IS
  'Гостевые заказы. Realtime включен для мгновенного обновления статусов.';

-- =====================================================================================
-- ШАГ 4: ВКЛЮЧАЕМ REALTIME ДЛЯ ТАБЛИЦЫ products
-- =====================================================================================

DO $$
BEGIN
  RAISE NOTICE '📋 Настройка realtime для: products';

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
    RAISE NOTICE '   ✅ Добавлена в supabase_realtime';
  ELSE
    RAISE NOTICE '   ✅ Уже в supabase_realtime';
  END IF;
END $$;

ALTER TABLE public.products REPLICA IDENTITY FULL;

COMMENT ON TABLE public.products IS
  'Товары. Realtime включен для отслеживания изменений цен и остатков.';

-- =====================================================================================
-- ШАГ 5: ВКЛЮЧАЕМ REALTIME ДЛЯ ТАБЛИЦЫ notifications
-- =====================================================================================

DO $$
BEGIN
  RAISE NOTICE '📋 Настройка realtime для: notifications';

  -- Проверяем существование таблицы
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'notifications'
  ) THEN
    -- Добавляем в публикацию
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
      RAISE NOTICE '   ✅ Добавлена в supabase_realtime';
    ELSE
      RAISE NOTICE '   ✅ Уже в supabase_realtime';
    END IF;

    -- Включаем REPLICA IDENTITY
    ALTER TABLE public.notifications REPLICA IDENTITY FULL;

    COMMENT ON TABLE public.notifications IS
      'Уведомления пользователей. Realtime включен для мгновенной доставки.';
  ELSE
    RAISE NOTICE '   ⚠️ Таблица notifications не существует, пропускаем';
  END IF;
END $$;

-- =====================================================================================
-- ШАГ 6: ПРОВЕРКА И ОТЧЁТ
-- =====================================================================================

DO $$
DECLARE
  table_rec RECORD;
  v_count INTEGER := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '📊 ФИНАЛЬНЫЙ ОТЧЁТ: REALTIME НАСТРОЙКИ';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Таблицы в публикации supabase_realtime:';

  FOR table_rec IN
    SELECT schemaname, tablename
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    ORDER BY tablename
  LOOP
    v_count := v_count + 1;
    RAISE NOTICE '   ✅ %.%', table_rec.schemaname, table_rec.tablename;
  END LOOP;

  IF v_count = 0 THEN
    RAISE WARNING '   ⚠️ Нет таблиц в публикации!';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '📊 Всего таблиц с realtime: %', v_count;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ REALTIME ВОССТАНОВЛЕН ДЛЯ ВСЕХ ТАБЛИЦ';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '💡 Использование на клиенте:';
  RAISE NOTICE '   supabase.channel(''orders'')';
  RAISE NOTICE '     .on(''postgres_changes'', {';
  RAISE NOTICE '       event: ''UPDATE'',';
  RAISE NOTICE '       schema: ''public'',';
  RAISE NOTICE '       table: ''orders''';
  RAISE NOTICE '     }, (payload) => { ... })';
  RAISE NOTICE '     .subscribe()';
  RAISE NOTICE '';
END $$;

-- Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
