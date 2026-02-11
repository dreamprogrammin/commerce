-- Исправление триггера уведомлений: pg_net + edge function + защита от NULL user_id

-- Гарантируем pg_net
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_question_answered()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_product_name TEXT;
  v_product_slug TEXT;
BEGIN
  -- Только когда answer_text появляется впервые
  IF OLD.answer_text IS NOT NULL OR NEW.answer_text IS NULL THEN
    RETURN NEW;
  END IF;

  -- Пропускаем автогенерированные вопросы (нет пользователя)
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name, slug INTO v_product_name, v_product_slug
  FROM public.products WHERE id = NEW.product_id;

  PERFORM net.http_post(
    url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/notify-question-answered',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'question_id', NEW.id,
      'question_text', NEW.question_text,
      'answer_text', NEW.answer_text,
      'product_name', v_product_name,
      'product_slug', v_product_slug
    )
  );

  RETURN NEW;
END;
$$;

-- Пересоздаём триггер
DROP TRIGGER IF EXISTS on_question_answered ON public.product_questions;

CREATE TRIGGER on_question_answered
AFTER UPDATE ON public.product_questions
FOR EACH ROW EXECUTE FUNCTION public.notify_question_answered();

NOTIFY pgrst, 'reload schema';
