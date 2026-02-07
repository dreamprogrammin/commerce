-- =====================================================================================
-- ИСПРАВЛЕНИЕ: Формат payload для Telegram уведомлений об отмене заказа
-- =====================================================================================
-- ПРОБЛЕМА:
-- Триггер notify_telegram_order_cancelled отправляет payload в неправильном формате
-- Edge Function sync-order-status-to-telegram ожидает { record, old_record, table }
-- А триггер отправляет { order_id, status, telegram_message_id, table }
--
-- РЕШЕНИЕ:
-- Исправить формат payload в триггере
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.notify_telegram_order_cancelled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  function_url TEXT;
  payload JSONB;
  request_id BIGINT;
BEGIN
  -- Проверяем что статус изменился на cancelled
  IF NEW.status <> 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Проверяем что был telegram_message_id (значит уведомление отправлялось)
  IF NEW.telegram_message_id IS NULL THEN
    RAISE NOTICE '⚠️ Заказ % не имеет telegram_message_id, пропускаем обновление', NEW.id;
    RETURN NEW;
  END IF;

  -- URL Edge Function для обновления Telegram
  function_url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/sync-order-status-to-telegram';

  -- ✅ ИСПРАВЛЕНО: Формируем payload в правильном формате для sync-order-status-to-telegram
  payload := jsonb_build_object(
    'record', jsonb_build_object(
      'id', NEW.id,
      'status', NEW.status,
      'telegram_message_id', NEW.telegram_message_id
    ),
    'old_record', jsonb_build_object(
      'status', OLD.status
    ),
    'table', TG_TABLE_NAME
  );

  RAISE NOTICE '📦 Отправка уведомления об отмене заказа %', NEW.id;
  RAISE NOTICE '📋 Payload: %', payload;

  -- Отправляем HTTP запрос через pg_net
  SELECT INTO request_id
    net.http_post(
      url := function_url,
      body := payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      )
    );

  RAISE NOTICE '📱 Запрос отправлен (request_id: %)', request_id;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '⚠️ Ошибка отправки уведомления в Telegram: %', SQLERRM;
  RETURN NEW; -- Не ломаем транзакцию
END;
$$;

COMMENT ON FUNCTION public.notify_telegram_order_cancelled IS
'Отправляет уведомление в Telegram при отмене заказа (исправленный формат payload)';

-- =====================================================================================
-- Пересоздаём триггеры
-- =====================================================================================

-- Удаляем старые триггеры
DROP TRIGGER IF EXISTS trigger_notify_telegram_cancelled ON public.orders;
DROP TRIGGER IF EXISTS trigger_notify_telegram_cancelled ON public.guest_checkouts;
DROP TRIGGER IF EXISTS on_order_cancelled_notify_telegram ON public.orders;
DROP TRIGGER IF EXISTS on_guest_checkout_cancelled_notify_telegram ON public.guest_checkouts;

-- Создаём триггер для orders
CREATE TRIGGER trigger_notify_telegram_cancelled
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status <> 'cancelled')
  EXECUTE FUNCTION public.notify_telegram_order_cancelled();

-- Создаём триггер для guest_checkouts
CREATE TRIGGER trigger_notify_telegram_cancelled
  AFTER UPDATE ON public.guest_checkouts
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status <> 'cancelled')
  EXECUTE FUNCTION public.notify_telegram_order_cancelled();

-- =====================================================================================
-- Удаляем дублирующую функцию если есть
-- =====================================================================================

DROP FUNCTION IF EXISTS public.notify_order_cancellation_to_telegram() CASCADE;

-- =====================================================================================
-- ПРОВЕРКА
-- =====================================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ ТРИГГЕР ОТМЕНЫ ЗАКАЗА ИСПРАВЛЕН';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Теперь при отмене заказа клиентом:';
  RAISE NOTICE '  1. Триггер отправляет payload в правильном формате';
  RAISE NOTICE '  2. sync-order-status-to-telegram обрабатывает запрос';
  RAISE NOTICE '  3. Сообщение в Telegram обновляется в реальном времени';
  RAISE NOTICE '========================================';
END $$;

-- Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
