-- =====================================================================================
-- МИГРАЦИЯ: Magic Links в уведомлениях Telegram
-- =====================================================================================
-- Обновляем trigger_send_telegram_notification():
-- - Если notification.link IS NOT NULL → генерируем magic link
-- - Передаём кнопку «🔗 Открыть на сайте» в send-user-telegram
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.trigger_send_telegram_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_chat_id BIGINT;
  v_magic_url TEXT;
  v_buttons JSONB;
  v_body_payload JSONB;
BEGIN
  -- Проверяем, есть ли у пользователя telegram_chat_id
  SELECT telegram_chat_id INTO v_chat_id
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_chat_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Если есть ссылка — генерируем magic link с автологином
  v_buttons := NULL;
  IF NEW.link IS NOT NULL AND NEW.link <> '' THEN
    v_magic_url := public.generate_magic_link(NEW.user_id, NEW.link);
    v_buttons := jsonb_build_array(
      jsonb_build_object('text', '🔗 Открыть на сайте', 'url', v_magic_url)
    );
  END IF;

  -- Формируем payload
  v_body_payload := jsonb_build_object(
    'chat_id', v_chat_id,
    'title', NEW.title,
    'body', COALESCE(NEW.body, '')
  );

  IF v_buttons IS NOT NULL THEN
    v_body_payload := v_body_payload || jsonb_build_object('buttons', v_buttons);
  END IF;

  -- Вызываем Edge Function для отправки в Telegram
  PERFORM net.http_post(
    url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/send-user-telegram',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := v_body_payload
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_send_telegram_notification error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Также обновляем check_abandoned_carts() чтобы использовать magic links для кнопки корзины
CREATE OR REPLACE FUNCTION public.check_abandoned_carts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r RECORD;
  v_title TEXT;
  v_body TEXT;
  v_items_count INT;
  v_photos JSONB;
  v_buttons JSONB;
  v_product_names TEXT[];
  v_product_rec RECORD;
  v_magic_url TEXT;
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

    -- Собираем фото и названия товаров из корзины
    v_photos := '[]'::jsonb;
    v_product_names := ARRAY[]::TEXT[];

    FOR v_product_rec IN
      SELECT
        pr.name,
        pi.image_url
      FROM jsonb_array_elements(r.items) AS item
      JOIN products pr ON pr.id = (item->>'product_id')::uuid
      LEFT JOIN LATERAL (
        SELECT image_url FROM product_images
        WHERE product_id = pr.id
        ORDER BY display_order ASC
        LIMIT 1
      ) pi ON true
      LIMIT 5
    LOOP
      v_product_names := array_append(v_product_names, v_product_rec.name);

      IF v_product_rec.image_url IS NOT NULL THEN
        v_photos := v_photos || jsonb_build_array(
          jsonb_build_object(
            'url', 'https://gvsdevsvzgcivpphcuai.supabase.co/storage/v1/object/public/product-images/'
              || v_product_rec.image_url,
            'caption', v_product_rec.name
          )
        );
      END IF;
    END LOOP;

    -- Текст с названиями товаров
    v_title := '🧸 Кажется, вы забыли кое-что...';
    IF array_length(v_product_names, 1) = 1 THEN
      v_body := v_product_names[1] || ' ждёт вас! Сумма: ' || r.total_amount || ' ₸';
    ELSIF array_length(v_product_names, 1) <= 3 THEN
      v_body := array_to_string(v_product_names, ', ') || ' ждут вас! Сумма: ' || r.total_amount || ' ₸';
    ELSE
      v_body := v_product_names[1] || ', ' || v_product_names[2]
        || ' и ещё ' || (v_items_count - 2) || ' '
        || CASE WHEN (v_items_count - 2) = 1 THEN 'товар'
                WHEN (v_items_count - 2) BETWEEN 2 AND 4 THEN 'товара'
                ELSE 'товаров' END
        || ' на сумму ' || r.total_amount || ' ₸';
    END IF;

    -- Кнопка «В корзину» с magic link
    v_magic_url := public.generate_magic_link(r.user_id, '/cart');
    v_buttons := jsonb_build_array(
      jsonb_build_object('text', '🛒 Перейти в корзину', 'url', v_magic_url)
    );

    -- Telegram (если привязан)
    IF r.telegram_chat_id IS NOT NULL THEN
      PERFORM net.http_post(
        url := current_setting('app.settings.supabase_url', true)
          || '/functions/v1/send-user-telegram',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'chat_id', r.telegram_chat_id,
          'title', v_title,
          'body', v_body,
          'photos', v_photos,
          'buttons', v_buttons
        )
      );
    END IF;

    -- In-app уведомление
    INSERT INTO notifications (user_id, type, title, body, link, is_read)
    VALUES (r.user_id, 'abandoned_cart', v_title, v_body, '/cart', false);

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

    v_photos := '[]'::jsonb;
    v_product_names := ARRAY[]::TEXT[];

    FOR v_product_rec IN
      SELECT
        pr.name,
        pi.image_url
      FROM jsonb_array_elements(r.items) AS item
      JOIN products pr ON pr.id = (item->>'product_id')::uuid
      LEFT JOIN LATERAL (
        SELECT image_url FROM product_images
        WHERE product_id = pr.id
        ORDER BY display_order ASC
        LIMIT 1
      ) pi ON true
      LIMIT 5
    LOOP
      v_product_names := array_append(v_product_names, v_product_rec.name);

      IF v_product_rec.image_url IS NOT NULL THEN
        v_photos := v_photos || jsonb_build_array(
          jsonb_build_object(
            'url', 'https://gvsdevsvzgcivpphcuai.supabase.co/storage/v1/object/public/product-images/'
              || v_product_rec.image_url,
            'caption', v_product_rec.name
          )
        );
      END IF;
    END LOOP;

    v_title := '🔥 Не забудьте про корзину!';
    IF array_length(v_product_names, 1) = 1 THEN
      v_body := v_product_names[1] || ' всё ещё ждёт вас! Сумма: ' || r.total_amount || ' ₸';
    ELSIF array_length(v_product_names, 1) <= 3 THEN
      v_body := array_to_string(v_product_names, ', ') || ' ждут вас! Сумма: ' || r.total_amount || ' ₸';
    ELSE
      v_body := 'Ваши ' || v_items_count || ' '
        || CASE WHEN v_items_count = 1 THEN 'товар ждёт'
                WHEN v_items_count BETWEEN 2 AND 4 THEN 'товара ждут'
                ELSE 'товаров ждут' END
        || ' вас! Сумма: ' || r.total_amount || ' ₸. Оформите заказ!';
    END IF;

    v_magic_url := public.generate_magic_link(r.user_id, '/cart');
    v_buttons := jsonb_build_array(
      jsonb_build_object('text', '🛒 Перейти в корзину', 'url', v_magic_url)
    );

    IF r.telegram_chat_id IS NOT NULL THEN
      PERFORM net.http_post(
        url := current_setting('app.settings.supabase_url', true)
          || '/functions/v1/send-user-telegram',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'chat_id', r.telegram_chat_id,
          'title', v_title,
          'body', v_body,
          'photos', v_photos,
          'buttons', v_buttons
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
