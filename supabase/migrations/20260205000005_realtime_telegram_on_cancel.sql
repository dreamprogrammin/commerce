-- =====================================================================================
-- REALTIME TELEGRAM: Обновление уведомлений при отмене заказа клиентом
-- =====================================================================================
-- ПРОБЛЕМА:
-- Когда клиент отменяет заказ через сайт, Telegram сообщение не обновляется
-- Администраторы не видят что заказ отменён пока не обновят вручную
--
-- РЕШЕНИЕ:
-- Создать триггер на UPDATE orders/guest_checkouts, который при смене статуса
-- на 'cancelled' вызывает Edge Function для обновления Telegram сообщения
-- =====================================================================================

-- =====================================================================================
-- Функция для отправки уведомления в Telegram об отмене заказа
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
  v_cancelled_by_text TEXT;
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

  -- Определяем текст кто отменил
  v_cancelled_by_text := COALESCE(NEW.cancelled_by, 'неизвестно');

  -- URL Edge Function для обновления Telegram
  function_url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/sync-order-status-to-telegram';

  -- Формируем payload
  payload := jsonb_build_object(
    'order_id', NEW.id,
    'status', NEW.status,
    'telegram_message_id', NEW.telegram_message_id,
    'cancelled_by', v_cancelled_by_text,
    'table', TG_TABLE_NAME
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

  RAISE NOTICE '📱 Отправлено уведомление в Telegram об отмене заказа % (cancelled_by: %, request_id: %)',
    NEW.id, v_cancelled_by_text, request_id;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '⚠️ Ошибка отправки уведомления в Telegram: %', SQLERRM;
  RETURN NEW; -- Не ломаем транзакцию
END;
$$;

COMMENT ON FUNCTION public.notify_telegram_order_cancelled IS
'Отправляет уведомление в Telegram при отмене заказа клиентом (realtime обновление)';

-- =====================================================================================
-- Триггер для orders
-- =====================================================================================

DROP TRIGGER IF EXISTS trigger_notify_telegram_cancelled ON public.orders;

CREATE TRIGGER trigger_notify_telegram_cancelled
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status <> 'cancelled')
  EXECUTE FUNCTION public.notify_telegram_order_cancelled();

COMMENT ON TRIGGER trigger_notify_telegram_cancelled ON public.orders IS
'Отправляет realtime уведомление в Telegram при отмене заказа';

-- =====================================================================================
-- Триггер для guest_checkouts
-- =====================================================================================

DROP TRIGGER IF EXISTS trigger_notify_telegram_cancelled ON public.guest_checkouts;

CREATE TRIGGER trigger_notify_telegram_cancelled
  AFTER UPDATE ON public.guest_checkouts
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status <> 'cancelled')
  EXECUTE FUNCTION public.notify_telegram_order_cancelled();

COMMENT ON TRIGGER trigger_notify_telegram_cancelled ON public.guest_checkouts IS
'Отправляет realtime уведомление в Telegram при отмене гостевого заказа';

-- =====================================================================================
-- ПРОВЕРКА
-- =====================================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ REALTIME TELEGRAM НАСТРОЕН';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Теперь при отмене заказа клиентом:';
  RAISE NOTICE '  1. Статус меняется на cancelled';
  RAISE NOTICE '  2. Триггер автоматически вызывает Edge Function';
  RAISE NOTICE '  3. Сообщение в Telegram обновляется в реальном времени';
  RAISE NOTICE '========================================';
END $$;

-- Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
