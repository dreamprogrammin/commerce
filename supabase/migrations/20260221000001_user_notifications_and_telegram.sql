-- =====================================================================================
-- МИГРАЦИЯ: Telegram-рассылка + Уведомления пользователям о статусе заказа
-- =====================================================================================

-- =====================================================================================
-- ШАГ 1: Добавить telegram_chat_id в profiles
-- =====================================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT UNIQUE;

COMMENT ON COLUMN public.profiles.telegram_chat_id IS
'Telegram chat ID для личных уведомлений. Привязывается через бота.';

-- =====================================================================================
-- ШАГ 2: Таблица telegram_link_codes (временные коды привязки)
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.telegram_link_codes (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_code ON public.telegram_link_codes(code);
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_user ON public.telegram_link_codes(user_id);

ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;

-- Пользователь видит только свои коды
CREATE POLICY "Users read own link codes" ON public.telegram_link_codes
  FOR SELECT USING (auth.uid() = user_id);

-- Пользователь может создавать свои коды
CREATE POLICY "Users create own link codes" ON public.telegram_link_codes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Пользователь может удалять свои коды
CREATE POLICY "Users delete own link codes" ON public.telegram_link_codes
  FOR DELETE USING (auth.uid() = user_id);

-- Service role может всё (для webhook)
CREATE POLICY "Service manage all link codes" ON public.telegram_link_codes
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================================================
-- ШАГ 3: Триггер — смена статуса заказа → notification пользователю
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.notify_user_order_status_changed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_title TEXT;
  v_body TEXT;
  v_order_short TEXT;
BEGIN
  -- Только для заказов с user_id (не гостевые)
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Только если статус реально изменился
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_order_short := substring(NEW.id::text from 1 for 8);

  CASE NEW.status
    WHEN 'processing' THEN
      v_title := 'Заказ принят в обработку';
      v_body := format('Ваш заказ #%s принят в обработку', v_order_short);
    WHEN 'confirmed' THEN
      v_title := 'Заказ подтверждён';
      v_body := format('Ваш заказ #%s подтверждён и готовится к отправке', v_order_short);
    WHEN 'shipped' THEN
      v_title := 'Заказ отправлен';
      v_body := format('Ваш заказ #%s отправлен', v_order_short);
    WHEN 'delivered' THEN
      v_title := 'Заказ доставлен';
      v_body := format('Ваш заказ #%s успешно доставлен. Спасибо за покупку!', v_order_short);
    WHEN 'cancelled' THEN
      v_title := 'Заказ отменён';
      v_body := format('Ваш заказ #%s был отменён', v_order_short);
    ELSE
      RETURN NEW;
  END CASE;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.user_id, 'order_status', v_title, v_body, '/profile/orders');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_user_order_status_changed error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_user_order_status_notification ON public.orders;
CREATE TRIGGER trigger_user_order_status_notification
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_user_order_status_changed();

COMMENT ON TRIGGER trigger_user_order_status_notification ON public.orders IS
'Создаёт in-app уведомление пользователю при смене статуса заказа.
Триггеры на notifications автоматически отправят push + Telegram.';

-- =====================================================================================
-- ШАГ 4: Триггер — начисление бонусов → notification
-- При создании заказа с бонусами — уведомление "Бонусы будут начислены"
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.notify_user_bonus_earned()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Только для заказов с user_id и с начисленными бонусами
  IF NEW.user_id IS NULL OR COALESCE(NEW.bonuses_awarded, 0) = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    NEW.user_id,
    'bonus_earned',
    'Бонусы начислены',
    format('+%s бонусов будут доступны через 14 дней', NEW.bonuses_awarded),
    '/profile/bonuses'
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_user_bonus_earned error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_user_bonus_earned ON public.orders;
CREATE TRIGGER trigger_user_bonus_earned
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_user_bonus_earned();

COMMENT ON TRIGGER trigger_user_bonus_earned ON public.orders IS
'Уведомляет пользователя о начислении бонусов при создании заказа.';

-- =====================================================================================
-- ШАГ 5: Триггер — notification → Telegram личное сообщение
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.trigger_send_telegram_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_chat_id BIGINT;
BEGIN
  -- Проверяем, есть ли у пользователя telegram_chat_id
  SELECT telegram_chat_id INTO v_chat_id
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_chat_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Вызываем Edge Function для отправки в Telegram
  PERFORM net.http_post(
    url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/send-user-telegram',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'chat_id', v_chat_id,
      'title', NEW.title,
      'body', COALESCE(NEW.body, ''),
      'link', COALESCE(NEW.link, '')
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_send_telegram_notification error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_telegram_on_notification ON public.notifications;
CREATE TRIGGER trigger_telegram_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_telegram_notification();

COMMENT ON TRIGGER trigger_telegram_on_notification ON public.notifications IS
'Отправляет Telegram личное сообщение пользователю при создании уведомления.
Работает параллельно с trigger_push_on_notification (Web Push).';

-- =====================================================================================
-- ШАГ 6: Таблица telegram_broadcasts (история рассылок)
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.telegram_broadcasts (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  message TEXT NOT NULL,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.telegram_broadcasts ENABLE ROW LEVEL SECURITY;

-- Только админы могут читать историю рассылок
CREATE POLICY "Admins read broadcasts" ON public.telegram_broadcasts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Service role может вставлять
CREATE POLICY "Service insert broadcasts" ON public.telegram_broadcasts
  FOR INSERT WITH CHECK (true);

-- =====================================================================================
-- Обновляем кэш PostgREST
-- =====================================================================================
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
