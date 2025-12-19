-- =====================================================================================
-- ТРИГГЕРЫ ДЛЯ ОТПРАВКИ УВЕДОМЛЕНИЙ В TELEGRAM (ИСПРАВЛЕННЫЕ)
-- =====================================================================================

-- ВАЖНО: Замените YOUR_PROJECT_REF на ваш project ref из Supabase
-- Найти можно в Settings > API > Project URL
-- Например: https://abcdefghijk.supabase.co
-- Ваш ref: abcdefghijk

-- Функция для уведомления о заказе пользователя
CREATE OR REPLACE FUNCTION public.notify_user_order_to_telegram()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  function_url TEXT;
  payload JSONB;
  request_id BIGINT;
BEGIN
  -- URL вашей Edge Function (ЗАМЕНИТЕ на свой!)
  function_url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/notify-order-to-telegram';
  
  -- Формируем payload с указанием таблицы
  payload := jsonb_build_object(
    'record', row_to_json(NEW),
    'table', 'orders',
    'operation', TG_OP
  );

  -- Отправляем HTTP запрос
  SELECT INTO request_id
    net.http_post(
      url := function_url,
      body := payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      )
    );

  RAISE NOTICE 'Уведомление о заказе % отправлено (request_id: %)', NEW.id, request_id;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Ошибка отправки уведомления: %', SQLERRM;
  RETURN NEW; -- Не ломаем транзакцию, если Telegram недоступен
END;
$$;

COMMENT ON FUNCTION public.notify_user_order_to_telegram IS 
  'Отправляет уведомление о заказе пользователя в Telegram';


-- Функция для уведомления о гостевом заказе
CREATE OR REPLACE FUNCTION public.notify_guest_checkout_to_telegram()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  function_url TEXT;
  payload JSONB;
  request_id BIGINT;
BEGIN
  -- URL вашей Edge Function (ЗАМЕНИТЕ на свой!)
  function_url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/notify-order-to-telegram';
  
  -- Формируем payload с указанием таблицы
  payload := jsonb_build_object(
    'record', row_to_json(NEW),
    'table', 'guest_checkouts',
    'operation', TG_OP
  );

  -- Отправляем HTTP запрос
  SELECT INTO request_id
    net.http_post(
      url := function_url,
      body := payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      )
    );

  RAISE NOTICE 'Уведомление о гостевом заказе % отправлено (request_id: %)', NEW.id, request_id;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Ошибка отправки уведомления: %', SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_guest_checkout_to_telegram IS 
  'Отправляет уведомление о гостевом заказе в Telegram';


-- =====================================================================================
-- СОЗДАЕМ ТРИГГЕРЫ
-- =====================================================================================

-- Триггер для заказов пользователей
DROP TRIGGER IF EXISTS trigger_notify_user_order ON public.orders;

CREATE TRIGGER trigger_notify_user_order
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_user_order_to_telegram();

COMMENT ON TRIGGER trigger_notify_user_order ON public.orders IS 
  'Отправляет уведомление в Telegram при создании заказа пользователя';


-- Триггер для гостевых заказов
DROP TRIGGER IF EXISTS trigger_notify_guest_checkout ON public.guest_checkouts;

CREATE TRIGGER trigger_notify_guest_checkout
  AFTER INSERT ON public.guest_checkouts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_guest_checkout_to_telegram();

COMMENT ON TRIGGER trigger_notify_guest_checkout ON public.guest_checkouts IS 
  'Отправляет уведомление в Telegram при создании гостевого заказа';


-- =====================================================================================
-- ПРОВЕРКА НАСТРОЙКИ
-- =====================================================================================

-- Проверяем, что триггеры созданы
SELECT 
  trigger_name,
  event_object_table,
  action_statement,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_name IN ('trigger_notify_user_order', 'trigger_notify_guest_checkout')
ORDER BY event_object_table;


-- =====================================================================================
-- ТЕСТИРОВАНИЕ (ОПЦИОНАЛЬНО)
-- =====================================================================================

-- Для тестирования можно вручную вызвать функцию:
/*
SELECT net.http_post(
  url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-order-to-telegram',
  body := jsonb_build_object(
    'record', jsonb_build_object('id', 'test-order-id'),
    'table', 'orders',
    'operation', 'INSERT'
  ),
  headers := jsonb_build_object('Content-Type', 'application/json')
);
*/


-- =====================================================================================
-- ИНСТРУКЦИИ ПО НАСТРОЙКЕ
-- =====================================================================================

-- 1. Замените YOUR_PROJECT_REF на ваш проект:
--    Найдите в Dashboard > Settings > API > Project URL
--    Например: https://abcdefghijk.supabase.co
--    Используйте только часть: abcdefghijk

-- 2. Убедитесь, что расширение pg_net включено:
--    Dashboard > Database > Extensions > pg_net (должно быть ON)

-- 3. Проверьте переменные окружения в Edge Function:
--    - TELEGRAM_BOT_TOKEN
--    - TELEGRAM_CHAT_ID
--    - ADMIN_SECRET (опционально)

-- 4. После применения миграции создайте тестовый заказ и проверьте логи:
--    Dashboard > Database > Logs