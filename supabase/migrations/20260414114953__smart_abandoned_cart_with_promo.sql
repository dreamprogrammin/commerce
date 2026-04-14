-- =====================================================================================
-- Smart Abandoned Cart Recovery с промокодами
-- =====================================================================================
-- 1. Таблица reminder_logs - история отправок
-- 2. Обновленная функция check_abandoned_carts с двумя напоминаниями:
--    - 20 минут: мягкое напоминание с фото
--    - 24 часа: промокод 5% на 2 часа
-- 3. Индексы для производительности
-- 4. Cron каждые 15 минут
-- =====================================================================================

-- 1. Таблица логов напоминаний
CREATE TABLE IF NOT EXISTS public.reminder_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  cart_snapshot JSONB,
  notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL
);

CREATE INDEX idx_reminder_logs_user_type ON reminder_logs(user_id, reminder_type, sent_at DESC);

ALTER TABLE reminder_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE reminder_logs IS 'История отправленных напоминаний для правила тишины';

-- 2. Обновленная функция с двумя напоминаниями
CREATE OR REPLACE FUNCTION public.check_abandoned_carts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r RECORD;
  v_title TEXT;
  v_body TEXT;
  v_items_count INT;
  v_product RECORD;
  v_cart_item JSONB;
  v_product_names TEXT := '';
  v_photo_url TEXT;
  v_notification_id UUID;
  v_promo_code TEXT;
BEGIN
  -- ПЕРВОЕ НАПОМИНАНИЕ (20 минут) - мягкое, с фото
  FOR r IN
    SELECT sc.id, sc.user_id, sc.items, sc.total_amount
    FROM server_carts sc
    WHERE sc.updated_at < now() - interval '20 minutes'
      AND jsonb_array_length(sc.items) > 0
      AND NOT EXISTS (
        SELECT 1 FROM orders o WHERE o.user_id = sc.user_id AND o.created_at > sc.updated_at
      )
      AND NOT EXISTS (
        SELECT 1 FROM reminder_logs rl
        WHERE rl.user_id = sc.user_id
          AND rl.reminder_type = 'abandoned_cart_first'
          AND rl.sent_at > sc.updated_at
      )
  LOOP
    v_items_count := jsonb_array_length(r.items);
    v_title := '🛒 Ваши товары ждут вас!';
    v_photo_url := NULL;

    IF v_items_count = 1 THEN
      v_cart_item := r.items->0;
      SELECT p.name, pi.image_url INTO v_product
      FROM products p
      LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.display_order = 0
      WHERE p.id = (v_cart_item->>'product_id')::UUID;

      v_body := 'В вашей корзине: ' || COALESCE(v_product.name, 'товар') ||
                chr(10) || chr(10) || 'Сумма: ' || r.total_amount || ' ₸';

      IF v_product.image_url IS NOT NULL THEN
        v_photo_url := 'https://gvsdevsvzgcivpphcuai.supabase.co/storage/v1/object/public/product-images/' || v_product.image_url || '_lg.webp';
      END IF;
    ELSIF v_items_count BETWEEN 2 AND 3 THEN
      v_product_names := '';
      FOR v_cart_item IN SELECT * FROM jsonb_array_elements(r.items)
      LOOP
        SELECT name INTO v_product FROM products WHERE id = (v_cart_item->>'product_id')::UUID;
        v_product_names := v_product_names || '• ' || COALESCE(v_product.name, 'товар') || chr(10);
      END LOOP;
      v_body := 'В вашей корзине ' || v_items_count || ' товара:' || chr(10) || chr(10) || v_product_names || chr(10) || 'Сумма: ' || r.total_amount || ' ₸';
    ELSE
      v_body := 'В вашей корзине ' || v_items_count || ' товаров на сумму ' || r.total_amount || ' ₸';
    END IF;

    INSERT INTO notifications (user_id, type, title, body, link, is_read, photo_url)
    VALUES (r.user_id, 'abandoned_cart', v_title, v_body, '/cart', false, v_photo_url)
    RETURNING id INTO v_notification_id;

    INSERT INTO reminder_logs (user_id, reminder_type, cart_snapshot, notification_id)
    VALUES (r.user_id, 'abandoned_cart_first', r.items, v_notification_id);
  END LOOP;

  -- ВТОРОЕ НАПОМИНАНИЕ (24 часа) - с промокодом 5% на 2 часа
  FOR r IN
    SELECT sc.id, sc.user_id, sc.items, sc.total_amount
    FROM server_carts sc
    WHERE sc.updated_at < now() - interval '24 hours'
      AND jsonb_array_length(sc.items) > 0
      AND NOT EXISTS (
        SELECT 1 FROM orders o WHERE o.user_id = sc.user_id AND o.created_at > sc.updated_at
      )
      AND EXISTS (
        SELECT 1 FROM reminder_logs rl
        WHERE rl.user_id = sc.user_id
          AND rl.reminder_type = 'abandoned_cart_first'
          AND rl.sent_at > sc.updated_at
      )
      AND NOT EXISTS (
        SELECT 1 FROM reminder_logs rl
        WHERE rl.user_id = sc.user_id
          AND rl.reminder_type = 'abandoned_cart_promo'
          AND rl.sent_at > sc.updated_at
      )
  LOOP
    v_items_count := jsonb_array_length(r.items);

    -- Генерируем промокод TG5-XXXXX
    v_promo_code := 'TG5-' || upper(substring(md5(random()::text) from 1 for 5));

    -- Создаем промокод в БД
    INSERT INTO promo_codes (
      code, user_id, discount_percent, min_order_amount,
      max_uses, expires_at
    ) VALUES (
      v_promo_code, r.user_id, 5, 0,
      1, now() + interval '2 hours'
    );

    v_title := '🔥 Не забудьте про корзину!';
    v_body := 'Ваши товары всё ещё ждут вас! Сумма: ' || r.total_amount || ' ₸' ||
              chr(10) || chr(10) ||
              '🎁 Ваш промокод: ' || v_promo_code ||
              chr(10) || '(скидка 5%, действует 2 часа)';

    INSERT INTO notifications (user_id, type, title, body, link, is_read, photo_url)
    VALUES (r.user_id, 'abandoned_cart', v_title, v_body, '/cart', false, NULL)
    RETURNING id INTO v_notification_id;

    INSERT INTO reminder_logs (user_id, reminder_type, cart_snapshot, notification_id)
    VALUES (r.user_id, 'abandoned_cart_promo', r.items, v_notification_id);
  END LOOP;

  DELETE FROM server_carts WHERE jsonb_array_length(items) = 0 AND updated_at < now() - interval '7 days';
  DELETE FROM reminder_logs WHERE sent_at < now() - interval '30 days';
END;
$$;

COMMENT ON FUNCTION check_abandoned_carts IS
  'Smart Abandoned Cart Recovery: 20 мин (фото+кнопка) → 24ч (промокод 5% на 2ч)';

-- 3. Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_server_carts_user_id ON public.server_carts(user_id);
CREATE INDEX IF NOT EXISTS idx_server_carts_updated_at ON public.server_carts(updated_at) WHERE jsonb_array_length(items) > 0;
CREATE INDEX IF NOT EXISTS idx_reminder_logs_user_id_type ON public.reminder_logs(user_id, reminder_type);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON public.orders(user_id, created_at);

-- 4. Обновляем cron на каждые 15 минут
DO $$
BEGIN
  PERFORM cron.unschedule('Abandoned Cart Reminders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'Smart Abandoned Cart Recovery',
  '*/15 * * * *',
  'SELECT public.check_abandoned_carts();'
);