-- =====================================================================================
-- ОБНОВЛЕНИЕ ФУНКЦИИ TELEGRAM ПОД НОВУЮ АРХИТЕКТУРУ (v3)
-- =====================================================================================
-- Эта миграция обновляет функцию notify_order_to_telegram для поддержки
-- разделения на orders (пользователи) и guest_checkouts (гости)
-- =====================================================================================

-- Удаляем старые триггеры
DROP TRIGGER IF EXISTS trigger_notify_user_order ON public.orders;
DROP TRIGGER IF EXISTS trigger_notify_guest_checkout ON public.guest_checkouts;

-- Удаляем старую функцию
DROP FUNCTION IF EXISTS public.notify_order_to_telegram();

-- =====================================================================================
-- НОВАЯ УНИВЕРСАЛЬНАЯ ФУНКЦИЯ ДЛЯ ОТПРАВКИ УВЕДОМЛЕНИЙ
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.notify_order_to_telegram()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  function_url TEXT;
  payload JSONB;
  table_name TEXT;
BEGIN
  -- Определяем имя таблицы из триггера
  table_name := TG_TABLE_NAME;
  
  -- URL вашей Edge Function
  function_url := current_setting('app.settings.supabase_functions_url', true) 
    || '/notify-order-to-telegram';
  
  -- Если настройка не задана, пытаемся получить из таблицы settings
  IF function_url IS NULL OR function_url = '/notify-order-to-telegram' THEN
    SELECT value->>'url' INTO function_url 
    FROM public.settings 
    WHERE key = 'telegram_function_url';
  END IF;
  
  -- Если всё ещё не задано, используем значение по умолчанию
  IF function_url IS NULL THEN
    function_url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/notify-order-to-telegram';
  END IF;

  -- Формируем payload с указанием таблицы и всех данных
  payload := jsonb_build_object(
    'record', row_to_json(NEW),
    'table', table_name,
    'operation', TG_OP
  );

  -- Отправляем HTTP запрос асинхронно
  PERFORM net.http_post(
    url := function_url,
    body := payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    )::jsonb
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Логируем ошибку, но не прерываем транзакцию
    RAISE WARNING 'Ошибка отправки уведомления в Telegram: %', SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_order_to_telegram IS 
  'Универсальная функция для отправки уведомлений о новых заказах (пользовательских и гостевых) в Telegram';

-- =====================================================================================
-- ТРИГГЕРЫ ДЛЯ ОБЕИХ ТАБЛИЦ
-- =====================================================================================

-- Триггер для таблицы orders (авторизованные пользователи)
CREATE TRIGGER trigger_notify_user_order
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_order_to_telegram();

COMMENT ON TRIGGER trigger_notify_user_order ON public.orders IS 
  'Отправляет уведомление в Telegram при создании заказа авторизованного пользователя';

-- Триггер для таблицы guest_checkouts (гостевые заказы)
CREATE TRIGGER trigger_notify_guest_checkout
  AFTER INSERT ON public.guest_checkouts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_order_to_telegram();

COMMENT ON TRIGGER trigger_notify_guest_checkout ON public.guest_checkouts IS 
  'Отправляет уведомление в Telegram при создании гостевого заказа';

-- =====================================================================================
-- ОБНОВЛЕНИЕ НАСТРОЕК
-- =====================================================================================

-- Обновляем формат настройки для хранения URL
INSERT INTO public.settings (key, value, description)
VALUES (
  'telegram_function_url',
  jsonb_build_object(
    'url', 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/notify-order-to-telegram',
    'enabled', true
  ),
  'Настройки Edge Function для отправки уведомлений в Telegram'
)
ON CONFLICT (key) DO UPDATE SET
  value = jsonb_build_object(
    'url', COALESCE(EXCLUDED.value->>'url', public.settings.value->>'url'),
    'enabled', true
  ),
  updated_at = NOW();

-- =====================================================================================
-- ПРОВЕРКА
-- =====================================================================================

-- Проверяем, что триггеры созданы
SELECT 
  trigger_name,
  event_object_table as table_name,
  action_timing || ' ' || event_manipulation as trigger_event
FROM information_schema.triggers
WHERE trigger_name IN ('trigger_notify_user_order', 'trigger_notify_guest_checkout')
ORDER BY event_object_table;
