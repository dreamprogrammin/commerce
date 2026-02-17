-- =====================================================================================
-- МИГРАЦИЯ: Таблица push-подписок и триггер отправки push при новых уведомлениях
-- =====================================================================================

-- =====================================================================================
-- ШАГ 1: Таблица push_subscriptions
-- =====================================================================================
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX idx_push_sub_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own subscriptions" ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role может читать подписки для отправки push
CREATE POLICY "Service read all" ON public.push_subscriptions
  FOR SELECT USING (true);

-- =====================================================================================
-- ШАГ 2: Триггер для отправки push при INSERT в notifications
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.trigger_send_push_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Вызываем Edge Function для отправки push
  PERFORM net.http_post(
    url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', COALESCE(NEW.body, ''),
      'link', COALESCE(NEW.link, '/notifications')
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_push_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_push_notification();

COMMENT ON TRIGGER trigger_push_on_notification ON public.notifications IS
'Отправляет Web Push уведомление при создании записи в notifications.
Работает для всех типов уведомлений (bonus_activated, question_answered и т.д.)';

-- Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
