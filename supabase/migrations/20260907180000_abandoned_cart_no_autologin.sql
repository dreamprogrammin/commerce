-- =====================================================================================
-- БРОШЕННАЯ КОРЗИНА: убрать автологин из маркетинговых уведомлений
-- =====================================================================================
-- НАЙДЕНО аудитом 7 сентября 2026.
--
-- `trigger_send_telegram_notification` любую непустую `link` превращает в
-- magic-ссылку АВТОЛОГИНА и кладёт кнопкой в Telegram. Напоминание о брошенной
-- корзине шлётся с `link = '/cart'` — значит каждое «ваши товары ждут вас»
-- содержит ссылку, по которой в один тап входят в аккаунт: адреса, телефон,
-- история заказов, бонусы. Пересланное или показанное сообщение = вход в чужой
-- аккаунт. Второе напоминание вдобавок несёт персональный промокод.
--
-- РЕШЕНИЕ (по слову владельца). Автологин оставляем ТОЛЬКО там, где он по делу
-- и где сообщение транзакционное: статусы заказа и бонусы. Маркетинговые
-- уведомления (корзина, промо, акции, дни рождения, просьба отзыва) ведут на
-- обычную ссылку `https://uhti.kz<путь>` — без сессии. На своём телефоне, где
-- уже есть вход, покупатель попадёт куда нужно; чужой — нет.
--
-- Плюс перестаём хранить состав корзины в `reminder_logs`: для дедупликации
-- напоминаний хватает факта «отправлено такого-то числа», а cart_snapshot
-- лежал 30 дней без нужды.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.trigger_send_telegram_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_chat_id BIGINT;
  v_url TEXT;
  v_buttons JSONB;
  v_photos JSONB;
  v_body_payload JSONB;
  v_base TEXT;
BEGIN
  SELECT telegram_chat_id INTO v_chat_id
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_chat_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_buttons := NULL;
  IF NEW.link IS NOT NULL AND NEW.link <> '' THEN
    /*
     * Автологин — только для транзакционных уведомлений, где человек ждёт
     * именно свой заказ или бонусы. Всё остальное (корзина, промо, акции) —
     * обычная ссылка: пересланное маркетинговое сообщение не должно пускать
     * в чужой аккаунт.
     */
    IF NEW.type IN ('order_status', 'bonus_earned', 'bonus_activated') THEN
      v_url := public.generate_magic_link(NEW.user_id, NEW.link);
    ELSE
      v_url := 'https://uhti.kz' || NEW.link;
    END IF;

    v_buttons := jsonb_build_array(
      jsonb_build_object('text', '🔗 Открыть на сайте', 'url', v_url)
    );
  END IF;

  v_photos := NULL;
  IF NEW.photo_url IS NOT NULL AND NEW.photo_url <> '' THEN
    v_photos := jsonb_build_array(
      jsonb_build_object('url', NEW.photo_url)
    );
  END IF;

  v_body_payload := jsonb_build_object(
    'chat_id', v_chat_id,
    'title', NEW.title,
    'body', COALESCE(NEW.body, '')
  );

  IF v_buttons IS NOT NULL THEN
    v_body_payload := v_body_payload || jsonb_build_object('buttons', v_buttons);
  END IF;

  IF v_photos IS NOT NULL THEN
    v_body_payload := v_body_payload || jsonb_build_object('photos', v_photos);
  END IF;

  /*
   * Адрес функций — из app_settings, а не зашит.
   *
   * Раньше здесь стоял прод-URL намертво, и на локальной базе триггер слал
   * сообщения БОЕВЫМ покупателям (их chat_id лежит в копии прод-данных).
   * На проде строки в app_settings нет — берётся значение по умолчанию;
   * на стенде она направляет вызов на локальную заглушку.
   */
  SELECT value INTO v_base FROM public.app_settings WHERE key = 'functions_url';

  PERFORM net.http_post(
    url := coalesce(v_base, 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1')
           || '/send-user-telegram',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := v_body_payload
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_send_telegram_notification error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- =====================================================================================
-- Перестаём складывать состав корзины: чистим прошлые снимки и не пишем новые
-- =====================================================================================

UPDATE public.reminder_logs SET cart_snapshot = NULL WHERE cart_snapshot IS NOT NULL;

-- =====================================================================================
-- check_abandoned_carts: снят с прода (pg_get_functiondef), cart_snapshot заменён на NULL
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.check_abandoned_carts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    VALUES (r.user_id, 'abandoned_cart_first', NULL, v_notification_id);
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
    VALUES (r.user_id, 'abandoned_cart_promo', NULL, v_notification_id);
  END LOOP;

  DELETE FROM server_carts WHERE jsonb_array_length(items) = 0 AND updated_at < now() - interval '7 days';
  DELETE FROM reminder_logs WHERE sent_at < now() - interval '30 days';
END;
$function$;

-- =====================================================================================
-- ПРОВЕРКА
-- =====================================================================================

DO $check$
DECLARE
  v_src TEXT;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'trigger_send_telegram_notification';
  IF position('order_status' IN v_src) = 0 THEN
    RAISE EXCEPTION 'В триггере нет белого списка типов для автологина';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'check_abandoned_carts';
  IF position('r.items, v_notification_id' IN v_src) > 0 THEN
    RAISE EXCEPTION 'check_abandoned_carts всё ещё сохраняет состав корзины';
  END IF;

  RAISE NOTICE '✅ Автологин убран из маркетинга, снимки корзины больше не хранятся';
END $check$;

NOTIFY pgrst, 'reload schema';
