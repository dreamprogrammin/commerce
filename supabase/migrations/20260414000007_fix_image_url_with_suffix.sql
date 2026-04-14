-- Исправляем URL изображений: добавляем _lg.webp
CREATE OR REPLACE FUNCTION public.check_abandoned_carts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r RECORD;
  v_title TEXT;
  v_body TEXT;
  v_items_count INT;
  v_product RECORD;
  v_cart_item JSONB;
  v_photos JSONB := '[]'::JSONB;
  v_product_names TEXT := '';
BEGIN
  -- 10 минут напоминание
  FOR r IN
    SELECT sc.id, sc.user_id, sc.items, sc.total_amount, p.telegram_chat_id
    FROM server_carts sc
    JOIN profiles p ON p.id = sc.user_id
    WHERE sc.updated_at < now() - interval '10 minutes'
      AND sc.reminder_1h_sent = false
      AND jsonb_array_length(sc.items) > 0
      AND NOT EXISTS (
        SELECT 1 FROM orders o
        WHERE o.user_id = sc.user_id AND o.created_at > sc.updated_at
      )
  LOOP
    v_items_count := jsonb_array_length(r.items);
    v_title := '🛒 Ваши товары ждут вас!';
    v_photos := '[]'::JSONB;
    v_product_names := '';

    -- Если 1 товар - отправляем с фото
    IF v_items_count = 1 THEN
      v_cart_item := r.items->0;
      
      SELECT p.name, pi.image_url INTO v_product
      FROM products p
      LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.display_order = 0
      WHERE p.id = (v_cart_item->>'product_id')::UUID;
      
      v_body := 'В вашей корзине: ' || COALESCE(v_product.name, 'товар') || 
                chr(10) || chr(10) || 'Сумма: ' || r.total_amount || ' ₸' || 
                chr(10) || 'Завершите покупку на uhti.kz';
      
      IF v_product.image_url IS NOT NULL THEN
        v_photos := jsonb_build_array(
          jsonb_build_object('url', 
            'https://gvsdevsvzgcivpphcuai.supabase.co/storage/v1/object/public/product-images/' || v_product.image_url || '_lg.webp'
          )
        );
      END IF;

    -- Если 2-3 товара - список названий
    ELSIF v_items_count BETWEEN 2 AND 3 THEN
      FOR v_cart_item IN SELECT * FROM jsonb_array_elements(r.items)
      LOOP
        SELECT name INTO v_product
        FROM products
        WHERE id = (v_cart_item->>'product_id')::UUID;
        
        v_product_names := v_product_names || '• ' || COALESCE(v_product.name, 'товар') || chr(10);
      END LOOP;
      
      v_body := 'В вашей корзине ' || v_items_count || ' товара:' || 
                chr(10) || chr(10) || v_product_names || 
                chr(10) || 'Сумма: ' || r.total_amount || ' ₸' || 
                chr(10) || 'Завершите покупку на uhti.kz';

    -- Если 4+ товаров - только количество
    ELSE
      v_body := 'В вашей корзине ' || v_items_count || ' товаров на сумму ' || 
                r.total_amount || ' ₸. Завершите покупку на uhti.kz';
    END IF;

    -- Telegram
    IF r.telegram_chat_id IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/send-user-telegram',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'chat_id', r.telegram_chat_id,
          'title', v_title,
          'body', v_body,
          'photos', v_photos
        )
      );
    END IF;

    -- In-app уведомление
    INSERT INTO notifications (user_id, type, title, body, link, is_read)
    VALUES (r.user_id, 'abandoned_cart', v_title, v_body, '/cart', false);

    UPDATE server_carts SET reminder_1h_sent = true WHERE id = r.id;
  END LOOP;

  -- 1 час напоминание (после первого)
  FOR r IN
    SELECT sc.id, sc.user_id, sc.items, sc.total_amount, p.telegram_chat_id
    FROM server_carts sc
    JOIN profiles p ON p.id = sc.user_id
    WHERE sc.updated_at < now() - interval '70 minutes'  -- 10 мин первое + 60 мин = 70 мин от updated_at
      AND sc.reminder_1h_sent = true
      AND sc.reminder_24h_sent = false
      AND jsonb_array_length(sc.items) > 0
      AND NOT EXISTS (
        SELECT 1 FROM orders o
        WHERE o.user_id = sc.user_id AND o.created_at > sc.updated_at
      )
  LOOP
    v_items_count := jsonb_array_length(r.items);
    v_title := '🔥 Не забудьте про корзину!';
    v_body := 'Ваши товары всё ещё ждут вас! Сумма: ' || r.total_amount || ' ₸' || 
              chr(10) || 'Завершите покупку на uhti.kz';

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

  DELETE FROM server_carts
  WHERE jsonb_array_length(items) = 0 AND updated_at < now() - interval '7 days';
END;
$$;
