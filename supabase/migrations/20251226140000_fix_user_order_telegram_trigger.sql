-- =====================================================================================
-- ИСПРАВЛЕНИЕ: Триггер для уведомлений о заказах пользователей в Telegram
-- =====================================================================================
-- Проблема: Гостевые заказы приходят в Telegram, а заказы пользователей - нет
-- Решение: Пересоздаем триггер для таблицы orders
-- =====================================================================================

-- Удаляем старые триггеры (если есть)
DROP TRIGGER IF EXISTS on_new_order_created_send_notification ON public.orders;
DROP TRIGGER IF EXISTS trigger_notify_user_order ON public.orders;

-- Удаляем старую функцию
DROP FUNCTION IF EXISTS public.trigger_order_notification();

-- Создаем функцию для уведомления о заказе пользователя
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
  -- URL Edge Function
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

  RAISE NOTICE '📨 Уведомление о заказе пользователя % отправлено (request_id: %)', NEW.id, request_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '⚠️ Ошибка отправки уведомления: %', SQLERRM;
  RETURN NEW; -- Не ломаем транзакцию, если Telegram недоступен
END;
$$;

COMMENT ON FUNCTION public.notify_user_order_to_telegram IS
  'Отправляет уведомление о заказе пользователя в Telegram';

-- Создаем триггер для заказов пользователей
CREATE TRIGGER trigger_notify_user_order
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_user_order_to_telegram();

COMMENT ON TRIGGER trigger_notify_user_order ON public.orders IS
  'Отправляет уведомление в Telegram при создании заказа пользователя';

-- =====================================================================================
-- ПРОВЕРКА
-- =====================================================================================

-- Проверяем, что триггер создан
DO $$
DECLARE
  v_trigger_exists BOOLEAN;
  v_function_exists BOOLEAN;
BEGIN
  -- Проверяем триггер
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trigger_notify_user_order'
    AND event_object_table = 'orders'
  ) INTO v_trigger_exists;

  -- Проверяем функцию
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'notify_user_order_to_telegram'
    AND n.nspname = 'public'
  ) INTO v_function_exists;

  RAISE NOTICE '====================================';
  RAISE NOTICE 'Триггер trigger_notify_user_order: %', CASE WHEN v_trigger_exists THEN '✅ СОЗДАН' ELSE '❌ НЕ НАЙДЕН' END;
  RAISE NOTICE 'Функция notify_user_order_to_telegram: %', CASE WHEN v_function_exists THEN '✅ СОЗДАНА' ELSE '❌ НЕ НАЙДЕНА' END;
  RAISE NOTICE '====================================';
END $$;

-- Показываем все активные триггеры на таблице orders
SELECT
  trigger_name,
  action_timing || ' ' || event_manipulation AS timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'orders'
AND event_object_schema = 'public'
ORDER BY trigger_name;
