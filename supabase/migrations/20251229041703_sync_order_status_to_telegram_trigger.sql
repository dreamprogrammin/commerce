-- Файл: supabase/migrations/20251229041703_sync_order_status_to_telegram_trigger.sql
-- Назначение: Создает триггеры для синхронизации статуса заказов в Telegram при обновлении

-- 1. Создаем триггерную функцию для синхронизации статуса заказов в Telegram
CREATE OR REPLACE FUNCTION public.sync_order_status_to_telegram()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Проверяем, что статус действительно изменился
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- Выполняем асинхронный POST-запрос к Edge Function
        PERFORM net.http_post(
            url:='https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/sync-order-status-to-telegram',
            body:=jsonb_build_object(
                'record', jsonb_build_object(
                    'id', NEW.id,
                    'status', NEW.status,
                    'telegram_message_id', NEW.telegram_message_id
                ),
                'old_record', jsonb_build_object(
                    'status', OLD.status
                ),
                'table', TG_TABLE_NAME
            )
        );
    END IF;
    RETURN NEW;
END;
$$;

-- 2. Создаем триггер для таблицы orders
DROP TRIGGER IF EXISTS on_order_status_changed ON public.orders;
CREATE TRIGGER on_order_status_changed
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_status_to_telegram();

-- 3. Создаем триггер для таблицы guest_checkouts
DROP TRIGGER IF EXISTS on_guest_order_status_changed ON public.guest_checkouts;
CREATE TRIGGER on_guest_order_status_changed
AFTER UPDATE OF status ON public.guest_checkouts
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_status_to_telegram();

-- Комментарии для документации
COMMENT ON FUNCTION public.sync_order_status_to_telegram() IS 'Синхронизирует изменение статуса заказа в Telegram для всех админов';
COMMENT ON TRIGGER on_order_status_changed ON public.orders IS 'Обновляет Telegram сообщение при изменении статуса заказа зарегистрированного пользователя';
COMMENT ON TRIGGER on_guest_order_status_changed ON public.guest_checkouts IS 'Обновляет Telegram сообщение при изменении статуса гостевого заказа';
