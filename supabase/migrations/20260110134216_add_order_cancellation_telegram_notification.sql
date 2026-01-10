-- =====================================================================================
-- МИГРАЦИЯ: Добавление уведомления в Telegram при отмене заказа пользователем
-- =====================================================================================
-- Назначение:
-- - Отправляет уведомление в Telegram когда пользователь отменяет заказ
-- - Обновляет существующее сообщение о заказе
-- - Добавляет информацию о том, кто отменил (пользователь/admin)
-- =====================================================================================

-- Функция для отправки уведомления об отмене заказа
CREATE OR REPLACE FUNCTION public.notify_order_cancellation_to_telegram()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_telegram_message_id TEXT;
  v_bot_token TEXT := current_setting('app.telegram_bot_token', true);
  v_chat_id TEXT := current_setting('app.telegram_chat_id', true);
  v_order_number TEXT;
  v_notification_text TEXT;
  v_customer_name TEXT := '';
  v_customer_phone TEXT := '';
BEGIN
  -- Проверяем что статус изменился на 'cancelled'
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    RAISE LOG '🔔 Заказ % отменен, статус: % -> %', NEW.id, OLD.status, NEW.status;

    -- Получаем telegram_message_id
    v_telegram_message_id := NEW.telegram_message_id;

    -- Определяем номер заказа
    v_order_number := substring(NEW.id::text from 31);

    -- Получаем информацию о клиенте
    IF TG_TABLE_NAME = 'orders' THEN
      -- Для зарегистрированных пользователей
      SELECT
        COALESCE(p.first_name || ' ' || COALESCE(p.last_name, ''), 'Не указано'),
        COALESCE(p.phone, 'Не указан')
      INTO v_customer_name, v_customer_phone
      FROM public.profiles p
      WHERE p.id = NEW.user_id;
    ELSIF TG_TABLE_NAME = 'guest_checkouts' THEN
      -- Для гостей
      v_customer_name := COALESCE(NEW.guest_name, 'Гость');
      v_customer_phone := COALESCE(NEW.guest_phone, 'Не указан');
    END IF;

    -- Формируем текст уведомления
    v_notification_text := format(
      E'⚠️ *ЗАКАЗ ОТМЕНЕН КЛИЕНТОМ*\n\n'
      '📦 Заказ №%s\n'
      '👤 Клиент: %s\n'
      '📞 Телефон: `%s`\n\n'
      '_Заказ отменен пользователем через личный кабинет_',
      v_order_number,
      v_customer_name,
      v_customer_phone
    );

    -- Если есть telegram_message_id, обновляем существующее сообщение
    IF v_telegram_message_id IS NOT NULL AND v_telegram_message_id != '' THEN
      RAISE LOG '📱 Обновление Telegram сообщения %', v_telegram_message_id;

      -- Вызываем Supabase Edge Function для обновления сообщения
      PERFORM
        net.http_post(
          url := current_setting('app.supabase_url', true) || '/functions/v1/sync-order-status-to-telegram',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
          ),
          body := jsonb_build_object(
            'order_id', NEW.id,
            'table', TG_TABLE_NAME,
            'message_id', v_telegram_message_id,
            'status', 'cancelled',
            'cancelled_by', 'user'
          )
        );
    END IF;

    -- Отправляем дополнительное уведомление
    RAISE LOG '📤 Отправка уведомления об отмене в Telegram';

    PERFORM
      net.http_post(
        url := 'https://api.telegram.org/bot' || v_bot_token || '/sendMessage',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'chat_id', v_chat_id,
          'text', v_notification_text,
          'parse_mode', 'Markdown'
        )
      );

    RAISE LOG '✅ Уведомление об отмене отправлено';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_order_cancellation_to_telegram() IS
'Отправляет уведомление в Telegram при отмене заказа пользователем.
Обновляет существующее сообщение и отправляет дополнительное уведомление.
Срабатывает при изменении статуса на cancelled.';

-- Создаем триггер для таблицы orders
DROP TRIGGER IF EXISTS on_order_cancelled_notify_telegram ON public.orders;

CREATE TRIGGER on_order_cancelled_notify_telegram
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
  EXECUTE FUNCTION public.notify_order_cancellation_to_telegram();

-- Создаем триггер для таблицы guest_checkouts
DROP TRIGGER IF EXISTS on_guest_checkout_cancelled_notify_telegram ON public.guest_checkouts;

CREATE TRIGGER on_guest_checkout_cancelled_notify_telegram
  AFTER UPDATE ON public.guest_checkouts
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
  EXECUTE FUNCTION public.notify_order_cancellation_to_telegram();

COMMENT ON TRIGGER on_order_cancelled_notify_telegram ON public.orders IS
'Отправляет уведомление в Telegram при отмене заказа пользователем (таблица orders)';

COMMENT ON TRIGGER on_guest_checkout_cancelled_notify_telegram ON public.guest_checkouts IS
'Отправляет уведомление в Telegram при отмене гостевого заказа (таблица guest_checkouts)';

-- =====================================================================================
-- КОНЕЦ МИГРАЦИИ
-- =====================================================================================
