-- =====================================================================================
-- ТРИГГЕРЫ ДЛЯ ОТПРАВКИ УВЕДОМЛЕНИЙ В TELEGRAM
-- =====================================================================================

-- Функция для отправки уведомления (универсальная)
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
  -- Определяем имя таблицы
  table_name := TG_TABLE_NAME;
  
  -- URL вашей Edge Function
  function_url := current_setting('app.settings.supabase_functions_url', true) 
    || '/notify-order-to-telegram';
  
  -- Если настройка не задана, используем переменную окружения
  IF function_url IS NULL OR function_url = '/notify-order-to-telegram' THEN
    function_url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/notify-order-to-telegram';
  END IF;

  -- Формируем payload с указанием таблицы
  payload := jsonb_build_object(
    'record', row_to_json(NEW),
    'table', table_name
  );

  -- Отправляем HTTP запрос
  PERFORM net.http_post(
    url := function_url,
    body := payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    )::jsonb
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_order_to_telegram IS 
  'Отправляет уведомление о новом заказе в Telegram';


-- =====================================================================================
-- ТРИГГЕР ДЛЯ ТАБЛИЦЫ ORDERS (заказы пользователей)
-- =====================================================================================

DROP TRIGGER IF EXISTS trigger_notify_user_order ON public.orders;

CREATE TRIGGER trigger_notify_user_order
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_order_to_telegram();

COMMENT ON TRIGGER trigger_notify_user_order ON public.orders IS 
  'Отправляет уведомление в Telegram при создании заказа пользователя';


-- =====================================================================================
-- ТРИГГЕР ДЛЯ ТАБЛИЦЫ GUEST_CHECKOUTS (гостевые заказы)
-- =====================================================================================

DROP TRIGGER IF EXISTS trigger_notify_guest_checkout ON public.guest_checkouts;

CREATE TRIGGER trigger_notify_guest_checkout
  AFTER INSERT ON public.guest_checkouts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_order_to_telegram();

COMMENT ON TRIGGER trigger_notify_guest_checkout ON public.guest_checkouts IS 
  'Отправляет уведомление в Telegram при создании гостевого заказа';


-- =====================================================================================
-- НАСТРОЙКА URL (ОПЦИОНАЛЬНО)
-- =====================================================================================

-- Если хотите хранить URL в настройках базы данных:
-- ALTER DATABASE postgres SET app.settings.supabase_functions_url TO 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1';

-- Или создайте настройку в таблице settings:
INSERT INTO public.settings (key, value, description)
VALUES (
  'telegram_function_url',
  '"https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/notify-order-to-telegram"'::jsonb,
  'URL Edge Function для отправки уведомлений в Telegram'
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();


-- =====================================================================================
-- ПРОВЕРКА
-- =====================================================================================

-- Проверяем, что триггеры созданы
SELECT 
  trigger_name,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name IN ('trigger_notify_user_order', 'trigger_notify_guest_checkout');