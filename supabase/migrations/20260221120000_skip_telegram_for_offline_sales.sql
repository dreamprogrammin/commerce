-- ============================================================================
-- FIX: Не отправлять Telegram-уведомления для оффлайн-продаж
-- Админ сам создаёт продажу через POS — уведомлять его нет смысла
-- ============================================================================

-- Обновляем триггер для orders
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
  -- Не отправляем уведомление для оффлайн-продаж (админ сам создал через POS)
  IF NEW.source = 'offline' THEN
    RAISE NOTICE '⏭️ [ORDERS] Пропуск уведомления для оффлайн-продажи %', NEW.id;
    RETURN NEW;
  END IF;

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

  RAISE NOTICE '📤 [ORDERS] Уведомление о заказе % отправлено (request_id: %)', NEW.id, request_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '⚠️ [ORDERS] Ошибка отправки уведомления: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Обновляем триггер для guest_checkouts
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
  -- Не отправляем уведомление для оффлайн-продаж (админ сам создал через POS)
  IF NEW.source = 'offline' THEN
    RAISE NOTICE '⏭️ [GUEST] Пропуск уведомления для оффлайн-продажи %', NEW.id;
    RETURN NEW;
  END IF;

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

  RAISE NOTICE '📤 [GUEST] Уведомление о гостевом заказе % отправлено (request_id: %)', NEW.id, request_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '⚠️ [GUEST] Ошибка отправки уведомления: %', SQLERRM;
  RETURN NEW;
END;
$$;
