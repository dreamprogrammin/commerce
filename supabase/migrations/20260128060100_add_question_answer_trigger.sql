CREATE OR REPLACE FUNCTION public.notify_question_answered()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_product_name TEXT;
  v_product_slug TEXT;
BEGIN
  IF OLD.answer_text IS NOT NULL OR NEW.answer_text IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name, slug INTO v_product_name, v_product_slug
  FROM public.products WHERE id = NEW.product_id;

  -- Не создаём уведомление здесь - Edge Function сделает это через 2 минуты
  -- Используем секретный токен для авторизации внутренних вызовов

  PERFORM net.http_post(
    url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/notify-question-answered',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'question_id', NEW.id,
      'question_text', NEW.question_text,
      'answer_text', NEW.answer_text,
      'product_name', v_product_name,
      'product_slug', v_product_slug,
      'trigger_secret', 'uhti-internal-trigger-2026'
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_question_answered
AFTER UPDATE ON public.product_questions
FOR EACH ROW EXECUTE FUNCTION public.notify_question_answered();
