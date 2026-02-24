-- =====================================================================================
-- МИГРАЦИЯ: Брошенная корзина — серверная синхронизация + напоминания
-- =====================================================================================
-- server_carts: хранит корзину авторизованных пользователей
-- check_abandoned_carts(): cron-функция проверяет забытые корзины (1ч, 24ч)
-- Отправляет Telegram + in-app уведомление
-- =====================================================================================

-- 1. Таблица server_carts
CREATE TABLE public.server_carts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  items JSONB NOT NULL DEFAULT '[]',
  total_amount NUMERIC(10,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  reminder_1h_sent BOOLEAN DEFAULT false,
  reminder_24h_sent BOOLEAN DEFAULT false
);

ALTER TABLE public.server_carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cart" ON public.server_carts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_server_carts_updated ON public.server_carts(updated_at)
  WHERE reminder_1h_sent = false OR reminder_24h_sent = false;

-- 2. Функция check_abandoned_carts()
CREATE OR REPLACE FUNCTION public.check_abandoned_carts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r RECORD;
  v_title TEXT;
  v_body TEXT;
  v_items_count INT;
BEGIN
  -- 1ч напоминание
  FOR r IN
    SELECT sc.id, sc.user_id, sc.items, sc.total_amount,
           p.telegram_chat_id
    FROM server_carts sc
    JOIN profiles p ON p.id = sc.user_id
    WHERE sc.updated_at < now() - interval '1 hour'
      AND sc.reminder_1h_sent = false
      AND jsonb_array_length(sc.items) > 0
      AND NOT EXISTS (
        SELECT 1 FROM orders o
        WHERE o.user_id = sc.user_id
          AND o.created_at > sc.updated_at
      )
  LOOP
    v_items_count := jsonb_array_length(r.items);
    v_title := '🛒 Ваши товары ждут вас!';
    v_body := 'В вашей корзине ' || v_items_count || ' ' ||
      CASE WHEN v_items_count = 1 THEN 'товар'
           WHEN v_items_count BETWEEN 2 AND 4 THEN 'товара'
           ELSE 'товаров' END ||
      ' на сумму ' || r.total_amount || ' ₸. Завершите покупку на uhti.kz';

    -- Telegram (если привязан)
    IF r.telegram_chat_id IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/send-user-telegram',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'chat_id', r.telegram_chat_id,
          'title', v_title,
          'body', v_body
        )
      );
    END IF;

    -- In-app уведомление
    INSERT INTO notifications (user_id, type, title, body, link, is_read)
    VALUES (r.user_id, 'abandoned_cart', v_title, v_body, '/cart', false);

    -- Отмечаем отправку
    UPDATE server_carts SET reminder_1h_sent = true WHERE id = r.id;
  END LOOP;

  -- 24ч напоминание
  FOR r IN
    SELECT sc.id, sc.user_id, sc.items, sc.total_amount,
           p.telegram_chat_id
    FROM server_carts sc
    JOIN profiles p ON p.id = sc.user_id
    WHERE sc.updated_at < now() - interval '24 hours'
      AND sc.reminder_1h_sent = true
      AND sc.reminder_24h_sent = false
      AND jsonb_array_length(sc.items) > 0
      AND NOT EXISTS (
        SELECT 1 FROM orders o
        WHERE o.user_id = sc.user_id
          AND o.created_at > sc.updated_at
      )
  LOOP
    v_items_count := jsonb_array_length(r.items);
    v_title := '🔥 Не забудьте про корзину!';
    v_body := 'Ваши ' || v_items_count || ' ' ||
      CASE WHEN v_items_count = 1 THEN 'товар ждёт'
           WHEN v_items_count BETWEEN 2 AND 4 THEN 'товара ждут'
           ELSE 'товаров ждут' END ||
      ' вас! Сумма: ' || r.total_amount || ' ₸. Оформите заказ на uhti.kz';

    IF r.telegram_chat_id IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/send-user-telegram',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'chat_id', r.telegram_chat_id,
          'title', v_title,
          'body', v_body
        )
      );
    END IF;

    INSERT INTO notifications (user_id, type, title, body, link, is_read)
    VALUES (r.user_id, 'abandoned_cart', v_title, v_body, '/cart', false);

    UPDATE server_carts SET reminder_24h_sent = true WHERE id = r.id;
  END LOOP;

  -- Очистка: удаляем пустые корзины старше 7 дней
  DELETE FROM server_carts
  WHERE jsonb_array_length(items) = 0
    AND updated_at < now() - interval '7 days';
END;
$$;

-- 3. Cron: каждые 30 минут
SELECT cron.schedule(
  'Abandoned Cart Reminders',
  '*/30 * * * *',
  'SELECT public.check_abandoned_carts();'
);
