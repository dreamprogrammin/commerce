-- ============================================================================
-- Создаем триггер для уведомлений о гостевых заказах
-- ============================================================================

-- Проверяем и создаем функцию триггера если её нет
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
  -- Не отправляем уведомление для оффлайн-продаж
  IF NEW.source = 'offline' THEN
    RAISE NOTICE '⏭️ [GUEST] Пропуск уведомления для оффлайн-продажи %', NEW.id;
    RETURN NEW;
  END IF;

  function_url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/notify-order-to-telegram';

  payload := jsonb_build_object(
    'record', row_to_json(NEW),
    'table', 'guest_checkouts',
    'operation', TG_OP
  );

  SELECT INTO request_id
    net.http_post(
      url := function_url,
      body := payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      )
    );

  RAISE NOTICE '📤 [GUEST] Уведомление о гостевом заказе % отправлено (request_id: %)', NEW.id, request_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '⚠️ [GUEST] Ошибка отправки уведомления: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Создаем триггер
DROP TRIGGER IF EXISTS trigger_notify_guest_checkout ON public.guest_checkouts;

CREATE TRIGGER trigger_notify_guest_checkout
  AFTER INSERT ON public.guest_checkouts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_guest_checkout_to_telegram();

-- Проверка
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'guest_checkouts'
      AND trigger_name = 'trigger_notify_guest_checkout'
  ) THEN
    RAISE NOTICE '✅ Триггер trigger_notify_guest_checkout создан';
  ELSE
    RAISE EXCEPTION '❌ Триггер не создан';
  END IF;
END $$;
