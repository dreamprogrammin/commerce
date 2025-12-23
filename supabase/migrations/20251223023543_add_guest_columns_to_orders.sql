-- =====================================================================================
-- Миграция: Добавление полей для гостевых заказов
-- Файл: 01_add_guest_columns_to_orders.sql
-- Описание: Добавляет колонки guest_name, guest_email, guest_phone в таблицу orders
-- =====================================================================================

-- Добавляем колонки для гостевых заказов, если их еще нет
DO $$
BEGIN
  -- guest_name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'orders' 
    AND column_name = 'guest_name'
  ) THEN
    ALTER TABLE public.orders 
    ADD COLUMN guest_name TEXT;
    
    COMMENT ON COLUMN public.orders.guest_name IS 
    'Имя гостя (заполняется только для гостевых заказов)';
  END IF;

  -- guest_email
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'orders' 
    AND column_name = 'guest_email'
  ) THEN
    ALTER TABLE public.orders 
    ADD COLUMN guest_email TEXT;
    
    COMMENT ON COLUMN public.orders.guest_email IS 
    'Email гостя (заполняется только для гостевых заказов)';
  END IF;

  -- guest_phone
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'orders' 
    AND column_name = 'guest_phone'
  ) THEN
    ALTER TABLE public.orders 
    ADD COLUMN guest_phone TEXT;
    
    COMMENT ON COLUMN public.orders.guest_phone IS 
    'Телефон гостя (заполняется только для гостевых заказов)';
  END IF;

  RAISE NOTICE 'Колонки для гостевых заказов добавлены успешно';
END $$;

-- Создаем индекс для поиска гостевых заказов по email
CREATE INDEX IF NOT EXISTS idx_orders_guest_email 
ON public.orders(guest_email) 
WHERE guest_email IS NOT NULL;

COMMENT ON INDEX idx_orders_guest_email IS 
'Индекс для быстрого поиска гостевых заказов по email';

-- Обновляем комментарий к колонке user_id
COMMENT ON COLUMN public.orders.user_id IS 
'NULL для гостевых заказов, UUID для авторизованных пользователей';

-- =====================================================================================
-- Проверка результата
-- =====================================================================================

DO $$
DECLARE
  v_guest_columns_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_guest_columns_count
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
  AND table_name = 'orders' 
  AND column_name IN ('guest_name', 'guest_email', 'guest_phone');
  
  RAISE NOTICE '====================================';
  RAISE NOTICE 'Добавлено колонок для гостей: %', v_guest_columns_count;
  RAISE NOTICE '====================================';
END $$;

-- =====================================================================================
-- Конец миграции
-- =====================================================================================