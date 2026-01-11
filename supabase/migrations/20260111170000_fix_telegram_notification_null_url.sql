-- =====================================================================================
-- МИГРАЦИЯ: Исправление ошибки NULL URL в уведомлениях об отмене заказа
-- =====================================================================================
-- Проблема:
-- При отмене заказа функция notify_order_cancellation_to_telegram пытается
-- вызвать net.http_post с url = NULL, что нарушает NOT NULL constraint
--
-- Решение:
-- Добавлена проверка наличия необходимых настроек перед отправкой HTTP запросов
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.notify_order_cancellation_to_telegram()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_telegram_message_id TEXT;
  v_bot_token TEXT := current_setting('app.telegram_bot_token', true);
  v_chat_id TEXT := current_setting('app.telegram_chat_id', true);
  v_supabase_url TEXT := current_setting('app.supabase_url', true);
  v_supabase_service_key TEXT := current_setting('app.supabase_service_role_key', true);
  v_order_number TEXT;
  v_notification_text TEXT;
  v_customer_name TEXT := '';
  v_customer_phone TEXT := '';
BEGIN
  -- Проверяем что статус изменился на 'cancelled'
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    RAISE LOG '🔔 Заказ % отменен, статус: % -> %', NEW.id, OLD.status, NEW.status;

    -- Проверяем наличие обязательных настроек для Telegram
    IF v_bot_token IS NULL OR v_chat_id IS NULL THEN
      RAISE WARNING '⚠️ Telegram настройки не найдены, уведомление не отправлено';
      RETURN NEW;
    END IF;

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

    -- Если есть telegram_message_id и настройки Supabase, обновляем существующее сообщение
    IF v_telegram_message_id IS NOT NULL
       AND v_telegram_message_id != ''
       AND v_supabase_url IS NOT NULL
       AND v_supabase_service_key IS NOT NULL THEN

      RAISE LOG '📱 Обновление Telegram сообщения %', v_telegram_message_id;

      -- Вызываем Supabase Edge Function для обновления сообщения
      PERFORM
        net.http_post(
          url := v_supabase_url || '/functions/v1/sync-order-status-to-telegram',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_supabase_service_key
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
Срабатывает при изменении статуса на cancelled.
Версия 2.0: Добавлена проверка наличия настроек перед отправкой HTTP запросов.';

-- =====================================================================================
-- КОНЕЦ МИГРАЦИИ
-- =====================================================================================
