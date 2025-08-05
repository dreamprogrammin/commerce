-- Файл: supabase/migrations/..._create_order_notification_trigger.sql
-- Назначение: Создает триггер, который вызывает Edge Function при новом заказе.

-- 1. Включаем расширение pg_net, если оно еще не включено
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Создаем триггерную функцию, которая будет "звонить" по URL
CREATE OR REPLACE FUNCTION public.trigger_order_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Выполняем асинхронный POST-запрос к нашей Edge Function
    -- Передаем всю новую запись о заказе (NEW) в теле запроса
    PERFORM net.http_post(
        url:='https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/notify-order-to-telegram',
        body:=jsonb_build_object('record', NEW)
    );
    RETURN NEW;
END;
$$;

-- 3. Привязываем ("вешаем") триггер на таблицу orders
DROP TRIGGER IF EXISTS on_new_order_created_send_notification ON public.orders;
CREATE TRIGGER on_new_order_created_send_notification
AFTER INSERT ON public.orders
FOR EACH ROW
-- Срабатывает только для заказов в начальном статусе 'new'
WHEN (NEW.status = 'new')
EXECUTE FUNCTION public.trigger_order_notification();