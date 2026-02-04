-- =====================================================================================
-- ENSURE: Триггеры для Telegram уведомлений существуют и активны
-- =====================================================================================
-- ПРОБЛЕМА:
-- Гостевые заказы не приходят в Telegram, логов нет
-- Возможно триггер trigger_notify_guest_checkout отсутствует или отключен
--
-- РЕШЕНИЕ:
-- Проверяем и пересоздаём оба триггера (для orders и guest_checkouts)
-- Проверяем расширение pg_net
-- =====================================================================================

-- Проверяем расширение pg_net (необходимо для http_post)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
    ) THEN
        CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
        RAISE NOTICE '✅ Расширение pg_net включено';
    ELSE
        RAISE NOTICE '✅ Расширение pg_net уже включено';
    END IF;
END $$;

-- =====================================================================================
-- ФУНКЦИЯ ДЛЯ УВЕДОМЛЕНИЙ О ЗАКАЗАХ ПОЛЬЗОВАТЕЛЕЙ
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.notify_user_order_to_telegram()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  RAISE NOTICE '📤 Уведомление о заказе % отправлено (request_id: %)', NEW.id, request_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '⚠️ Ошибка отправки уведомления: %', SQLERRM;
  RETURN NEW; -- Не ломаем транзакцию, если Telegram недоступен
END;
$$;

COMMENT ON FUNCTION public.notify_user_order_to_telegram IS
  'Отправляет уведомление о заказе пользователя в Telegram через Edge Function';

-- =====================================================================================
-- ФУНКЦИЯ ДЛЯ УВЕДОМЛЕНИЙ О ГОСТЕВЫХ ЗАКАЗАХ
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.notify_guest_checkout_to_telegram()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  RAISE NOTICE '📤 Уведомление о гостевом заказе % отправлено (request_id: %)', NEW.id, request_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '⚠️ Ошибка отправки уведомления: %', SQLERRM;
  RETURN NEW; -- Не ломаем транзакцию
END;
$$;

COMMENT ON FUNCTION public.notify_guest_checkout_to_telegram IS
  'Отправляет уведомление о гостевом заказе в Telegram через Edge Function';

-- =====================================================================================
-- ПЕРЕСОЗДАЁМ ТРИГГЕРЫ
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

DO $$
DECLARE
  v_orders_trigger TEXT;
  v_guest_trigger TEXT;
BEGIN
  -- Проверяем триггер для orders
  SELECT trigger_name INTO v_orders_trigger
  FROM information_schema.triggers
  WHERE event_object_table = 'orders'
    AND trigger_name = 'trigger_notify_user_order';

  IF v_orders_trigger IS NOT NULL THEN
    RAISE NOTICE '✅ Триггер trigger_notify_user_order активен на таблице orders';
  ELSE
    RAISE EXCEPTION '❌ Триггер trigger_notify_user_order НЕ НАЙДЕН на таблице orders';
  END IF;

  -- Проверяем триггер для guest_checkouts
  SELECT trigger_name INTO v_guest_trigger
  FROM information_schema.triggers
  WHERE event_object_table = 'guest_checkouts'
    AND trigger_name = 'trigger_notify_guest_checkout';

  IF v_guest_trigger IS NOT NULL THEN
    RAISE NOTICE '✅ Триггер trigger_notify_guest_checkout активен на таблице guest_checkouts';
  ELSE
    RAISE EXCEPTION '❌ Триггер trigger_notify_guest_checkout НЕ НАЙДЕН на таблице guest_checkouts';
  END IF;

  -- Итоговый отчет
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ ВСЕ ТРИГГЕРЫ ДЛЯ TELEGRAM НАСТРОЕНЫ';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Триггеры:';
  RAISE NOTICE '  - orders → trigger_notify_user_order';
  RAISE NOTICE '  - guest_checkouts → trigger_notify_guest_checkout';
  RAISE NOTICE '';
  RAISE NOTICE 'Обе функции отправляют уведомления на:';
  RAISE NOTICE '  https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/notify-order-to-telegram';
  RAISE NOTICE '';
  RAISE NOTICE 'Тестирование:';
  RAISE NOTICE '  Создайте гостевой заказ и проверьте Telegram';
END $$;

-- Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
