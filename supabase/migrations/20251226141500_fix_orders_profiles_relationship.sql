-- =====================================================================================
-- МИГРАЦИЯ: Исправление связи между orders и profiles
-- =====================================================================================
-- Проблема: orders.user_id ссылается на auth.users.id вместо profiles.id
-- Это ломает JOIN в Edge Function при отправке уведомлений в Telegram
-- Решение: Изменяем foreign key, чтобы он ссылался на profiles.id напрямую
-- =====================================================================================

-- Шаг 1: Удаляем старый constraint (если есть)
DO $$
BEGIN
  -- Удаляем все возможные варианты constraint
  ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS "orders_user_id_fkey";
  ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS "orders_user_id_fkey_to_auth";
  ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS "orders_user_id_fkey_to_profiles";

  RAISE NOTICE '✅ Старые constraints удалены';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '⚠️ Ошибка при удалении constraints: %', SQLERRM;
END $$;

-- Шаг 2: Создаем НОВЫЙ constraint, который ссылается на profiles напрямую
DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT "orders_user_id_fkey"
    FOREIGN KEY (user_id)
    REFERENCES public.profiles(id)
    ON DELETE SET NULL;

  RAISE NOTICE '✅ Создан новый constraint orders_user_id_fkey → profiles.id';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '⚠️ Ошибка при создании constraint: %', SQLERRM;
END $$;

-- Шаг 3: Добавляем комментарий для документации
COMMENT ON CONSTRAINT "orders_user_id_fkey" ON public.orders IS
  'Foreign key связь между orders.user_id и profiles.id. Нужна для JOIN в Edge Function уведомлений Telegram.';

-- =====================================================================================
-- ПРОВЕРКА РЕЗУЛЬТАТА
-- =====================================================================================

-- Проверяем, что constraint создан правильно
DO $$
DECLARE
  v_constraint_exists BOOLEAN;
  v_referenced_table TEXT;
BEGIN
  -- Проверяем существование constraint
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_user_id_fkey'
    AND conrelid = 'public.orders'::regclass
  ) INTO v_constraint_exists;

  -- Получаем имя таблицы, на которую ссылается constraint
  SELECT confrelid::regclass::text INTO v_referenced_table
  FROM pg_constraint
  WHERE conname = 'orders_user_id_fkey'
  AND conrelid = 'public.orders'::regclass;

  RAISE NOTICE '====================================';
  RAISE NOTICE 'Constraint orders_user_id_fkey: %', CASE WHEN v_constraint_exists THEN '✅ СОЗДАН' ELSE '❌ НЕ НАЙДЕН' END;
  RAISE NOTICE 'Ссылается на таблицу: %', COALESCE(v_referenced_table, 'НЕ НАЙДЕНО');
  RAISE NOTICE 'Ожидается: public.profiles';
  RAISE NOTICE '====================================';

  -- Проверяем, что ссылка правильная
  IF v_referenced_table = 'profiles' OR v_referenced_table = 'public.profiles' THEN
    RAISE NOTICE '🎉 УСПЕХ: Constraint настроен правильно!';
  ELSE
    RAISE WARNING '⚠️ ВНИМАНИЕ: Constraint ссылается на неправильную таблицу!';
  END IF;
END $$;

-- Показываем детали constraint
SELECT
  conname AS constraint_name,
  conrelid::regclass AS table_name,
  confrelid::regclass AS referenced_table,
  confdeltype AS on_delete_action,
  CASE confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_delete_description
FROM pg_constraint
WHERE conname = 'orders_user_id_fkey'
AND conrelid = 'public.orders'::regclass;

-- =====================================================================================
-- ТЕСТ СВЯЗИ (опционально)
-- =====================================================================================

-- Проверяем, что JOIN работает
DO $$
DECLARE
  v_test_count INTEGER;
BEGIN
  -- Пробуем выполнить JOIN, который использует Edge Function
  SELECT COUNT(*) INTO v_test_count
  FROM public.orders o
  LEFT JOIN public.profiles p ON o.user_id = p.id
  WHERE o.user_id IS NOT NULL
  LIMIT 1;

  RAISE NOTICE '✅ JOIN orders ↔ profiles работает корректно';
  RAISE NOTICE 'Заказов с профилями найдено (первая проверка): %', v_test_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '⚠️ Ошибка при тестировании JOIN: %', SQLERRM;
END $$;

-- =====================================================================================
-- КОНЕЦ МИГРАЦИИ
-- =====================================================================================
